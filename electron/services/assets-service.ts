import type { AssetItemDto } from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { CharacterRepository } from '../db/repositories/characterRepo';
import type { EsiClient } from './esi-client';

export class AssetsService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly characterRepo: CharacterRepository,
    private readonly esiClient: EsiClient
  ) {}

  async syncAssets(characterId: number | null): Promise<AssetItemDto[]> {
    const targets =
      characterId !== null
        ? [characterId]
        : this.characterRepo.listCharacters().map((c) => c.characterId);

    const now = Date.now();
    await this.ensureGlobalPricesSynced(now);

    const allStationIds = new Set<number>();
    const allItemIds = new Set<number>();
    const rawStructureCandidates: Array<{ locationId: number; cid: number }> = [];

    for (const cid of targets) {
      const assets = await this.esiClient
        .requestAllPages<{
          item_id: number;
          type_id: number;
          location_id: number;
          location_type: string;
          location_flag: string;
          quantity: number;
          is_singleton: boolean;
        }>(`/characters/${cid}/assets`, { characterId: cid })
        .catch(() => null);

      if (!assets) continue;

      // Also check active ship & location in case pilot is in space (active ship hull is omitted from /assets when undocked)
      const [activeShip, activeLoc] = await Promise.all([
        this.esiClient
          .request<{ ship_item_id: number; ship_name: string; ship_type_id: number }>(
            `/characters/${cid}/ship`,
            { characterId: cid }
          )
          .catch(() => null),
        this.esiClient
          .request<{ solar_system_id: number; station_id?: number; structure_id?: number }>(
            `/characters/${cid}/location`,
            { characterId: cid }
          )
          .catch(() => null)
      ]);

      const mergedAssets = [...assets];
      if (
        activeShip?.ship_item_id &&
        !mergedAssets.some((a) => a.item_id === activeShip.ship_item_id)
      ) {
        const locId =
          activeLoc?.station_id ?? activeLoc?.structure_id ?? activeLoc?.solar_system_id ?? 0;
        const locType = activeLoc?.station_id
          ? 'station'
          : activeLoc?.structure_id
            ? 'other'
            : 'solar_system';
        if (locId > 0) {
          mergedAssets.push({
            item_id: activeShip.ship_item_id,
            type_id: activeShip.ship_type_id,
            location_id: locId,
            location_type: locType,
            location_flag: activeLoc?.station_id || activeLoc?.structure_id ? 'Hangar' : 'InSpace',
            quantity: 1,
            is_singleton: true
          });
        }
      }

      this.db.transaction((raw) => {
        raw.run('DELETE FROM character_assets WHERE character_id = ?', [cid]);
        const stmt = raw.prepare(
          `INSERT INTO character_assets (
             character_id, item_id, type_id, location_id, location_type, location_flag, quantity, is_singleton, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        try {
          for (const a of mergedAssets) {
            stmt.run([
              cid,
              a.item_id,
              a.type_id,
              a.location_id,
              a.location_type,
              a.location_flag,
              a.quantity,
              a.is_singleton ? 1 : 0,
              now
            ]);
          }
        } finally {
          stmt.free();
        }
      });

      // Fetch custom names for singleton items (ships, station containers)
      const singletonIds = mergedAssets.filter((a) => a.is_singleton).map((a) => a.item_id);
      if (singletonIds.length > 0) {
        const nameRows: Array<{ item_id: number; name: string }> = [];
        for (let i = 0; i < singletonIds.length; i += 1000) {
          const chunk = singletonIds.slice(i, i + 1000);
          const res = await this.esiClient
            .request<Array<{ item_id: number; name: string }>>(`/characters/${cid}/assets/names`, {
              method: 'POST',
              characterId: cid,
              body: chunk
            })
            .catch(() => []);
          nameRows.push(...res);
        }
        this.db.transaction((raw) => {
          raw.run('DELETE FROM character_asset_names WHERE character_id = ?', [cid]);
          const stmt = raw.prepare(
            'INSERT OR REPLACE INTO character_asset_names (character_id, item_id, name) VALUES (?, ?, ?)'
          );
          try {
            for (const nr of nameRows) {
              if (nr.name && nr.name !== 'None') {
                stmt.run([cid, nr.item_id, nr.name]);
              }
            }
            if (activeShip?.ship_item_id && activeShip.ship_name) {
              stmt.run([cid, activeShip.ship_item_id, activeShip.ship_name]);
            }
          } finally {
            stmt.free();
          }
        });
      }

      for (const a of mergedAssets) {
        allItemIds.add(a.item_id);
        if (a.location_id >= 60_000_000 && a.location_id < 64_000_000) {
          allStationIds.add(a.location_id);
        } else if (a.location_id >= 1_000_000_000_000) {
          rawStructureCandidates.push({ locationId: a.location_id, cid });
        }
      }
    }

    // Only resolve Upwell Structures that are NOT ship/container item_ids!
    const structureTargets: Array<{ structureId: number; cid: number }> = [];
    const seenStructures = new Set<number>();
    for (const cand of rawStructureCandidates) {
      if (!allItemIds.has(cand.locationId) && !seenStructures.has(cand.locationId)) {
        seenStructures.add(cand.locationId);
        structureTargets.push({ structureId: cand.locationId, cid: cand.cid });
      }
    }

    await this.resolveStationAndStructureNames(Array.from(allStationIds), structureTargets, now);
    return this.listAssets(characterId);
  }

  private async ensureGlobalPricesSynced(now: number): Promise<void> {
    const latest = this.db.get<{ updated_at: number }>(
      'SELECT updated_at FROM market_global_prices LIMIT 1'
    );
    if (latest && now - latest.updated_at < 60 * 60 * 1000) return;

    const prices = await this.esiClient
      .request<Array<{ type_id: number; average_price?: number; adjusted_price?: number }>>(
        '/markets/prices'
      )
      .catch(() => null);
    if (!prices || prices.length === 0) return;

    this.db.transaction((raw) => {
      const stmt = raw.prepare(
        `INSERT OR REPLACE INTO market_global_prices (type_id, average_price, adjusted_price, updated_at)
         VALUES (?, ?, ?, ?)`
      );
      try {
        for (const p of prices) {
          stmt.run([p.type_id, p.average_price ?? 0, p.adjusted_price ?? 0, now]);
        }
      } finally {
        stmt.free();
      }
    });
  }

  private async resolveStationAndStructureNames(
    stationIds: number[],
    structures: Array<{ structureId: number; cid: number }>,
    now: number
  ): Promise<void> {
    const cachedRows = this.db.all<{ location_id: number }>('SELECT location_id FROM location_names_cache');
    const cachedSet = new Set(cachedRows.map((r) => r.location_id));

    const missingStations = stationIds.filter((id) => !cachedSet.has(id));
    for (let i = 0; i < missingStations.length; i += 500) {
      const chunk = missingStations.slice(i, i + 500);
      const resolved = await this.esiClient
        .request<Array<{ id: number; name: string }>>('/universe/names', {
          method: 'POST',
          body: chunk
        })
        .catch(() => []);
      if (resolved.length > 0) {
        this.db.transaction((raw) => {
          const stmt = raw.prepare(
            'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)'
          );
          try {
            for (const r of resolved) {
              stmt.run([r.id, r.name, now]);
            }
          } finally {
            stmt.free();
          }
        });
      }
    }

    const missingStructures = structures.filter((s) => !cachedSet.has(s.structureId));
    for (let i = 0; i < missingStructures.length; i += 5) {
      const batch = missingStructures.slice(i, i + 5);
      await Promise.all(
        batch.map(async ({ structureId, cid }) => {
          const info = await this.esiClient
            .request<{ name?: string; type_id?: number; solar_system_id?: number }>(
              `/universe/structures/${structureId}`,
              { characterId: cid }
            )
            .catch(() => null);
          if (info?.name) {
            this.db.run(
              'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)',
              [structureId, info.name, now]
            );
          }
        })
      );
    }
  }

  listAssets(characterId: number | null): AssetItemDto[] {
    const where = characterId !== null ? 'WHERE a.character_id = ?' : '';
    const rows = this.db.all<{
      item_id: number;
      character_id: number;
      character_name: string | null;
      type_id: number;
      type_name: string | null;
      group_name: string | null;
      location_id: number;
      location_flag: string;
      quantity: number;
      unit_price: number | null;
      sys_name: string | null;
      loc_name: string | null;
      custom_name: string | null;
    }>(
      `SELECT a.item_id, a.character_id, c.character_name, a.type_id, t.type_name, g.group_name,
              a.location_id, a.location_flag, a.quantity,
              COALESCE(
                (SELECT MIN(m.price) FROM market_orders_cache m
                 WHERE m.region_id IN (10000002, 19000001) AND m.type_id = a.type_id AND m.is_buy_order = 0),
                NULLIF(gp.average_price, 0),
                NULLIF(gp.adjusted_price, 0),
                0
              ) AS unit_price,
              s.solar_system_name AS sys_name,
              ln.name AS loc_name,
              an.name AS custom_name
       FROM character_assets a
       LEFT JOIN characters c ON c.character_id = a.character_id
       LEFT JOIN sde_inv_types t ON t.type_id = a.type_id
       LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
       LEFT JOIN sde_solar_systems s ON s.solar_system_id = a.location_id
       LEFT JOIN location_names_cache ln ON ln.location_id = a.location_id
       LEFT JOIN character_asset_names an ON an.character_id = a.character_id AND an.item_id = a.item_id
       LEFT JOIN market_global_prices gp ON gp.type_id = a.type_id
       ${where}
       ORDER BY (unit_price * a.quantity) DESC, t.type_name ASC`,
      characterId !== null ? [characterId] : undefined
    );

    const byItemId = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      byItemId.set(r.item_id, r);
    }

    const resolveLocation = (
      row: (typeof rows)[number]
    ): { name: string; destinationId: number | null } => {
      let current = row;
      const chain: string[] = [];
      const visited = new Set<number>([row.item_id]);

      for (let hop = 0; hop < 5; hop++) {
        const parent = byItemId.get(current.location_id);
        if (!parent || visited.has(parent.item_id)) break;
        visited.add(parent.item_id);
        const parentType = parent.type_name ?? `Type #${parent.type_id}`;
        const parentLabel =
          parent.custom_name && parent.custom_name !== parentType
            ? `${parent.custom_name} (${parentType})`
            : parentType;
        chain.push(parentLabel);
        current = parent;
      }

      const rootId = current.location_id;
      const isShipSlotFlag =
        current.location_flag.startsWith('HiSlot') ||
        current.location_flag.startsWith('MedSlot') ||
        current.location_flag.startsWith('LoSlot') ||
        current.location_flag.startsWith('RigSlot') ||
        current.location_flag.startsWith('SubSystemSlot') ||
        current.location_flag === 'DroneBay' ||
        current.location_flag === 'Cargo' ||
        current.location_flag === 'FleetHangar';
      const rootName =
        current.loc_name ??
        current.sys_name ??
        (rootId >= 60_000_000 && rootId < 64_000_000
          ? `Station #${rootId}`
          : rootId >= 1_000_000_000_000
            ? isShipSlotFlag
              ? `Ship #${rootId}`
              : `Upwell Structure #${rootId}`
            : `Location #${rootId}`);

      const destinationId =
        rootId >= 30_000_000 && !byItemId.has(rootId) ? rootId : null;

      if (chain.length > 0) {
        return { name: `${chain.join(' › ')} — ${rootName}`, destinationId };
      }
      return { name: rootName, destinationId };
    };

    const formatFlag = (flag: string): string => {
      if (flag === 'Unlocked' || flag === 'Hangar') return 'Item Hangar';
      if (flag === 'ShipHangar') return 'Ship Hangar';
      if (flag === 'DroneBay') return 'Drone Bay';
      if (flag === 'Cargo') return 'Cargo Hold';
      if (flag === 'FleetHangar') return 'Fleet Hangar';
      if (flag === 'AssetSafety') return 'Asset Safety';
      if (flag === 'Deliveries') return 'Deliveries';
      if (flag === 'SpecializedFuelBay') return 'Fuel Bay';
      if (flag === 'SpecializedOreHold') return 'Ore Hold';
      if (flag === 'SpecializedMineralHold') return 'Mineral Hold';
      if (flag.startsWith('HiSlot')) return `High Slot ${flag.slice(6)}`;
      if (flag.startsWith('MedSlot')) return `Mid Slot ${flag.slice(7)}`;
      if (flag.startsWith('LoSlot')) return `Low Slot ${flag.slice(6)}`;
      if (flag.startsWith('RigSlot')) return `Rig Slot ${flag.slice(7)}`;
      if (flag.startsWith('SubSystemSlot')) return `Subsystem ${flag.slice(13)}`;
      return flag;
    };

    return rows.map((r) => {
      const unitPrice = r.unit_price ?? 0;
      const displayType =
        r.custom_name && r.custom_name !== r.type_name
          ? `${r.custom_name} (${r.type_name ?? `Type #${r.type_id}`})`
          : (r.type_name ?? `Type #${r.type_id}`);
      const loc = resolveLocation(r);
      const parentItemId = byItemId.has(r.location_id) ? r.location_id : null;
      return {
        itemId: r.item_id,
        characterId: r.character_id,
        characterName: r.character_name ?? `Pilot #${r.character_id}`,
        typeId: r.type_id,
        typeName: displayType,
        groupName: r.group_name ?? 'Item',
        locationId: r.location_id,
        locationName: loc.name,
        locationFlag: formatFlag(r.location_flag),
        parentItemId,
        destinationId: loc.destinationId,
        quantity: r.quantity,
        unitPrice,
        totalValue: unitPrice * r.quantity
      };
    });
  }
}

