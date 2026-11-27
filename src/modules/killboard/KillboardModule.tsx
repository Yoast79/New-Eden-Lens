import { useCallback, useEffect, useState } from 'react';
import {
  Crosshair,
  ExternalLink,
  History,
  MapPin,
  Pencil,
  PictureInPicture2,
  Plus,
  Search,
  Trash2,
  User,
  X
} from 'lucide-react';
import type { InvTypeRow, SolarSystemRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type {
  HistoricalKillEntityKind,
  KillClassification,
  KillEntityKind,
  KillTrackerGroupDto,
  KillTrackerRuleDto,
  KillmailRow
} from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { ConfirmModal } from '@/core/components/ConfirmModal';
import { formatIsk, getSecurityColorClass } from '@/core/utils/format';

const CLASS_BADGE_STYLES: Record<KillClassification, string> = {
  GANK: 'border-red-500/60 bg-red-500/15 text-red-300',
  'PVE LOSS': 'border-amber-500/60 bg-amber-500/15 text-amber-300',
  SOLO: 'border-sky-500/60 bg-sky-500/15 text-sky-300',
  'SMALL GANG': 'border-purple-500/60 bg-purple-500/15 text-purple-300',
  'FLEET/WAR': 'border-rose-500/60 bg-rose-500/15 text-rose-300'
};

const ENTITY_KIND_LABELS: Record<KillEntityKind, string> = {
  ship_type: 'Ship Type',
  structure: 'Structure / MTU',
  character: 'Player',
  corporation: 'Corporation',
  alliance: 'Alliance',
  special_npc: 'Special NPC / Officer',
  solar_system: 'System',
  region: 'Region'
};

const OFFICER_PRESETS = [
  'Estamel Tharchon',
  'Cormack Vaaja',
  'Tobias Kruzhor',
  'Gotan Krebas',
  'Draclira Merlonne',
  'Tairei Namazoth',
  'Chelm Soran',
  'Brynn Jerdola'
];

interface KillboardModuleProps extends ModuleProps {
  onJumpToLookup?: (target: { kind: HistoricalKillEntityKind; id: number; name?: string }) => void;
}

export function KillboardModule({ onJumpToLookup }: KillboardModuleProps) {
  const [search, setSearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<number | null>(null);
  const [kills, setKills] = useState<KillmailRow[]>([]);
  const [groups, setGroups] = useState<KillTrackerGroupDto[]>([]);
  const [allRegions, setAllRegions] = useState<Array<{ regionId: number; regionName: string }>>([]);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<number | null>(null);

  // Setup Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | undefined>(undefined);
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gOriginQuery, setGOriginQuery] = useState('');
  const [gOriginHits, setGOriginHits] = useState<SolarSystemRow[]>([]);
  const [gOriginId, setGOriginId] = useState<number | null>(null);
  const [gOriginName, setGOriginName] = useState<string | null>(null);
  const [gMaxJumps, setGMaxJumps] = useState('5');
  const [gRole, setGRole] = useState<KillTrackerGroupDto['roleFilter']>('both');
  const [gSec, setGSec] = useState<KillTrackerGroupDto['secFilter']>('all');
  const [gActivity, setGActivity] = useState<KillTrackerGroupDto['activityFilter']>('all');
  const [gEntityMatchMode, setGEntityMatchMode] = useState<'any' | 'all'>('any');
  const [gMinIskM, setGMinIskM] = useState('');
  const [gNotify, setGNotify] = useState(true);
  const [gRules, setGRules] = useState<KillTrackerRuleDto[]>([]);

  // Location picker inside Setup Modal
  const [locKind, setLocKind] = useState<'solar_system' | 'region'>('solar_system');
  const [locQuery, setLocQuery] = useState('');
  const [locSysHits, setLocSysHits] = useState<SolarSystemRow[]>([]);
  const [locPasteText, setLocPasteText] = useState('');

  // Entity picker inside Setup Modal
  const [ruleKind, setRuleKind] = useState<KillEntityKind>('ship_type');
  const [ruleQuery, setRuleQuery] = useState('');
  const [sdeRuleHits, setSdeRuleHits] = useState<InvTypeRow[]>([]);
  const [esiRuleHits, setEsiRuleHits] = useState<Array<{ id: number; name: string }>>([]);
  const [resolvingEsi, setResolvingEsi] = useState(false);

  const refresh = useCallback(async () => {
    const [recent, groupList] = await Promise.all([
      window.eveLens.killboard.getRecent(100, search, selectedGroupFilter),
      window.eveLens.killboard.listGroups()
    ]);
    setKills(recent);
    setGroups(groupList);
  }, [search, selectedGroupFilter]);

  useEffect(() => {
    void refresh();
    void window.eveLens.nav.listRegions().then(setAllRegions);
    const unsubKill = window.eveLens.killboard.onNewKill((kill) => {
      if (
        selectedGroupFilter === null ||
        kill.matchedGroupIds?.includes(selectedGroupFilter)
      ) {
        setKills((prev) => [kill, ...prev].slice(0, 120));
      }
    });
    const unsubPop = window.eveLens.killboard.onPopoutGroupChanged(() => {
      void window.eveLens.killboard.listGroups().then(setGroups);
    });
    return () => {
      unsubKill();
      unsubPop();
    };
  }, [refresh, selectedGroupFilter]);

  const openAddModal = () => {
    setEditingGroupId(undefined);
    setGName('');
    setGDesc('');
    setGOriginQuery('');
    setGOriginHits([]);
    setGOriginId(null);
    setGOriginName(null);
    setGMaxJumps('5');
    setGRole('both');
    setGSec('all');
    setGActivity('all');
    setGEntityMatchMode('any');
    setGMinIskM('');
    setGNotify(true);
    setGRules([]);
    setLocQuery('');
    setLocSysHits([]);
    setLocPasteText('');
    setRuleQuery('');
    setSdeRuleHits([]);
    setEsiRuleHits([]);
    setModalOpen(true);
  };

  const openEditModal = (g: KillTrackerGroupDto) => {
    setEditingGroupId(g.id);
    setGName(g.name);
    setGDesc(g.description);
    setGOriginQuery(g.originSystemName ?? '');
    setGOriginHits([]);
    setGOriginId(g.originSystemId);
    setGOriginName(g.originSystemName);
    setGMaxJumps(g.maxJumps !== null ? String(g.maxJumps) : '5');
    setGRole(g.roleFilter);
    setGSec(g.secFilter);
    setGActivity(g.activityFilter);
    setGEntityMatchMode(g.entityMatchMode ?? 'any');
    setGMinIskM(g.minIsk > 0 ? String(Math.round(g.minIsk / 1_000_000)) : '');
    setGNotify(g.desktopNotify);
    setGRules(g.rules);
    setLocQuery('');
    setLocSysHits([]);
    setLocPasteText('');
    setRuleQuery('');
    setSdeRuleHits([]);
    setEsiRuleHits([]);
    setModalOpen(true);
  };

  const addRule = (rule: KillTrackerRuleDto) => {
    if (gRules.some((r) => r.matchKind === rule.matchKind && r.targetId === rule.targetId)) return;
    setGRules((prev) => [...prev, rule]);
  };

  const handlePasteSystems = async () => {
    const names = locPasteText
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of names) {
      const hits = await window.eveLens.sde.searchSystems(name, 5);
      const exact = hits.find((h) => h.solarSystemName.toLowerCase() === name.toLowerCase()) ?? hits[0];
      if (exact) {
        addRule({
          matchKind: 'solar_system',
          targetId: exact.solarSystemId,
          targetName: exact.solarSystemName
        });
      }
    }
    setLocPasteText('');
  };

  const handleRuleSearchChange = async (q: string) => {
    setRuleQuery(q);
    setEsiRuleHits([]);
    if (q.trim().length < 2) {
      setSdeRuleHits([]);
      return;
    }
    if (ruleKind === 'ship_type' || ruleKind === 'structure' || ruleKind === 'special_npc') {
      const hits = await window.eveLens.sde.searchTypes(q, 35);
      const filtered = hits.filter((t) => {
        if (ruleKind === 'ship_type') return t.categoryId === 6;
        if (ruleKind === 'structure') {
          return (
            t.categoryId === 65 ||
            t.categoryId === 22 ||
            t.categoryId === 23 ||
            t.categoryId === 40 ||
            /mobile tractor|depot|citadel|azbel|athanor|tatara|raitaru|fortizar|keepstar|astrahus/i.test(
              t.typeName
            )
          );
        }
        return t.categoryId === 11;
      });
      setSdeRuleHits(filtered.slice(0, 12));
    } else {
      setSdeRuleHits([]);
    }
  };

  const handleResolveEsiEntity = async () => {
    if (ruleKind !== 'character' && ruleKind !== 'corporation' && ruleKind !== 'alliance') return;
    if (!ruleQuery.trim()) return;
    setResolvingEsi(true);
    try {
      const hits = await window.eveLens.killboard.resolveEntityNames(ruleKind, ruleQuery.trim());
      setEsiRuleHits(hits);
    } finally {
      setResolvingEsi(false);
    }
  };

  const handleSaveGroup = async () => {
    const parsedIskM = Number(gMinIskM.trim());
    const minIsk = gMinIskM.trim() && Number.isFinite(parsedIskM) && parsedIskM > 0 ? parsedIskM * 1_000_000 : 0;
    const updated = await window.eveLens.killboard.saveGroup({
      id: editingGroupId,
      name: gName.trim() || 'Tracked Group',
      description: gDesc.trim(),
      originSystemId: gOriginId,
      originSystemName: gOriginName,
      maxJumps: gOriginId !== null ? Math.max(0, Number(gMaxJumps) || 0) : null,
      roleFilter: gRole,
      secFilter: gSec,
      activityFilter: gActivity,
      entityMatchMode: gEntityMatchMode,
      minIsk,
      audioAlert: true,
      desktopNotify: gNotify,
      enabled: true,
      rules: gRules
    });
    setGroups(updated);
    setModalOpen(false);
  };

  const locationRules = gRules.filter((r) => r.matchKind === 'solar_system' || r.matchKind === 'region');
  const entityRules = gRules.filter((r) => r.matchKind !== 'solar_system' && r.matchKind !== 'region');
  const regionHits =
    locKind === 'region' && locQuery.trim().length >= 2
      ? allRegions
          .filter((r) => r.regionName.toLowerCase().includes(locQuery.trim().toLowerCase()))
          .slice(0, 8)
      : [];

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      {/* Top Bar */}
      <div className="photon-panel flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Crosshair className="h-4 w-4 text-eve-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Live Kill Tracker (Tracked Entities Only)
          </span>
          <span className="inline-flex items-center gap-1.5 border border-eve-success/60 bg-eve-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-eve-success">
            <span className="h-1.5 w-1.5 rounded-full bg-eve-success animate-pulse" />
            Always On
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedGroupFilter ?? ''}
            onChange={(e) => setSelectedGroupFilter(e.target.value ? Number(e.target.value) : null)}
            className="border border-eve-border bg-eve-bg px-2.5 py-1 text-xs text-eve-text"
          >
            <option value="">All Tracked Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-eve-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter system or ship..."
              className="border border-eve-border bg-eve-bg py-1 pl-8 pr-3 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25"
          >
            <Plus className="h-3.5 w-3.5" />
            Add New
          </button>
        </div>
      </div>

      {/* Main Split: Matched Kills + Tracker Groups */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Matched Killmail Feed */}
        <div className="photon-panel flex min-h-0 flex-col lg:col-span-8">
          <div className="photon-header flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            <span>Matched Killmails ({kills.length})</span>
            <span className="text-[10px] font-normal text-eve-muted">Click any kill to open on zKillboard</span>
          </div>
          <div className="flex-1 overflow-auto">
            {kills.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-center text-xs text-eve-muted">
                {groups.length === 0
                  ? 'Click "Add New" to create a Tracker Group (systems, regions, ships, structures/MTUs, pilots, corps, alliances, or officers).'
                  : 'Listening live for killmails matching your active Tracker Groups...'}
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                  <tr className="border-b border-eve-border">
                    <th className="px-3 py-2">Ship / Loss</th>
                    <th className="px-3 py-2">System</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Pilots</th>
                    <th className="px-3 py-2 text-right">Est. Value</th>
                    <th className="px-3 py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/50">
                  {kills.map((k) => {
                    const cls = k.classification ?? 'SMALL GANG';
                    return (
                      <tr
                        key={k.killmailId}
                        onClick={() =>
                          void window.eveLens.app.openExternal(`https://zkillboard.com/kill/${k.killmailId}/`)
                        }
                        className="cursor-pointer hover:bg-eve-elevated/60"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <EveIcon path={`types/${k.victimShipTypeId}/icon?size=64`} size={24} alt={k.victimShipName} />
                            <span className="font-medium text-eve-text">{k.victimShipName}</span>
                            {onJumpToLookup && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToLookup({
                                      kind: 'ship_type',
                                      id: k.victimShipTypeId,
                                      name: k.victimShipName
                                    });
                                  }}
                                  className="rounded p-0.5 text-eve-muted hover:bg-eve-panel hover:text-eve-accent"
                                  title={`Lookup ${k.victimShipName} in Killboard Lookup`}
                                >
                                  <History className="h-3 w-3" />
                                </button>
                                {k.victimCharacterId && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onJumpToLookup({
                                        kind: 'character',
                                        id: k.victimCharacterId!
                                      });
                                    }}
                                    className="rounded p-0.5 text-eve-muted hover:bg-eve-panel hover:text-eve-accent"
                                    title="Lookup victim pilot in Killboard Lookup"
                                  >
                                    <User className="h-3 w-3" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-eve-text">{k.solarSystemName}</span>
                            <span className={`num-mono text-[11px] ${getSecurityColorClass(k.security)}`}>
                              {k.security.toFixed(1)}
                            </span>
                            {onJumpToLookup && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onJumpToLookup({
                                    kind: 'solar_system',
                                    id: k.solarSystemId,
                                    name: k.solarSystemName
                                  });
                                }}
                                className="rounded p-0.5 text-eve-muted hover:bg-eve-panel hover:text-eve-accent"
                                title={`Lookup ${k.solarSystemName} in Killboard Lookup`}
                              >
                                <History className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`border px-1.5 py-0.2 text-[10px] font-semibold uppercase ${CLASS_BADGE_STYLES[cls]}`}>
                            {cls}
                          </span>
                        </td>
                        <td className="num-mono px-3 py-2 text-right text-eve-muted">
                          {k.attackerCount}
                        </td>
                        <td className="num-mono px-3 py-2 text-right font-semibold text-eve-accent">
                          {formatIsk(k.totalValue, true)}
                        </td>
                        <td className="num-mono px-3 py-2 text-right text-[11px] text-eve-muted">
                          <div className="inline-flex items-center gap-1.5">
                            <span>{new Date(k.killmailTime).toLocaleTimeString()}</span>
                            <ExternalLink className="h-3 w-3 text-eve-muted/70" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Tracker Groups */}
        <div className="photon-panel flex min-h-0 flex-col lg:col-span-4">
          <div className="photon-header flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            <span>Tracker Groups ({groups.length})</span>
            <button
              type="button"
              onClick={openAddModal}
              className="text-[11px] text-eve-accent hover:underline"
            >
              + Add New
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
            {groups.length === 0 ? (
              <div className="text-eve-muted">No tracker groups configured yet.</div>
            ) : (
              groups.map((g) => (
                <div
                  key={g.id}
                  className={`space-y-2 border p-2.5 ${
                    g.isPopoutActive
                      ? 'border-eve-accent/70 bg-eve-accent-muted/15'
                      : 'border-eve-border bg-eve-bg/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-eve-text">{g.name}</span>
                        {!g.enabled && (
                          <span className="border border-eve-border px-1 text-[9px] uppercase text-eve-muted">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-eve-muted">
                        {g.originSystemName ? `Within ${g.maxJumps ?? 0}j of ${g.originSystemName}` : 'All New Eden'}
                        {' · '}
                        {g.secFilter.toUpperCase()}
                        {' · '}
                        {g.activityFilter.replace('_', ' ').toUpperCase()}
                        {g.minIsk > 0 ? ` · ≥${formatIsk(g.minIsk, true)}` : ''}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(g)}
                        title="Edit Group"
                        className="p-1 text-eve-muted hover:text-eve-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteGroupId(g.id)}
                        title="Delete Group"
                        className="p-1 text-eve-muted hover:text-eve-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {g.rules.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {g.rules.map((r, idx) => (
                        <span
                          key={`${r.matchKind}-${r.targetId}-${idx}`}
                          className={`border px-1.5 py-0.5 text-[10px] ${
                            r.matchKind === 'solar_system' || r.matchKind === 'region'
                              ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                              : 'border-eve-border bg-eve-panel text-eve-text'
                          }`}
                        >
                          <span className="opacity-70">{ENTITY_KIND_LABELS[r.matchKind]}:</span>{' '}
                          {r.targetName}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-eve-border/60 pt-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-eve-muted">
                      <input
                        type="checkbox"
                        checked={g.enabled}
                        onChange={async (e) => {
                          setGroups(
                            await window.eveLens.killboard.saveGroup({
                              ...g,
                              enabled: e.target.checked
                            })
                          );
                        }}
                        className="accent-[var(--eve-accent)]"
                      />
                      Active
                    </label>

                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await window.eveLens.killboard.setPopoutGroup(
                          g.isPopoutActive ? null : g.id
                        );
                        setGroups(updated);
                      }}
                      className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        g.isPopoutActive
                          ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                          : 'border-eve-border-strong bg-eve-panel text-eve-text hover:border-eve-accent'
                      }`}
                    >
                      <PictureInPicture2 className="h-3 w-3" />
                      {g.isPopoutActive ? 'In Pop-Out' : 'Send to Pop-Out'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Tracker Group Setup Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel flex max-h-[92vh] w-full max-w-3xl flex-col shadow-2xl">
            <div className="photon-header flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider">
                {editingGroupId ? 'Edit Tracker Group' : 'New Kill Tracker Group'}
              </span>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-eve-muted hover:text-eve-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
              {/* 1. Basics & Value */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[10px] uppercase text-eve-muted">Group Name</span>
                  <input
                    type="text"
                    value={gName}
                    onChange={(e) => setGName(e.target.value)}
                    placeholder="e.g. Jita & Amarr High-Value Kills"
                    className="w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] uppercase text-eve-muted">Min Loss Value (M ISK)</span>
                  <input
                    type="number"
                    min={0}
                    value={gMinIskM}
                    onChange={(e) => setGMinIskM(e.target.value)}
                    placeholder="Leave blank for all"
                    className="num-mono w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
                  />
                </label>
              </div>

              {/* 2. Locations Scope */}
              <div className="space-y-2 border border-eve-border bg-eve-bg/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                    <MapPin className="h-3.5 w-3.5" />
                    Locations (Systems, Regions, or Jump Radius — Leave Empty for All New Eden)
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <select
                    value={locKind}
                    onChange={(e) => {
                      setLocKind(e.target.value as 'solar_system' | 'region');
                      setLocQuery('');
                      setLocSysHits([]);
                    }}
                    className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
                  >
                    <option value="solar_system">Solar System</option>
                    <option value="region">Region</option>
                  </select>

                  <div className="relative sm:col-span-2">
                    <input
                      type="text"
                      value={locQuery}
                      onChange={async (e) => {
                        const q = e.target.value;
                        setLocQuery(q);
                        if (locKind === 'solar_system' && q.length >= 2) {
                          setLocSysHits(await window.eveLens.sde.searchSystems(q, 8));
                        } else {
                          setLocSysHits([]);
                        }
                      }}
                      placeholder={
                        locKind === 'solar_system'
                          ? 'Add system (e.g. Jita, Amarr)...'
                          : 'Add region (e.g. The Forge, Domain)...'
                      }
                      className="w-full border border-eve-border bg-eve-panel px-2.5 py-1 text-xs text-eve-text"
                    />
                    {(locSysHits.length > 0 || regionHits.length > 0) && (
                      <div className="photon-panel absolute left-0 right-0 top-full z-30 max-h-40 overflow-y-auto shadow-xl">
                        {locSysHits.map((s) => (
                          <button
                            key={s.solarSystemId}
                            type="button"
                            onClick={() => {
                              addRule({
                                matchKind: 'solar_system',
                                targetId: s.solarSystemId,
                                targetName: s.solarSystemName
                              });
                              setLocQuery('');
                              setLocSysHits([]);
                            }}
                            className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                          >
                            {s.solarSystemName} ({s.security.toFixed(1)})
                          </button>
                        ))}
                        {regionHits.map((r) => (
                          <button
                            key={r.regionId}
                            type="button"
                            onClick={() => {
                              addRule({
                                matchKind: 'region',
                                targetId: r.regionId,
                                targetName: r.regionName
                              });
                              setLocQuery('');
                            }}
                            className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                          >
                            {r.regionName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <select
                    value={gSec}
                    onChange={(e) => setGSec(e.target.value as KillTrackerGroupDto['secFilter'])}
                    className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
                  >
                    <option value="all">All Security</option>
                    <option value="highsec">Highsec Only</option>
                    <option value="lowsec">Lowsec Only</option>
                    <option value="nullsec">Nullsec Only</option>
                    <option value="jspace">J-Space Only</option>
                  </select>
                </div>

                {/* Paste list of systems + Jump Radius */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <div className="flex gap-1.5 sm:col-span-6">
                    <input
                      type="text"
                      value={locPasteText}
                      onChange={(e) => setLocPasteText(e.target.value)}
                      placeholder="Paste system list (e.g. Jita, Amarr, Perimeter)..."
                      className="flex-1 border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePasteSystems()}
                      className="border border-eve-border-strong bg-eve-elevated px-2.5 py-1 text-[11px] text-eve-text hover:border-eve-accent"
                    >
                      Add List
                    </button>
                  </div>

                  <div className="relative sm:col-span-4">
                    <input
                      type="text"
                      value={gOriginQuery}
                      onChange={async (e) => {
                        const q = e.target.value;
                        setGOriginQuery(q);
                        if (!q.trim()) {
                          setGOriginId(null);
                          setGOriginName(null);
                        }
                        setGOriginHits(q.length >= 2 ? await window.eveLens.sde.searchSystems(q, 8) : []);
                      }}
                      placeholder="Or within jumps of [System]..."
                      className="w-full border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
                    />
                    {gOriginHits.length > 0 && (
                      <div className="photon-panel absolute left-0 right-0 top-full z-30 max-h-40 overflow-y-auto shadow-xl">
                        {gOriginHits.map((s) => (
                          <button
                            key={s.solarSystemId}
                            type="button"
                            onClick={() => {
                              setGOriginId(s.solarSystemId);
                              setGOriginName(s.solarSystemName);
                              setGOriginQuery(s.solarSystemName);
                              setGOriginHits([]);
                            }}
                            className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                          >
                            {s.solarSystemName} ({s.security.toFixed(1)})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="number"
                    min={0}
                    max={25}
                    disabled={gOriginId === null}
                    value={gMaxJumps}
                    onChange={(e) => setGMaxJumps(e.target.value)}
                    title="Within X jumps"
                    className="num-mono border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text disabled:opacity-40 sm:col-span-2"
                  />
                </div>

                {locationRules.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {locationRules.map((r, idx) => (
                      <span
                        key={`${r.matchKind}-${r.targetId}-${idx}`}
                        className="inline-flex items-center gap-1 border border-sky-500/50 bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-200"
                      >
                        <span className="text-[10px] opacity-80">{ENTITY_KIND_LABELS[r.matchKind]}:</span>
                        <span>{r.targetName}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setGRules((prev) =>
                              prev.filter(
                                (x) => !(x.matchKind === r.matchKind && x.targetId === r.targetId)
                              )
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Entities & Tactical Filters */}
              <div className="space-y-2 border border-eve-border bg-eve-bg/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-eve-accent">
                    Tracked Entities (Leave Empty to List All Kills in Selected Locations)
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={gRole}
                    onChange={(e) => setGRole(e.target.value as KillTrackerGroupDto['roleFilter'])}
                    className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
                  >
                    <option value="both">Kills &amp; Losses</option>
                    <option value="losses_only">Losses Only</option>
                    <option value="kills_only">Kills Only</option>
                  </select>
                  <select
                    value={gActivity}
                    onChange={(e) => setGActivity(e.target.value as KillTrackerGroupDto['activityFilter'])}
                    className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
                  >
                    <option value="all">All Activity</option>
                    <option value="ganks_only">Highsec Ganks</option>
                    <option value="pve_losses">PvE Losses Only</option>
                    <option value="pvp_only">PvP Only</option>
                    <option value="solo_only">Solo Kills Only</option>
                    <option value="capital_only">Capitals / &gt;2B ISK</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={ruleKind}
                    onChange={(e) => {
                      setRuleKind(e.target.value as KillEntityKind);
                      setRuleQuery('');
                      setSdeRuleHits([]);
                      setEsiRuleHits([]);
                    }}
                    className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
                  >
                    <option value="ship_type">Ship Type</option>
                    <option value="structure">Structure / MTU</option>
                    <option value="character">Player Name</option>
                    <option value="corporation">Corporation</option>
                    <option value="alliance">Alliance</option>
                    <option value="special_npc">Special NPC / Officer</option>
                  </select>

                  <div className="relative flex flex-1 gap-1.5">
                    <input
                      type="text"
                      value={ruleQuery}
                      onChange={(e) => void handleRuleSearchChange(e.target.value)}
                      placeholder={`Search ${ENTITY_KIND_LABELS[ruleKind]}...`}
                      className="flex-1 border border-eve-border bg-eve-panel px-2.5 py-1 text-xs text-eve-text"
                    />
                    {(ruleKind === 'character' || ruleKind === 'corporation' || ruleKind === 'alliance') && (
                      <button
                        type="button"
                        disabled={resolvingEsi}
                        onClick={() => void handleResolveEsiEntity()}
                        className="border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs text-eve-accent"
                      >
                        {resolvingEsi ? '...' : 'Lookup'}
                      </button>
                    )}

                    {(sdeRuleHits.length > 0 || esiRuleHits.length > 0) && (
                      <div className="photon-panel absolute left-0 right-0 top-full z-30 max-h-44 overflow-y-auto shadow-2xl">
                        {sdeRuleHits.map((t) => (
                          <button
                            key={t.typeId}
                            type="button"
                            onClick={() => {
                              addRule({
                                matchKind: ruleKind,
                                targetId: t.typeId,
                                targetName: t.typeName
                              });
                              setRuleQuery('');
                              setSdeRuleHits([]);
                            }}
                            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                          >
                            <EveIcon path={`types/${t.typeId}/icon?size=64`} size={18} alt={t.typeName} />
                            <span className="truncate">{t.typeName}</span>
                          </button>
                        ))}
                        {esiRuleHits.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => {
                              addRule({
                                matchKind: ruleKind,
                                targetId: e.id,
                                targetName: e.name
                              });
                              setRuleQuery('');
                              setEsiRuleHits([]);
                            }}
                            className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                          >
                            {e.name} <span className="num-mono text-[10px] text-eve-muted">#{e.id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {ruleKind === 'special_npc' && (
                  <div className="flex flex-wrap gap-1">
                    {OFFICER_PRESETS.map((off) => (
                      <button
                        key={off}
                        type="button"
                        onClick={() => void handleRuleSearchChange(off)}
                        className="border border-eve-border bg-eve-panel px-1.5 py-0.5 text-[10px] text-eve-muted hover:text-eve-accent"
                      >
                        + {off}
                      </button>
                    ))}
                  </div>
                )}

                {entityRules.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entityRules.map((r, idx) => (
                      <span
                        key={`${r.matchKind}-${r.targetId}-${idx}`}
                        className="inline-flex items-center gap-1 border border-eve-accent/50 bg-eve-accent-muted px-2 py-0.5 text-[11px] text-eve-accent"
                      >
                        <span className="text-[10px] opacity-80">{ENTITY_KIND_LABELS[r.matchKind]}:</span>
                        <span>{r.targetName}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setGRules((prev) =>
                              prev.filter(
                                (x) => !(x.matchKind === r.matchKind && x.targetId === r.targetId)
                              )
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-eve-text">
                <input
                  type="checkbox"
                  checked={gNotify}
                  onChange={(e) => setGNotify(e.target.checked)}
                  className="accent-[var(--eve-accent)]"
                />
                Show Windows Desktop Notification on match
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-eve-border px-4 py-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="border border-eve-border bg-eve-panel px-3 py-1 text-xs text-eve-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveGroup()}
                className="border border-eve-accent/60 bg-eve-accent-muted px-4 py-1 text-xs font-semibold text-eve-accent"
              >
                Save Tracker Group
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDeleteGroupId !== null}
        title="Delete Tracker Group"
        onCancel={() => setConfirmDeleteGroupId(null)}
        onConfirm={async () => {
          if (confirmDeleteGroupId !== null) {
            setGroups(await window.eveLens.killboard.deleteGroup(confirmDeleteGroupId));
            if (selectedGroupFilter === confirmDeleteGroupId) setSelectedGroupFilter(null);
          }
          setConfirmDeleteGroupId(null);
        }}
      />
    </div>
  );
}
