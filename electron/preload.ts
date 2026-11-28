import { contextBridge, ipcRenderer } from 'electron';
import type { SdeImportProgress } from '@shared/types/esi';
import type { AppSettings, ElectronBridgeApi, EsiRequestOptions } from '@shared/types/ipc';
import type { ModuleConfigRecord } from '@shared/types/module';
import type {
  KillWatchlistRow,
  KillmailRow,
  IntelTrackerAlertEvent,
  IndustryCalculationRequest
} from '@shared/types/modules-data';

const bridgeApi: ElectronBridgeApi = {
  app: {
    getSettings: () => ipcRenderer.invoke('app:getSettings'),
    updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('app:updateSettings', patch),
    getModuleConfigs: () => ipcRenderer.invoke('app:getModuleConfigs'),
    saveModuleConfigs: (configs: ModuleConfigRecord[]) =>
      ipcRenderer.invoke('app:saveModuleConfigs', configs),
    notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', title, body),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    setFullScreen: (enabled: boolean) => ipcRenderer.invoke('app:setFullScreen', enabled),
    openPopout: () => ipcRenderer.invoke('app:openPopout'),
    closePopout: () => ipcRenderer.invoke('app:closePopout'),
    setPopoutOptions: (opts) => ipcRenderer.invoke('app:setPopoutOptions', opts),
    submitFeedback: (input) => ipcRenderer.invoke('app:submitFeedback', input)
  },
  auth: {
    listAccounts: () => ipcRenderer.invoke('auth:listAccounts'),
    createAccount: (label: string) => ipcRenderer.invoke('auth:createAccount', label),
    renameAccount: (accountId: number, label: string) =>
      ipcRenderer.invoke('auth:renameAccount', accountId, label),
    deleteAccount: (accountId: number) => ipcRenderer.invoke('auth:deleteAccount', accountId),
    assignCharacterAccount: (characterId: number, accountId: number | null) =>
      ipcRenderer.invoke('auth:assignCharacterAccount', characterId, accountId),
    listCharacters: () => ipcRenderer.invoke('auth:listCharacters'),
    loginPkce: (scopes?: string[], accountId?: number | null) =>
      ipcRenderer.invoke('auth:loginPkce', scopes, accountId),
    removeCharacter: (characterId: number) => ipcRenderer.invoke('auth:removeCharacter', characterId),
    setDefaultCharacter: (characterId: number) =>
      ipcRenderer.invoke('auth:setDefaultCharacter', characterId),
    setMainCharacter: (characterId: number) =>
      ipcRenderer.invoke('auth:setMainCharacter', characterId),
    updateCharacterMeta: (characterId: number, patch: { description?: string; accentColor?: string }) =>
      ipcRenderer.invoke('auth:updateCharacterMeta', characterId, patch),
    refreshCharacter: (characterId: number) =>
      ipcRenderer.invoke('auth:refreshCharacter', characterId)
  },
  esi: {
    request: (path: string, options?: EsiRequestOptions) =>
      ipcRenderer.invoke('esi:request', path, options),
    getStatus: () => ipcRenderer.invoke('esi:getStatus'),
    syncCharacterSnapshot: (characterId: number) =>
      ipcRenderer.invoke('esi:syncCharacterSnapshot', characterId)
  },
  sde: {
    getStatus: () => ipcRenderer.invoke('sde:getStatus'),
    importFuzzwork: () => ipcRenderer.invoke('sde:importFuzzwork'),
    importLocalSqlite: () => ipcRenderer.invoke('sde:importLocalSqlite'),
    searchTypes: (query: string, limit?: number) =>
      ipcRenderer.invoke('sde:searchTypes', query, limit),
    lookupTypesByNames: (names: string[]) =>
      ipcRenderer.invoke('sde:lookupTypesByNames', names),
    searchSystems: (query: string, limit?: number) =>
      ipcRenderer.invoke('sde:searchSystems', query, limit),
    onImportProgress: (cb: (progress: SdeImportProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: SdeImportProgress) => cb(data);
      ipcRenderer.on('sde:import-progress', listener);
      return () => ipcRenderer.removeListener('sde:import-progress', listener);
    }
  },
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText'),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    onClipboardChanged: (cb: (text: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, text: string) => cb(text);
      ipcRenderer.on('clipboard:changed', listener);
      return () => ipcRenderer.removeListener('clipboard:changed', listener);
    }
  },
  db: {
    getCharacterWalletHistory: (characterId: number | null) =>
      ipcRenderer.invoke('db:getCharacterWalletHistory', characterId),
    getCharacterSkills: (characterId: number) =>
      ipcRenderer.invoke('db:getCharacterSkills', characterId)
  },
  market: {
    getQuotesForTypes: (regionId: number, typeIds: number[]) =>
      ipcRenderer.invoke('market:getQuotesForTypes', regionId, typeIds),
    getHistory: (regionId: number, typeId: number) =>
      ipcRenderer.invoke('market:getHistory', regionId, typeId),
    listInvestments: (characterId: number | null) =>
      ipcRenderer.invoke('market:listInvestments', characterId),
    addInvestment: (input) => ipcRenderer.invoke('market:addInvestment', input),
    markInvestmentSold: (id: number, soldPrice: number) =>
      ipcRenderer.invoke('market:markInvestmentSold', id, soldPrice),
    deleteInvestment: (id: number) => ipcRenderer.invoke('market:deleteInvestment', id),
    getLpOffers: (corporationId: number, regionId: number) =>
      ipcRenderer.invoke('market:getLpOffers', corporationId, regionId),
    getCharacterLp: (characterId: number) => ipcRenderer.invoke('market:getCharacterLp', characterId),
    listNpcCorporations: () => ipcRenderer.invoke('market:listNpcCorporations'),
    getCharacterOrders: (characterId: number | null, forceRefresh?: boolean) =>
      ipcRenderer.invoke('market:getCharacterOrders', characterId, forceRefresh),
    getCharacterContracts: (characterId: number | null, forceRefresh?: boolean) =>
      ipcRenderer.invoke('market:getCharacterContracts', characterId, forceRefresh),
    getContractDetails: (characterId: number, contractId: number, contractType: string) =>
      ipcRenderer.invoke('market:getContractDetails', characterId, contractId, contractType)
  },
  killboard: {
    startStream: () => ipcRenderer.invoke('killboard:startStream'),
    stopStream: () => ipcRenderer.invoke('killboard:stopStream'),
    isRunning: () => ipcRenderer.invoke('killboard:isRunning'),
    getRecent: (limit?: number, search?: string, groupId?: number | null) =>
      ipcRenderer.invoke('killboard:getRecent', limit, search, groupId),
    listGroups: () => ipcRenderer.invoke('killboard:listGroups'),
    saveGroup: (input) => ipcRenderer.invoke('killboard:saveGroup', input),
    deleteGroup: (id: number) => ipcRenderer.invoke('killboard:deleteGroup', id),
    setPopoutGroup: (id: number | null) => ipcRenderer.invoke('killboard:setPopoutGroup', id),
    resolveEntityNames: (kind, query) =>
      ipcRenderer.invoke('killboard:resolveEntityNames', kind, query),
    lookupEntity: (kind, entityId, mode, page, pageSize) =>
      ipcRenderer.invoke('killboard:lookupEntity', kind, entityId, mode, page, pageSize),
    listWatchlists: () => ipcRenderer.invoke('killboard:listWatchlists'),
    addWatchlist: (input) => ipcRenderer.invoke('killboard:addWatchlist', input),
    removeWatchlist: (id: number) => ipcRenderer.invoke('killboard:removeWatchlist', id),
    onNewKill: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, data: KillmailRow) => cb(data);
      ipcRenderer.on('killboard:new-kill', listener);
      return () => ipcRenderer.removeListener('killboard:new-kill', listener);
    },
    onWatchlistHit: (cb) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        data: { watch: KillWatchlistRow; kill: KillmailRow }
      ) => cb(data);
      ipcRenderer.on('killboard:watchlist-hit', listener);
      return () => ipcRenderer.removeListener('killboard:watchlist-hit', listener);
    },
    onPopoutGroupChanged: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, groupId: number | null) => cb(groupId);
      ipcRenderer.on('killboard:popout-group-changed', listener);
      return () => ipcRenderer.removeListener('killboard:popout-group-changed', listener);
    }
  },
  fitting: {
    simulate: (shipTypeId, items, characterId, options) =>
      ipcRenderer.invoke('fitting:simulate', shipTypeId, items, characterId, options),
    browseModules: (tab, query, shipTypeId, hullRestricted, fittedTypeIds) =>
      ipcRenderer.invoke('fitting:browseModules', tab, query, shipTypeId, hullRestricted, fittedTypeIds),
    parseEft: (rawText) => ipcRenderer.invoke('fitting:parseEft', rawText),
    list: (characterId) => ipcRenderer.invoke('fitting:list', characterId),
    save: (input) => ipcRenderer.invoke('fitting:save', input),
    syncFromEsi: (characterId) => ipcRenderer.invoke('fitting:syncFromEsi', characterId),
    pushToEsi: (characterId, fit) => ipcRenderer.invoke('fitting:pushToEsi', characterId, fit)
  },
  fleets: {
    list: () => ipcRenderer.invoke('fleets:list'),
    create: (name, description) => ipcRenderer.invoke('fleets:create', name, description),
    delete: (id) => ipcRenderer.invoke('fleets:delete', id),
    addMember: (input) => ipcRenderer.invoke('fleets:addMember', input),
    removeMember: (memberId) => ipcRenderer.invoke('fleets:removeMember', memberId)
  },
  assets: {
    list: (characterId) => ipcRenderer.invoke('assets:list', characterId),
    sync: (characterId) => ipcRenderer.invoke('assets:sync', characterId)
  },
  analytics: {
    getPilotAnalytics: (characterId) => ipcRenderer.invoke('analytics:getPilotAnalytics', characterId)
  },
  wh: {
    listMaps: () => ipcRenderer.invoke('wh:listMaps'),
    getMapState: (mapId) => ipcRenderer.invoke('wh:getMapState', mapId),
    addNode: (mapId, solarSystemId, posX, posY) =>
      ipcRenderer.invoke('wh:addNode', mapId, solarSystemId, posX, posY),
    updateNodePosition: (mapId, solarSystemId, posX, posY) =>
      ipcRenderer.invoke('wh:updateNodePosition', mapId, solarSystemId, posX, posY),
    updateEdgeStatus: (edgeId, patch) => ipcRenderer.invoke('wh:updateEdgeStatus', edgeId, patch),
    saveSignatures: (mapId, solarSystemId, entries) =>
      ipcRenderer.invoke('wh:saveSignatures', mapId, solarSystemId, entries),
    pollLocations: (mapId, characterId) =>
      ipcRenderer.invoke('wh:pollLocations', mapId, characterId),
    clearMap: (mapId) => ipcRenderer.invoke('wh:clearMap', mapId),
    fetchTheraTurnur: (originSystemId?: number | null) =>
      ipcRenderer.invoke('wh:fetchTheraTurnur', originSystemId)
  },
  intelTracker: {
    start: () => ipcRenderer.invoke('intelTracker:start'),
    stop: () => ipcRenderer.invoke('intelTracker:stop'),
    isRunning: () => ipcRenderer.invoke('intelTracker:isRunning'),
    getLogDir: () => ipcRenderer.invoke('intelTracker:getLogDir'),
    selectLogDir: () => ipcRenderer.invoke('intelTracker:selectLogDir'),
    setNotifyEnabled: (enabled) => ipcRenderer.invoke('intelTracker:setNotifyEnabled', enabled),
    setMaxJumps: (jumps) => ipcRenderer.invoke('intelTracker:setMaxJumps', jumps),
    setWatches: (watches) => ipcRenderer.invoke('intelTracker:setWatches', watches),
    setSetups: (setups) => ipcRenderer.invoke('intelTracker:setSetups', setups),
    listChannels: () => ipcRenderer.invoke('intelTracker:listChannels'),
    setChannels: (channels) => ipcRenderer.invoke('intelTracker:setChannels', channels),
    setActiveSystemId: (systemId) => ipcRenderer.invoke('intelTracker:setActiveSystemId', systemId),
    setCharacterSystemId: (characterId, systemId) =>
      ipcRenderer.invoke('intelTracker:setCharacterSystemId', characterId, systemId),
    getRecentEvents: () => ipcRenderer.invoke('intelTracker:getRecentEvents'),
    clearEvents: () => ipcRenderer.invoke('intelTracker:clearEvents'),
    dismissEvent: (id) => ipcRenderer.invoke('intelTracker:dismissEvent', id),
    onEvent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, data: IntelTrackerAlertEvent) => cb(data);
      ipcRenderer.on('intelTracker:event', listener);
      return () => ipcRenderer.removeListener('intelTracker:event', listener);
    },
    onEventsSync: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, data: IntelTrackerAlertEvent[]) => cb(data);
      ipcRenderer.on('intelTracker:events-sync', listener);
      return () => ipcRenderer.removeListener('intelTracker:events-sync', listener);
    }
  },
  skills: {
    resolveRequirements: (
      targets: Array<{ typeId: number; targetLevel?: number }>,
      characterId: number | null
    ) => ipcRenderer.invoke('skills:resolveRequirements', targets, characterId),
    syncAttributesAndImplants: (characterId: number) =>
      ipcRenderer.invoke('skills:syncAttributesAndImplants', characterId),
    getSkillMonitor: (characterId: number) => ipcRenderer.invoke('skills:getSkillMonitor', characterId)
  },
  mining: {
    syncLedger: (characterId: number, regionId: number) =>
      ipcRenderer.invoke('mining:syncLedger', characterId, regionId)
  },
  industry: {
    searchBlueprints: (query: string, limit?: number) =>
      ipcRenderer.invoke('industry:searchBlueprints', query, limit),
    calculate: (req: IndustryCalculationRequest) => ipcRenderer.invoke('industry:calculate', req),
    getSystemCostIndex: (solarSystemId: number) =>
      ipcRenderer.invoke('industry:getSystemCostIndex', solarSystemId),
    listOwnedBlueprints: (characterId: number | null) =>
      ipcRenderer.invoke('industry:listOwnedBlueprints', characterId),
    listCharacterJobs: (characterId: number | null) =>
      ipcRenderer.invoke('industry:listCharacterJobs', characterId)
  },
  planetary: {
    getOverview: (characterId: number | null, regionId: number, pocoTaxPct: number) =>
      ipcRenderer.invoke('planetary:getOverview', characterId, regionId, pocoTaxPct)
  },
  nav: {
    listRegions: () => ipcRenderer.invoke('nav:listRegions'),
    getFleetLocations: (characterId: number) => ipcRenderer.invoke('nav:getFleetLocations', characterId),
    getSystemStations: (solarSystemId: number, characterId?: number | null) =>
      ipcRenderer.invoke('nav:getSystemStations', solarSystemId, characterId),
    scanRegionStations: (regionId: number, characterId?: number | null) =>
      ipcRenderer.invoke('nav:scanRegionStations', regionId, characterId),
    getMapData: (regionId: number | null) => ipcRenderer.invoke('nav:getMapData', regionId),
    syncSystemActivity: () => ipcRenderer.invoke('nav:syncSystemActivity'),
    saveSystemNote: (input) => ipcRenderer.invoke('nav:saveSystemNote', input),
    setAutopilotWaypoint: (characterId, destinationId, clearOtherWaypoints, addToBeginning) =>
      ipcRenderer.invoke(
        'nav:setAutopilotWaypoint',
        characterId,
        destinationId,
        clearOtherWaypoints,
        addToBeginning
      ),
    findRoute: (req) => ipcRenderer.invoke('nav:findRoute', req),
    resolveRouteShareCode: (input) => ipcRenderer.invoke('nav:resolveRouteShareCode', input),
    listJumpGates: () => ipcRenderer.invoke('nav:listJumpGates'),
    importJumpGatesText: (rawText) => ipcRenderer.invoke('nav:importJumpGatesText', rawText),
    deleteJumpGate: (id) => ipcRenderer.invoke('nav:deleteJumpGate', id),
    listSavedRoutes: () => ipcRenderer.invoke('nav:listSavedRoutes'),
    saveRoute: (input) => ipcRenderer.invoke('nav:saveRoute', input),
    renameRoute: (id, name, description) =>
      ipcRenderer.invoke('nav:renameRoute', id, name, description),
    deleteRoute: (id) => ipcRenderer.invoke('nav:deleteRoute', id)
  },
  intel: {
    analyzeDScan: (entries) => ipcRenderer.invoke('intel:analyzeDScan', entries),
    analyzeLocalPilots: (pilotNames, activeCharacterId) =>
      ipcRenderer.invoke('intel:analyzeLocalPilots', pilotNames, activeCharacterId),
    listManualStandings: () => ipcRenderer.invoke('intel:listManualStandings'),
    upsertManualStanding: (input) => ipcRenderer.invoke('intel:upsertManualStanding', input),
    deleteManualStanding: (id) => ipcRenderer.invoke('intel:deleteManualStanding', id)
  },
  structures: {
    list: (characterId) => ipcRenderer.invoke('structures:list', characterId),
    addManual: (input) => ipcRenderer.invoke('structures:addManual', input),
    deleteManual: (id) => ipcRenderer.invoke('structures:deleteManual', id)
  }
};

contextBridge.exposeInMainWorld('eveLens', bridgeApi);
