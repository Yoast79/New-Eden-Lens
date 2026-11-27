export interface EveAccountRecord {
  id: number;
  label: string;
  sortOrder: number;
  createdAt: number;
}

export interface CharacterRecord {
  characterId: number;
  characterName: string;
  corporationId: number | null;
  allianceId: number | null;
  accountId: number | null;
  description: string;
  accentColor: string;
  tokenExpiresAt: number;
  scopes: string[];
  isMain: boolean;
  isDefault: boolean;
  addedAt: number;
}

export interface EsiStatusSnapshot {
  compatibilityDate: string;
  errorLimitRemain: number | null;
  errorLimitReset: number | null;
  rateLimitedUntil: number | null;
  activeRequests: number;
  lastError: string | null;
}

export interface SdeStatusSnapshot {
  installed: boolean;
  importedAt: number | null;
  source: string | null;
  counts: {
    types: number;
    systems: number;
    stargates: number;
    dogmaAttributes: number;
  };
}

export interface SdeImportProgress {
  stage: 'downloading' | 'decompressing' | 'indexing' | 'complete' | 'error';
  table?: string;
  progressPct: number;
  message: string;
}

export interface InvTypeRow {
  typeId: number;
  groupId: number;
  typeName: string;
  description: string | null;
  mass: number | null;
  volume: number | null;
  packagedVolume: number | null;
  capacity: number | null;
  marketGroupId: number | null;
  published: number;
  groupName?: string;
  categoryId?: number;
  categoryName?: string;
}

export interface SolarSystemRow {
  solarSystemId: number;
  regionId: number;
  constellationId: number;
  solarSystemName: string;
  security: number;
  x: number;
  y: number;
  z: number;
  sunTypeId: number | null;
  wormholeClass: number | null;
  wormholeEffect: string | null;
  regionName?: string;
}

