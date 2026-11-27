import { useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import { useAccounts } from '@/core/contexts/AccountContext';
import { useModules } from '@/core/contexts/ModuleContext';
import { useTheme } from '@/core/contexts/ThemeContext';
import { NEOCOM_UTILITY_ITEMS } from './NeocomSidebar';

export function ModuleManagerModal({ onClose }: { onClose: () => void }) {
  const { modules, toggleModule, reorderModules, resetModuleOrder } = useModules();
  const { activeCharacter } = useAccounts();
  const { settings, updateSettings } = useTheme();
  const [tab, setTab] = useState<'modules' | 'utilities'>('modules');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const customNames = settings?.moduleCustomNames ?? {};

  const saveCustomName = (id: string) => {
    const trimmed = editingName.trim();
    const next = { ...customNames };
    if (!trimmed) {
      delete next[id];
    } else {
      next[id] = trimmed;
    }
    void updateSettings({ moduleCustomNames: next });
    setEditingId(null);
  };

  const utilityOrder = settings?.neocomUtilityOrder ?? NEOCOM_UTILITY_ITEMS.map((u) => u.id);
  const hiddenSet = new Set(settings?.neocomHiddenIds ?? []);

  const orderedUtilities = utilityOrder
    .map((id) => NEOCOM_UTILITY_ITEMS.find((u) => u.id === id))
    .filter((u): u is (typeof NEOCOM_UTILITY_ITEMS)[number] => Boolean(u))
    .concat(NEOCOM_UTILITY_ITEMS.filter((u) => !utilityOrder.includes(u.id)));

  const handleDropModule = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = modules.map((m) => m.definition.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void reorderModules(ids);
    setDragId(null);
    setDragOverId(null);
  };

  const handleDropUtility = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const list = orderedUtilities.map((u) => u.id);
    const from = list.indexOf(dragId);
    const to = list.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    void updateSettings({ neocomUtilityOrder: list });
    setDragId(null);
    setDragOverId(null);
  };

  const toggleUtilityVisibility = (id: string) => {
    const next = new Set(hiddenSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void updateSettings({ neocomHiddenIds: Array.from(next) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="photon-panel flex max-h-[85vh] w-full max-w-2xl flex-col shadow-2xl">
        <div className="photon-header flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Sidebar &amp; Module Manager
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void resetModuleOrder();
                void updateSettings({
                  neocomUtilityOrder: NEOCOM_UTILITY_ITEMS.map((u) => u.id),
                  neocomHiddenIds: [],
                  moduleCustomNames: {}
                });
                setEditingId(null);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-eve-muted hover:text-eve-accent"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Default
            </button>
            <button type="button" onClick={onClose} className="text-eve-muted hover:text-eve-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-eve-border bg-eve-bg/50 px-4 pt-2 text-xs">
          <button
            type="button"
            onClick={() => setTab('modules')}
            className={`border-b-2 px-3 py-1.5 font-medium ${tab === 'modules'
                ? 'border-eve-accent text-eve-accent'
                : 'border-transparent text-eve-muted hover:text-eve-text'
              }`}
          >
            Feature Modules ({modules.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('utilities')}
            className={`border-b-2 px-3 py-1.5 font-medium ${tab === 'utilities'
                ? 'border-eve-accent text-eve-accent'
                : 'border-transparent text-eve-muted hover:text-eve-text'
              }`}
          >
            Sidebar Utility Rail ({orderedUtilities.length})
          </button>
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto p-4">
          {tab === 'modules'
            ? modules.map(({ definition, config }) => {
              const Icon = definition.icon;
              const missingScopes =
                activeCharacter && definition.requiredEsiScopes.length > 0
                  ? definition.requiredEsiScopes.filter(
                    (s) => !activeCharacter.scopes.includes(s)
                  )
                  : [];

              return (
                <div
                  key={definition.id}
                  draggable={editingId !== definition.id}
                  onDragStart={(e) => {
                    setDragId(definition.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverId !== definition.id) setDragOverId(definition.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropModule(definition.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  className={`flex items-center justify-between gap-3 border px-3 py-2.5 transition-colors ${
                    dragOverId === definition.id && dragId !== definition.id
                      ? 'border-eve-accent bg-eve-accent-muted/30'
                      : config.enabled
                        ? 'border-eve-border bg-eve-bg/70'
                        : 'border-eve-border/50 bg-eve-bg/30 opacity-60'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div
                      className="mt-2 cursor-grab text-eve-muted hover:text-eve-accent active:cursor-grabbing"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-eve-border bg-eve-panel text-eve-accent">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {editingId === definition.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCustomName(definition.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              placeholder={definition.name}
                              autoFocus
                              className="w-44 border border-eve-accent bg-eve-bg px-2 py-0.5 text-xs text-eve-text"
                            />
                            <button
                              type="button"
                              onClick={() => saveCustomName(definition.id)}
                              className="border border-eve-accent/60 bg-eve-accent-muted p-0.5 text-eve-accent"
                              title="Save name"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-semibold text-eve-text">
                              {customNames[definition.id]?.trim() || definition.name}
                            </span>
                            {customNames[definition.id]?.trim() && (
                              <span className="text-[10px] text-eve-muted">
                                ({definition.name})
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(definition.id);
                                setEditingName(customNames[definition.id] ?? definition.name);
                              }}
                              className="text-eve-muted hover:text-eve-accent"
                              title="Rename module"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            {customNames[definition.id]?.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = { ...customNames };
                                  delete next[definition.id];
                                  void updateSettings({ moduleCustomNames: next });
                                }}
                                className="text-eve-muted hover:text-eve-warning"
                                title="Reset name to default"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            )}
                          </>
                        )}
                        <span className="border border-eve-border bg-eve-elevated px-1.5 py-0.2 text-[10px] uppercase tracking-wider text-eve-muted">
                          {definition.category}
                        </span>
                        {definition.requiredEsiScopes.length > 0 && activeCharacter && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] ${missingScopes.length === 0 ? 'text-eve-success' : 'text-eve-warning'
                              }`}
                          >
                            {missingScopes.length === 0 ? (
                              <ShieldCheck className="h-3 w-3" />
                            ) : (
                              <ShieldAlert className="h-3 w-3" />
                            )}
                            {missingScopes.length === 0
                              ? 'Authorized'
                              : `${missingScopes.length} missing`}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-eve-muted">
                        {definition.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void toggleModule(definition.id, !config.enabled)}
                      className={`ml-1 min-w-[74px] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${config.enabled
                          ? 'border-eve-accent/60 bg-eve-accent-muted text-eve-accent'
                          : 'border-eve-border bg-eve-panel text-eve-muted hover:text-eve-text'
                        }`}
                    >
                      {config.enabled ? 'Visible' : 'Hidden'}
                    </button>
                  </div>
                </div>
              );
            })
            : orderedUtilities.map((item) => {
              const Icon = item.icon;
              const hidden = item.canHide && hiddenSet.has(item.id);
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(item.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverId !== item.id) setDragOverId(item.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropUtility(item.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  className={`flex items-center justify-between border px-3 py-2 transition-colors ${
                    dragOverId === item.id && dragId !== item.id
                      ? 'border-eve-accent bg-eve-accent-muted/30'
                      : hidden
                        ? 'border-eve-border/50 bg-eve-bg/30 opacity-60'
                        : 'border-eve-border bg-eve-bg/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="cursor-grab text-eve-muted hover:text-eve-accent active:cursor-grabbing"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <Icon className="h-4 w-4 text-eve-accent" />
                    <span className="text-xs font-medium text-eve-text">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!item.canHide}
                      onClick={() => toggleUtilityVisibility(item.id)}
                      className="inline-flex min-w-[74px] items-center justify-center gap-1 border border-eve-border bg-eve-panel px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent disabled:opacity-40"
                    >
                      {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {hidden ? 'Hidden' : 'Visible'}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
