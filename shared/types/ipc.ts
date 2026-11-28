import type { FactionThemeId } from '../constants/eve';
import type {
  CharacterRecord,
  EsiStatusSnapshot,
  EveAccountRecord,
  InvTypeRow,
  SdeImportProgress,
  SdeStatusSnapshot,
  SolarSystemRow
} from './esi';
import type { ModuleConfigRecord } from './module';
import type { ParsedCosmicSignature, ParsedDScanEntry } from './clipboard';
import type {
  AssetItemDto,
  CharacterAttributesDto,
  DScanGroupSummary,
  FittingSlotItem,
  FittingStatsDto,
  FleetCompositionDto,
  ImplantDetailDto,
  JumpGateRow,
  KillTrackerGroupDto,
  KillTrackerRuleDto,
  KillWatchlistRow,
  KillmailRow,
  LocalPilotIntelDto,
  MapDataDto,
  MarketHistoryPoint,
  MarketInvestmentRow,
  MarketQuote,
  IntelTrackerAlertEvent,
  PilotAnalyticsDto,
  RouteFindRequest,
  RouteResultDto,
  RouteSecurityMode,
  SavedFittingRow,
  SavedRouteRow,
  SkillRequirementNode,
  StructureTimerRow,
  WhEdgeDto,
  WhNodeDto,
  WhSignatureDto,
  ManualStandingRow,
  HistoricalKillEntityKind,
  HistoricalKillboardResultDto,
  TheraTurnurConnectionDto,
  LpOfferDto,
  CharacterLpBalanceDto,
  CharacterMarketOrderDto,
  CharacterContractDto,
  ContractDetailDto,
  SkillMonitorDto,
  FleetMemberLocationDto,
  StationServiceInfoDto,
  MiningLedgerSummaryDto,
  BlueprintSearchItemDto,
  IndustryCalculationRequest,
  IndustryCalculationResultDto,
  OwnedBlueprintDto,
  CharacterIndustryJobDto,
  PlanetaryOverviewDto
} from './modules-data';

export type DateFormatOption = 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd' | 'locale';

export interface AppSettings {
  theme: FactionThemeId;
  esiClientId: string;
  esiCompatibilityDate: string;
  clipboardAutoWatch: boolean;
  neocomExpanded: boolean;
  neocomUtilityOrder: string[];
  neocomHiddenIds: string[];
  moduleCustomNames?: Record<string, string>;
  dateFormat?: DateFormatOption;
  intelTrackerLogDir: string;
  intelTrackerChannels?: string[];
  intelTrackerSetups?: import('./modules-data').IntelTrackerSetupDto[];
  intelTrackerOverlayInRangeOnly?: boolean;
  intelTrackerVolumePct?: number;
  intelTrackerGridCount?: number;
  intelTrackerPaneSetupIds?: string[];
  tacticalMapStyle?: 'cluster' | 'schematic';
  tacticalMapRegionId?: number | null;
  quickSetupCompleted: boolean;
  closeToTray: boolean;
  fullScreen: boolean;
  fontSizePx: number;
  windowBounds: string;
  popoutBounds: string;
}

export interface EsiRequestOptions {
  characterId?: number;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface ElectronBridgeApi {
  app: {
    getSettings: () => Promise<AppSettings>;
    updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
    getModuleConfigs: () => Promise<ModuleConfigRecord[]>;
    saveModuleConfigs: (configs: ModuleConfigRecord[]) => Promise<ModuleConfigRecord[]>;
    notify: (title: string, body: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    setFullScreen: (enabled: boolean) => Promise<void>;
    openPopout: () => Promise<void>;
    closePopout: () => Promise<void>;
    setPopoutOptions: (opts: { alwaysOnTop?: boolean; attachToEve?: boolean; opacity?: number }) => Promise<void>;
    submitFeedback: (input: {
      kind: 'bug' | 'feature';
      title: string;
      message: string;
      contact?: string;
      includeLogs?: boolean;
    }) => Promise<{ ok: boolean; error?: string }>;
    logError: (source: string, message: string) => Promise<void>;
    checkForUpdates: () => Promise<{
      updateAvailable: boolean;
      currentVersion: string;
      latestRelease: {
        version: string;
        title: string;
        date: string;
        downloadUrl: string;
        fileSize?: string;
        notes: string;
      } | null;
    }>;
  };
  auth: {
    listAccounts: () => Promise<EveAccountRecord[]>;
    createAccount: (label: string) => Promise<EveAccountRecord>;
    renameAccount: (accountId: number, label: string) => Promise<void>;
    deleteAccount: (accountId: number) => Promise<void>;
    assignCharacterAccount: (characterId: number, accountId: number | null) => Promise<void>;
    listCharacters: () => Promise<CharacterRecord[]>;
    loginPkce: (scopes?: string[], accountId?: number | null) => Promise<CharacterRecord>;
    removeCharacter: (characterId: number) => Promise<void>;
    setDefaultCharacter: (characterId: number) => Promise<void>;
    setMainCharacter: (characterId: number) => Promise<void>;
    updateCharacterMeta: (
      characterId: number,
      patch: { description?: string; accentColor?: string }
    ) => Promise<void>;
    refreshCharacter: (characterId: number) => Promise<CharacterRecord>;
  };
  esi: {
    request: <T = unknown>(path: string, options?: EsiRequestOptions) => Promise<T>;
    getStatus: () => Promise<EsiStatusSnapshot>;
    syncCharacterSnapshot: (characterId: number) => Promise<{ ok: boolean; syncedAt: number }>;
  };
  sde: {
    getStatus: () => Promise<SdeStatusSnapshot>;
    importFuzzwork: () => Promise<SdeStatusSnapshot>;
    importLocalSqlite: () => Promise<SdeStatusSnapshot>;
    searchTypes: (query: string, limit?: number) => Promise<InvTypeRow[]>;
    lookupTypesByNames: (names: string[]) => Promise<Record<string, InvTypeRow>>;
    searchSystems: (query: string, limit?: number) => Promise<SolarSystemRow[]>;
    onImportProgress: (cb: (progress: SdeImportProgress) => void) => () => void;
  };
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
    onClipboardChanged: (cb: (text: string) => void) => () => void;
  };
  db: {
    getCharacterWalletHistory: (characterId: number | null) => Promise<Array<{ characterId: number; balance: number; estimatedAssetValue: number; capturedAt: number }>>;
    getCharacterSkills: (characterId: number) => Promise<{ totalSp: number; unallocatedSp: number; skills: Array<{ skillId: number; activeSkillLevel: number; trainedSkillLevel: number; skillpointsInSkill: number }> }>;
  };
  market: {
    getQuotesForTypes: (regionId: number, typeIds: number[]) => Promise<Record<number, MarketQuote>>;
    getHistory: (regionId: number, typeId: number) => Promise<MarketHistoryPoint[]>;
    listInvestments: (characterId: number | null) => Promise<MarketInvestmentRow[]>;
    addInvestment: (input: {
      characterId: number | null;
      typeId: number;
      quantity: number;
      buyPrice: number;
      targetRegionId: number;
      brokerFeePct: number;
      salesTaxPct: number;
      notes?: string;
    }) => Promise<void>;
    markInvestmentSold: (id: number, soldPrice: number) => Promise<void>;
    deleteInvestment: (id: number) => Promise<void>;
    getLpOffers: (corporationId: number, regionId: number) => Promise<LpOfferDto[]>;
    getCharacterLp: (characterId: number) => Promise<{ balances: CharacterLpBalanceDto[]; scopeMissing?: boolean }>;
    listNpcCorporations: () => Promise<Array<{ id: number; name: string }>>;
    getCharacterOrders: (characterId: number | null, forceRefresh?: boolean) => Promise<CharacterMarketOrderDto[]>;
    getCharacterContracts: (characterId: number | null, forceRefresh?: boolean) => Promise<CharacterContractDto[]>;
    getContractDetails: (characterId: number, contractId: number, contractType: string) => Promise<ContractDetailDto>;
  };
  killboard: {
    startStream: () => Promise<void>;
    stopStream: () => Promise<void>;
    isRunning: () => Promise<boolean>;
    getRecent: (limit?: number, search?: string, groupId?: number | null) => Promise<KillmailRow[]>;
    listGroups: () => Promise<KillTrackerGroupDto[]>;
    saveGroup: (input: {
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
    }) => Promise<KillTrackerGroupDto[]>;
    deleteGroup: (id: number) => Promise<KillTrackerGroupDto[]>;
    setPopoutGroup: (id: number | null) => Promise<KillTrackerGroupDto[]>;
    resolveEntityNames: (
      kind: 'character' | 'corporation' | 'alliance',
      query: string
    ) => Promise<Array<{ id: number; name: string }>>;
    lookupEntity: (
      kind: HistoricalKillEntityKind,
      entityId: number,
      mode: 'all' | 'kills' | 'losses',
      page?: number,
      pageSize?: number
    ) => Promise<HistoricalKillboardResultDto>;
    listWatchlists: () => Promise<KillWatchlistRow[]>;
    addWatchlist: (input: Omit<KillWatchlistRow, 'id'>) => Promise<KillWatchlistRow[]>;
    removeWatchlist: (id: number) => Promise<KillWatchlistRow[]>;
    onNewKill: (cb: (kill: KillmailRow) => void) => () => void;
    onWatchlistHit: (cb: (payload: { watch: KillWatchlistRow; kill: KillmailRow }) => void) => () => void;
    onPopoutGroupChanged: (cb: (groupId: number | null) => void) => () => void;
  };
  fitting: {
    simulate: (
      shipTypeId: number,
      items: FittingSlotItem[],
      characterId: number | null,
      options?: { skillOverrideLevel?: number | null; implantTypeIds?: number[]; priceRegionId?: number }
    ) => Promise<FittingStatsDto>;
    browseModules: (
      tab: 'all' | 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge',
      query: string,
      shipTypeId?: number,
      hullRestricted?: boolean,
      fittedTypeIds?: number[]
    ) => Promise<
      Array<{
        typeId: number;
        groupId: number;
        typeName: string;
        groupName: string;
        eveCategory: string;
        subCategory: string;
        slotKind: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge';
        categoryId: number;
        marketGroupId: number | null;
      }>
    >;
    parseEft: (rawText: string) => Promise<{
      shipTypeId: number;
      shipName: string;
      fitName: string;
      items: FittingSlotItem[];
    } | null>;
    list: (characterId: number | null) => Promise<SavedFittingRow[]>;
    save: (input: {
      characterId: number | null;
      name: string;
      shipTypeId: number;
      description?: string;
      eftText: string;
      items: FittingSlotItem[];
    }) => Promise<SavedFittingRow[]>;
    syncFromEsi: (characterId: number) => Promise<SavedFittingRow[]>;
    pushToEsi: (
      characterId: number,
      fit: { name: string; shipTypeId: number; description: string; items: FittingSlotItem[] }
    ) => Promise<{ fitting_id: number }>;
  };
  fleets: {
    list: () => Promise<FleetCompositionDto[]>;
    create: (name: string, description: string) => Promise<FleetCompositionDto[]>;
    delete: (id: number) => Promise<FleetCompositionDto[]>;
    addMember: (input: {
      fleetId: number;
      fittingId?: number | null;
      shipTypeId: number;
      fitName: string;
      roleLabel: string;
      quantity: number;
      notes?: string;
    }) => Promise<FleetCompositionDto[]>;
    removeMember: (memberId: number) => Promise<FleetCompositionDto[]>;
  };
  assets: {
    list: (characterId: number | null) => Promise<AssetItemDto[]>;
    sync: (characterId: number | null) => Promise<AssetItemDto[]>;
  };
  analytics: {
    getPilotAnalytics: (characterId: number | null) => Promise<PilotAnalyticsDto>;
  };
  wh: {
    listMaps: () => Promise<Array<{ id: number; name: string }>>;
    getMapState: (mapId: number) => Promise<{
      nodes: WhNodeDto[];
      edges: WhEdgeDto[];
      signatures: WhSignatureDto[];
    }>;
    addNode: (mapId: number, solarSystemId: number, posX?: number, posY?: number) => Promise<void>;
    updateNodePosition: (mapId: number, solarSystemId: number, posX: number, posY: number) => Promise<void>;
    updateEdgeStatus: (
      edgeId: number,
      patch: { whType?: string; massStatus?: WhEdgeDto['massStatus']; timeStatus?: WhEdgeDto['timeStatus'] }
    ) => Promise<void>;
    saveSignatures: (mapId: number, solarSystemId: number, entries: ParsedCosmicSignature[]) => Promise<void>;
    pollLocations: (
      mapId: number,
      characterId?: number | null
    ) => Promise<{ trackedLocations: Array<{ characterId: number; solarSystemId: number }> }>;
    clearMap: (mapId: number) => Promise<void>;
    fetchTheraTurnur: (originSystemId?: number | null) => Promise<TheraTurnurConnectionDto[]>;
  };
  intelTracker: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    isRunning: () => Promise<boolean>;
    getLogDir: () => Promise<string>;
    selectLogDir: () => Promise<string | null>;
    setNotifyEnabled: (enabled: boolean) => Promise<void>;
    setMaxJumps: (jumps: number) => Promise<void>;
    setWatches: (watches: string[]) => Promise<void>;
    setSetups: (setups: import('./modules-data').IntelTrackerSetupDto[]) => Promise<void>;
    listChannels: () => Promise<string[]>;
    setChannels: (channels: string[]) => Promise<void>;
    setActiveSystemId: (systemId: number | null) => Promise<void>;
    setCharacterSystemId: (characterId: number, systemId: number | null) => Promise<void>;
    getRecentEvents: () => Promise<IntelTrackerAlertEvent[]>;
    clearEvents: () => Promise<void>;
    dismissEvent: (id: string) => Promise<void>;
    onEvent: (cb: (ev: IntelTrackerAlertEvent) => void) => () => void;
    onEventsSync: (cb: (events: IntelTrackerAlertEvent[]) => void) => () => void;
  };
  skills: {
    resolveRequirements: (
      targets: Array<{ typeId: number; targetLevel?: number }>,
      characterId: number | null
    ) => Promise<SkillRequirementNode[]>;
    syncAttributesAndImplants: (characterId: number) => Promise<{
      attributes: CharacterAttributesDto;
      implants: ImplantDetailDto[];
    }>;
    getSkillMonitor: (characterId: number) => Promise<SkillMonitorDto>;
  };
  mining: {
    syncLedger: (characterId: number, regionId: number) => Promise<MiningLedgerSummaryDto>;
  };
  industry: {
    searchBlueprints: (query: string, limit?: number) => Promise<BlueprintSearchItemDto[]>;
    calculate: (req: IndustryCalculationRequest) => Promise<IndustryCalculationResultDto>;
    getSystemCostIndex: (solarSystemId: number) => Promise<{
      manufacturing: number;
      reaction: number;
      copying: number;
      researchMe: number;
      researchTe: number;
    }>;
    listOwnedBlueprints: (characterId: number | null) => Promise<OwnedBlueprintDto[]>;
    listCharacterJobs: (characterId: number | null) => Promise<CharacterIndustryJobDto[]>;
  };
  planetary: {
    getOverview: (
      characterId: number | null,
      regionId: number,
      pocoTaxPct: number
    ) => Promise<PlanetaryOverviewDto>;
  };
  nav: {
    listRegions: () => Promise<Array<{ regionId: number; regionName: string }>>;
    getFleetLocations: (characterId: number) => Promise<{
      members: FleetMemberLocationDto[];
      error?: string;
    }>;
    getSystemStations: (solarSystemId: number, characterId?: number | null) => Promise<StationServiceInfoDto[]>;
    scanRegionStations: (regionId: number, characterId?: number | null) => Promise<StationServiceInfoDto[]>;
    getMapData: (regionId: number | null) => Promise<MapDataDto>;
    syncSystemActivity: () => Promise<{ updatedSystems: number; syncedAt: number }>;
    saveSystemNote: (input: {
      solarSystemId: number;
      hasIceBelt: boolean;
      timerLabel?: string | null;
      timerExpiresAt?: number | null;
      note?: string | null;
    }) => Promise<void>;
    setAutopilotWaypoint: (
      characterId: number,
      destinationId: number,
      clearOtherWaypoints: boolean,
      addToBeginning?: boolean
    ) => Promise<void>;
    findRoute: (req: RouteFindRequest) => Promise<RouteResultDto>;
    resolveRouteShareCode: (input: {
      shareCode?: string;
      systemNames?: string[];
      entries?: Array<{ name: string; isWaypoint: boolean; waypointIndex?: number }>;
    }) => Promise<RouteResultDto>;
    listJumpGates: () => Promise<JumpGateRow[]>;
    importJumpGatesText: (rawText: string) => Promise<JumpGateRow[]>;
    deleteJumpGate: (id: number) => Promise<JumpGateRow[]>;
    listSavedRoutes: () => Promise<SavedRouteRow[]>;
    saveRoute: (input: {
      name: string;
      description: string;
      waypoints: number[];
      securityMode: RouteSecurityMode;
      shareCode: string;
    }) => Promise<SavedRouteRow[]>;
    renameRoute: (id: number, name: string, description: string) => Promise<SavedRouteRow[]>;
    deleteRoute: (id: number) => Promise<SavedRouteRow[]>;
  };
  intel: {
    analyzeDScan: (entries: ParsedDScanEntry[]) => Promise<DScanGroupSummary[]>;
    analyzeLocalPilots: (
      pilotNames: string[],
      activeCharacterId?: number | null
    ) => Promise<LocalPilotIntelDto[]>;
    listManualStandings: () => Promise<ManualStandingRow[]>;
    upsertManualStanding: (input: {
      targetName: string;
      standing: number;
      sourceLabel: string;
      notes?: string;
    }) => Promise<ManualStandingRow[]>;
    deleteManualStanding: (id: number) => Promise<ManualStandingRow[]>;
  };
  structures: {
    list: (characterId: number | null) => Promise<StructureTimerRow[]>;
    addManual: (input: {
      name: string;
      structureType: string;
      solarSystemId: number;
      timerKind: string;
      expiresAt: number;
      notes?: string;
    }) => Promise<void>;
    deleteManual: (id: number) => Promise<void>;
  };
}
