import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { FactionThemeId } from '@shared/constants/eve';
import type { AppSettings } from '@shared/types/ipc';

interface ThemeContextValue {
  theme: FactionThemeId;
  settings: AppSettings | null;
  setTheme: (theme: FactionThemeId) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const theme: FactionThemeId = settings?.theme ?? 'photon';

  const applyThemeDom = useCallback((id: FactionThemeId, fontSizePx?: number) => {
    document.documentElement.setAttribute('data-theme', id);
    const savedLocal = Number(localStorage.getItem('nel:fontSizePx'));
    const effective = fontSizePx ?? (Number.isFinite(savedLocal) && savedLocal >= 12 ? savedLocal : 14);
    const clamped = Math.min(18, Math.max(12, effective));
    document.documentElement.style.fontSize = `${clamped}px`;
  }, []);

  const refreshSettings = useCallback(async () => {
    const loaded = await window.eveLens.app.getSettings();
    if (loaded.fontSizePx) {
      localStorage.setItem('nel:fontSizePx', String(loaded.fontSizePx));
    }
    setSettings(loaded);
    applyThemeDom(loaded.theme, loaded.fontSizePx);
  }, [applyThemeDom]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (patch.fontSizePx !== undefined) {
        localStorage.setItem('nel:fontSizePx', String(patch.fontSizePx));
      }
      if (patch.theme || patch.fontSizePx) {
        applyThemeDom(patch.theme ?? theme, patch.fontSizePx ?? settings?.fontSizePx);
      }
      const updated = await window.eveLens.app.updateSettings(patch);
      const merged = {
        ...updated,
        fontSizePx: patch.fontSizePx ?? updated.fontSizePx ?? settings?.fontSizePx ?? 14
      };
      setSettings(merged);
      applyThemeDom(merged.theme, merged.fontSizePx);
    },
    [applyThemeDom, theme, settings?.fontSizePx]
  );

  const setTheme = useCallback(
    async (nextTheme: FactionThemeId) => {
      await updateSettings({ theme: nextTheme });
    },
    [updateSettings]
  );

  return (
    <ThemeContext.Provider value={{ theme, settings, setTheme, updateSettings, refreshSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

