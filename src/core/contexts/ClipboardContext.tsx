import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ParsedClipboard } from '@shared/types/clipboard';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';
import { useModules } from './ModuleContext';

interface ClipboardContextValue {
  lastParsed: ParsedClipboard | null;
  parseAndRoute: (text: string, autoNavigate?: boolean) => ParsedClipboard;
  pasteFromSystemClipboard: (autoNavigate?: boolean) => Promise<ParsedClipboard>;
  clearClipboardBanner: () => void;
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null);

export function ClipboardProvider({ children }: { children: React.ReactNode }) {
  const { enabledModules, activeModule, setActiveModuleId } = useModules();
  const [lastParsed, setLastParsed] = useState<ParsedClipboard | null>(null);

  const parseAndRoute = useCallback(
    (text: string, autoNavigate = true): ParsedClipboard => {
      const parsed = parseEveClipboard(text);
      setLastParsed(parsed);

      if (autoNavigate && parsed.format !== 'unknown') {
        const currentAccepts = activeModule?.definition.acceptedClipboardFormats?.includes(parsed.format);
        if (!currentAccepts) {
          const matchingMod = enabledModules.find((m) =>
            m.definition.acceptedClipboardFormats?.includes(parsed.format)
          );
          if (matchingMod) {
            setActiveModuleId(matchingMod.definition.id);
          }
        }
      }
      return parsed;
    },
    [activeModule, enabledModules, setActiveModuleId]
  );

  const pasteFromSystemClipboard = useCallback(
    async (autoNavigate = true) => {
      const text = await window.eveLens.clipboard.readText();
      return parseAndRoute(text, autoNavigate);
    },
    [parseAndRoute]
  );

  useEffect(() => {
    const unsub = window.eveLens.clipboard.onClipboardChanged((text) => {
      const parsed = parseEveClipboard(text);
      if (parsed.format !== 'unknown') {
        parseAndRoute(text, false);
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        void pasteFromSystemClipboard(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [parseAndRoute, pasteFromSystemClipboard]);

  return (
    <ClipboardContext.Provider
      value={{
        lastParsed,
        parseAndRoute,
        pasteFromSystemClipboard,
        clearClipboardBanner: () => setLastParsed(null)
      }}
    >
      {children}
    </ClipboardContext.Provider>
  );
}

export function useEveClipboard() {
  const ctx = useContext(ClipboardContext);
  if (!ctx) throw new Error('useEveClipboard must be used inside ClipboardProvider');
  return ctx;
}

