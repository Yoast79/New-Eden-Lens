import { BrowserWindow, Notification, app, clipboard, dialog, ipcMain, shell } from 'electron';
import { errorLogger } from '../services/error-logger';
import type { SdeImportProgress } from '@shared/types/esi';
import type { AppSettings, EsiRequestOptions } from '@shared/types/ipc';
import type { ModuleConfigRecord } from '@shared/types/module';
import type { AppRepository } from '../db/repositories/appRepo';
import type { CharacterRepository } from '../db/repositories/characterRepo';
import type { SdeRepository } from '../db/repositories/sdeRepo';
import type { PkceAuthService } from '../services/auth-pkce';
import type { EsiClient } from '../services/esi-client';
import type { ParsedCosmicSignature, ParsedDScanEntry } from '@shared/types/clipboard';
import type { FittingSlotItem, KillWatchlistRow, RouteFindRequest, WhEdgeDto } from '@shared/types/modules-data';
import type { AnalyticsService } from '../services/analytics-service';
import type { AssetsService } from '../services/assets-service';
import type { BackgroundScheduler } from '../services/scheduler';
import type { SdeImporter } from '../services/sde-importer';
import type { FittingService } from '../services/fitting-service';
import type { FleetService } from '../services/fleet-service';
import type { IntelService } from '../services/intel-service';
import type { KillboardService } from '../services/killboard-service';
import type { MarketService } from '../services/market-service';
import type { NavigationService } from '../services/navigation-service';
import type { IntelTrackerService } from '../services/intel-tracker-service';
import type { SkillPlannerService } from '../services/skill-planner-service';
import type { StructureService } from '../services/structure-service';
import type { MiningService } from '../services/mining-service';
import type { IndustryService } from '../services/industry-service';
import type { PlanetaryService } from '../services/planetary-service';
import type { WormholeService } from '../services/wormhole-service';

export interface IpcDependencies {
  getMainWindow: () => BrowserWindow | null;
  getPopoutWindow: () => BrowserWindow | null;
  openPopoutWindow: () => void;
  setPopoutWindowOptions: (opts: { alwaysOnTop?: boolean; attachToEve?: boolean; opacity?: number }) => void;
  appRepo: AppRepository;
  characterRepo: CharacterRepository;
  sdeRepo: SdeRepository;
  authService: PkceAuthService;
  esiClient: EsiClient;
  sdeImporter: SdeImporter;
  scheduler: BackgroundScheduler;
  marketService: MarketService;
  skillPlannerService: SkillPlannerService;
  navigationService: NavigationService;
  intelService: IntelService;
  killboardService: KillboardService;
  fittingService: FittingService;
  analyticsService: AnalyticsService;
  wormholeService: WormholeService;
  intelTrackerService: IntelTrackerService;
  structureService: StructureService;
  fleetService: FleetService;
  assetsService: AssetsService;
  miningService: MiningService;
  industryService: IndustryService;
  planetaryService: PlanetaryService;
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  const sendSdeProgress = (progress: SdeImportProgress) => {
    deps.getMainWindow()?.webContents.send('sde:import-progress', progress);
  };

  ipcMain.handle('app:getSettings', () => deps.appRepo.getSettings());
  ipcMain.handle('app:updateSettings', (_e, patch: Partial<AppSettings>) =>
    deps.appRepo.updateSettings(patch)
  );
  ipcMain.handle('app:getModuleConfigs', () => deps.appRepo.getModuleConfigs());
  ipcMain.handle('app:saveModuleConfigs', (_e, configs: ModuleConfigRecord[]) =>
    deps.appRepo.saveModuleConfigs(configs)
  );
  ipcMain.handle('app:notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });
  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));
  ipcMain.handle('app:setFullScreen', (_e, enabled: boolean) => {
    const win = deps.getMainWindow();
    if (win) {
      if (enabled && win.isMaximized()) win.unmaximize();
      win.setFullScreen(enabled);
    }
    deps.appRepo.updateSettings({ fullScreen: enabled });
  });

  // XOR-obfuscated endpoint payloads (never exposed to renderer or plaintext binary strings)
  let lastFeedbackAt = 0;
  ipcMain.handle(
    'app:submitFeedback',
    async (
      _e,
      input: {
        kind: 'bug' | 'feature';
        title: string;
        message: string;
        contact?: string;
        includeLogs?: boolean;
      }
    ): Promise<{ ok: boolean; error?: string }> => {
      const now = Date.now();
      if (now - lastFeedbackAt < 15_000) {
        return { ok: false, error: 'Please wait a few seconds before sending another report.' };
      }

      const clean = (val: string | undefined, max: number) =>
        (val ?? '')
          .replace(/@(everyone|here)/gi, '@\u200b$1')
          .trim()
          .slice(0, max);

      const title = clean(input.title, 120);
      const message = clean(input.message, 1800);
      const contact = clean(input.contact, 100);
      const versionStr = `v${app.getVersion()} (${process.platform})`;

      if (!title || !message) {
        return { ok: false, error: 'Summary and details are required.' };
      }

      const mask = [0x4e, 0x65, 0x77, 0x45, 0x64, 0x65, 0x6e, 0x4c, 0x65, 0x6e, 0x73, 0x21];
      const payload =
        input.kind === 'bug'
          ? [38, 17, 3, 53, 23, 95, 65, 99, 1, 7, 0, 66, 33, 23, 19, 107, 7, 10, 3, 99, 4, 30, 26, 14, 57, 0, 21, 45, 11, 10, 5, 63, 74, 95, 70, 22, 120, 85, 70, 125, 82, 93, 92, 125, 93, 90, 75, 23, 122, 85, 65, 117, 75, 50, 67, 61, 87, 24, 74, 64, 56, 87, 90, 11, 9, 51, 90, 24, 81, 1, 61, 98, 13, 29, 62, 8, 8, 2, 59, 11, 28, 40, 29, 85, 9, 50, 66, 54, 2, 63, 86, 37, 14, 30, 70, 69, 22, 35, 4, 61, 92, 1, 56, 120, 8, 26, 0, 79, 2, 92, 47, 35, 92, 31, 41, 61, 21, 11, 20, 12, 127]
          : [38, 17, 3, 53, 23, 95, 65, 99, 1, 7, 0, 66, 33, 23, 19, 107, 7, 10, 3, 99, 4, 30, 26, 14, 57, 0, 21, 45, 11, 10, 5, 63, 74, 95, 70, 22, 120, 85, 70, 125, 92, 81, 87, 116, 93, 87, 68, 25, 125, 93, 69, 125, 75, 60, 86, 11, 9, 58, 34, 64, 43, 93, 26, 50, 38, 1, 57, 124, 10, 62, 58, 101, 45, 1, 34, 104, 40, 10, 42, 116, 49, 34, 22, 77, 31, 86, 5, 115, 55, 28, 93, 20, 84, 33, 62, 17, 22, 7, 69, 125, 13, 40, 31, 61, 49, 3, 32, 114, 45, 63, 36, 60, 51, 44, 1, 43, 21, 12, 20, 105, 61];
      const endpoint = Buffer.from(payload.map((b, i) => b ^ mask[i % mask.length])).toString('utf8');

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [
              {
                title: `${input.kind === 'bug' ? '🐛 Bug Report' : '💡 Feature Request'}: ${title}`,
                color: input.kind === 'bug' ? 0xf43f5e : 0x38bdf8,
                fields: [
                  { name: 'Pilot / Contact', value: contact || 'Anonymous', inline: true },
                  { name: 'Client', value: versionStr, inline: true },
                  { name: 'Details', value: message, inline: false }
                ],
                footer: { text: 'New Eden Lens Desktop App' },
                timestamp: new Date().toISOString()
              }
            ]
          })
        });
        if (!res.ok) {
          return { ok: false, error: 'Delivery service returned an error. Please try again later.' };
        }

        // Send local error log right under the bug report (inline if <= 1900 chars, else as .log file)
        if (input.kind === 'bug' && input.includeLogs) {
          const logText = errorLogger
            .getFormattedLog()
            .replace(/@(everyone|here)/gi, '@\u200b$1');
          if (logText.length <= 1900) {
            await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `**Error Log for:** \`${title}\`\n\`\`\`log\n${logText}\n\`\`\``
              })
            }).catch(() => {});
          } else {
            const form = new FormData();
            form.append(
              'payload_json',
              JSON.stringify({ content: `**Attached Error Log for:** \`${title}\`` })
            );
            form.append(
              'files[0]',
              new Blob([logText], { type: 'text/plain' }),
              'new-eden-lens-errors.log'
            );
            await fetch(endpoint, { method: 'POST', body: form }).catch(() => {});
          }
        }

        lastFeedbackAt = now;
        return { ok: true };
      } catch {
        return { ok: false, error: 'Unable to reach feedback service. Check your connection.' };
      }
    }
  );

  ipcMain.handle('app:logError', (_e, source: string, message: string) => {
    errorLogger.record(String(source || 'RENDERER').slice(0, 40), String(message || '').slice(0, 2000));
  });

  ipcMain.handle('app:checkForUpdates', async () => {
    const currentVersion = app.getVersion();
    const parseSemver = (v: string): [number, number, number] => {
      const cleaned = v.replace(/^v/i, '').split('-')[0];
      const parts = cleaned.split('.').map((n) => parseInt(n, 10) || 0);
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    };
    const isNewer = (latest: string, current: string): boolean => {
      const [la, lb, lc] = parseSemver(latest);
      const [ca, cb, cc] = parseSemver(current);
      if (la !== ca) return la > ca;
      if (lb !== cb) return lb > cb;
      return lc > cc;
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://new-eden-lens.com/api/releases', {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return { updateAvailable: false, currentVersion, latestRelease: null };
      const data = (await res.json()) as {
        releases?: Array<{
          version: string;
          title: string;
          date: string;
          downloadUrl: string;
          fileSize?: string;
          notes: string;
        }>;
      };
      const latest = data.releases?.[0] ?? null;
      if (!latest || !latest.version) {
        return { updateAvailable: false, currentVersion, latestRelease: null };
      }
      return {
        updateAvailable: isNewer(latest.version, currentVersion),
        currentVersion,
        latestRelease: latest
      };
    } catch {
      return { updateAvailable: false, currentVersion, latestRelease: null };
    }
  });
  ipcMain.handle('app:openPopout', () => {
    deps.openPopoutWindow();
  });
  ipcMain.handle('app:closePopout', () => {
    deps.getPopoutWindow()?.close();
  });
  ipcMain.handle('app:setPopoutOptions', (_e, opts: { alwaysOnTop?: boolean; attachToEve?: boolean; opacity?: number }) => {
    deps.setPopoutWindowOptions(opts);
  });

  ipcMain.handle('auth:listAccounts', () => deps.characterRepo.listAccounts());
  ipcMain.handle('auth:createAccount', (_e, label: string) =>
    deps.characterRepo.createAccount(label)
  );
  ipcMain.handle('auth:renameAccount', (_e, accountId: number, label: string) => {
    deps.characterRepo.renameAccount(accountId, label);
  });
  ipcMain.handle('auth:deleteAccount', (_e, accountId: number) => {
    deps.characterRepo.deleteAccount(accountId);
  });
  ipcMain.handle(
    'auth:assignCharacterAccount',
    (_e, characterId: number, accountId: number | null) => {
      deps.characterRepo.assignCharacterAccount(characterId, accountId);
    }
  );
  ipcMain.handle('auth:listCharacters', () => deps.characterRepo.listCharacters());
  ipcMain.handle('auth:loginPkce', async (_e, scopes?: string[], accountId?: number | null) => {
    const char = await deps.authService.login(scopes, accountId);
    void deps.scheduler.syncCharacterSnapshot(char.characterId);
    return char;
  });
  ipcMain.handle('auth:removeCharacter', (_e, characterId: number) => {
    deps.characterRepo.removeCharacter(characterId);
  });
  ipcMain.handle('auth:setDefaultCharacter', (_e, characterId: number) => {
    deps.characterRepo.setDefaultCharacter(characterId);
  });
  ipcMain.handle('auth:setMainCharacter', (_e, characterId: number) => {
    deps.characterRepo.setMainCharacter(characterId);
  });
  ipcMain.handle(
    'auth:updateCharacterMeta',
    (_e, characterId: number, patch: { description?: string; accentColor?: string }) => {
      deps.characterRepo.updateCharacterMeta(characterId, patch);
    }
  );
  ipcMain.handle('auth:refreshCharacter', async (_e, characterId: number) => {
    await deps.authService.refreshAccessToken(characterId);
    return deps.characterRepo.listCharacters().find((c) => c.characterId === characterId);
  });

  ipcMain.handle('esi:request', (_e, path: string, options?: EsiRequestOptions) =>
    deps.esiClient.request(path, options)
  );
  ipcMain.handle('esi:getStatus', () => deps.esiClient.getStatus());
  ipcMain.handle('esi:syncCharacterSnapshot', (_e, characterId: number) =>
    deps.scheduler.syncCharacterSnapshot(characterId)
  );

  ipcMain.handle('sde:getStatus', () => deps.sdeRepo.getStatus());
  ipcMain.handle('sde:importFuzzwork', async () => {
    try {
      return await deps.sdeImporter.importFromFuzzwork(sendSdeProgress);
    } catch (err) {
      sendSdeProgress({
        stage: 'error',
        progressPct: 0,
        message: err instanceof Error ? err.message : 'Fuzzwork SDE import failed'
      });
      throw err;
    }
  });
  ipcMain.handle('sde:importLocalSqlite', async () => {
    const win = deps.getMainWindow();
    const picker = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Select Fuzzwork EVE SDE SQLite File',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    });
    if (picker.canceled || picker.filePaths.length === 0) {
      return deps.sdeRepo.getStatus();
    }
    try {
      return await deps.sdeImporter.importFromLocalSqlite(picker.filePaths[0], sendSdeProgress);
    } catch (err) {
      sendSdeProgress({
        stage: 'error',
        progressPct: 0,
        message: err instanceof Error ? err.message : 'Local SQLite SDE import failed'
      });
      throw err;
    }
  });
  ipcMain.handle('sde:searchTypes', (_e, query: string, limit?: number) =>
    deps.sdeRepo.searchTypes(query, limit)
  );
  ipcMain.handle('sde:lookupTypesByNames', (_e, names: string[]) =>
    deps.sdeRepo.lookupTypesByNames(names)
  );
  ipcMain.handle('sde:searchSystems', (_e, query: string, limit?: number) =>
    deps.sdeRepo.searchSystems(query, limit)
  );

  ipcMain.handle('clipboard:readText', () => clipboard.readText());
  ipcMain.handle('clipboard:writeText', (_e, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('db:getCharacterWalletHistory', (_e, characterId: number | null) =>
    deps.characterRepo.getWalletHistory(characterId)
  );
  ipcMain.handle('db:getCharacterSkills', (_e, characterId: number) =>
    deps.characterRepo.getCharacterSkills(characterId)
  );

  ipcMain.handle('market:getQuotesForTypes', (_e, regionId: number, typeIds: number[]) =>
    deps.marketService.getQuotesForTypes(regionId, typeIds)
  );
  ipcMain.handle('market:getHistory', (_e, regionId: number, typeId: number) =>
    deps.marketService.getMarketHistory(regionId, typeId)
  );
  ipcMain.handle('market:listInvestments', (_e, characterId: number | null) =>
    deps.marketService.listInvestments(characterId)
  );
  ipcMain.handle('market:addInvestment', (_e, input) => {
    deps.marketService.addInvestment(input);
  });
  ipcMain.handle('market:markInvestmentSold', (_e, id: number, soldPrice: number) => {
    deps.marketService.markInvestmentSold(id, soldPrice);
  });
  ipcMain.handle('market:deleteInvestment', (_e, id: number) => {
    deps.marketService.deleteInvestment(id);
  });
  ipcMain.handle('market:getLpOffers', (_e, corporationId: number, regionId: number) =>
    deps.marketService.getLpOffers(corporationId, regionId)
  );
  ipcMain.handle('market:getCharacterLp', (_e, characterId: number) =>
    deps.marketService.getCharacterLp(characterId)
  );
  ipcMain.handle('market:listNpcCorporations', () => deps.marketService.listNpcCorporations());
  ipcMain.handle('market:getCharacterOrders', (_e, characterId: number | null, forceRefresh?: boolean) =>
    deps.marketService.getCharacterOrders(characterId, forceRefresh)
  );
  ipcMain.handle('market:getCharacterContracts', (_e, characterId: number | null, forceRefresh?: boolean) =>
    deps.marketService.getCharacterContracts(characterId, forceRefresh)
  );
  ipcMain.handle(
    'market:getContractDetails',
    (_e, characterId: number, contractId: number, contractType: string) =>
      deps.marketService.getContractDetails(characterId, contractId, contractType)
  );

  ipcMain.handle('killboard:startStream', () => {
    deps.killboardService.start(deps.getMainWindow);
  });
  ipcMain.handle('killboard:stopStream', () => {
    deps.killboardService.stop();
  });
  ipcMain.handle('killboard:isRunning', () => deps.killboardService.isRunning());
  ipcMain.handle('killboard:getRecent', (_e, limit?: number, search?: string, groupId?: number | null) =>
    deps.killboardService.getRecentKillmails(limit, search, groupId ?? null)
  );
  ipcMain.handle('killboard:listGroups', () => deps.killboardService.listGroups());
  ipcMain.handle('killboard:saveGroup', (_e, input) => deps.killboardService.saveGroup(input));
  ipcMain.handle('killboard:deleteGroup', (_e, id: number) => deps.killboardService.deleteGroup(id));
  ipcMain.handle('killboard:setPopoutGroup', (_e, id: number | null) =>
    deps.killboardService.setPopoutGroup(id)
  );
  ipcMain.handle(
    'killboard:resolveEntityNames',
    (_e, kind: 'character' | 'corporation' | 'alliance', query: string) =>
      deps.killboardService.resolveEntityNames(kind, query)
  );
  ipcMain.handle(
    'killboard:lookupEntity',
    (
      _e,
      kind: 'character' | 'corporation' | 'alliance' | 'ship_type' | 'solar_system',
      entityId: number,
      mode: 'all' | 'kills' | 'losses',
      page?: number,
      pageSize?: number
    ) => deps.killboardService.lookupEntity(kind, entityId, mode, page, pageSize)
  );
  ipcMain.handle('killboard:listWatchlists', () => deps.killboardService.listWatchlists());
  ipcMain.handle('killboard:addWatchlist', (_e, input: Omit<KillWatchlistRow, 'id'>) =>
    deps.killboardService.addWatchlist(input)
  );
  ipcMain.handle('killboard:removeWatchlist', (_e, id: number) =>
    deps.killboardService.removeWatchlist(id)
  );

  ipcMain.handle(
    'fitting:simulate',
    (
      _e,
      shipTypeId: number,
      items: FittingSlotItem[],
      characterId: number | null,
      options?: { skillOverrideLevel?: number | null; implantTypeIds?: number[]; priceRegionId?: number }
    ) => deps.fittingService.simulateFit(shipTypeId, items, characterId, options)
  );
  ipcMain.handle(
    'fitting:browseModules',
    (
      _e,
      tab: 'all' | 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge',
      query: string,
      shipTypeId?: number,
      hullRestricted?: boolean,
      fittedTypeIds?: number[]
    ) => deps.fittingService.browseModules(tab, query, shipTypeId, hullRestricted, fittedTypeIds)
  );
  ipcMain.handle('fitting:parseEft', (_e, rawText: string) => deps.fittingService.parseEft(rawText));
  ipcMain.handle('fitting:list', (_e, characterId: number | null) =>
    deps.fittingService.listFittings(characterId)
  );
  ipcMain.handle('fitting:save', (_e, input) => deps.fittingService.saveFitting(input));
  ipcMain.handle('fitting:syncFromEsi', (_e, characterId: number) =>
    deps.fittingService.syncFromEsi(characterId)
  );
  ipcMain.handle('fitting:pushToEsi', (_e, characterId: number, fit) =>
    deps.fittingService.pushToEsi(characterId, fit)
  );

  ipcMain.handle('fleets:list', () => deps.fleetService.listFleets());
  ipcMain.handle('fleets:create', (_e, name: string, description: string) =>
    deps.fleetService.createFleet(name, description)
  );
  ipcMain.handle('fleets:delete', (_e, id: number) => deps.fleetService.deleteFleet(id));
  ipcMain.handle('fleets:addMember', (_e, input) => deps.fleetService.addMember(input));
  ipcMain.handle('fleets:removeMember', (_e, memberId: number) =>
    deps.fleetService.removeMember(memberId)
  );

  ipcMain.handle('assets:list', (_e, characterId: number | null) =>
    deps.assetsService.listAssets(characterId)
  );
  ipcMain.handle('assets:sync', (_e, characterId: number | null) =>
    deps.assetsService.syncAssets(characterId)
  );

  ipcMain.handle('analytics:getPilotAnalytics', (_e, characterId: number | null) =>
    deps.analyticsService.syncAndGetAnalytics(characterId)
  );

  ipcMain.handle('wh:listMaps', () => deps.wormholeService.listMaps());
  ipcMain.handle('wh:getMapState', (_e, mapId: number) => deps.wormholeService.getMapState(mapId));
  ipcMain.handle(
    'wh:addNode',
    (_e, mapId: number, solarSystemId: number, posX?: number, posY?: number) => {
      deps.wormholeService.addNode(mapId, solarSystemId, posX, posY);
    }
  );
  ipcMain.handle(
    'wh:updateNodePosition',
    (_e, mapId: number, solarSystemId: number, posX: number, posY: number) => {
      deps.wormholeService.updateNodePosition(mapId, solarSystemId, posX, posY);
    }
  );
  ipcMain.handle(
    'wh:updateEdgeStatus',
    (
      _e,
      edgeId: number,
      patch: { whType?: string; massStatus?: WhEdgeDto['massStatus']; timeStatus?: WhEdgeDto['timeStatus'] }
    ) => {
      deps.wormholeService.updateEdgeStatus(edgeId, patch);
    }
  );
  ipcMain.handle(
    'wh:saveSignatures',
    (_e, mapId: number, solarSystemId: number, entries: ParsedCosmicSignature[]) => {
      deps.wormholeService.saveSignatures(mapId, solarSystemId, entries);
    }
  );
  ipcMain.handle('wh:pollLocations', (_e, mapId: number, characterId?: number | null) =>
    deps.wormholeService.pollLocationsAndTrack(mapId, characterId ?? null)
  );
  ipcMain.handle('wh:clearMap', (_e, mapId: number) => {
    deps.wormholeService.clearMap(mapId);
  });
  ipcMain.handle('wh:fetchTheraTurnur', (_e, originSystemId?: number | null) =>
    deps.wormholeService.fetchTheraTurnur(originSystemId ?? null)
  );

  ipcMain.handle('intelTracker:start', () => {
    deps.intelTrackerService.start(deps.getMainWindow);
  });
  ipcMain.handle('intelTracker:stop', () => {
    deps.intelTrackerService.stop();
  });
  ipcMain.handle('intelTracker:isRunning', () => deps.intelTrackerService.isRunning());
  ipcMain.handle('intelTracker:getLogDir', () => deps.intelTrackerService.getDefaultLogDir());
  ipcMain.handle('intelTracker:selectLogDir', async () => {
    const win = deps.getMainWindow();
    const picker = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Select EVE Chatlogs Folder',
      properties: ['openDirectory']
    });
    if (picker.canceled || picker.filePaths.length === 0) return null;
    const chosen = picker.filePaths[0];
    deps.appRepo.updateSettings({ intelTrackerLogDir: chosen });
    return chosen;
  });
  ipcMain.handle('intelTracker:setNotifyEnabled', (_e, enabled: boolean) => {
    deps.intelTrackerService.setNotifyEnabled(enabled);
  });
  ipcMain.handle('intelTracker:setMaxJumps', (_e, jumps: number) => {
    deps.intelTrackerService.setMaxJumps(jumps);
  });
  ipcMain.handle('intelTracker:listChannels', () => deps.intelTrackerService.listAvailableChannels());
  ipcMain.handle('intelTracker:setChannels', (_e, channels: string[]) => {
    deps.intelTrackerService.setChannels(channels);
  });
  ipcMain.handle('intelTracker:setWatches', (_e, watches: string[]) => {
    deps.intelTrackerService.setWatches(watches);
  });
  ipcMain.handle(
    'intelTracker:setSetups',
    (_e, setups: import('@shared/types/modules-data').IntelTrackerSetupDto[]) => {
      deps.intelTrackerService.setSetups(setups);
    }
  );
  ipcMain.handle('intelTracker:setActiveSystemId', (_e, systemId: number | null) => {
    deps.intelTrackerService.setActiveSystemId(systemId);
  });
  ipcMain.handle('intelTracker:setCharacterSystemId', (_e, characterId: number, systemId: number | null) => {
    deps.intelTrackerService.setCharacterSystemId(characterId, systemId);
  });
  ipcMain.handle('intelTracker:getRecentEvents', () => deps.intelTrackerService.getRecentEvents());
  ipcMain.handle('intelTracker:clearEvents', () => {
    deps.intelTrackerService.clearEvents();
  });
  ipcMain.handle('intelTracker:dismissEvent', (_e, id: string) => {
    deps.intelTrackerService.dismissEvent(id);
  });

  ipcMain.handle(
    'skills:resolveRequirements',
    (_e, targets: Array<{ typeId: number; targetLevel?: number }>, characterId: number | null) =>
      deps.skillPlannerService.resolveSkillRequirements(targets, characterId)
  );
  ipcMain.handle('skills:syncAttributesAndImplants', (_e, characterId: number) =>
    deps.skillPlannerService.syncCharacterAttributesAndImplants(characterId)
  );
  ipcMain.handle('mining:syncLedger', (_e, characterId: number, regionId: number) =>
    deps.miningService.syncLedger(characterId, regionId)
  );
  ipcMain.handle('industry:searchBlueprints', (_e, query: string, limit?: number) =>
    deps.industryService.searchBlueprints(query, limit)
  );
  ipcMain.handle(
    'industry:calculate',
    (_e, req: import('@shared/types/modules-data').IndustryCalculationRequest) =>
      deps.industryService.calculate(req)
  );
  ipcMain.handle('industry:getSystemCostIndex', (_e, solarSystemId: number) =>
    deps.industryService.getSystemCostIndex(solarSystemId)
  );
  ipcMain.handle('industry:listOwnedBlueprints', (_e, characterId: number | null) =>
    deps.industryService.listOwnedBlueprints(characterId)
  );
  ipcMain.handle('industry:listCharacterJobs', (_e, characterId: number | null) =>
    deps.industryService.listCharacterJobs(characterId)
  );
  ipcMain.handle(
    'planetary:getOverview',
    (_e, characterId: number | null, regionId: number, pocoTaxPct: number) =>
      deps.planetaryService.getOverview(characterId, regionId, pocoTaxPct)
  );
  ipcMain.handle('skills:getSkillMonitor', (_e, characterId: number) =>
    deps.skillPlannerService.getSkillMonitor(characterId)
  );

  ipcMain.handle('nav:listRegions', () => deps.navigationService.listRegions());
  ipcMain.handle('nav:getFleetLocations', (_e, characterId: number) =>
    deps.navigationService.getFleetLocations(characterId)
  );
  ipcMain.handle('nav:getSystemStations', (_e, solarSystemId: number, characterId?: number | null) =>
    deps.navigationService.getSystemStations(solarSystemId, characterId ?? null)
  );
  ipcMain.handle('nav:scanRegionStations', (_e, regionId: number, characterId?: number | null) =>
    deps.navigationService.scanRegionStations(regionId, characterId ?? null)
  );
  ipcMain.handle('nav:getMapData', (_e, regionId: number | null) =>
    deps.navigationService.getMapData(regionId)
  );
  ipcMain.handle('nav:syncSystemActivity', () => deps.navigationService.syncSystemActivity());
  ipcMain.handle(
    'nav:saveSystemNote',
    (
      _e,
      input: {
        solarSystemId: number;
        hasIceBelt: boolean;
        timerLabel?: string | null;
        timerExpiresAt?: number | null;
        note?: string | null;
      }
    ) => {
      deps.navigationService.saveSystemNote(input);
    }
  );
  ipcMain.handle(
    'nav:setAutopilotWaypoint',
    (
      _e,
      characterId: number,
      destinationId: number,
      clearOtherWaypoints: boolean,
      addToBeginning?: boolean
    ) =>
      deps.navigationService.setAutopilotWaypoint(
        characterId,
        destinationId,
        clearOtherWaypoints,
        addToBeginning
      )
  );
  ipcMain.handle('nav:findRoute', (_e, req: RouteFindRequest) =>
    deps.navigationService.findRoute(req)
  );
  ipcMain.handle(
    'nav:resolveRouteShareCode',
    (
      _e,
      input: {
        shareCode?: string;
        systemNames?: string[];
        entries?: Array<{ name: string; isWaypoint: boolean; waypointIndex?: number }>;
      }
    ) => deps.navigationService.resolveRouteShareCode(input)
  );
  ipcMain.handle('nav:listJumpGates', () => deps.navigationService.listJumpGates());
  ipcMain.handle('nav:importJumpGatesText', (_e, rawText: string) =>
    deps.navigationService.importJumpGatesText(rawText)
  );
  ipcMain.handle('nav:deleteJumpGate', (_e, id: number) =>
    deps.navigationService.deleteJumpGate(id)
  );
  ipcMain.handle('nav:listSavedRoutes', () => deps.navigationService.listSavedRoutes());
  ipcMain.handle('nav:saveRoute', (_e, input) => deps.navigationService.saveRoute(input));
  ipcMain.handle('nav:renameRoute', (_e, id: number, name: string, description: string) =>
    deps.navigationService.renameRoute(id, name, description)
  );
  ipcMain.handle('nav:deleteRoute', (_e, id: number) => deps.navigationService.deleteRoute(id));

  ipcMain.handle('intel:analyzeDScan', (_e, entries: ParsedDScanEntry[]) =>
    deps.intelService.analyzeDScan(entries)
  );
  ipcMain.handle(
    'intel:analyzeLocalPilots',
    (_e, pilotNames: string[], activeCharacterId?: number | null) =>
      deps.intelService.analyzeLocalPilots(pilotNames, activeCharacterId ?? null)
  );
  ipcMain.handle('intel:listManualStandings', () => deps.intelService.listManualStandings());
  ipcMain.handle('intel:upsertManualStanding', (_e, input) =>
    deps.intelService.upsertManualStanding(input)
  );
  ipcMain.handle('intel:deleteManualStanding', (_e, id: number) =>
    deps.intelService.deleteManualStanding(id)
  );

  ipcMain.handle('structures:list', (_e, characterId: number | null) =>
    deps.structureService.listStructures(characterId)
  );
  ipcMain.handle('structures:addManual', (_e, input) => {
    deps.structureService.addManualStructure(input);
  });
  ipcMain.handle('structures:deleteManual', (_e, id: number) => {
    deps.structureService.deleteManualStructure(id);
  });
}
