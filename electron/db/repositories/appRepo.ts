import { ESI_DEFAULT_COMPATIBILITY_DATE } from '@shared/constants/eve';
import type { AppSettings } from '@shared/types/ipc';
import type { ModuleConfigRecord } from '@shared/types/module';
import type { LocalDatabase } from '../connection';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'photon',
  esiClientId: '3c7490f12cde4e47b1ed6a16b9c6af70',
  esiCompatibilityDate: ESI_DEFAULT_COMPATIBILITY_DATE,
  clipboardAutoWatch: false,
  neocomExpanded: false,
  neocomUtilityOrder: ['accounts', 'modules', 'help', 'donate', 'settings'],
  neocomHiddenIds: [],
  moduleCustomNames: {},
  dateFormat: 'dd/mm/yyyy',
  intelTrackerLogDir: '',
  intelTrackerChannels: [],
  intelTrackerSetups: [],
  intelTrackerOverlayInRangeOnly: false,
  intelTrackerVolumePct: 70,
  intelTrackerGridCount: 1,
  intelTrackerPaneSetupIds: [],
  tacticalMapStyle: 'cluster',
  tacticalMapRegionId: null,
  quickSetupCompleted: false,
  closeToTray: false,
  fullScreen: false,
  fontSizePx: 14,
  windowBounds: '',
  popoutBounds: ''
};

export class AppRepository {
  constructor(private readonly db: LocalDatabase) {}

  getSettings(): AppSettings {
    const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM app_settings');
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      theme: (map.get('theme') as AppSettings['theme']) ?? DEFAULT_SETTINGS.theme,
      esiClientId: (map.get('esiClientId') || '').trim() || DEFAULT_SETTINGS.esiClientId,
      esiCompatibilityDate: map.get('esiCompatibilityDate') ?? DEFAULT_SETTINGS.esiCompatibilityDate,
      clipboardAutoWatch: map.get('clipboardAutoWatch') === 'true',
      neocomExpanded: map.get('neocomExpanded') === 'true',
      neocomUtilityOrder: safeJsonParse(
        map.get('neocomUtilityOrder') ?? '',
        DEFAULT_SETTINGS.neocomUtilityOrder
      ),
      neocomHiddenIds: safeJsonParse(
        map.get('neocomHiddenIds') ?? '',
        DEFAULT_SETTINGS.neocomHiddenIds
      ),
      moduleCustomNames: safeJsonParse(map.get('moduleCustomNames') ?? '', {}),
      dateFormat: (map.get('dateFormat') as AppSettings['dateFormat']) ?? DEFAULT_SETTINGS.dateFormat,
      intelTrackerLogDir: map.get('intelTrackerLogDir') ?? map.get('near2LogDir') ?? '',
      intelTrackerChannels: safeJsonParse(
        map.get('intelTrackerChannels') ?? map.get('near2Channels') ?? '',
        []
      ),
      intelTrackerSetups: safeJsonParse(
        map.get('intelTrackerSetups') ?? map.get('near2Setups') ?? '',
        []
      ),
      intelTrackerOverlayInRangeOnly:
        (map.get('intelTrackerOverlayInRangeOnly') ?? map.get('near2OverlayInRangeOnly')) === 'true',
      intelTrackerVolumePct: Math.min(
        100,
        Math.max(0, Number(map.get('intelTrackerVolumePct') ?? map.get('near2VolumePct') ?? 70))
      ),
      intelTrackerGridCount: Math.min(9, Math.max(1, Number(map.get('intelTrackerGridCount') ?? 1))),
      intelTrackerPaneSetupIds: safeJsonParse(map.get('intelTrackerPaneSetupIds') ?? '', []),
      tacticalMapStyle: map.get('tacticalMapStyle') === 'schematic' ? 'schematic' : 'cluster',
      tacticalMapRegionId:
        map.has('tacticalMapRegionId') && map.get('tacticalMapRegionId') !== 'null' && map.get('tacticalMapRegionId') !== ''
          ? Number(map.get('tacticalMapRegionId'))
          : null,
      quickSetupCompleted: map.get('quickSetupCompleted') === 'true',
      closeToTray: map.get('closeToTray') === 'true',
      fullScreen: map.get('fullScreen') === 'true',
      fontSizePx: Math.min(18, Math.max(12, Number(map.get('fontSizePx')) || 14)),
      windowBounds: map.get('windowBounds') ?? '',
      popoutBounds: map.get('popoutBounds') ?? ''
    };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const now = Date.now();
    this.db.transaction((raw) => {
      for (const [key, val] of Object.entries(patch)) {
        if (val === undefined) continue;
        const serialized =
          typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
        raw.run(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, serialized, now]
        );
      }
    });
    return this.getSettings();
  }

  getModuleConfigs(): ModuleConfigRecord[] {
    const rows = this.db.all<{
      module_id: string;
      enabled: number;
      sort_order: number;
      settings_json: string;
    }>('SELECT module_id, enabled, sort_order, settings_json FROM module_configs ORDER BY sort_order ASC');

    return rows.map((row) => ({
      moduleId: row.module_id,
      enabled: row.enabled === 1,
      sortOrder: row.sort_order,
      settings: safeJsonParse(row.settings_json, {})
    }));
  }

  saveModuleConfigs(configs: ModuleConfigRecord[]): ModuleConfigRecord[] {
    this.db.transaction((raw) => {
      for (const cfg of configs) {
        raw.run(
          `INSERT INTO module_configs (module_id, enabled, sort_order, settings_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(module_id) DO UPDATE SET
             enabled = excluded.enabled,
             sort_order = excluded.sort_order,
             settings_json = excluded.settings_json`,
          [cfg.moduleId, cfg.enabled ? 1 : 0, cfg.sortOrder, JSON.stringify(cfg.settings ?? {})]
        );
      }
    });
    return this.getModuleConfigs();
  }
}

function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

