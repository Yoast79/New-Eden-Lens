import type { ParsedDScanEntry } from '@shared/types/clipboard';
import type {
  DScanGroupSummary,
  LocalPilotIntelDto,
  ManualStandingRow
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { EsiClient } from './esi-client';

const CAPITAL_GROUPS = new Set([
  'Carrier',
  'Dreadnought',
  'Lancer Dreadnought',
  'Force Auxiliary',
  'Supercarrier',
  'Titan',
  'Jump Freighter',
  'Capital Industrial Ship'
]);
const LOGI_GROUPS = new Set(['Logistics', 'Logistics Frigate']);
const RECON_CYNO_GROUPS = new Set([
  'Force Recon Ship',
  'Combat Recon Ship',
  'Black Ops',
  'Covert Ops',
  'Stealth Bomber'
]);
const TACKLE_GROUPS = new Set([
  'Interceptor',
  'Interdictor',
  'Heavy Interdiction Cruiser'
]);

const COMMAND_GROUPS = new Set(['Command Ship', 'Command Destroyer', 'Flag Cruiser']);
const T3_GROUPS = new Set(['Strategic Cruiser', 'Tactical Destroyer']);
const BATTLESHIP_GROUPS = new Set(['Battleship', 'Marauder']);
const BATTLECRUISER_GROUPS = new Set(['Battlecruiser', 'Attack Battlecruiser', 'Combat Battlecruiser']);
const CRUISER_GROUPS = new Set(['Cruiser', 'Heavy Assault Cruiser']);
const DESTROYER_GROUPS = new Set(['Destroyer']);
const FRIGATE_GROUPS = new Set(['Frigate', 'Assault Frigate', 'Electronic Attack Ship', 'Corvette', 'Shuttle']);
const MINING_GROUPS = new Set(['Mining Barge', 'Exhumer', 'Expedition Frigate', 'Industrial Command Ship']);
const HAULER_GROUPS = new Set(['Hauler', 'Industrial', 'Blockade Runner', 'Deep Space Transport', 'Freighter']);

function classifyThreatTag(groupName: string, categoryId: number | null): DScanGroupSummary['threatTag'] {
  if (CAPITAL_GROUPS.has(groupName)) return 'CAPITAL';
  if (RECON_CYNO_GROUPS.has(groupName)) return 'RECON/CYNO';
  if (LOGI_GROUPS.has(groupName)) return 'LOGI';
  if (TACKLE_GROUPS.has(groupName)) return 'TACKLE';
  if (COMMAND_GROUPS.has(groupName)) return 'COMMAND';
  if (T3_GROUPS.has(groupName)) return 'T3 CRUISER';
  if (BATTLESHIP_GROUPS.has(groupName)) return 'BATTLESHIP';
  if (BATTLECRUISER_GROUPS.has(groupName)) return 'BATTLECRUISER';
  if (CRUISER_GROUPS.has(groupName)) return 'CRUISER';
  if (DESTROYER_GROUPS.has(groupName)) return 'DESTROYER';
  if (FRIGATE_GROUPS.has(groupName)) return 'FRIGATE';
  if (MINING_GROUPS.has(groupName)) return 'MINING';
  if (HAULER_GROUPS.has(groupName)) return 'HAULER';
  if (categoryId === 18) return 'DRONE';
  if (categoryId === 65 || categoryId === 22 || categoryId === 23 || categoryId === 40) return 'STRUCTURE';
  if (categoryId === 6) return 'COMBAT';
  return 'OTHER';
}

export class IntelService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly esiClient: EsiClient
  ) {}

  analyzeDScan(entries: ParsedDScanEntry[]): DScanGroupSummary[] {
    const groupsMap = new Map<string, DScanGroupSummary>();

    for (const entry of entries) {
      const row = entry.typeId
        ? this.db.get<{
            type_id: number;
            type_name: string;
            group_name: string | null;
            category_id: number | null;
            category_name: string | null;
          }>(
            `SELECT t.type_id, t.type_name, g.group_name, g.category_id, c.category_name
             FROM sde_inv_types t
             LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
             LEFT JOIN sde_inv_categories c ON c.category_id = g.category_id
             WHERE t.type_id = ?`,
            [entry.typeId]
          )
        : this.db.get<{
            type_id: number;
            type_name: string;
            group_name: string | null;
            category_id: number | null;
            category_name: string | null;
          }>(
            `SELECT t.type_id, t.type_name, g.group_name, g.category_id, c.category_name
             FROM sde_inv_types t
             LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
             LEFT JOIN sde_inv_categories c ON c.category_id = g.category_id
             WHERE LOWER(t.type_name) = LOWER(?)`,
            [entry.typeName]
          );

      const groupName = row?.group_name ?? 'Unknown';
      const categoryName = row?.category_name ?? 'Unknown';
      const threatTag = classifyThreatTag(groupName, row?.category_id ?? null);

      let group = groupsMap.get(groupName);
      if (!group) {
        group = { groupName, categoryName, threatTag, count: 0, items: [] };
        groupsMap.set(groupName, group);
      }

      group.count += 1;
      const existingItem = group.items.find(
        (i) => i.typeName === (row?.type_name ?? entry.typeName) && i.name === entry.name
      );
      if (existingItem) {
        existingItem.count += 1;
      } else {
        group.items.push({
          typeId: row?.type_id ?? entry.typeId ?? null,
          typeName: row?.type_name ?? entry.typeName,
          name: entry.name,
          distanceRaw: entry.distanceRaw,
          count: 1
        });
      }
    }

    const orderPriority: Record<DScanGroupSummary['threatTag'], number> = {
      CAPITAL: 0,
      'RECON/CYNO': 1,
      LOGI: 2,
      TACKLE: 3,
      COMMAND: 4,
      'T3 CRUISER': 5,
      BATTLESHIP: 6,
      BATTLECRUISER: 7,
      CRUISER: 8,
      DESTROYER: 9,
      FRIGATE: 10,
      COMBAT: 11,
      MINING: 12,
      HAULER: 13,
      STRUCTURE: 14,
      DRONE: 15,
      OTHER: 16
    };

    return Array.from(groupsMap.values()).sort(
      (a, b) => orderPriority[a.threatTag] - orderPriority[b.threatTag] || b.count - a.count
    );
  }

  async analyzeLocalPilots(
    pilotNames: string[],
    activeCharacterId: number | null = null
  ): Promise<LocalPilotIntelDto[]> {
    const uniqueNames = Array.from(new Set(pilotNames.map((n) => n.trim()).filter(Boolean))).slice(0, 80);
    if (uniqueNames.length === 0) return [];

    // 1. Resolve character IDs via ESI POST /universe/ids
    const idsRes = await this.esiClient
      .request<{ characters?: Array<{ id: number; name: string }> }>('/universe/ids', {
        method: 'POST',
        body: uniqueNames
      })
      .catch(() => ({ characters: [] as Array<{ id: number; name: string }> }));

    const charIdByName = new Map(
      (idsRes.characters ?? []).map((c) => [c.name.toLowerCase(), { id: c.id, name: c.name }])
    );

    const charIds = Array.from(charIdByName.values()).map((c) => c.id);

    // 2. Bulk fetch affiliations (/characters/affiliation)
    const affiliations =
      charIds.length > 0
        ? await this.esiClient
            .request<
              Array<{
                character_id: number;
                corporation_id: number;
                alliance_id?: number;
              }>
            >('/characters/affiliation', { method: 'POST', body: charIds })
            .catch(() => [])
        : [];

    const affById = new Map(affiliations.map((a) => [a.character_id, a]));

    // 3. Resolve corp & alliance names via POST /universe/names
    const orgIds = Array.from(
      new Set(
        affiliations.flatMap((a) => [
          a.corporation_id,
          ...(a.alliance_id ? [a.alliance_id] : [])
        ])
      )
    );
    const orgNamesRes =
      orgIds.length > 0
        ? await this.esiClient
            .request<Array<{ id: number; name: string }>>('/universe/names', {
              method: 'POST',
              body: orgIds
            })
            .catch(() => [])
        : [];
    const orgNameMap = new Map(orgNamesRes.map((o) => [o.id, o.name]));

    // 4. Load Standings (Character / Corporation / Alliance from ESI + Manual from SQLite)
    const standingByContactId = new Map<number, { standing: number; source: string }>();
    if (activeCharacterId !== null) {
      const charInfo = await this.esiClient
        .request<{ corporation_id: number; alliance_id?: number }>(`/characters/${activeCharacterId}`)
        .catch(() => null);

      const [charContacts, corpContacts, allianceContacts] = await Promise.all([
        this.esiClient
          .request<Array<{ contact_id: number; standing: number }>>(
            `/characters/${activeCharacterId}/contacts`,
            { characterId: activeCharacterId }
          )
          .catch(() => []),
        charInfo?.corporation_id
          ? this.esiClient
              .request<Array<{ contact_id: number; standing: number }>>(
                `/corporations/${charInfo.corporation_id}/contacts`,
                { characterId: activeCharacterId }
              )
              .catch(() => [])
          : Promise.resolve([]),
        charInfo?.alliance_id
          ? this.esiClient
              .request<Array<{ contact_id: number; standing: number }>>(
                `/alliances/${charInfo.alliance_id}/contacts`,
                { characterId: activeCharacterId }
              )
              .catch(() => [])
          : Promise.resolve([])
      ]);

      for (const c of allianceContacts) standingByContactId.set(c.contact_id, { standing: c.standing, source: 'Alliance' });
      for (const c of corpContacts) standingByContactId.set(c.contact_id, { standing: c.standing, source: 'Corp' });
      for (const c of charContacts) standingByContactId.set(c.contact_id, { standing: c.standing, source: 'Character' });
    }

    const manualRows = this.listManualStandings();
    const manualByName = new Map(manualRows.map((m) => [m.targetName.toLowerCase(), m]));

    // 5. Check zKillboard public stats for up to 15 pilots to flag cyno/hunter/high-danger pilots
    const zkbStatsMap = new Map<
      number,
      { dangerRatio?: number; shipsDestroyed?: number; shipsLost?: number; soloKills?: number }
    >();
    const zkbTargets = charIds.slice(0, 15);
    await Promise.all(
      zkbTargets.map(async (cid) => {
        try {
          const res = await fetch(`https://zkillboard.com/api/stats/characterID/${cid}/`, {
            headers: { 'User-Agent': 'NewEdenLens/0.1.0', Accept: 'application/json' }
          });
          if (!res.ok) return;
          const json = (await res.json()) as {
            dangerRatio?: number;
            shipsDestroyed?: number;
            shipsLost?: number;
            soloKills?: number;
          };
          zkbStatsMap.set(cid, json);
        } catch {
          // zKillboard optional
        }
      })
    );

    const results: LocalPilotIntelDto[] = uniqueNames.map((rawName) => {
      const matched = charIdByName.get(rawName.toLowerCase());
      const aff = matched ? affById.get(matched.id) : undefined;
      const corpName = aff ? (orgNameMap.get(aff.corporation_id) ?? null) : null;
      const allianceName = aff?.alliance_id ? (orgNameMap.get(aff.alliance_id) ?? null) : null;

      // Resolve standing priority: Manual (exact pilot/corp/alliance) > Character > Corp > Alliance
      const manualMatch =
        manualByName.get(rawName.toLowerCase()) ??
        (corpName ? manualByName.get(corpName.toLowerCase()) : undefined) ??
        (allianceName ? manualByName.get(allianceName.toLowerCase()) : undefined);

      const esiStanding = matched
        ? (standingByContactId.get(matched.id) ??
            (aff?.corporation_id ? standingByContactId.get(aff.corporation_id) : undefined) ??
            (aff?.alliance_id ? standingByContactId.get(aff.alliance_id) : undefined))
        : undefined;

      const standing = manualMatch ? manualMatch.standing : (esiStanding?.standing ?? null);
      const standingSource = manualMatch ? manualMatch.sourceLabel : (esiStanding?.source ?? null);

      if (!matched) {
        return {
          name: rawName,
          characterId: null,
          corporationId: null,
          corporationName: null,
          allianceId: null,
          allianceName: null,
          securityStatus: null,
          dangerRatio: null,
          shipsDestroyed: null,
          shipsLost: null,
          standing,
          standingSource,
          threatBadges: []
        };
      }

      const zkb = zkbStatsMap.get(matched.id);
      const badges: string[] = [];

      const dangerRatio = zkb?.dangerRatio ?? null;
      const shipsDestroyed = zkb?.shipsDestroyed ?? null;
      const shipsLost = zkb?.shipsLost ?? null;

      if (dangerRatio !== null && dangerRatio >= 75) badges.push('HIGH DANGER');
      if ((zkb?.soloKills ?? 0) >= 25) badges.push('SOLO HUNTER');
      if (shipsDestroyed !== null && shipsDestroyed >= 500) badges.push('VETERAN PVPER');
      if (shipsDestroyed !== null && shipsLost !== null && shipsDestroyed > 30 && shipsLost < 10) {
        badges.push('POTENTIAL CYNO/ALT');
      }

      return {
        name: matched.name,
        characterId: matched.id,
        corporationId: aff?.corporation_id ?? null,
        corporationName: corpName,
        allianceId: aff?.alliance_id ?? null,
        allianceName,
        securityStatus: null,
        dangerRatio,
        shipsDestroyed,
        shipsLost,
        standing,
        standingSource,
        threatBadges: badges
      };
    });

    return results.sort((a, b) => (b.dangerRatio ?? -1) - (a.dangerRatio ?? -1));
  }

  listManualStandings(): ManualStandingRow[] {
    const rows = this.db.all<{
      id: number;
      target_name: string;
      standing: number;
      source_label: string;
      notes: string;
      updated_at: number;
    }>('SELECT * FROM manual_standings ORDER BY standing ASC, target_name ASC');

    return rows.map((r) => ({
      id: r.id,
      targetName: r.target_name,
      standing: r.standing,
      sourceLabel: r.source_label,
      notes: r.notes,
      updatedAt: r.updated_at
    }));
  }

  upsertManualStanding(input: {
    targetName: string;
    standing: number;
    sourceLabel: string;
    notes?: string;
  }): ManualStandingRow[] {
    this.db.run(
      `INSERT INTO manual_standings (target_name, standing, source_label, notes, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(target_name) DO UPDATE SET
         standing = excluded.standing,
         source_label = excluded.source_label,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
      [input.targetName.trim(), input.standing, input.sourceLabel, input.notes ?? '', Date.now()]
    );
    return this.listManualStandings();
  }

  deleteManualStanding(id: number): ManualStandingRow[] {
    this.db.run('DELETE FROM manual_standings WHERE id = ?', [id]);
    return this.listManualStandings();
  }
}

