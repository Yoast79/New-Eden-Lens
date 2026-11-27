import { useState } from 'react';
import { Rocket, Settings, X } from 'lucide-react';
import { FACTION_THEMES } from '@shared/constants/eve';
import type { DateFormatOption } from '@shared/types/ipc';
import { useTheme } from '@/core/contexts/ThemeContext';

const DATE_FORMAT_OPTIONS: Array<{ value: DateFormatOption; label: string }> = [
  { value: 'dd/mm/yyyy', label: 'DD/MM/YYYY (27/11/2026)' },
  { value: 'mm/dd/yyyy', label: 'MM/DD/YYYY (11/27/2026)' },
  { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD (2026-11-27)' },
  { value: 'locale', label: 'System Locale' }
];

const FONT_SIZE_OPTIONS = [
  { px: 12, label: 'Compact (12px)' },
  { px: 13, label: 'Small (13px)' },
  { px: 14, label: 'Default (14px)' },
  { px: 15, label: 'Medium (15px)' },
  { px: 16, label: 'Large (16px)' },
  { px: 18, label: 'Extra Large (18px)' }
] as const;

export function SettingsModal({
  onClose,
  onOpenQuickSetup
}: {
  onClose: () => void;
  onOpenQuickSetup: () => void;
}) {
  const { settings, theme, setTheme, updateSettings } = useTheme();
  const [autoWatch, setAutoWatch] = useState(settings?.clipboardAutoWatch ?? false);
  const [closeToTray, setCloseToTray] = useState(settings?.closeToTray ?? false);
  const [fullScreen, setFullScreen] = useState(settings?.fullScreen ?? false);
  const [fontSizePx, setFontSizePx] = useState(settings?.fontSizePx ?? 14);
  const [dateFormat, setDateFormat] = useState<DateFormatOption>(settings?.dateFormat ?? 'dd/mm/yyyy');

  const handleSave = async () => {
    await updateSettings({
      clipboardAutoWatch: autoWatch,
      closeToTray,
      fullScreen,
      fontSizePx,
      dateFormat
    });
    await window.eveLens.app.setFullScreen(fullScreen);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="photon-panel w-full max-w-xl shadow-2xl">
        <div className="photon-header flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Application Settings
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-eve-muted hover:text-eve-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Window & Behavior Options */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-between border border-eve-border bg-eve-bg px-3 py-2 text-xs text-eve-text">
              <span>Auto-watch EVE Clipboard</span>
              <input
                type="checkbox"
                checked={autoWatch}
                onChange={(e) => setAutoWatch(e.target.checked)}
                className="accent-[var(--eve-accent)]"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between border border-eve-border bg-eve-bg px-3 py-2 text-xs text-eve-text">
              <span>Close to System Tray</span>
              <input
                type="checkbox"
                checked={closeToTray}
                onChange={(e) => setCloseToTray(e.target.checked)}
                className="accent-[var(--eve-accent)]"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between border border-eve-border bg-eve-bg px-3 py-2 text-xs text-eve-text">
              <span>Full Screen Mode</span>
              <input
                type="checkbox"
                checked={fullScreen}
                onChange={(e) => {
                  const next = e.target.checked;
                  setFullScreen(next);
                  void updateSettings({ fullScreen: next });
                  void window.eveLens.app.setFullScreen(next);
                }}
                className="accent-[var(--eve-accent)]"
              />
            </label>

            <label className="flex items-center justify-between gap-2 border border-eve-border bg-eve-bg px-3 py-1.5 text-xs text-eve-text">
              <span>Font Size</span>
              <select
                value={fontSizePx}
                onChange={(e) => {
                  const nextPx = Number(e.target.value);
                  setFontSizePx(nextPx);
                  void updateSettings({ fontSizePx: nextPx });
                }}
                className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
              >
                {FONT_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.px} value={opt.px}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-2 border border-eve-border bg-eve-bg px-3 py-1.5 text-xs text-eve-text sm:col-span-2">
              <span>Date Format</span>
              <select
                value={dateFormat}
                onChange={(e) => {
                  const nextFmt = e.target.value as DateFormatOption;
                  setDateFormat(nextFmt);
                  void updateSettings({ dateFormat: nextFmt });
                }}
                className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
              >
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Faction Theme Swatches */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-eve-text">
              EVE Faction Color Theme
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FACTION_THEMES.map((t) => {
                const active = t.id === theme;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void setTheme(t.id)}
                    className={`flex items-center gap-2 border px-2.5 py-2 text-left text-xs ${
                      active
                        ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                        : 'border-eve-border bg-eve-bg/60 text-eve-text hover:border-eve-border-strong'
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 border border-white/25"
                      style={{ backgroundColor: t.swatch }}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-eve-border pt-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenQuickSetup();
              }}
              className="inline-flex items-center gap-1.5 border border-eve-border-strong bg-eve-elevated px-3 py-1.5 text-xs text-eve-text hover:border-eve-accent"
            >
              <Rocket className="h-3.5 w-3.5 text-eve-accent" />
              Launch Quick Setup
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="border border-eve-accent/60 bg-eve-accent-muted px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
