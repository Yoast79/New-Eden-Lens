import fs from 'fs';
import { FUZZWORK_DUMP_BASE } from '@shared/constants/eve';
import type { SdeImportProgress, SdeStatusSnapshot } from '@shared/types/esi';
import type { LocalDatabase } from '../db/connection';
import type { SdeRepository } from '../db/repositories/sdeRepo';

interface FuzzworkTableSpec {
  csvName: string;
  targetTable: string;
  columns: string[];
  mapRow: (row: Record<string, string>) => unknown[];
}

const FUZZWORK_TABLES: FuzzworkTableSpec[] = [
  {
    csvName: 'invCategories.csv',
    targetTable: 'sde_inv_categories',
    columns: ['category_id', 'category_name', 'published'],
    mapRow: (r) => [num(r.categoryID), str(r.categoryName), num(r.published)]
  },
  {
    csvName: 'invGroups.csv',
    targetTable: 'sde_inv_groups',
    columns: ['group_id', 'category_id', 'group_name', 'published'],
    mapRow: (r) => [num(r.groupID), num(r.categoryID), str(r.groupName), num(r.published)]
  },
  {
    csvName: 'invTypes.csv',
    targetTable: 'sde_inv_types',
    columns: [
      'type_id',
      'group_id',
      'type_name',
      'description',
      'mass',
      'volume',
      'packaged_volume',
      'capacity',
      'market_group_id',
      'published'
    ],
    mapRow: (r) => [
      num(r.typeID),
      num(r.groupID),
      str(r.typeName),
      optStr(r.description),
      optNum(r.mass),
      optNum(r.volume),
      optNum(r.packagedVolume) ?? optNum(r.volume),
      optNum(r.capacity),
      optNum(r.marketGroupID),
      num(r.published)
    ]
  },
  {
    csvName: 'mapRegions.csv',
    targetTable: 'sde_regions',
    columns: ['region_id', 'region_name'],
    mapRow: (r) => [num(r.regionID), str(r.regionName)]
  },
  {
    csvName: 'mapConstellations.csv',
    targetTable: 'sde_constellations',
    columns: ['constellation_id', 'region_id', 'constellation_name'],
    mapRow: (r) => [num(r.constellationID), num(r.regionID), str(r.constellationName)]
  },
  {
    csvName: 'mapSolarSystems.csv',
    targetTable: 'sde_solar_systems',
    columns: [
      'solar_system_id',
      'region_id',
      'constellation_id',
      'solar_system_name',
      'security',
      'x',
      'y',
      'z',
      'sun_type_id',
      'wormhole_class',
      'wormhole_effect'
    ],
    mapRow: (r) => [
      num(r.solarSystemID),
      num(r.regionID),
      num(r.constellationID),
      str(r.solarSystemName),
      Number(r.security ?? 0),
      Number(r.x ?? 0),
      Number(r.y ?? 0),
      Number(r.z ?? 0),
      optNum(r.sunTypeID),
      null,
      optStr(r.visualEffect)
    ]
  },
  {
    csvName: 'mapSolarSystemJumps.csv',
    targetTable: 'sde_stargates',
    columns: ['from_solar_system_id', 'to_solar_system_id'],
    mapRow: (r) => [num(r.fromSolarSystemID), num(r.toSolarSystemID)]
  },
  {
    csvName: 'dgmAttributeTypes.csv',
    targetTable: 'sde_dogma_attributes',
    columns: ['attribute_id', 'attribute_name', 'display_name', 'unit_id', 'stackable', 'high_is_good'],
    mapRow: (r) => [
      num(r.attributeID),
      str(r.attributeName),
      optStr(r.displayName),
      optNum(r.unitID),
      optNum(r.stackable),
      optNum(r.highIsGood)
    ]
  },
  {
    csvName: 'dgmTypeAttributes.csv',
    targetTable: 'sde_type_dogma_attributes',
    columns: ['type_id', 'attribute_id', 'value'],
    mapRow: (r) => [
      num(r.typeID),
      num(r.attributeID),
      r.valueFloat !== undefined && r.valueFloat !== '' && r.valueFloat !== 'None'
        ? Number(r.valueFloat)
        : Number(r.valueInt ?? 0)
    ]
  },
  {
    csvName: 'dgmEffects.csv',
    targetTable: 'sde_dogma_effects',
    columns: ['effect_id', 'effect_name', 'effect_category'],
    mapRow: (r) => [num(r.effectID), str(r.effectName), num(r.effectCategory)]
  },
  {
    csvName: 'dgmTypeEffects.csv',
    targetTable: 'sde_type_dogma_effects',
    columns: ['type_id', 'effect_id', 'is_default'],
    mapRow: (r) => [num(r.typeID), num(r.effectID), num(r.isDefault)]
  }
];

export class SdeImporter {
  constructor(
    private readonly db: LocalDatabase,
    private readonly sdeRepo: SdeRepository
  ) {}

  async importFromFuzzwork(onProgress: (p: SdeImportProgress) => void): Promise<SdeStatusSnapshot> {
    const total = FUZZWORK_TABLES.length + 2;
    for (let i = 0; i < FUZZWORK_TABLES.length; i++) {
      const spec = FUZZWORK_TABLES[i];
      const basePct = Math.round((i / total) * 95);
      onProgress({
        stage: 'downloading',
        table: spec.targetTable,
        progressPct: basePct,
        message: `Downloading ${spec.csvName} (${i + 1}/${FUZZWORK_TABLES.length})...`
      });

      const res = await fetch(`${FUZZWORK_DUMP_BASE}/${spec.csvName}`, {
        headers: { 'User-Agent': 'NewEdenLens/0.1.0' }
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${spec.csvName}: HTTP ${res.status}`);
      }
      const csvText = await res.text();

      onProgress({
        stage: 'indexing',
        table: spec.targetTable,
        progressPct: basePct + 4,
        message: `Indexing ${spec.targetTable} into local SQLite...`
      });
      this.insertCsvIntoTable(spec, csvText);
    }

    // Apply packaged volumes from invVolumes.csv
    onProgress({
      stage: 'indexing',
      table: 'sde_inv_types',
      progressPct: 92,
      message: 'Applying packaged ship & container volumes (invVolumes.csv)...'
    });
    await this.applyPackagedVolumes();

    // Apply wormhole classes from mapLocationWormholeClasses.csv
    onProgress({
      stage: 'indexing',
      table: 'sde_solar_systems',
      progressPct: 96,
      message: 'Applying wormhole system classes (mapLocationWormholeClasses.csv)...'
    });
    await this.applyWormholeClasses();

    this.recordMeta('fuzzwork-csv');
    this.db.flushNow();

    const status = this.sdeRepo.getStatus();
    onProgress({
      stage: 'complete',
      progressPct: 100,
      message: `SDE import complete (${status.counts.types.toLocaleString()} types, ${status.counts.systems.toLocaleString()} systems).`
    });
    return status;
  }

  private async applyPackagedVolumes(): Promise<void> {
    const res = await fetch(`${FUZZWORK_DUMP_BASE}/invVolumes.csv`, {
      headers: { 'User-Agent': 'NewEdenLens/0.1.0' }
    });
    if (!res.ok) return;
    const text = await res.text();
    const records = parseCsvRecords(text);
    if (records.length < 2) return;

    this.db.transaction((raw) => {
      const stmt = raw.prepare('UPDATE sde_inv_types SET packaged_volume = ? WHERE type_id = ?');
      try {
        for (let i = 1; i < records.length; i++) {
          const r = records[i];
          if (r.length < 2) continue;
          const typeId = Number(r[0]);
          const vol = Number(r[1]);
          if (Number.isFinite(typeId) && Number.isFinite(vol)) {
            stmt.run([vol, typeId]);
          }
        }
      } finally {
        stmt.free();
      }
    });
  }

  private async applyWormholeClasses(): Promise<void> {
    const res = await fetch(`${FUZZWORK_DUMP_BASE}/mapLocationWormholeClasses.csv`, {
      headers: { 'User-Agent': 'NewEdenLens/0.1.0' }
    });
    if (!res.ok) return;
    const text = await res.text();
    const records = parseCsvRecords(text);
    if (records.length < 2) return;

    this.db.transaction((raw) => {
      const stmtSystem = raw.prepare(
        'UPDATE sde_solar_systems SET wormhole_class = ? WHERE solar_system_id = ?'
      );
      const stmtRegion = raw.prepare(
        'UPDATE sde_solar_systems SET wormhole_class = ? WHERE region_id = ? AND wormhole_class IS NULL'
      );
      try {
        for (let i = 1; i < records.length; i++) {
          const r = records[i];
          if (r.length < 2) continue;
          const locId = Number(r[0]);
          const whClass = Number(r[1]);
          if (!Number.isFinite(locId) || !Number.isFinite(whClass)) continue;
          if (locId >= 30_000_000) {
            stmtSystem.run([whClass, locId]);
          } else if (locId >= 10_000_000 && locId < 20_000_000) {
            stmtRegion.run([whClass, locId]);
          }
        }
      } finally {
        stmtSystem.free();
        stmtRegion.free();
      }
    });
  }

  async importFromLocalSqlite(
    filePath: string,
    onProgress: (p: SdeImportProgress) => void
  ): Promise<SdeStatusSnapshot> {
    onProgress({
      stage: 'indexing',
      progressPct: 15,
      message: `Opening local SDE SQLite: ${filePath}`
    });

    const SQL = this.db.getSqlJs();
    const rawBytes = fs.readFileSync(filePath);
    const sourceDb = new SQL.Database(rawBytes);

    try {
      const copyMappings: Array<{
        srcTable: string;
        dstTable: string;
        dstCols: string[];
        selectSql: string;
      }> = [
        {
          srcTable: 'invCategories',
          dstTable: 'sde_inv_categories',
          dstCols: ['category_id', 'category_name', 'published'],
          selectSql: 'SELECT categoryID, categoryName, published FROM invCategories'
        },
        {
          srcTable: 'invGroups',
          dstTable: 'sde_inv_groups',
          dstCols: ['group_id', 'category_id', 'group_name', 'published'],
          selectSql: 'SELECT groupID, categoryID, groupName, published FROM invGroups'
        },
        {
          srcTable: 'invTypes',
          dstTable: 'sde_inv_types',
          dstCols: [
            'type_id',
            'group_id',
            'type_name',
            'description',
            'mass',
            'volume',
            'packaged_volume',
            'capacity',
            'market_group_id',
            'published'
          ],
          selectSql:
            'SELECT typeID, groupID, typeName, description, mass, volume, volume, capacity, marketGroupID, published FROM invTypes'
        },
        {
          srcTable: 'mapRegions',
          dstTable: 'sde_regions',
          dstCols: ['region_id', 'region_name'],
          selectSql: 'SELECT regionID, regionName FROM mapRegions'
        },
        {
          srcTable: 'mapConstellations',
          dstTable: 'sde_constellations',
          dstCols: ['constellation_id', 'region_id', 'constellation_name'],
          selectSql: 'SELECT constellationID, regionID, constellationName FROM mapConstellations'
        },
        {
          srcTable: 'mapSolarSystems',
          dstTable: 'sde_solar_systems',
          dstCols: [
            'solar_system_id',
            'region_id',
            'constellation_id',
            'solar_system_name',
            'security',
            'x',
            'y',
            'z',
            'sun_type_id',
            'wormhole_class',
            'wormhole_effect'
          ],
          selectSql:
            'SELECT solarSystemID, regionID, constellationID, solarSystemName, security, x, y, z, sunTypeID, NULL, NULL FROM mapSolarSystems'
        },
        {
          srcTable: 'mapSolarSystemJumps',
          dstTable: 'sde_stargates',
          dstCols: ['from_solar_system_id', 'to_solar_system_id'],
          selectSql: 'SELECT fromSolarSystemID, toSolarSystemID FROM mapSolarSystemJumps'
        },
        {
          srcTable: 'dgmAttributeTypes',
          dstTable: 'sde_dogma_attributes',
          dstCols: ['attribute_id', 'attribute_name', 'display_name', 'unit_id', 'stackable', 'high_is_good'],
          selectSql:
            'SELECT attributeID, attributeName, displayName, unitID, stackable, highIsGood FROM dgmAttributeTypes'
        },
        {
          srcTable: 'dgmTypeAttributes',
          dstTable: 'sde_type_dogma_attributes',
          dstCols: ['type_id', 'attribute_id', 'value'],
          selectSql:
            'SELECT typeID, attributeID, COALESCE(valueFloat, valueInt, 0) FROM dgmTypeAttributes'
        },
        {
          srcTable: 'dgmEffects',
          dstTable: 'sde_dogma_effects',
          dstCols: ['effect_id', 'effect_name', 'effect_category'],
          selectSql: 'SELECT effectID, effectName, effectCategory FROM dgmEffects'
        },
        {
          srcTable: 'dgmTypeEffects',
          dstTable: 'sde_type_dogma_effects',
          dstCols: ['type_id', 'effect_id', 'is_default'],
          selectSql: 'SELECT typeID, effectID, isDefault FROM dgmTypeEffects'
        }
      ];

      for (let i = 0; i < copyMappings.length; i++) {
        const m = copyMappings[i];
        onProgress({
          stage: 'indexing',
          table: m.dstTable,
          progressPct: 20 + Math.round((i / copyMappings.length) * 75),
          message: `Copying ${m.srcTable} -> ${m.dstTable}...`
        });

        const res = sourceDb.exec(m.selectSql);
        if (res.length === 0) continue;
        const rows = res[0].values;
        const placeholders = m.dstCols.map(() => '?').join(',');
        const insertSql = `INSERT OR REPLACE INTO ${m.dstTable} (${m.dstCols.join(',')}) VALUES (${placeholders})`;

        this.db.transaction((raw) => {
          raw.run(`DELETE FROM ${m.dstTable}`);
          const stmt = raw.prepare(insertSql);
          try {
            for (const row of rows) {
              stmt.run(row as never);
            }
          } finally {
            stmt.free();
          }
        });
      }
    } finally {
      sourceDb.close();
    }

    this.recordMeta('local-sqlite');
    this.db.flushNow();

    const status = this.sdeRepo.getStatus();
    onProgress({
      stage: 'complete',
      progressPct: 100,
      message: `Local SQLite SDE imported (${status.counts.types.toLocaleString()} types).`
    });
    return status;
  }

  private insertCsvIntoTable(spec: FuzzworkTableSpec, csvText: string): void {
    const records = parseCsvRecords(csvText);
    if (records.length < 2) return;

    const headers = records[0];
    const placeholders = spec.columns.map(() => '?').join(',');
    const insertSql = `INSERT OR REPLACE INTO ${spec.targetTable} (${spec.columns.join(',')}) VALUES (${placeholders})`;

    this.db.transaction((raw) => {
      raw.run(`DELETE FROM ${spec.targetTable}`);
      const stmt = raw.prepare(insertSql);
      try {
        for (let i = 1; i < records.length; i++) {
          const vals = records[i];
          if (vals.length === 1 && vals[0] === '') continue;
          const rowObj: Record<string, string> = {};
          for (let c = 0; c < headers.length; c++) {
            rowObj[headers[c]] = vals[c] ?? '';
          }
          stmt.run(spec.mapRow(rowObj) as never);
        }
      } finally {
        stmt.free();
      }
    });
  }

  private recordMeta(source: string): void {
    const now = String(Date.now());
    this.db.transaction((raw) => {
      raw.run(`INSERT OR REPLACE INTO sde_meta (key, value) VALUES ('imported_at', ?)`, [now]);
      raw.run(`INSERT OR REPLACE INTO sde_meta (key, value) VALUES ('source', ?)`, [source]);
    });
  }
}

export function parseCsvRecords(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      continue;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function num(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function optNum(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === 'None' || v === 'NULL') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: string | undefined): string {
  return v ?? '';
}

function optStr(v: string | undefined): string | null {
  if (v === undefined || v === '' || v === 'None' || v === 'NULL') return null;
  return v;
}
