import type { InvTypeRow, SdeStatusSnapshot, SolarSystemRow } from '@shared/types/esi';
import type { LocalDatabase } from '../connection';

export class SdeRepository {
  constructor(private readonly db: LocalDatabase) {}

  getStatus(): SdeStatusSnapshot {
    const metaRows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM sde_meta');
    const meta = new Map(metaRows.map((m) => [m.key, m.value]));

    const typesCount = this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sde_inv_types')?.cnt ?? 0;
    const systemsCount = this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sde_solar_systems')?.cnt ?? 0;
    const stargatesCount = this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sde_stargates')?.cnt ?? 0;
    const dogmaCount = this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sde_dogma_attributes')?.cnt ?? 0;

    return {
      installed: typesCount > 0 && systemsCount > 0,
      importedAt: meta.has('imported_at') ? Number(meta.get('imported_at')) : null,
      source: meta.get('source') ?? null,
      counts: {
        types: typesCount,
        systems: systemsCount,
        stargates: stargatesCount,
        dogmaAttributes: dogmaCount
      }
    };
  }

  searchTypes(query: string, limit = 40): InvTypeRow[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = this.db.all<{
      type_id: number;
      group_id: number;
      type_name: string;
      description: string | null;
      mass: number | null;
      volume: number | null;
      packaged_volume: number | null;
      capacity: number | null;
      market_group_id: number | null;
      published: number;
      group_name: string | null;
      category_id: number | null;
      category_name: string | null;
    }>(
      `SELECT t.*, g.group_name, g.category_id, c.category_name
       FROM sde_inv_types t
       LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
       LEFT JOIN sde_inv_categories c ON c.category_id = g.category_id
       WHERE t.type_name LIKE ? AND t.published = 1
       ORDER BY CASE WHEN LOWER(t.type_name) = LOWER(?) THEN 0
                     WHEN LOWER(t.type_name) LIKE LOWER(?) THEN 1
                     ELSE 2 END,
                LENGTH(t.type_name) ASC
       LIMIT ?`,
      [`%${trimmed}%`, trimmed, `${trimmed}%`, limit]
    );
    return rows.map(mapInvTypeRow);
  }

  lookupTypesByNames(names: string[]): Record<string, InvTypeRow> {
    const result: Record<string, InvTypeRow> = {};
    const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
    if (unique.length === 0) return result;

    const batchSize = 200;
    for (let i = 0; i < unique.length; i += batchSize) {
      const slice = unique.slice(i, i + batchSize);
      const placeholders = slice.map(() => '?').join(',');
      const rows = this.db.all<{
        type_id: number;
        group_id: number;
        type_name: string;
        description: string | null;
        mass: number | null;
        volume: number | null;
        packaged_volume: number | null;
        capacity: number | null;
        market_group_id: number | null;
        published: number;
        group_name: string | null;
        category_id: number | null;
        category_name: string | null;
      }>(
        `SELECT t.*, g.group_name, g.category_id, c.category_name
         FROM sde_inv_types t
         LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
         LEFT JOIN sde_inv_categories c ON c.category_id = g.category_id
         WHERE LOWER(t.type_name) IN (${placeholders})`,
        slice.map((s) => s.toLowerCase())
      );
      for (const row of rows) {
        result[row.type_name.toLowerCase()] = mapInvTypeRow(row);
      }
    }
    return result;
  }

  searchSystems(query: string, limit = 30): SolarSystemRow[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = this.db.all<{
      solar_system_id: number;
      region_id: number;
      constellation_id: number;
      solar_system_name: string;
      security: number;
      x: number;
      y: number;
      z: number;
      sun_type_id: number | null;
      wormhole_class: number | null;
      wormhole_effect: string | null;
      region_name: string | null;
    }>(
      `SELECT s.*, r.region_name
       FROM sde_solar_systems s
       LEFT JOIN sde_regions r ON r.region_id = s.region_id
       WHERE s.solar_system_name LIKE ?
       ORDER BY CASE WHEN LOWER(s.solar_system_name) = LOWER(?) THEN 0
                     WHEN LOWER(s.solar_system_name) LIKE LOWER(?) THEN 1
                     ELSE 2 END,
                s.solar_system_name ASC
       LIMIT ?`,
      [`%${trimmed}%`, trimmed, `${trimmed}%`, limit]
    );
    return rows.map((r) => ({
      solarSystemId: r.solar_system_id,
      regionId: r.region_id,
      constellationId: r.constellation_id,
      solarSystemName: r.solar_system_name,
      security: r.security,
      x: r.x,
      y: r.y,
      z: r.z,
      sunTypeId: r.sun_type_id,
      wormholeClass: r.wormhole_class,
      wormholeEffect: r.wormhole_effect,
      regionName: r.region_name ?? undefined
    }));
  }
}

function mapInvTypeRow(r: {
  type_id: number;
  group_id: number;
  type_name: string;
  description: string | null;
  mass: number | null;
  volume: number | null;
  packaged_volume: number | null;
  capacity: number | null;
  market_group_id: number | null;
  published: number;
  group_name: string | null;
  category_id: number | null;
  category_name: string | null;
}): InvTypeRow {
  return {
    typeId: r.type_id,
    groupId: r.group_id,
    typeName: r.type_name,
    description: r.description,
    mass: r.mass,
    volume: r.volume,
    packagedVolume: r.packaged_volume,
    capacity: r.capacity,
    marketGroupId: r.market_group_id,
    published: r.published,
    groupName: r.group_name ?? undefined,
    categoryId: r.category_id ?? undefined,
    categoryName: r.category_name ?? undefined
  };
}

