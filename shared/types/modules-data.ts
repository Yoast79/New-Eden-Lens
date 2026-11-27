export interface MarketQuote {
  typeId: number;
  regionId: number;
  buyMax: number;
  sellMin: number;
  split: number;
  buyVolume: number;
  sellVolume: number;
  fetchedAt: number;
}

export interface EvaluatedItemRow {
  name: string;
  quantity: number;
  typeId: number | null;
  matchedName: string | null;
  groupName: string | null;
  volumePerUnit: number;
  totalVolume: number;
  buyUnit: number;
  sellUnit: number;
  splitUnit: number;
  buyTotal: number;
  sellTotal: number;
  splitTotal: number;
}

export interface SkillRequirementNode {
  skillId: number;
  skillName: string;
  rank: number;
  primaryAttributeId: number | null;
  secondaryAttributeId: number | null;
  requiredLevel: number;
  trainedLevel: number;
  currentSp: number;
  requiredSp: number;
  missingSp: number;
}

export interface CharacterAttributesDto {
  charisma: number;
  intelligence: number;
  memory: number;
  perception: number;
  willpower: number;
  bonusRemaps?: number;
}

export interface ImplantDetailDto {
  typeId: number;
  name: string;
  slot: number | null;
  bonuses: {
    charisma: number;
    intelligence: number;
    memory: number;
    perception: number;
    willpower: number;
  };
}

export interface MapSystemDto {
  solarSystemId: number;
  solarSystemName: string;
  regionId: number;
  regionName: string;
  security: number;
  x: number;
  y: number;
  z: number;
  shipKills: number;
  podKills: number;
  npcKills: number;
  shipJumps: number;
  sovAllianceId: number | null;
  hasIceBelt: boolean;
  timerLabel: string | null;
  timerExpiresAt: number | null;
  note: string | null;
  constellationId?: number;
  constellationName?: string;
  isExternalGateway?: boolean;
}

export interface MapDataDto {
  systems: MapSystemDto[];
  edges: Array<[number, number]>;
}

export type RouteSecurityMode = 'shortest' | 'highsec_only' | 'avoid_low_null' | 'most_dangerous';

export interface RouteFindRequest {
  originSystemId: number;
  destinationSystemId: number;
  waypointSystemIds?: number[];
  securityMode: RouteSecurityMode;
  avoidSystemIds?: number[];
  avoidRegionIds?: number[];
  useTheraTurnur?: boolean;
  useJumpGates?: boolean;
}

export interface RouteJumpNode {
  solarSystemId: number;
  solarSystemName: string;
  regionId: number;
  regionName: string;
  security: number;
  shipKills: number;
  podKills: number;
  npcKills: number;
  gankWarning: string | null;
  isWaypoint?: boolean;
  waypointIndex?: number;
  viaWormhole?: boolean;
  wormholeSource?: string;
  viaJumpGate?: boolean;
}

export interface JumpGateRow {
  id: number;
  fromSystemId: number;
  fromSystemName: string;
  toSystemId: number;
  toSystemName: string;
  bidirectional: boolean;
  label: string;
}

export interface SavedRouteRow {
  id: number;
  name: string;
  description: string;
  securityMode: RouteSecurityMode;
  shareCode: string;
  waypoints: number[];
  createdAt: number;
}

export interface RouteResultDto {
  jumps: RouteJumpNode[];
  majorWaypoints: RouteJumpNode[];
  totalJumps: number;
  shareCode: string;
  meta?: {
    securityMode?: RouteSecurityMode;
    useTheraTurnur?: boolean;
    useJumpGates?: boolean;
    pushEveryJump?: boolean;
  };
}

export type DScanThreatTag =
  | 'CAPITAL'
  | 'RECON/CYNO'
  | 'LOGI'
  | 'TACKLE'
  | 'COMMAND'
  | 'T3 CRUISER'
  | 'BATTLESHIP'
  | 'BATTLECRUISER'
  | 'CRUISER'
  | 'DESTROYER'
  | 'FRIGATE'
  | 'MINING'
  | 'HAULER'
  | 'STRUCTURE'
  | 'DRONE'
  | 'COMBAT'
  | 'OTHER';

export interface DScanGroupSummary {
  groupName: string;
  categoryName: string;
  threatTag: DScanThreatTag;
  count: number;
  items: Array<{
    typeId: number | null;
    typeName: string;
    name: string;
    distanceRaw: string;
    count: number;
  }>;
}

export interface LocalPilotIntelDto {
  name: string;
  characterId: number | null;
  corporationId: number | null;
  corporationName: string | null;
  allianceId: number | null;
  allianceName: string | null;
  securityStatus: number | null;
  dangerRatio: number | null;
  shipsDestroyed: number | null;
  shipsLost: number | null;
  standing: number | null;
  standingSource: string | null;
  threatBadges: string[];
}

export interface ManualStandingRow {
  id: number;
  targetName: string;
  standing: number;
  sourceLabel: string;
  notes: string;
  updatedAt: number;
}

export interface StructureTimerRow {
  id: string;
  source: 'esi' | 'manual';
  manualId?: number;
  name: string;
  structureType: string;
  solarSystemId: number;
  solarSystemName: string;
  state: string;
  timerKind: string;
  expiresAt: number | null;
  fuelExpiresAt: number | null;
  isLowFuel: boolean;
  isUnderAttack: boolean;
  reinforceHour?: number;
  nextReinforceHour?: number;
  unanchorsAt?: number | null;
  corporationName?: string;
  services?: Array<{ name: string; state: string }>;
  notes: string;
}

export interface MarketHistoryPoint {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  orderCount: number;
  volume: number;
}

export interface MarketInvestmentRow {
  id: number;
  characterId: number | null;
  typeId: number;
  typeName: string;
  quantity: number;
  buyPrice: number;
  targetRegionId: number;
  brokerFeePct: number;
  salesTaxPct: number;
  status: 'HOLDING' | 'SOLD';
  soldPrice: number | null;
  notes: string;
  createdAt: number;
  currentSellPrice?: number;
  netProfit?: number;
}

export type KillClassification = 'GANK' | 'PVE LOSS' | 'SOLO' | 'SMALL GANG' | 'FLEET/WAR';

export interface KillmailRow {
  killmailId: number;
  killmailTime: number;
  solarSystemId: number;
  solarSystemName: string;
  security: number;
  victimCharacterId: number | null;
  victimCorporationId: number | null;
  victimAllianceId: number | null;
  victimShipTypeId: number;
  victimShipName: string;
  totalValue: number;
  attackerCount: number;
  isNpc: boolean;
  isSolo?: boolean;
  isAwox?: boolean;
  points?: number;
  classification?: KillClassification;
  matchedGroupIds?: number[];
}

export type KillEntityKind =
  | 'ship_type'
  | 'structure'
  | 'character'
  | 'corporation'
  | 'alliance'
  | 'special_npc'
  | 'solar_system'
  | 'region';

export interface KillTrackerRuleDto {
  id?: number;
  groupId?: number;
  matchKind: KillEntityKind;
  targetId: number;
  targetName: string;
}

export interface KillTrackerGroupDto {
  id: number;
  name: string;
  description: string;
  originSystemId: number | null;
  originSystemName: string | null;
  maxJumps: number | null;
  roleFilter: 'both' | 'losses_only' | 'kills_only';
  secFilter: 'all' | 'highsec' | 'lowsec' | 'nullsec' | 'jspace';
  activityFilter: 'all' | 'ganks_only' | 'pve_losses' | 'pvp_only' | 'solo_only' | 'capital_only';
  entityMatchMode?: 'any' | 'all';
  minIsk: number;
  audioAlert: boolean;
  desktopNotify: boolean;
  isPopoutActive: boolean;
  enabled: boolean;
  createdAt: number;
  rules: KillTrackerRuleDto[];
}

export interface KillWatchlistRow {
  id: number;
  matchKind: 'ship_type' | 'character' | 'corporation' | 'alliance' | 'structure';
  targetId: number;
  label: string;
  audioAlert: boolean;
  desktopNotify: boolean;
  enabled: boolean;
}

export interface FittingSlotItem {
  typeId: number;
  typeName: string;
  slot: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'cargo';
  quantity: number;
  offline?: boolean;
  inactive?: boolean;
  overheated?: boolean;
  activeCount?: number;
  chargeTypeId?: number;
  chargeName?: string;
}

export interface FittingModuleDetail {
  cpu: number;
  pg: number;
  dps: number;
  optimalKm: number;
  falloffKm: number;
  capPerSec: number;
  cycleSec: number;
  maxState?: 'offline' | 'online' | 'active' | 'overload';
  bandwidth?: number;
  subsystemBonuses?: string[];
}

export interface FittingShipTraits {
  skillBonuses: Array<{ skillName: string; lines: string[] }>;
  roleBonuses: string[];
}

export interface FittingMissingSkill {
  skillId: number;
  skillName: string;
  requiredLevel: number;
  currentLevel: number;
}

export interface FittingStatsDto {
  shipTypeId: number;
  shipName: string;
  shipDescription?: string;
  shipTraits?: FittingShipTraits;
  highSlots: number;
  midSlots: number;
  lowSlots: number;
  rigSlots: number;
  subsystemSlots: number;
  dps: number;
  weaponDps: number;
  droneDps: number;
  volley: number;
  ehp: number;
  shieldHp: number;
  armorHp: number;
  hullHp: number;
  resists: {
    shield: [number, number, number, number];
    armor: [number, number, number, number];
    hull: [number, number, number, number];
  };
  cpuUsed: number;
  cpuMax: number;
  pgUsed: number;
  pgMax: number;
  calibrationUsed: number;
  calibrationMax: number;
  droneBandwidthUsed: number;
  droneBandwidthMax: number;
  droneBayUsed: number;
  droneBayMax: number;
  estimatedValue: number;
  capCapacity: number;
  capDeltaPerSec: number;
  capStablePct: number;
  capDepletesSec: number | null;
  alignTimeSec: number;
  targetingRangeKm: number;
  maxVelocity: number;
  moduleDetails: FittingModuleDetail[];
  missingSkills: FittingMissingSkill[];
}

export interface FleetMemberDto {
  id: number;
  fleetId: number;
  fittingId: number | null;
  shipTypeId: number;
  shipName: string;
  fitName: string;
  roleLabel: string;
  quantity: number;
  notes: string;
}

export interface FleetCompositionDto {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  members: FleetMemberDto[];
}

export interface AssetItemDto {
  itemId: number;
  characterId: number;
  characterName: string;
  typeId: number;
  typeName: string;
  groupName: string;
  locationId: number;
  locationName: string;
  locationFlag: string;
  parentItemId: number | null;
  destinationId: number | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
}

export interface SavedFittingRow {
  id: number;
  characterId: number | null;
  esiFittingId: number | null;
  name: string;
  shipTypeId: number;
  shipName: string;
  description: string;
  eftText: string;
  items: FittingSlotItem[];
  updatedAt: number;
}

export interface PilotAnalyticsDto {
  totalWalletBalance: number;
  totalAssetValue: number;
  mostExpensiveAssetName: string | null;
  mostExpensiveAssetValue: number;
  mostExpensiveShipName: string | null;
  mostExpensiveShipValue: number;
  iskPerHour: number;
  isk24h: number;
  isk7d: number;
  isk30d: number;
  kdRatio: number;
  walletHistory: Array<{ capturedAt: number; balance: number; estimatedAssetValue: number }>;
  journalTicks: Array<{
    journalId: number;
    date: number;
    refType: string;
    amount: number;
    reason: string;
  }>;
  clones: {
    homeLocationId: number | null;
    lastCloneJumpDate: number | null;
    cooldownRemainingSec: number;
    activeImplants: ImplantDetailDto[];
    jumpClones: Array<{
      jumpCloneId: number;
      locationId: number;
      name: string;
      implants: number[];
    }>;
  };
}

export interface WhNodeDto {
  mapId: number;
  solarSystemId: number;
  solarSystemName: string;
  security: number;
  wormholeClass: number | null;
  wormholeEffect: string | null;
  statics?: string;
  posX: number;
  posY: number;
  customLabel: string;
  notes: string;
}

export interface WhEdgeDto {
  id: number;
  mapId: number;
  sourceSystemId: number;
  targetSystemId: number;
  whType: string;
  massStatus: 'stable' | 'reduced' | 'critical';
  timeStatus: 'normal' | 'eol';
}

export interface WhSignatureDto {
  mapId: number;
  solarSystemId: number;
  sigId: string;
  sigGroup: string;
  sigType: string;
  name: string;
  updatedAt: number;
}

export type AlertSoundId =
  | 'chime'
  | 'chime-high'
  | 'siren'
  | 'ping'
  | 'radar'
  | 'alarm'
  | 'klaxon'
  | 'horn'
  | 'double-beep'
  | 'bell'
  | 'alert-pulse'
  | 'subtle-tick'
  | 'none';

export interface IntelTrackerWatchRuleDto {
  id: string;
  keyword: string;
  sound: AlertSoundId;
}

export interface IntelTrackerSetupDto {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  channels: string[];
  watches: IntelTrackerWatchRuleDto[];
  rangeBased: boolean;
  maxJumps: number;
  rangeSource: 'live' | 'system' | 'character';
  rangeSystemId?: number | null;
  rangeSystemName?: string;
  rangeCharacterId?: number | null;
  showInOverlay: boolean;
  systemAlertSound: AlertSoundId;
  alertOnNameCall?: boolean;
  nameCallSound?: AlertSoundId;
}

export interface IntelTrackerAlertEvent {
  id: string;
  timestamp: number;
  channel: string;
  sender: string;
  message: string;
  systemName: string | null;
  solarSystemId: number | null;
  jumpsAway: number | null;
  matchedWatches: string[];
  matchedSetupIds?: string[];
  matchedSetupNames?: string[];
  soundId?: AlertSoundId;
  nameCalled?: boolean;
  inRange?: boolean;
  showInOverlay?: boolean;
}

export type HistoricalKillEntityKind =
  | 'character'
  | 'corporation'
  | 'alliance'
  | 'ship_type'
  | 'solar_system';

export interface HistoricalKillStatsDto {
  shipsDestroyed: number;
  shipsLost: number;
  iskDestroyed: number;
  iskLost: number;
  dangerRatio: number | null;
  gangRatio: number | null;
  soloKills: number;
  points: number;
}

export interface HistoricalKillmailDto {
  killmailId: number;
  killmailTime: number;
  solarSystemId: number;
  solarSystemName: string;
  security: number;
  victimCharacterId: number | null;
  victimCharacterName: string | null;
  victimCorporationId: number | null;
  victimCorporationName: string | null;
  victimAllianceId: number | null;
  victimAllianceName: string | null;
  victimShipTypeId: number;
  victimShipName: string;
  finalBlowName: string | null;
  finalBlowShipTypeId: number | null;
  finalBlowShipName: string | null;
  attackerCount: number;
  totalValue: number;
  isNpc: boolean;
  isSolo: boolean;
  isAwox: boolean;
  points: number;
}

export interface HistoricalKillboardResultDto {
  entityKind: HistoricalKillEntityKind;
  entityId: number;
  entityName: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  stats: HistoricalKillStatsDto | null;
  kills: HistoricalKillmailDto[];
}

export interface TheraTurnurConnectionDto {
  id: number;
  sourceSystem: 'Thera' | 'Turnur';
  whType: string;
  maxShipSize: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  remainingHours: number;
  outSignature: string;
  inSystemId: number;
  inSystemName: string;
  inSystemClass: string;
  inRegionId: number;
  inRegionName: string;
  inSignature: string;
  security: number | null;
  jumpsFromOrigin: number | null;
  jumpsFromJita: number | null;
}

export interface LpOfferItemCostDto {
  typeId: number;
  typeName: string;
  quantity: number;
  unitPrice: number;
}

export interface LpOfferDto {
  offerId: number;
  corporationId: number;
  typeId: number;
  typeName: string;
  groupName: string;
  quantity: number;
  lpCost: number;
  iskCost: number;
  akCost: number;
  requiredItems: LpOfferItemCostDto[];
  itemBuyPrice: number;
  itemSellPrice: number;
  requiredItemsCost: number;
  netProfitBuy: number;
  netProfitSell: number;
  iskPerLpBuy: number;
  iskPerLpSell: number;
}

export interface CharacterLpBalanceDto {
  corporationId: number;
  corporationName: string;
  loyaltyPoints: number;
}

export interface CharacterMarketOrderDto {
  orderId: number;
  characterId: number;
  characterName: string;
  typeId: number;
  typeName: string;
  isBuyOrder: boolean;
  price: number;
  hubBestPrice: number;
  priceDiff: number;
  isUndercutOrOverbid: boolean;
  volumeRemain: number;
  volumeTotal: number;
  locationId: number;
  locationName: string;
  regionId: number;
  regionName: string;
  issued: string;
  duration: number;
  expiresAt: number;
  escrow: number;
  range: string;
}

export interface CharacterContractDto {
  contractId: number;
  characterId: number;
  characterName: string;
  type: 'item_exchange' | 'courier' | 'auction' | 'loan' | 'unknown';
  status: string;
  title: string;
  issuerId: number;
  issuerName: string;
  assigneeId: number;
  assigneeName: string;
  acceptorId: number;
  price: number;
  reward: number;
  collateral: number;
  buyout: number;
  volume: number;
  startLocationId: number | null;
  startLocationName: string;
  endLocationId: number | null;
  endLocationName: string;
  dateIssued: string;
  dateExpired: string;
  dateAccepted: string | null;
  daysToComplete: number;
  forCorporation: boolean;
}

export interface ContractDetailDto {
  items: Array<{
    recordId: number;
    typeId: number;
    typeName: string;
    quantity: number;
    isIncluded: boolean;
    isSingleton: boolean;
  }>;
  bids: Array<{
    bidId: number;
    bidderId: number;
    bidderName: string;
    amount: number;
    dateBid: string;
  }>;
}

export interface SkillQueueEntryDto {
  queuePosition: number;
  skillId: number;
  skillName: string;
  groupName: string;
  finishedLevel: number;
  trainingStartSp: number;
  levelStartSp: number;
  levelEndSp: number;
  startDate: string | null;
  finishDate: string | null;
}

export interface SkillCatalogEntryDto {
  skillId: number;
  skillName: string;
  groupName: string;
  rank: number;
  trainedLevel: number;
  activeLevel: number;
  skillpointsInSkill: number;
  isTraining: boolean;
  trainingToLevel: number | null;
}

export interface SkillMonitorDto {
  characterId: number;
  totalSp: number;
  unallocatedSp: number;
  attributes: CharacterAttributesDto;
  implants: ImplantDetailDto[];
  queue: SkillQueueEntryDto[];
  skills: SkillCatalogEntryDto[];
}

export interface FleetMemberLocationDto {
  characterId: number;
  characterName: string;
  solarSystemId: number;
  shipTypeId: number;
  shipName: string;
  role: string;
}

export interface StationServiceInfoDto {
  id: number;
  kind: 'station' | 'structure';
  name: string;
  solarSystemId: number;
  solarSystemName: string;
  regionId: number;
  regionName: string;
  security: number;
  services: string[];
  ownerName?: string;
  typeName?: string;
}

