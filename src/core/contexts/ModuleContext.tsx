import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { BackgroundWorkerContext, ModuleConfigRecord, ModuleDefinition } from '@shared/types/module';
import { MODULE_REGISTRY } from '@/modules/registry';
import { useAccounts } from './AccountContext';

export interface ResolvedModule {
  definition: ModuleDefinition;
  config: ModuleConfigRecord;
}

interface ModuleContextValue {
  modules: ResolvedModule[];
  enabledModules: ResolvedModule[];
  activeModuleId: string;
  activeModule: ResolvedModule | null;
  setActiveModuleId: (id: string) => void;
  toggleModule: (id: string, enabled: boolean) => Promise<void>;
  moveModule: (id: string, direction: 'up' | 'down') => Promise<void>;
  reorderModules: (orderedIds: string[]) => Promise<void>;
  resetModuleOrder: () => Promise<void>;
  subscribeWorkerEvents: (moduleId: string, handler: (event: string, data: unknown) => void) => () => void;
}

const ModuleContext = createContext<ModuleContextValue | null>(null);

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const { characters, activeCharacterId } = useAccounts();
  const [configs, setConfigs] = useState<ModuleConfigRecord[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string>(MODULE_REGISTRY[0]?.id ?? '');

  const listenersRef = useRef(new Map<string, Set<(event: string, data: unknown) => void>>());
  const activeWorkersRef = useRef(new Map<string, { timer?: number }>());
  const charsRef = useRef(characters);
  const activeCharRef = useRef(activeCharacterId);

  charsRef.current = characters;
  activeCharRef.current = activeCharacterId;

  const mergeWithRegistry = useCallback((stored: ModuleConfigRecord[]): ModuleConfigRecord[] => {
    const byId = new Map(stored.map((c) => [c.moduleId, c]));
    return MODULE_REGISTRY.map((mod, idx) => {
      const existing = byId.get(mod.id);
      return (
        existing ?? {
          moduleId: mod.id,
          enabled: mod.defaultEnabled ?? true,
          sortOrder: mod.defaultOrder ?? idx,
          settings: {}
        }
      );
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);

  useEffect(() => {
    void window.eveLens.app.getModuleConfigs().then((stored) => {
      const merged = mergeWithRegistry(stored);
      setConfigs(merged);
      const firstEnabled = merged.find((m) => m.enabled);
      if (firstEnabled) setActiveModuleId(firstEnabled.moduleId);
    });
  }, [mergeWithRegistry]);

  const buildWorkerCtx = useCallback((moduleId: string): BackgroundWorkerContext => {
    return {
      getCharacterIds: () => charsRef.current.map((c) => c.characterId),
      getActiveCharacterId: () => activeCharRef.current,
      esiFetch: (path, opts) => window.eveLens.esi.request(path, opts),
      notify: (payload) => {
        void window.eveLens.app.notify(payload.title, payload.body);
      },
      emit: (event, data) => {
        const set = listenersRef.current.get(moduleId);
        if (!set) return;
        for (const fn of set) fn(event, data);
      }
    };
  }, []);

  // Manage background worker lifecycles when enabled modules change
  useEffect(() => {
    const enabledIds = new Set(configs.filter((c) => c.enabled).map((c) => c.moduleId));

    // Stop workers for disabled modules
    for (const [modId, handle] of activeWorkersRef.current.entries()) {
      if (!enabledIds.has(modId)) {
        if (handle.timer) window.clearInterval(handle.timer);
        const mod = MODULE_REGISTRY.find((m) => m.id === modId);
        void mod?.backgroundWorker?.onStop?.();
        activeWorkersRef.current.delete(modId);
      }
    }

    // Start workers for newly enabled modules
    for (const mod of MODULE_REGISTRY) {
      if (!enabledIds.has(mod.id) || !mod.backgroundWorker) continue;
      if (activeWorkersRef.current.has(mod.id)) continue;

      const ctx = buildWorkerCtx(mod.id);
      const worker = mod.backgroundWorker;
      void worker.onStart?.(ctx);
      let timer: number | undefined;
      if (worker.intervalMs && worker.onTick) {
        timer = window.setInterval(() => {
          void worker.onTick?.(ctx);
        }, worker.intervalMs);
      }
      activeWorkersRef.current.set(mod.id, { timer });
    }
  }, [configs, buildWorkerCtx]);

  // Notify active workers when active character switches
  useEffect(() => {
    for (const modId of activeWorkersRef.current.keys()) {
      const mod = MODULE_REGISTRY.find((m) => m.id === modId);
      if (mod?.backgroundWorker?.onCharacterChanged) {
        void mod.backgroundWorker.onCharacterChanged(activeCharacterId, buildWorkerCtx(modId));
      }
    }
  }, [activeCharacterId, buildWorkerCtx]);

  useEffect(() => {
    return () => {
      for (const [modId, handle] of activeWorkersRef.current.entries()) {
        if (handle.timer) window.clearInterval(handle.timer);
        const mod = MODULE_REGISTRY.find((m) => m.id === modId);
        void mod?.backgroundWorker?.onStop?.();
      }
      activeWorkersRef.current.clear();
    };
  }, []);

  const persistConfigs = useCallback(async (next: ModuleConfigRecord[]) => {
    const normalized = next.map((c, idx) => ({ ...c, sortOrder: idx }));
    setConfigs(normalized);
    await window.eveLens.app.saveModuleConfigs(normalized);
  }, []);

  const toggleModule = useCallback(
    async (id: string, enabled: boolean) => {
      const next = configs.map((c) => (c.moduleId === id ? { ...c, enabled } : c));
      await persistConfigs(next);
      if (!enabled && activeModuleId === id) {
        const fallback = next.find((c) => c.enabled);
        if (fallback) setActiveModuleId(fallback.moduleId);
      }
    },
    [configs, activeModuleId, persistConfigs]
  );

  const moveModule = useCallback(
    async (id: string, direction: 'up' | 'down') => {
      const idx = configs.findIndex((c) => c.moduleId === id);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= configs.length) return;
      const copy = [...configs];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);
      await persistConfigs(copy);
    },
    [configs, persistConfigs]
  );

  const reorderModules = useCallback(
    async (orderedIds: string[]) => {
      const byId = new Map(configs.map((c) => [c.moduleId, c]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((c): c is ModuleConfigRecord => Boolean(c));
      for (const c of configs) {
        if (!orderedIds.includes(c.moduleId)) reordered.push(c);
      }
      await persistConfigs(reordered);
    },
    [configs, persistConfigs]
  );

  const resetModuleOrder = useCallback(async () => {
    const defaults: ModuleConfigRecord[] = MODULE_REGISTRY.map((mod, idx) => ({
      moduleId: mod.id,
      enabled: mod.defaultEnabled ?? true,
      sortOrder: mod.defaultOrder ?? idx,
      settings: {}
    }));
    await persistConfigs(defaults);
  }, [persistConfigs]);

  const subscribeWorkerEvents = useCallback(
    (moduleId: string, handler: (event: string, data: unknown) => void) => {
      let set = listenersRef.current.get(moduleId);
      if (!set) {
        set = new Set();
        listenersRef.current.set(moduleId, set);
      }
      set.add(handler);
      return () => {
        set?.delete(handler);
      };
    },
    []
  );

  const modules = useMemo<ResolvedModule[]>(() => {
    const effective = configs.length > 0 ? configs : mergeWithRegistry([]);
    return effective
      .map((config) => {
        const definition = MODULE_REGISTRY.find((m) => m.id === config.moduleId);
        return definition ? { definition, config } : null;
      })
      .filter((m): m is ResolvedModule => m !== null);
  }, [configs, mergeWithRegistry]);

  const enabledModules = useMemo(() => modules.filter((m) => m.config.enabled), [modules]);
  const activeModule = useMemo(
    () => enabledModules.find((m) => m.definition.id === activeModuleId) ?? enabledModules[0] ?? null,
    [enabledModules, activeModuleId]
  );

  return (
    <ModuleContext.Provider
      value={{
        modules,
        enabledModules,
        activeModuleId: activeModule?.definition.id ?? activeModuleId,
        activeModule,
        setActiveModuleId,
        toggleModule,
        moveModule,
        reorderModules,
        resetModuleOrder,
        subscribeWorkerEvents
      }}
    >
      {children}
    </ModuleContext.Provider>
  );
}

export function useModules() {
  const ctx = useContext(ModuleContext);
  if (!ctx) throw new Error('useModules must be used inside ModuleProvider');
  return ctx;
}

