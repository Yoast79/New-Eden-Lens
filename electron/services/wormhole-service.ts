import type { ParsedCosmicSignature } from '@shared/types/clipboard';
import type {
  TheraTurnurConnectionDto,
  WhEdgeDto,
  WhNodeDto,
  WhSignatureDto
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { CharacterRepository } from '../db/repositories/characterRepo';
import type { EsiClient } from './esi-client';

export class WormholeService {
  private lastKnownSystem = new Map<number, number>();

  constructor(
    private readonly db: LocalDatabase,
    private readonly characterRepo: CharacterRepository,
    private readonly esiClient: EsiClient
  ) {}

  listMaps(): Array<{ id: number; name: string }> {
    let rows = this.db.all<{ id: number; name: string }>('SELECT id, name FROM wh_maps ORDER BY id ASC');
    if (rows.length === 0) {
      this.db.run('INSERT INTO wh_maps (name, created_at) VALUES (?, ?)', [
        'Primary Chain',
        Date.now()
      ]);
      rows = this.db.all<{ id: number; name: string }>('SELECT id, name FROM wh_maps ORDER BY id ASC');
    }
    return rows;
  }

  getMapState(mapId: number): {
    nodes: WhNodeDto[];
    edges: WhEdgeDto[];
    signatures: WhSignatureDto[];
  } {
    const nodes = this.db.all<{
      map_id: number;
      solar_system_id: number;
      solar_system_name: string | null;
      security: number | null;
      wormhole_class: number | null;
      wormhole_effect: string | null;
      pos_x: number;
      pos_y: number;
      custom_label: string | null;
      notes: string | null;
    }>(
      `SELECT n.*, s.solar_system_name, s.security, s.wormhole_class, s.wormhole_effect
       FROM wh_nodes n
       LEFT JOIN sde_solar_systems s ON s.solar_system_id = n.solar_system_id
       WHERE n.map_id = ?`,
      [mapId]
    );

    const edges = this.db.all<{
      id: number;
      map_id: number;
      source_system_id: number;
      target_system_id: number;
      wh_type: string | null;
      mass_status: WhEdgeDto['massStatus'];
      time_status: WhEdgeDto['timeStatus'];
    }>('SELECT * FROM wh_edges WHERE map_id = ?', [mapId]);

    const sigs = this.db.all<{
      map_id: number;
      solar_system_id: number;
      sig_id: string;
      sig_group: string;
      sig_type: string | null;
      name: string | null;
      updated_at: number;
    }>('SELECT * FROM wh_signatures WHERE map_id = ? ORDER BY sig_id ASC', [mapId]);

    return {
      nodes: nodes.map((n) => ({
        mapId: n.map_id,
        solarSystemId: n.solar_system_id,
        solarSystemName: n.solar_system_name ?? `System #${n.solar_system_id}`,
        security: n.security ?? 0,
        wormholeClass: n.wormhole_class,
        wormholeEffect: n.wormhole_effect,
        posX: n.pos_x,
        posY: n.pos_y,
        customLabel: n.custom_label ?? '',
        notes: n.notes ?? '',
        statics: n.notes?.startsWith('Statics:') ? n.notes.slice('Statics:'.length).trim() : undefined
      })),
      edges: edges.map((e) => ({
        id: e.id,
        mapId: e.map_id,
        sourceSystemId: e.source_system_id,
        targetSystemId: e.target_system_id,
        whType: e.wh_type ?? 'K162',
        massStatus: e.mass_status,
        timeStatus: e.time_status
      })),
      signatures: sigs.map((s) => ({
        mapId: s.map_id,
        solarSystemId: s.solar_system_id,
        sigId: s.sig_id,
        sigGroup: s.sig_group,
        sigType: s.sig_type ?? '',
        name: s.name ?? '',
        updatedAt: s.updated_at
      }))
    };
  }

  addNode(mapId: number, solarSystemId: number, posX = 120, posY = 120): void {
    this.db.run(
      `INSERT OR IGNORE INTO wh_nodes (map_id, solar_system_id, pos_x, pos_y, custom_label, notes)
       VALUES (?, ?, ?, ?, '', '')`,
      [mapId, solarSystemId, posX, posY]
    );
  }

  updateNodePosition(mapId: number, solarSystemId: number, posX: number, posY: number): void {
    this.db.run(
      'UPDATE wh_nodes SET pos_x = ?, pos_y = ? WHERE map_id = ? AND solar_system_id = ?',
      [posX, posY, mapId, solarSystemId]
    );
  }

  updateEdgeStatus(
    edgeId: number,
    patch: { whType?: string; massStatus?: WhEdgeDto['massStatus']; timeStatus?: WhEdgeDto['timeStatus'] }
  ): void {
    if (patch.whType !== undefined) {
      this.db.run('UPDATE wh_edges SET wh_type = ? WHERE id = ?', [patch.whType, edgeId]);
    }
    if (patch.massStatus !== undefined) {
      this.db.run('UPDATE wh_edges SET mass_status = ? WHERE id = ?', [patch.massStatus, edgeId]);
    }
    if (patch.timeStatus !== undefined) {
      this.db.run('UPDATE wh_edges SET time_status = ? WHERE id = ?', [patch.timeStatus, edgeId]);
    }
  }

  saveSignatures(mapId: number, solarSystemId: number, entries: ParsedCosmicSignature[]): void {
    const now = Date.now();
    this.db.transaction((raw) => {
      raw.run('DELETE FROM wh_signatures WHERE map_id = ? AND solar_system_id = ?', [
        mapId,
        solarSystemId
      ]);
      const stmt = raw.prepare(
        `INSERT INTO wh_signatures (map_id, solar_system_id, sig_id, sig_group, sig_type, name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      try {
        for (const e of entries) {
          stmt.run([mapId, solarSystemId, e.sigId, e.sigGroup, e.sigType, e.name, now]);
        }
      } finally {
        stmt.free();
      }
    });
  }

  private isJSpace(solarSystemId: number, solarSystemName: string | null, _whClass: number | null): boolean {
    if (solarSystemName && /^J\d{6}$/i.test(solarSystemName)) return true;
    return solarSystemId >= 31_000_000 && solarSystemId < 32_000_000;
  }

  private async enrichFromEllatha(solarSystemId: number, sysName: string, mapId: number): Promise<void> {
    try {
      const res = await fetch(`https://www.ellatha.com/eve/wormholeSystemview.asp?key=${encodeURIComponent(sysName)}`, {
        headers: { 'User-Agent': 'NewEdenLens/0.1.0' }
      });
      if (!res.ok) return;
      const html = await res.text();
      const classMatch = /Class\s*(\d+)/i.exec(html);
      const effectMatch = /Effect<\/td>\s*<td[^>]*>([^<]+)/i.exec(html);
      const staticMatches = Array.from(html.matchAll(/\b([A-Z]\d{3})\b/g)).map((m) => m[1]);
      const uniqueStatics = Array.from(new Set(staticMatches)).slice(0, 3);

      const whClass = classMatch ? Number(classMatch[1]) : null;
      const effect = effectMatch ? effectMatch[1].trim() : null;
      if (whClass || (effect && !/none/i.test(effect))) {
        this.db.run(
          `UPDATE sde_solar_systems
           SET wormhole_class = COALESCE(wormhole_class, ?),
               wormhole_effect = COALESCE(wormhole_effect, ?)
           WHERE solar_system_id = ?`,
          [whClass, effect && !/none/i.test(effect) ? effect : null, solarSystemId]
        );
      }
      if (uniqueStatics.length > 0) {
        this.db.run(
          `UPDATE wh_nodes SET notes = ? WHERE map_id = ? AND solar_system_id = ? AND (notes IS NULL OR notes = '')`,
          [`Statics: ${uniqueStatics.join(' / ')}`, mapId, solarSystemId]
        );
      }
    } catch {
      // Ellatha optional
    }
  }

  clearMap(mapId: number): void {
    this.db.transaction((raw) => {
      raw.run('DELETE FROM wh_signatures WHERE map_id = ?', [mapId]);
      raw.run('DELETE FROM wh_edges WHERE map_id = ?', [mapId]);
      raw.run('DELETE FROM wh_nodes WHERE map_id = ?', [mapId]);
    });
    this.lastKnownSystem.clear();
  }

  async pollLocationsAndTrack(
    mapId: number,
    characterId: number | null = null
  ): Promise<{
    trackedLocations: Array<{ characterId: number; solarSystemId: number }>;
  }> {
    if (characterId === null) {
      return { trackedLocations: [] };
    }
    const chars = this.characterRepo
      .listCharacters()
      .filter((c) => c.characterId === characterId);
    const trackedLocations: Array<{ characterId: number; solarSystemId: number }> = [];

    for (const c of chars) {
      if (!c.scopes.includes('esi-location.read_location.v1')) continue;
      try {
        const loc = await this.esiClient.request<{ solar_system_id: number }>(
          `/characters/${c.characterId}/location`,
          { characterId: c.characterId }
        );
        if (!loc?.solar_system_id) continue;
        trackedLocations.push({ characterId: c.characterId, solarSystemId: loc.solar_system_id });

        const sys = this.db.get<{
          solar_system_name: string;
          wormhole_class: number | null;
        }>(
          'SELECT solar_system_name, wormhole_class FROM sde_solar_systems WHERE solar_system_id = ?',
          [loc.solar_system_id]
        );
        const sysName = sys?.solar_system_name ?? '';
        const currIsJ = this.isJSpace(loc.solar_system_id, sysName, sys?.wormhole_class ?? null);
        const prevSys = this.lastKnownSystem.get(c.characterId);
        this.lastKnownSystem.set(c.characterId, loc.solar_system_id);

        if (!prevSys) {
          // First poll: only add if already inside J-space
          if (!currIsJ) continue;
          const cnt =
            this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM wh_nodes WHERE map_id = ?', [mapId])
              ?.cnt ?? 0;
          this.addNode(mapId, loc.solar_system_id, 100 + (cnt % 5) * 210, 80 + Math.floor(cnt / 5) * 140);
          if (sys && sys.wormhole_class === null && sysName) {
            void this.enrichFromEllatha(loc.solar_system_id, sysName, mapId);
          }
          continue;
        }

        const prevRow = this.db.get<{ solar_system_name: string; wormhole_class: number | null }>(
          'SELECT solar_system_name, wormhole_class FROM sde_solar_systems WHERE solar_system_id = ?',
          [prevSys]
        );
        const prevIsJ = this.isJSpace(prevSys, prevRow?.solar_system_name ?? null, prevRow?.wormhole_class ?? null);

        // K-space -> K-space: just remember last K-space system, do not map
        if (!prevIsJ && !currIsJ) {
          continue;
        }

        // Entering J-space from K-space: add both the entry K-space system and the J-system
        if (!prevIsJ && currIsJ) {
          const cnt0 =
            this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM wh_nodes WHERE map_id = ?', [mapId])
              ?.cnt ?? 0;
          this.addNode(mapId, prevSys, 100 + (cnt0 % 5) * 210, 80 + Math.floor(cnt0 / 5) * 140);
        }

        // Add current system (J-space, or K-space exit when coming from J-space)
        const cnt1 =
          this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM wh_nodes WHERE map_id = ?', [mapId])
            ?.cnt ?? 0;
        this.addNode(mapId, loc.solar_system_id, 100 + (cnt1 % 5) * 210, 80 + Math.floor(cnt1 / 5) * 140);

        if (currIsJ && sys && sys.wormhole_class === null && sysName) {
          void this.enrichFromEllatha(loc.solar_system_id, sysName, mapId);
        }

        if (prevSys !== loc.solar_system_id) {
          this.db.run(
            `INSERT OR IGNORE INTO wh_edges (map_id, source_system_id, target_system_id, wh_type, mass_status, time_status, created_at)
             VALUES (?, ?, ?, 'K162', 'stable', 'normal', ?)`,
            [mapId, prevSys, loc.solar_system_id, Date.now()]
          );
        }
      } catch {
        // ignore transient location errors
      }
    }

    return { trackedLocations };
  }

  async fetchTheraTurnur(originSystemId: number | null = null): Promise<TheraTurnurConnectionDto[]> {
    interface EveScoutSig {
      id: number;
      created_at?: string;
      updated_at?: string;
      wh_type?: string;
      max_ship_size?: string;
      expires_at?: string;
      remaining_hours?: number;
      out_system_id?: number;
      out_system_name?: string;
      out_signature?: string;
      in_system_id?: number;
      in_system_class?: string;
      in_system_name?: string;
      in_region_id?: number;
      in_region_name?: string;
      in_signature?: string;
    }

    const res = await fetch('https://api.eve-scout.com/v2/public/signatures', {
      headers: { 'User-Agent': 'NewEdenLens/0.1.0', Accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`EVE-Scout API returned HTTP ${res.status}`);
    }
    const raw = (await res.json()) as EveScoutSig[];
    if (!Array.isArray(raw)) return [];

    // Build stargate adjacency for jump distance calculation
    const gateRows = this.db.all<{ fromId: number; toId: number }>(
      'SELECT from_solar_system_id AS fromId, to_solar_system_id AS toId FROM sde_stargates'
    );
    const adj = new Map<number, number[]>();
    for (const g of gateRows) {
      let arr = adj.get(g.fromId);
      if (!arr) {
        arr = [];
        adj.set(g.fromId, arr);
      }
      arr.push(g.toId);
    }

    const bfs = (startId: number): Map<number, number> => {
      const dist = new Map<number, number>();
      dist.set(startId, 0);
      const queue: number[] = [startId];
      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const d = dist.get(curr)!;
        const neighbors = adj.get(curr);
        if (!neighbors) continue;
        for (const nb of neighbors) {
          if (!dist.has(nb)) {
            dist.set(nb, d + 1);
            queue.push(nb);
          }
        }
      }
      return dist;
    };

    const jitaDist = bfs(30000142);
    const originDist = originSystemId && originSystemId > 0 ? bfs(originSystemId) : null;

    const inIds = Array.from(new Set(raw.map((s) => s.in_system_id).filter((id): id is number => Boolean(id))));
    const secMap = new Map<number, number>();
    if (inIds.length > 0) {
      const ph = inIds.map(() => '?').join(',');
      const sysRows = this.db.all<{ solar_system_id: number; security: number }>(
        `SELECT solar_system_id, security FROM sde_solar_systems WHERE solar_system_id IN (${ph})`,
        inIds
      );
      for (const r of sysRows) secMap.set(r.solar_system_id, r.security);
    }

    return raw
      .filter((s) => s.in_system_id && s.in_system_name)
      .map((s) => {
        const inId = s.in_system_id!;
        const sourceSystem: 'Thera' | 'Turnur' =
          s.out_system_name?.toLowerCase() === 'turnur' || s.out_system_id === 30002086
            ? 'Turnur'
            : 'Thera';
        return {
          id: s.id,
          sourceSystem,
          whType: s.wh_type ?? '?',
          maxShipSize: s.max_ship_size ?? 'unknown',
          createdAt: s.created_at ?? '',
          updatedAt: s.updated_at ?? s.created_at ?? '',
          expiresAt: s.expires_at ?? '',
          remainingHours: typeof s.remaining_hours === 'number' ? s.remaining_hours : 0,
          outSignature: s.out_signature ?? '???',
          inSystemId: inId,
          inSystemName: s.in_system_name ?? `System ${inId}`,
          inSystemClass: s.in_system_class ?? '',
          inRegionId: s.in_region_id ?? 0,
          inRegionName: s.in_region_name ?? '',
          inSignature: s.in_signature ?? '???',
          security: secMap.has(inId) ? secMap.get(inId)! : null,
          jumpsFromOrigin: originDist ? (originDist.get(inId) ?? null) : null,
          jumpsFromJita: jitaDist.get(inId) ?? null
        };
      });
  }
}

