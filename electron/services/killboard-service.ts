import { BrowserWindow, Notification } from 'electron';
import type {
  HistoricalKillEntityKind,
  HistoricalKillboardResultDto,
  HistoricalKillmailDto,
  HistoricalKillStatsDto,
  KillClassification,
  KillEntityKind,
  KillTrackerGroupDto,
  KillTrackerRuleDto,
  KillWatchlistRow,
  KillmailRow
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';

interface RedisqPackage {
  killID: number;
  killmail: {
    killmail_id: number;
    killmail_time: string;
    solar_system_id: number;
    victim: {
      character_id?: number;
      corporation_id?: number;
      alliance_id?: number;
      ship_type_id: number;
    };
    attackers: Array<{
      character_id?: number;
      corporation_id?: number;
      alliance_id?: number;
      ship_type_id?: number;
      final_blow?: boolean;
    }>;
  };
  zkb?: {
    totalValue?: number;
    npc?: boolean;
    solo?: boolean;
    awox?: boolean;
    points?: number;
  };
}

const CAPITAL_SHIP_GROUPS = new Set([
  'Carrier',
  'Dreadnought',
  'Lancer Dreadnought',
  'Force Auxiliary',
  'Supercarrier',
  'Titan',
  'Jump Freighter',
  'Capital Industrial Ship'
]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class KillboardService {
  private running = false;
  private abortController: AbortController | null = null;
  private getWindow: (() => BrowserWindow | null) | null = null;
  private jumpCache = new Map<string, Set<number>>();

  constructor(private readonly db: LocalDatabase) {}

  start(getMainWindow: () => BrowserWindow | null): void {
    this.getWindow = getMainWindow;
    if (this.running) return;
    this.running = true;
    void this.pollLoop();
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  private async pollLoop(): Promise<void> {
    const baseUrl = 'https://r2z2.zkillboard.com/ephemeral';
    let currentSeq: number | null = null;

    while (this.running) {
      try {
        this.abortController = new AbortController();

        if (currentSeq === null) {
          const seqRes = await fetch(`${baseUrl}/sequence.json`, {
            signal: this.abortController.signal,
            headers: { 'User-Agent': 'NewEdenLens/0.2.0' }
          });
          if (!seqRes.ok) {
            await sleep(4000);
            continue;
          }
          const seqJson = (await seqRes.json()) as { sequence?: number };
          if (typeof seqJson.sequence !== 'number') {
            await sleep(4000);
            continue;
          }
          // Backfill last 30 killmails on startup so active groups see recent kills immediately
          currentSeq = Math.max(1, seqJson.sequence - 30);
        }

        const res = await fetch(`${baseUrl}/${currentSeq}.json`, {
          signal: this.abortController.signal,
          headers: { 'User-Agent': 'NewEdenLens/0.2.0' }
        });

        if (res.status === 404) {
          // Caught up to live edge
          await sleep(3500);
          continue;
        }
        if (res.status === 429) {
          await sleep(5000);
          continue;
        }
        if (!res.ok) {
          await sleep(3000);
          continue;
        }

        const r2 = (await res.json()) as {
          killmail_id?: number;
          esi?: RedisqPackage['killmail'];
          zkb?: RedisqPackage['zkb'];
        };
        currentSeq += 1;

        if (r2.esi?.killmail_id) {
          this.ingestPackage({
            killID: r2.esi.killmail_id,
            killmail: r2.esi,
            zkb: r2.zkb
          });
        }

        // Stay well under R2Z2's 20 req/s limit while catching up
        await sleep(90);
      } catch {
        if (!this.running) break;
        await sleep(3000);
      }
    }
  }

  private getReachableSystems(originId: number, maxJumps: number): Set<number> {
    const key = `${originId}:${maxJumps}`;
    const cached = this.jumpCache.get(key);
    if (cached) return cached;

    const visited = new Set<number>([originId]);
    let frontier = [originId];
    for (let depth = 0; depth < maxJumps && frontier.length > 0; depth++) {
      const next: number[] = [];
      const placeholders = frontier.map(() => '?').join(',');
      const edges = this.db.all<{ to_solar_system_id: number }>(
        `SELECT to_solar_system_id FROM sde_stargates WHERE from_solar_system_id IN (${placeholders})`,
        frontier
      );
      for (const e of edges) {
        if (!visited.has(e.to_solar_system_id)) {
          visited.add(e.to_solar_system_id);
          next.push(e.to_solar_system_id);
        }
      }
      frontier = next;
    }

    this.jumpCache.set(key, visited);
    return visited;
  }

  private classifyKill(
    pkg: RedisqPackage,
    sysSec: number
  ): KillClassification {
    const isNpc = Boolean(pkg.zkb?.npc);
    if (isNpc) return 'PVE LOSS';
    const isSolo = Boolean(pkg.zkb?.solo) || pkg.killmail.attackers.length === 1;
    if (sysSec >= 0.45) return 'GANK';
    if (isSolo) return 'SOLO';
    if (pkg.killmail.attackers.length >= 10) return 'FLEET/WAR';
    return 'SMALL GANG';
  }

  private matchesGroup(
    pkg: RedisqPackage,
    group: KillTrackerGroupDto,
    sysSec: number,
    regionId: number | null,
    classification: KillClassification,
    victimGroupName: string | null
  ): boolean {
    if (!group.enabled) return false;
    const km = pkg.killmail;
    const totalValue = pkg.zkb?.totalValue ?? 0;
    const isNpc = Boolean(pkg.zkb?.npc);
    const isSolo = Boolean(pkg.zkb?.solo) || (km.attackers.length === 1 && !isNpc);

    if (group.minIsk > 0 && totalValue < group.minIsk) return false;

    if (group.originSystemId !== null && group.maxJumps !== null) {
      const reachable = this.getReachableSystems(group.originSystemId, group.maxJumps);
      if (!reachable.has(km.solar_system_id)) return false;
    }

    const locationRules = group.rules.filter(
      (r) => r.matchKind === 'solar_system' || r.matchKind === 'region'
    );
    if (locationRules.length > 0) {
      const locMatched = locationRules.some(
        (r) =>
          (r.matchKind === 'solar_system' && r.targetId === km.solar_system_id) ||
          (r.matchKind === 'region' && regionId !== null && r.targetId === regionId)
      );
      if (!locMatched) return false;
    }

    const isJSpace = km.solar_system_id >= 31_000_000 && km.solar_system_id < 32_000_000;
    if (group.secFilter === 'highsec' && sysSec < 0.45) return false;
    if (group.secFilter === 'lowsec' && (sysSec <= 0 || sysSec >= 0.45 || isJSpace)) return false;
    if (group.secFilter === 'nullsec' && (sysSec > 0 || isJSpace)) return false;
    if (group.secFilter === 'jspace' && !isJSpace) return false;

    if (group.activityFilter === 'ganks_only' && classification !== 'GANK') return false;
    if (group.activityFilter === 'pve_losses' && !isNpc) return false;
    if (group.activityFilter === 'pvp_only' && isNpc) return false;
    if (group.activityFilter === 'solo_only' && !isSolo) return false;
    if (
      group.activityFilter === 'capital_only' &&
      !(victimGroupName && CAPITAL_SHIP_GROUPS.has(victimGroupName)) &&
      totalValue < 2_000_000_000
    ) {
      return false;
    }

    const entityRules = group.rules.filter(
      (r) => r.matchKind !== 'solar_system' && r.matchKind !== 'region'
    );
    if (entityRules.length === 0) return true;

    const victimEntities = new Set<number>();
    if (km.victim.character_id) victimEntities.add(km.victim.character_id);
    if (km.victim.corporation_id) victimEntities.add(km.victim.corporation_id);
    if (km.victim.alliance_id) victimEntities.add(km.victim.alliance_id);

    const attackerEntities = new Set<number>();
    const attackerShips = new Set<number>();
    for (const att of km.attackers) {
      if (att.character_id) attackerEntities.add(att.character_id);
      if (att.corporation_id) attackerEntities.add(att.corporation_id);
      if (att.alliance_id) attackerEntities.add(att.alliance_id);
      if (att.ship_type_id) attackerShips.add(att.ship_type_id);
    }

    const matchesEntityRule = (rule: KillTrackerRuleDto): boolean => {
      if (rule.matchKind === 'ship_type' || rule.matchKind === 'structure') {
        const onVictim = km.victim.ship_type_id === rule.targetId;
        const onAttacker = attackerShips.has(rule.targetId);
        if (group.roleFilter === 'losses_only') return onVictim;
        if (group.roleFilter === 'kills_only') return onAttacker;
        return onVictim || onAttacker;
      }
      if (rule.matchKind === 'special_npc') {
        return km.victim.ship_type_id === rule.targetId || attackerShips.has(rule.targetId);
      }
      const onVictim = victimEntities.has(rule.targetId);
      const onAttacker = attackerEntities.has(rule.targetId);
      if (group.roleFilter === 'losses_only') return onVictim;
      if (group.roleFilter === 'kills_only') return onAttacker;
      return onVictim || onAttacker;
    };

    return group.entityMatchMode === 'all'
      ? entityRules.every(matchesEntityRule)
      : entityRules.some(matchesEntityRule);
  }

  private ingestPackage(pkg: RedisqPackage): void {
    const groups = this.listGroups().filter((g) => g.enabled);
    if (groups.length === 0) return;

    const km = pkg.killmail;
    const sysRow = this.db.get<{ security: number; region_id: number }>(
      'SELECT security, region_id FROM sde_solar_systems WHERE solar_system_id = ?',
      [km.solar_system_id]
    );
    const sysSec = sysRow?.security ?? 0;
    const regionId = sysRow?.region_id ?? null;

    const shipRow = this.db.get<{ group_name: string | null }>(
      `SELECT g.group_name FROM sde_inv_types t
       LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
       WHERE t.type_id = ?`,
      [km.victim.ship_type_id]
    );

    const classification = this.classifyKill(pkg, sysSec);
    const matchedGroups = groups.filter((g) =>
      this.matchesGroup(pkg, g, sysSec, regionId, classification, shipRow?.group_name ?? null)
    );

    if (matchedGroups.length === 0) return;

    const kmTime = Date.parse(km.killmail_time) || Date.now();
    const totalValue = pkg.zkb?.totalValue ?? 0;
    const isNpc = pkg.zkb?.npc ? 1 : 0;

    this.db.transaction((raw) => {
      raw.run(
        `INSERT OR IGNORE INTO killmails (
           killmail_id, killmail_time, solar_system_id,
           victim_character_id, victim_corporation_id, victim_alliance_id,
           victim_ship_type_id, total_value, attacker_count, is_npc, raw_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          km.killmail_id,
          kmTime,
          km.solar_system_id,
          km.victim.character_id ?? null,
          km.victim.corporation_id ?? null,
          km.victim.alliance_id ?? null,
          km.victim.ship_type_id,
          totalValue,
          km.attackers.length,
          isNpc,
          JSON.stringify(pkg)
        ]
      );
      for (const mg of matchedGroups) {
        raw.run(
          'INSERT OR IGNORE INTO kill_group_hits (group_id, killmail_id) VALUES (?, ?)',
          [mg.id, km.killmail_id]
        );
      }
    });

    const hydrated = this.getKillmailById(km.killmail_id);
    if (!hydrated) return;
    hydrated.matchedGroupIds = matchedGroups.map((g) => g.id);

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('killboard:new-kill', hydrated);
    }

    const notifyGroup = matchedGroups.find((g) => g.desktopNotify);
    if (notifyGroup && Notification.isSupported()) {
      new Notification({
        title: `Kill Tracker: ${notifyGroup.name}`,
        body: `${hydrated.victimShipName} (${classification}) in ${hydrated.solarSystemName}`
      }).show();
    }
  }

  private hydrateKillRow(r: {
    killmail_id: number;
    killmail_time: number;
    solar_system_id: number;
    solar_system_name: string | null;
    security: number | null;
    victim_character_id: number | null;
    victim_corporation_id: number | null;
    victim_alliance_id: number | null;
    victim_ship_type_id: number;
    type_name: string | null;
    total_value: number;
    attacker_count: number;
    is_npc: number;
    raw_json: string;
  }): KillmailRow {
    let pkg: RedisqPackage | null = null;
    try {
      pkg = JSON.parse(r.raw_json) as RedisqPackage;
    } catch {
      pkg = null;
    }
    const sec = r.security ?? 0;
    const isNpc = r.is_npc === 1;
    const isSolo = Boolean(pkg?.zkb?.solo) || (r.attacker_count === 1 && !isNpc);
    const classification: KillClassification = pkg
      ? this.classifyKill(pkg, sec)
      : isNpc
        ? 'PVE LOSS'
        : sec >= 0.45
          ? 'GANK'
          : isSolo
            ? 'SOLO'
            : r.attacker_count >= 10
              ? 'FLEET/WAR'
              : 'SMALL GANG';

    const hitRows = this.db.all<{ group_id: number }>(
      'SELECT group_id FROM kill_group_hits WHERE killmail_id = ?',
      [r.killmail_id]
    );

    return {
      killmailId: r.killmail_id,
      killmailTime: r.killmail_time,
      solarSystemId: r.solar_system_id,
      solarSystemName: r.solar_system_name ?? `System #${r.solar_system_id}`,
      security: sec,
      victimCharacterId: r.victim_character_id,
      victimCorporationId: r.victim_corporation_id,
      victimAllianceId: r.victim_alliance_id,
      victimShipTypeId: r.victim_ship_type_id,
      victimShipName: r.type_name ?? `Type #${r.victim_ship_type_id}`,
      totalValue: r.total_value,
      attackerCount: r.attacker_count,
      isNpc,
      isSolo,
      isAwox: Boolean(pkg?.zkb?.awox),
      points: pkg?.zkb?.points ?? 0,
      classification,
      matchedGroupIds: hitRows.map((h) => h.group_id)
    };
  }

  getRecentKillmails(limit = 80, search = '', groupId: number | null = null): KillmailRow[] {
    const trimmed = search.trim();
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (groupId !== null) {
      conditions.push(
        'EXISTS (SELECT 1 FROM kill_group_hits h WHERE h.killmail_id = k.killmail_id AND h.group_id = ?)'
      );
      params.push(groupId);
    } else {
      conditions.push('EXISTS (SELECT 1 FROM kill_group_hits h WHERE h.killmail_id = k.killmail_id)');
    }

    if (trimmed) {
      conditions.push('(s.solar_system_name LIKE ? OR t.type_name LIKE ?)');
      params.push(`%${trimmed}%`, `%${trimmed}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    const rows = this.db.all<{
      killmail_id: number;
      killmail_time: number;
      solar_system_id: number;
      solar_system_name: string | null;
      security: number | null;
      victim_character_id: number | null;
      victim_corporation_id: number | null;
      victim_alliance_id: number | null;
      victim_ship_type_id: number;
      type_name: string | null;
      total_value: number;
      attacker_count: number;
      is_npc: number;
      raw_json: string;
    }>(
      `SELECT k.killmail_id, k.killmail_time, k.solar_system_id,
              s.solar_system_name, s.security,
              k.victim_character_id, k.victim_corporation_id, k.victim_alliance_id,
              k.victim_ship_type_id, t.type_name,
              k.total_value, k.attacker_count, k.is_npc, k.raw_json
       FROM killmails k
       LEFT JOIN sde_solar_systems s ON s.solar_system_id = k.solar_system_id
       LEFT JOIN sde_inv_types t ON t.type_id = k.victim_ship_type_id
       ${whereClause}
       ORDER BY k.killmail_time DESC
       LIMIT ?`,
      params
    );

    return rows.map((r) => this.hydrateKillRow(r));
  }

  private getKillmailById(killmailId: number): KillmailRow | null {
    const r = this.db.get<{
      killmail_id: number;
      killmail_time: number;
      solar_system_id: number;
      solar_system_name: string | null;
      security: number | null;
      victim_character_id: number | null;
      victim_corporation_id: number | null;
      victim_alliance_id: number | null;
      victim_ship_type_id: number;
      type_name: string | null;
      total_value: number;
      attacker_count: number;
      is_npc: number;
      raw_json: string;
    }>(
      `SELECT k.killmail_id, k.killmail_time, k.solar_system_id,
              s.solar_system_name, s.security,
              k.victim_character_id, k.victim_corporation_id, k.victim_alliance_id,
              k.victim_ship_type_id, t.type_name,
              k.total_value, k.attacker_count, k.is_npc, k.raw_json
       FROM killmails k
       LEFT JOIN sde_solar_systems s ON s.solar_system_id = k.solar_system_id
       LEFT JOIN sde_inv_types t ON t.type_id = k.victim_ship_type_id
       WHERE k.killmail_id = ?`,
      [killmailId]
    );
    return r ? this.hydrateKillRow(r) : null;
  }

  listGroups(): KillTrackerGroupDto[] {
    const groups = this.db.all<{
      id: number;
      name: string;
      description: string;
      origin_system_id: number | null;
      origin_system_name: string | null;
      max_jumps: number | null;
      role_filter: KillTrackerGroupDto['roleFilter'];
      sec_filter: KillTrackerGroupDto['secFilter'];
      activity_filter: KillTrackerGroupDto['activityFilter'];
      entity_match_mode: 'any' | 'all';
      min_isk: number;
      audio_alert: number;
      desktop_notify: number;
      is_popout_active: number;
      enabled: number;
      created_at: number;
    }>('SELECT * FROM kill_tracker_groups ORDER BY is_popout_active DESC, id DESC');

    const rules = this.db.all<{
      id: number;
      group_id: number;
      match_kind: KillEntityKind;
      target_id: number;
      target_name: string;
    }>('SELECT * FROM kill_tracker_rules ORDER BY id ASC');

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description ?? '',
      originSystemId: g.origin_system_id,
      originSystemName: g.origin_system_name,
      maxJumps: g.max_jumps,
      roleFilter: g.role_filter,
      secFilter: g.sec_filter,
      activityFilter: g.activity_filter,
      entityMatchMode: g.entity_match_mode ?? 'any',
      minIsk: g.min_isk,
      audioAlert: g.audio_alert === 1,
      desktopNotify: g.desktop_notify === 1,
      isPopoutActive: g.is_popout_active === 1,
      enabled: g.enabled === 1,
      createdAt: g.created_at,
      rules: rules
        .filter((r) => r.group_id === g.id)
        .map((r) => ({
          id: r.id,
          groupId: r.group_id,
          matchKind: r.match_kind,
          targetId: r.target_id,
          targetName: r.target_name
        }))
    }));
  }

  saveGroup(input: {
    id?: number;
    name: string;
    description?: string;
    originSystemId?: number | null;
    originSystemName?: string | null;
    maxJumps?: number | null;
    roleFilter: KillTrackerGroupDto['roleFilter'];
    secFilter: KillTrackerGroupDto['secFilter'];
    activityFilter: KillTrackerGroupDto['activityFilter'];
    entityMatchMode?: 'any' | 'all';
    minIsk: number;
    audioAlert: boolean;
    desktopNotify: boolean;
    enabled: boolean;
    rules: KillTrackerRuleDto[];
  }): KillTrackerGroupDto[] {
    const now = Date.now();
    this.db.transaction((raw) => {
      let groupId = input.id;
      if (groupId) {
        raw.run(
          `UPDATE kill_tracker_groups
           SET name = ?, description = ?, origin_system_id = ?, origin_system_name = ?,
               max_jumps = ?, role_filter = ?, sec_filter = ?, activity_filter = ?,
               entity_match_mode = ?, min_isk = ?, audio_alert = ?, desktop_notify = ?, enabled = ?
           WHERE id = ?`,
          [
            input.name.trim() || 'Tracker Group',
            input.description ?? '',
            input.originSystemId ?? null,
            input.originSystemName ?? null,
            input.maxJumps ?? null,
            input.roleFilter,
            input.secFilter,
            input.activityFilter,
            input.entityMatchMode ?? 'any',
            input.minIsk ?? 0,
            input.audioAlert ? 1 : 0,
            input.desktopNotify ? 1 : 0,
            input.enabled ? 1 : 0,
            groupId
          ]
        );
        raw.run('DELETE FROM kill_tracker_rules WHERE group_id = ?', [groupId]);
      } else {
        raw.run(
          `INSERT INTO kill_tracker_groups (
             name, description, origin_system_id, origin_system_name, max_jumps,
             role_filter, sec_filter, activity_filter, entity_match_mode, min_isk,
             audio_alert, desktop_notify, is_popout_active, enabled, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            input.name.trim() || 'Tracker Group',
            input.description ?? '',
            input.originSystemId ?? null,
            input.originSystemName ?? null,
            input.maxJumps ?? null,
            input.roleFilter,
            input.secFilter,
            input.activityFilter,
            input.entityMatchMode ?? 'any',
            input.minIsk ?? 0,
            input.audioAlert ? 1 : 0,
            input.desktopNotify ? 1 : 0,
            input.enabled ? 1 : 0,
            now
          ]
        );
        const row = this.db.get<{ id: number }>('SELECT last_insert_rowid() AS id');
        groupId = row?.id ?? 0;
      }

      if (groupId) {
        const stmt = raw.prepare(
          'INSERT INTO kill_tracker_rules (group_id, match_kind, target_id, target_name) VALUES (?, ?, ?, ?)'
        );
        try {
          for (const r of input.rules) {
            stmt.run([groupId, r.matchKind, r.targetId, r.targetName]);
          }
        } finally {
          stmt.free();
        }
      }
    });
    return this.listGroups();
  }

  deleteGroup(id: number): KillTrackerGroupDto[] {
    this.db.run('DELETE FROM kill_tracker_groups WHERE id = ?', [id]);
    return this.listGroups();
  }

  setPopoutGroup(id: number | null): KillTrackerGroupDto[] {
    this.db.transaction((raw) => {
      raw.run('UPDATE kill_tracker_groups SET is_popout_active = 0');
      if (id !== null) {
        raw.run('UPDATE kill_tracker_groups SET is_popout_active = 1 WHERE id = ?', [id]);
      }
    });
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('killboard:popout-group-changed', id);
    }
    return this.listGroups();
  }

  async resolveEntityNames(
    kind: 'character' | 'corporation' | 'alliance',
    query: string
  ): Promise<Array<{ id: number; name: string }>> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const results: Array<{ id: number; name: string }> = [];
    const seen = new Set<number>();
    const lower = trimmed.toLowerCase();

    try {
      const zkbRes = await fetch(
        `https://zkillboard.com/autocomplete/${encodeURIComponent(trimmed)}/`,
        { headers: { 'User-Agent': 'NewEdenLens/0.1.0', Accept: 'application/json' } }
      );
      if (zkbRes.ok) {
        const arr = (await zkbRes.json()) as Array<{ id: number; name: string; type: string }>;
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item.type === kind && item.id && item.name && !seen.has(item.id)) {
              seen.add(item.id);
              results.push({ id: Number(item.id), name: item.name });
            }
          }
        }
      }
    } catch {
      // ignore autocomplete network error and fall back to ESI
    }

    if (results.length === 0) {
      try {
        const res = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'NewEdenLens/0.1.0' },
          body: JSON.stringify([trimmed])
        });
        if (res.ok) {
          const json = (await res.json()) as {
            characters?: Array<{ id: number; name: string }>;
            corporations?: Array<{ id: number; name: string }>;
            alliances?: Array<{ id: number; name: string }>;
          };
          const list =
            kind === 'character'
              ? (json.characters ?? [])
              : kind === 'corporation'
                ? (json.corporations ?? [])
                : (json.alliances ?? []);
          for (const item of list) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              results.push(item);
            }
          }
        }
      } catch {
        // ignore ESI fallback failure
      }
    }

    results.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });
    return results.slice(0, 20);
  }

  listWatchlists(): KillWatchlistRow[] {
    const rows = this.db.all<{
      id: number;
      match_kind: KillWatchlistRow['matchKind'];
      target_id: number;
      label: string;
      audio_alert: number;
      desktop_notify: number;
      enabled: number;
    }>('SELECT * FROM kill_watchlists ORDER BY id DESC');

    return rows.map((r) => ({
      id: r.id,
      matchKind: r.match_kind,
      targetId: r.target_id,
      label: r.label,
      audioAlert: r.audio_alert === 1,
      desktopNotify: r.desktop_notify === 1,
      enabled: r.enabled === 1
    }));
  }

  addWatchlist(input: Omit<KillWatchlistRow, 'id'>): KillWatchlistRow[] {
    this.db.run(
      `INSERT INTO kill_watchlists (match_kind, target_id, label, audio_alert, desktop_notify, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.matchKind,
        input.targetId,
        input.label,
        input.audioAlert ? 1 : 0,
        input.desktopNotify ? 1 : 0,
        input.enabled ? 1 : 0
      ]
    );
    return this.listWatchlists();
  }

  removeWatchlist(id: number): KillWatchlistRow[] {
    this.db.run('DELETE FROM kill_watchlists WHERE id = ?', [id]);
    return this.listWatchlists();
  }

  async lookupEntity(
    kind: HistoricalKillEntityKind,
    entityId: number,
    mode: 'all' | 'kills' | 'losses',
    page = 1,
    pageSize = 25
  ): Promise<HistoricalKillboardResultDto> {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(200, Math.max(10, Math.floor(pageSize)));
    const zkbPage = Math.floor(((safePage - 1) * safeSize) / 200) + 1;
    const offset = ((safePage - 1) * safeSize) % 200;

    const keyMap: Record<HistoricalKillEntityKind, string> = {
      character: 'characterID',
      corporation: 'corporationID',
      alliance: 'allianceID',
      ship_type: 'shipID',
      solar_system: 'solarSystemID'
    };
    const zkbKey = keyMap[kind];
    const modeSegment = mode === 'all' ? '' : `${mode}/`;
    const headers = { 'User-Agent': 'NewEdenLens/0.1.0', Accept: 'application/json' };

    const [statsRes, listRes] = await Promise.all([
      fetch(`https://zkillboard.com/api/stats/${zkbKey}/${entityId}/`, { headers }).catch(() => null),
      fetch(`https://zkillboard.com/api/${modeSegment}${zkbKey}/${entityId}/page/${zkbPage}/`, {
        headers
      }).catch(() => null)
    ]);

    let stats: HistoricalKillStatsDto | null = null;
    let entityName = `#${entityId}`;

    if (statsRes && statsRes.ok) {
      try {
        const sJson = (await statsRes.json()) as {
          shipsDestroyed?: number;
          shipsLost?: number;
          iskDestroyed?: number;
          iskLost?: number;
          dangerRatio?: number;
          gangRatio?: number;
          soloKills?: number;
          points?: number;
          info?: { name?: string };
        };
        if (sJson.info?.name) entityName = sJson.info.name;
        stats = {
          shipsDestroyed: sJson.shipsDestroyed ?? 0,
          shipsLost: sJson.shipsLost ?? 0,
          iskDestroyed: sJson.iskDestroyed ?? 0,
          iskLost: sJson.iskLost ?? 0,
          dangerRatio: typeof sJson.dangerRatio === 'number' ? sJson.dangerRatio : null,
          gangRatio: typeof sJson.gangRatio === 'number' ? sJson.gangRatio : null,
          soloKills: sJson.soloKills ?? 0,
          points: sJson.points ?? 0
        };
      } catch {
        // ignore stats parse error
      }
    }

    if (entityName.startsWith('#')) {
      if (kind === 'ship_type') {
        const row = this.db.get<{ type_name: string }>('SELECT type_name FROM sde_inv_types WHERE type_id = ?', [
          entityId
        ]);
        if (row?.type_name) entityName = row.type_name;
      } else if (kind === 'solar_system') {
        const row = this.db.get<{ solar_system_name: string }>(
          'SELECT solar_system_name FROM sde_solar_systems WHERE solar_system_id = ?',
          [entityId]
        );
        if (row?.solar_system_name) entityName = row.solar_system_name;
      }
    }

    interface EsiKillmailJson {
      killmail_id: number;
      killmail_time: string;
      solar_system_id: number;
      victim: {
        character_id?: number;
        corporation_id?: number;
        alliance_id?: number;
        ship_type_id: number;
      };
      attackers: Array<{
        character_id?: number;
        corporation_id?: number;
        ship_type_id?: number;
        final_blow?: boolean;
      }>;
    }

    interface ZkbListItem {
      killmail_id: number;
      killmail_time?: string;
      solar_system_id?: number;
      victim?: EsiKillmailJson['victim'];
      attackers?: EsiKillmailJson['attackers'];
      zkb?: {
        hash?: string;
        totalValue?: number;
        points?: number;
        npc?: boolean;
        solo?: boolean;
        awox?: boolean;
      };
    }

    let zkbItems: ZkbListItem[] = [];
    let hasMore = false;
    if (listRes && listRes.ok) {
      try {
        const arr = (await listRes.json()) as ZkbListItem[];
        if (Array.isArray(arr)) {
          hasMore = arr.length >= 200 || offset + safeSize < arr.length;
          zkbItems = arr
            .slice(offset, offset + safeSize)
            .filter((x) => x.killmail_id && (x.zkb?.hash || (x.victim && x.attackers)));
        }
      } catch {
        // ignore list parse error
      }
    }

    const hydrated: Array<{ zkb: ZkbListItem; esi: EsiKillmailJson }> = [];
    const needEsi: ZkbListItem[] = [];
    for (const item of zkbItems) {
      if (item.victim && item.attackers && item.killmail_time && item.solar_system_id) {
        hydrated.push({
          zkb: item,
          esi: {
            killmail_id: item.killmail_id,
            killmail_time: item.killmail_time,
            solar_system_id: item.solar_system_id,
            victim: item.victim,
            attackers: item.attackers
          }
        });
      } else if (item.zkb?.hash) {
        needEsi.push(item);
      }
    }

    const batchSize = 8;
    for (let i = 0; i < needEsi.length; i += batchSize) {
      const batch = needEsi.slice(i, i + batchSize);
      const settled = await Promise.all(
        batch.map(async (item) => {
          try {
            const res = await fetch(
              `https://esi.evetech.net/latest/killmails/${item.killmail_id}/${item.zkb!.hash}/?datasource=tranquility`,
              { headers: { 'User-Agent': 'NewEdenLens/0.1.0' } }
            );
            if (!res.ok) return null;
            const esi = (await res.json()) as EsiKillmailJson;
            return { zkb: item, esi };
          } catch {
            return null;
          }
        })
      );
      for (const s of settled) {
        if (s) hydrated.push(s);
      }
    }

    const idsToResolve = new Set<number>();
    const typeIds = new Set<number>();
    const systemIds = new Set<number>();
    if (entityName.startsWith('#') && (kind === 'character' || kind === 'corporation' || kind === 'alliance')) {
      idsToResolve.add(entityId);
    }

    for (const { esi } of hydrated) {
      systemIds.add(esi.solar_system_id);
      if (esi.victim.ship_type_id) typeIds.add(esi.victim.ship_type_id);
      if (esi.victim.character_id) idsToResolve.add(esi.victim.character_id);
      if (esi.victim.corporation_id) idsToResolve.add(esi.victim.corporation_id);
      if (esi.victim.alliance_id) idsToResolve.add(esi.victim.alliance_id);
      const fb = esi.attackers.find((a) => a.final_blow) ?? esi.attackers[0];
      if (fb?.character_id) idsToResolve.add(fb.character_id);
      else if (fb?.corporation_id) idsToResolve.add(fb.corporation_id);
      if (fb?.ship_type_id) typeIds.add(fb.ship_type_id);
    }

    const systemMap = new Map<number, { name: string; security: number }>();
    if (systemIds.size > 0) {
      const ph = Array.from(systemIds).map(() => '?').join(',');
      const rows = this.db.all<{ solar_system_id: number; solar_system_name: string; security: number }>(
        `SELECT solar_system_id, solar_system_name, security FROM sde_solar_systems WHERE solar_system_id IN (${ph})`,
        Array.from(systemIds)
      );
      for (const r of rows) systemMap.set(r.solar_system_id, { name: r.solar_system_name, security: r.security });
    }

    const typeMap = new Map<number, string>();
    if (typeIds.size > 0) {
      const ph = Array.from(typeIds).map(() => '?').join(',');
      const rows = this.db.all<{ type_id: number; type_name: string }>(
        `SELECT type_id, type_name FROM sde_inv_types WHERE type_id IN (${ph})`,
        Array.from(typeIds)
      );
      for (const r of rows) typeMap.set(r.type_id, r.type_name);
    }

    const nameMap = new Map<number, string>();
    if (idsToResolve.size > 0) {
      try {
        const res = await fetch('https://esi.evetech.net/latest/universe/names/?datasource=tranquility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'NewEdenLens/0.1.0' },
          body: JSON.stringify(Array.from(idsToResolve).slice(0, 500))
        });
        if (res.ok) {
          const names = (await res.json()) as Array<{ id: number; name: string }>;
          for (const n of names) nameMap.set(n.id, n.name);
        }
      } catch {
        // ignore universe/names failure
      }
    }

    if (entityName.startsWith('#') && nameMap.has(entityId)) {
      entityName = nameMap.get(entityId)!;
    }

    const kills: HistoricalKillmailDto[] = hydrated
      .sort((a, b) => Date.parse(b.esi.killmail_time) - Date.parse(a.esi.killmail_time))
      .map(({ zkb, esi }) => {
        const sys = systemMap.get(esi.solar_system_id);
        const fb = esi.attackers.find((a) => a.final_blow) ?? esi.attackers[0];
        const fbId = fb?.character_id ?? fb?.corporation_id ?? null;
        return {
          killmailId: esi.killmail_id,
          killmailTime: Date.parse(esi.killmail_time) || Date.now(),
          solarSystemId: esi.solar_system_id,
          solarSystemName: sys?.name ?? `System ${esi.solar_system_id}`,
          security: sys?.security ?? 0,
          victimCharacterId: esi.victim.character_id ?? null,
          victimCharacterName: esi.victim.character_id ? (nameMap.get(esi.victim.character_id) ?? null) : null,
          victimCorporationId: esi.victim.corporation_id ?? null,
          victimCorporationName: esi.victim.corporation_id ? (nameMap.get(esi.victim.corporation_id) ?? null) : null,
          victimAllianceId: esi.victim.alliance_id ?? null,
          victimAllianceName: esi.victim.alliance_id ? (nameMap.get(esi.victim.alliance_id) ?? null) : null,
          victimShipTypeId: esi.victim.ship_type_id,
          victimShipName: typeMap.get(esi.victim.ship_type_id) ?? `Type ${esi.victim.ship_type_id}`,
          finalBlowName: fbId ? (nameMap.get(fbId) ?? null) : null,
          finalBlowShipTypeId: fb?.ship_type_id ?? null,
          finalBlowShipName: fb?.ship_type_id ? (typeMap.get(fb.ship_type_id) ?? null) : null,
          attackerCount: esi.attackers.length,
          totalValue: zkb.zkb?.totalValue ?? 0,
          isNpc: Boolean(zkb.zkb?.npc),
          isSolo: Boolean(zkb.zkb?.solo),
          isAwox: Boolean(zkb.zkb?.awox),
          points: zkb.zkb?.points ?? 0
        };
      });

    return {
      entityKind: kind,
      entityId,
      entityName,
      page: safePage,
      pageSize: safeSize,
      hasMore,
      stats,
      kills
    };
  }
}
