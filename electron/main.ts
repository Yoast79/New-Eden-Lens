import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { BrowserWindow, Menu, Tray, app, nativeImage, protocol, screen, shell } from 'electron';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { LocalDatabase } from './db/connection';
import { AppRepository } from './db/repositories/appRepo';
import { CharacterRepository } from './db/repositories/characterRepo';
import { SdeRepository } from './db/repositories/sdeRepo';
import { registerIpcHandlers } from './ipc/register-handlers';
import { AnalyticsService } from './services/analytics-service';
import { AssetsService } from './services/assets-service';
import { PkceAuthService } from './services/auth-pkce';
import { EsiClient } from './services/esi-client';
import { FittingService } from './services/fitting-service';
import { FleetService } from './services/fleet-service';
import { registerEveImageProtocol } from './services/image-cache';
import { IntelService } from './services/intel-service';
import { KillboardService } from './services/killboard-service';
import { MarketService } from './services/market-service';
import { NavigationService } from './services/navigation-service';
import { IntelTrackerService } from './services/intel-tracker-service';
import { BackgroundScheduler } from './services/scheduler';
import { SdeImporter } from './services/sde-importer';
import { SkillPlannerService } from './services/skill-planner-service';
import { StructureService } from './services/structure-service';
import { MiningService } from './services/mining-service';
import { IndustryService } from './services/industry-service';
import { PlanetaryService } from './services/planetary-service';
import { WormholeService } from './services/wormhole-service';
import { errorLogger } from './services/error-logger';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'eve-img',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let popoutWindow: BrowserWindow | null = null;
let popoutAlwaysOnTop = true;
let popoutAttachToEve = true;
let popoutMonitorTimer: NodeJS.Timeout | null = null;
let lastPopoutOnTopApplied: boolean | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let database: LocalDatabase | null = null;
let scheduler: BackgroundScheduler | null = null;
let killboardService: KillboardService | null = null;
let intelTrackerService: IntelTrackerService | null = null;

interface SavedBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function parseSavedBounds(
  raw: string,
  defaultWidth = 1480,
  defaultHeight = 920,
  minWidth = 1120,
  minHeight = 720
): SavedBounds {
  try {
    const parsed = JSON.parse(raw) as Partial<SavedBounds>;
    const width = Math.max(minWidth, Number(parsed.width) || defaultWidth);
    const height = Math.max(minHeight, Number(parsed.height) || defaultHeight);
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return (
          parsed.x! < b.x + b.width - 80 &&
          parsed.x! + width > b.x + 80 &&
          parsed.y! < b.y + b.height - 80 &&
          parsed.y! + height > b.y + 80
        );
      });
      if (visible) {
        return { x: parsed.x, y: parsed.y, width, height, maximized: Boolean(parsed.maximized) };
      }
    }
    return { width, height, maximized: Boolean(parsed.maximized) };
  } catch {
    return { width: defaultWidth, height: defaultHeight };
  }
}

function loadAppIcon(): Electron.NativeImage {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.png'),
    path.join(process.resourcesPath ?? '', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'public', 'icon.png')
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVQ4T2NkYGD4z0ABYBzVMGoAww9Q04CjRgMDg8P/fwz/Gf7//48s9v//fwZGBgZGBkZGJCVMDGgakA34j90AmgZiXUAzF4waMGoAyQF0H9DMBaMGUAkA5T4jAT8L8fQAAAAASUVORK5CYII=';
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
}

function createTray(appRepo: AppRepository): void {
  if (tray) return;
  const icon = loadAppIcon().resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('New Eden Lens');
  const openMain = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow(appRepo);
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  };
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open New Eden Lens',
        click: openMain
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          if (popoutWindow && !popoutWindow.isDestroyed()) popoutWindow.close();
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
          app.quit();
        }
      }
    ])
  );
  tray.on('double-click', openMain);
}

function createWindow(appRepo: AppRepository): void {
  const settings = appRepo.getSettings();
  const bounds = parseSavedBounds(settings.windowBounds);

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0B0E14',
    title: 'New Eden Lens',
    icon: loadAppIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (bounds.maximized && !settings.fullScreen) {
    mainWindow.maximize();
  }

  let boundsTimer: NodeJS.Timeout | null = null;
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || !database) return;
    try {
      const maximized = mainWindow.isMaximized();
      const rect = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
      appRepo.updateSettings({
        windowBounds: JSON.stringify({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          maximized
        })
      });
    } catch {
      // ignore if database is closing
    }
  };
  const scheduleSaveBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(saveBounds, 300);
  };

  mainWindow.on('move', scheduleSaveBounds);
  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('maximize', saveBounds);
  mainWindow.on('unmaximize', saveBounds);
  mainWindow.on('close', (e) => {
    saveBounds();
    if (!isQuitting && appRepo.getSettings().closeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    } else {
      isQuitting = true;
      if (popoutWindow && !popoutWindow.isDestroyed()) {
        popoutWindow.close();
      }
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (appRepo.getSettings().fullScreen) {
      mainWindow?.setFullScreen(true);
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function checkForegroundForPopout(): void {
  if (!popoutWindow || popoutWindow.isDestroyed()) return;
  if (!popoutAlwaysOnTop) {
    if (lastPopoutOnTopApplied !== false) {
      popoutWindow.setAlwaysOnTop(false);
      lastPopoutOnTopApplied = false;
    }
    return;
  }
  if (!popoutAttachToEve) {
    if (lastPopoutOnTopApplied !== true) {
      popoutWindow.setAlwaysOnTop(true, 'screen-saver');
      lastPopoutOnTopApplied = true;
    }
    return;
  }
  if (process.platform !== 'win32') return;

  const psScript =
    "$sig = '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);'; " +
    "$t = Add-Type -MemberDefinition $sig -Name WinApiFg -Namespace Nel -PassThru; " +
    "$h = $t::GetForegroundWindow(); $sb = New-Object System.Text.StringBuilder 256; [void]$t::GetWindowText($h, $sb, 256); $sb.ToString()";

  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 650 }, (err, stdout) => {
    if (err || !popoutWindow || popoutWindow.isDestroyed() || !popoutAlwaysOnTop || !popoutAttachToEve) return;
    const title = stdout.trim();
    const isEveOrSelf =
      /^EVE\s*-/i.test(title) ||
      /^EVE Online/i.test(title) ||
      /New Eden Lens/i.test(title);
    if (isEveOrSelf) {
      if (lastPopoutOnTopApplied !== true) {
        popoutWindow.setAlwaysOnTop(true, 'screen-saver');
        popoutWindow.moveTop();
        lastPopoutOnTopApplied = true;
      }
    } else if (lastPopoutOnTopApplied !== false) {
      popoutWindow.setAlwaysOnTop(false);
      lastPopoutOnTopApplied = false;
    }
  });
}

export function setPopoutWindowOptions(opts: {
  alwaysOnTop?: boolean;
  attachToEve?: boolean;
  opacity?: number;
}): void {
  if (opts.alwaysOnTop !== undefined) popoutAlwaysOnTop = opts.alwaysOnTop;
  if (opts.attachToEve !== undefined) popoutAttachToEve = opts.attachToEve;
  lastPopoutOnTopApplied = null;
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    if (opts.opacity !== undefined) {
      popoutWindow.setOpacity(Math.min(1, Math.max(0.45, opts.opacity)));
    }
    checkForegroundForPopout();
  }
}

export function openPopoutWindow(appRepo: AppRepository): void {
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    popoutWindow.show();
    popoutWindow.focus();
    return;
  }

  const bounds = parseSavedBounds(appRepo.getSettings().popoutBounds, 440, 620, 340, 380);

  popoutWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 340,
    minHeight: 380,
    frame: false,
    resizable: true,
    alwaysOnTop: popoutAlwaysOnTop,
    skipTaskbar: false,
    backgroundColor: '#0B0E14',
    title: 'New Eden Lens — In-Game Overlay',
    icon: loadAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (popoutAlwaysOnTop) {
    popoutWindow.setAlwaysOnTop(true, 'screen-saver');
    popoutWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    lastPopoutOnTopApplied = true;
  }

  if (popoutMonitorTimer) clearInterval(popoutMonitorTimer);
  popoutMonitorTimer = setInterval(checkForegroundForPopout, 800);

  let popTimer: NodeJS.Timeout | null = null;
  const savePopBounds = () => {
    if (!popoutWindow || popoutWindow.isDestroyed() || !database) return;
    try {
      const rect = popoutWindow.getBounds();
      appRepo.updateSettings({
        popoutBounds: JSON.stringify({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        })
      });
    } catch {
      // ignore if database is closing
    }
  };
  const scheduleSavePopBounds = () => {
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(savePopBounds, 300);
  };

  popoutWindow.on('move', scheduleSavePopBounds);
  popoutWindow.on('resize', scheduleSavePopBounds);
  popoutWindow.on('close', savePopBounds);
  popoutWindow.on('closed', () => {
    if (popoutMonitorTimer) {
      clearInterval(popoutMonitorTimer);
      popoutMonitorTimer = null;
    }
    lastPopoutOnTopApplied = null;
    popoutWindow = null;
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'];
    const sep = base.includes('?') ? '&' : '?';
    void popoutWindow.loadURL(`${base}${sep}popout=1`);
  } else {
    void popoutWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { popout: '1' }
    });
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.fenriscreations.newedenlens');
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  errorLogger.init();

  const userDataDir = app.getPath('userData');
  registerEveImageProtocol(userDataDir);

  database = new LocalDatabase(userDataDir);
  await database.init();

  const appRepo = new AppRepository(database);
  const characterRepo = new CharacterRepository(database);
  const sdeRepo = new SdeRepository(database);
  const authService = new PkceAuthService(appRepo, characterRepo);
  const esiClient = new EsiClient(appRepo, authService);
  const sdeImporter = new SdeImporter(database, sdeRepo);
  const marketService = new MarketService(database, esiClient);
  const skillPlannerService = new SkillPlannerService(database, characterRepo, esiClient);
  const navigationService = new NavigationService(database, esiClient);
  const intelService = new IntelService(database, esiClient);
  killboardService = new KillboardService(database);
  const fittingService = new FittingService(database, characterRepo, esiClient);
  const analyticsService = new AnalyticsService(database, characterRepo, esiClient, skillPlannerService);
  const wormholeService = new WormholeService(database, characterRepo, esiClient);
  const structureService = new StructureService(database, esiClient);
  const fleetService = new FleetService(database);
  const assetsService = new AssetsService(database, characterRepo, esiClient);
  const miningService = new MiningService(database, esiClient, marketService);
  const industryService = new IndustryService(database, esiClient, marketService);
  const planetaryService = new PlanetaryService(database, esiClient, marketService);
  intelTrackerService = new IntelTrackerService(database, appRepo);
  scheduler = new BackgroundScheduler(appRepo, characterRepo, esiClient);

  registerIpcHandlers({
    getMainWindow: () => mainWindow,
    getPopoutWindow: () => popoutWindow,
    openPopoutWindow: () => openPopoutWindow(appRepo),
    setPopoutWindowOptions,
    appRepo,
    characterRepo,
    sdeRepo,
    authService,
    esiClient,
    sdeImporter,
    scheduler,
    marketService,
    skillPlannerService,
    navigationService,
    intelService,
    killboardService,
    fittingService,
    analyticsService,
    wormholeService,
    intelTrackerService,
    structureService,
    fleetService,
    assetsService,
    miningService,
    industryService,
    planetaryService
  });

  createTray(appRepo);
  createWindow(appRepo);
  scheduler.start(() => mainWindow);
  killboardService.start(() => mainWindow);
  intelTrackerService.start(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(appRepo);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isQuitting) {
    if (!mainWindow) app.quit();
  } else if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (popoutMonitorTimer) {
    clearInterval(popoutMonitorTimer);
    popoutMonitorTimer = null;
  }
  tray?.destroy();
  tray = null;
  killboardService?.stop();
  intelTrackerService?.stop();
  scheduler?.stop();
  database?.close();
  database = null;
});
