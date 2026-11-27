import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Skull,
  Swords,
  User,
  X
} from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type {
  HistoricalKillEntityKind,
  HistoricalKillboardResultDto
} from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { useTheme } from '@/core/contexts/ThemeContext';
import { formatDate, formatIsk, getSecurityColorClass } from '@/core/utils/format';

const KIND_OPTIONS: Array<{ value: HistoricalKillEntityKind; label: string }> = [
  { value: 'character', label: 'Character' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'alliance', label: 'Alliance' },
  { value: 'ship_type', label: 'Ship Type' },
  { value: 'solar_system', label: 'Solar System' }
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

interface KillboardLookupProps extends ModuleProps {
  initialTarget?: {
    kind: HistoricalKillEntityKind;
    id: number;
    name?: string;
    nonce: number;
  } | null;
}

export function KillboardLookupModule({ activeCharacterId, initialTarget }: KillboardLookupProps) {
  const { settings } = useTheme();
  const [kind, setKind] = useState<HistoricalKillEntityKind>('character');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Array<{ id: number; name: string }>>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addedToTracker, setAddedToTracker] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const [selectedEntity, setSelectedEntity] = useState<{
    kind: HistoricalKillEntityKind;
    id: number;
    name: string;
  } | null>(null);
  const [mode, setMode] = useState<'all' | 'kills' | 'losses'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HistoricalKillboardResultDto | null>(null);

  const loadEntity = useCallback(
    async (
      entityKind: HistoricalKillEntityKind,
      entityId: number,
      fetchMode: 'all' | 'kills' | 'losses',
      targetPage = 1,
      targetPageSize = pageSize
    ) => {
      setLoading(true);
      setError(null);
      try {
        const data = await window.eveLens.killboard.lookupEntity(
          entityKind,
          entityId,
          fetchMode,
          targetPage,
          targetPageSize
        );
        setResult(data);
        setPage(data.page);
        setSelectedEntity({ kind: entityKind, id: entityId, name: data.entityName });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load zKillboard history.');
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  const runSearch = useCallback(
    async (q: string, targetKind: HistoricalKillEntityKind) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setCandidates([]);
        return;
      }
      setSearching(true);
      try {
        if (targetKind === 'ship_type') {
          const hits = await window.eveLens.sde.searchTypes(trimmed, 12);
          setCandidates(hits.map((h) => ({ id: h.typeId, name: h.typeName })));
          setDropdownOpen(hits.length > 0);
        } else if (targetKind === 'solar_system') {
          const hits = await window.eveLens.sde.searchSystems(trimmed, 12);
          setCandidates(hits.map((h) => ({ id: h.solarSystemId, name: h.solarSystemName })));
          setDropdownOpen(hits.length > 0);
        } else {
          const hits = await window.eveLens.killboard.resolveEntityNames(targetKind, trimmed);
          const sliced = hits.slice(0, 12);
          setCandidates(sliced);
          setDropdownOpen(sliced.length > 0);
        }
      } catch {
        // ignore transient autocomplete error
      } finally {
        setSearching(false);
      }
    },
    []
  );

  // Lazy debounced search as user types
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(() => {
      void runSearch(trimmed, kind);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, kind, runSearch]);

  useEffect(() => {
    if (!initialTarget) return;
    setKind(initialTarget.kind);
    if (initialTarget.name) setQuery(initialTarget.name);
    setDropdownOpen(false);
    setAddedToTracker(false);
    void loadEntity(initialTarget.kind, initialTarget.id, mode, 1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget?.nonce]);

  const handleAddToTracker = async () => {
    if (!result) return;
    await window.eveLens.killboard.saveGroup({
      name: `Watch: ${result.entityName}`,
      description: `Added from Killboard Lookup (${result.entityKind})`,
      originSystemId: null,
      maxJumps: null,
      roleFilter: 'both',
      secFilter: 'all',
      activityFilter: 'all',
      entityMatchMode: 'any',
      minIsk: 0,
      audioAlert: false,
      desktopNotify: false,
      enabled: true,
      rules: [
        {
          matchKind: result.entityKind,
          targetId: result.entityId,
          targetName: result.entityName
        }
      ]
    });
    setAddedToTracker(true);
    setTimeout(() => setAddedToTracker(false), 3000);
  };

  const handleModeChange = (nextMode: 'all' | 'kills' | 'losses') => {
    setMode(nextMode);
    if (selectedEntity) {
      void loadEntity(selectedEntity.kind, selectedEntity.id, nextMode, 1, pageSize);
    }
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    if (selectedEntity) {
      void loadEntity(selectedEntity.kind, selectedEntity.id, mode, 1, nextSize);
    }
  };

  const zkbTypeSegment = (k: HistoricalKillEntityKind) => {
    if (k === 'ship_type') return 'ship';
    if (k === 'solar_system') return 'system';
    return k;
  };

  const renderEntityIcon = (k: HistoricalKillEntityKind, id: number, size = 40) => {
    if (k === 'character') return <EveIcon path={`characters/${id}/portrait?size=64`} size={size} />;
    if (k === 'corporation') return <EveIcon path={`corporations/${id}/logo?size=64`} size={size} />;
    if (k === 'alliance') return <EveIcon path={`alliances/${id}/logo?size=64`} size={size} />;
    if (k === 'ship_type') return <EveIcon path={`types/${id}/icon?size=64`} size={size} />;
    return <History className="w-8 h-8 text-sky-400" />;
  };

  return (
    <div className="flex flex-col h-full gap-3 p-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-sky-400" />
            Historical Killboard Lookup
          </h1>
          <p className="text-xs text-slate-400">
            Lazy-search any pilot, corporation, alliance, ship hull, or solar system to inspect zKillboard history.
          </p>
        </div>

        {activeCharacterId && (
          <button
            type="button"
            onClick={() => {
              setKind('character');
              void loadEntity('character', activeCharacterId, mode, 1, pageSize);
            }}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5 text-sky-400" />
            Load Active Pilot
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as HistoricalKillEntityKind);
            setCandidates([]);
          }}
          className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div ref={searchBoxRef} className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onFocus={() => {
              if (candidates.length > 0) setDropdownOpen(true);
            }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (candidates.length > 0) {
                  setDropdownOpen(false);
                  void loadEntity(kind, candidates[0].id, mode, 1, pageSize);
                } else {
                  void runSearch(query, kind);
                }
              } else if (e.key === 'Escape') {
                setDropdownOpen(false);
              }
            }}
            placeholder={`Type ${KIND_OPTIONS.find((o) => o.value === kind)?.label.toLowerCase()} name (e.g. sam)...`}
            className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCandidates([]);
                setDropdownOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {dropdownOpen && candidates.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded border border-slate-700 bg-slate-950 shadow-2xl">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setQuery(c.name);
                    void loadEntity(kind, c.id, mode, 1, pageSize);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-800 ${
                    selectedEntity?.id === c.id && selectedEntity?.kind === kind
                      ? 'bg-sky-500/15 text-sky-200'
                      : 'text-slate-200'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="ml-2 text-[10px] font-mono text-slate-500">#{c.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void runSearch(query, kind)}
          disabled={searching || query.trim().length < 2}
          className="px-3.5 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white flex items-center gap-1.5"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Search
        </button>

        <div className="flex items-center rounded border border-slate-700 overflow-hidden ml-auto">
          {(['all', 'kills', 'losses'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={`px-2.5 py-1 text-xs capitalize transition-colors ${
                mode === m ? 'bg-sky-600 text-white font-medium' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded bg-rose-950/60 border border-rose-800/70 text-xs text-rose-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          Fetching zKillboard stats &amp; hydrating killmails...
        </div>
      )}

      {!loading && result && (
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Entity Header & Stats */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 min-w-[200px]">
              {renderEntityIcon(result.entityKind, result.entityId, 44)}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{result.entityName}</span>
                  <button
                    type="button"
                    onClick={() =>
                      void window.eveLens.app.openExternal(
                        `https://zkillboard.com/${zkbTypeSegment(result.entityKind)}/${result.entityId}/`
                      )
                    }
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300 hover:border-sky-500 hover:text-sky-300"
                    title="Open on zKillboard in default browser"
                  >
                    <ExternalLink className="w-3 h-3" />
                    zKillboard
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddToTracker()}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
                      addedToTracker
                        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                        : 'border-sky-500/60 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
                    }`}
                    title="Add this entity as a Tracker Group in Live Killboard"
                  >
                    {addedToTracker ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {addedToTracker ? 'Added to Tracker' : 'Add to Tracker'}
                  </button>
                </div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  {KIND_OPTIONS.find((o) => o.value === result.entityKind)?.label} #{result.entityId}
                </span>
              </div>
            </div>

            {result.stats && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 flex-1">
                <div className="bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 uppercase">Destroyed</div>
                  <div className="text-xs font-semibold text-emerald-400">
                    {result.stats.shipsDestroyed.toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 uppercase">Lost</div>
                  <div className="text-xs font-semibold text-rose-400">
                    {result.stats.shipsLost.toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 uppercase">ISK Killed</div>
                  <div className="text-xs font-semibold text-emerald-300">
                    {formatIsk(result.stats.iskDestroyed)}
                  </div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 uppercase">ISK Lost</div>
                  <div className="text-xs font-semibold text-rose-300">
                    {formatIsk(result.stats.iskLost)}
                  </div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 uppercase">Danger</div>
                  <div className="text-xs font-semibold text-amber-300">
                    {result.stats.dangerRatio !== null ? `${result.stats.dangerRatio}%` : '—'}
                  </div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 uppercase">Solo Kills</div>
                  <div className="text-xs font-semibold text-sky-300">
                    {result.stats.soloKills.toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Killmails Table */}
          <div className="flex-1 overflow-auto bg-slate-900/50 border border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-950/95 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">Victim Ship</th>
                  <th className="py-2 px-3">Victim</th>
                  <th className="py-2 px-3">Final Blow</th>
                  <th className="py-2 px-3">System</th>
                  <th className="py-2 px-3 text-right">Value</th>
                  <th className="py-2 px-3 text-right">zKB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {result.kills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No killmails returned on this page.
                    </td>
                  </tr>
                ) : (
                  result.kills.map((k) => {
                    const isLoss =
                      (result.entityKind === 'character' && k.victimCharacterId === result.entityId) ||
                      (result.entityKind === 'corporation' && k.victimCorporationId === result.entityId) ||
                      (result.entityKind === 'alliance' && k.victimAllianceId === result.entityId);
                    return (
                      <tr
                        key={k.killmailId}
                        className={
                          isLoss
                            ? 'bg-rose-950/35 hover:bg-rose-950/55 border-l-2 border-l-rose-500/80'
                            : 'bg-emerald-950/25 hover:bg-emerald-950/45 border-l-2 border-l-emerald-500/80'
                        }
                      >
                        <td className="py-2 px-3 text-slate-300 whitespace-nowrap font-mono text-[11px]">
                          {formatDate(k.killmailTime, settings?.dateFormat, true)}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <EveIcon path={`types/${k.victimShipTypeId}/icon?size=64`} size={24} alt={k.victimShipName} />
                            <div>
                              <div className="text-slate-200 font-medium flex items-center gap-1.5">
                                {isLoss ? (
                                  <Skull className="w-3 h-3 text-rose-400 shrink-0" />
                                ) : (
                                  <Swords className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                                {k.victimShipName}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {k.isSolo && (
                                  <span className="px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 text-[9px]">
                                    SOLO
                                  </span>
                                )}
                                {k.isNpc && (
                                  <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px]">
                                    NPC
                                  </span>
                                )}
                                {k.isAwox && (
                                  <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px]">
                                    AWOX
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-slate-200">
                            {k.victimCharacterName ?? k.victimCorporationName ?? 'Unknown'}
                          </div>
                          {k.victimCorporationName && (
                            <div className="text-[10px] text-slate-400">{k.victimCorporationName}</div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-slate-200">{k.finalBlowName ?? 'Unknown'}</div>
                          <div className="text-[10px] text-slate-400">
                            {k.finalBlowShipName ?? 'Unknown Ship'} ({k.attackerCount} inv)
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="text-slate-200">{k.solarSystemName}</span>{' '}
                          <span className={`text-[11px] font-mono ${getSecurityColorClass(k.security)}`}>
                            {k.security.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-amber-300 whitespace-nowrap">
                          {formatIsk(k.totalValue)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              void window.eveLens.app.openExternal(`https://zkillboard.com/kill/${k.killmailId}/`)
                            }
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-sky-400"
                            title="Open killmail on zKillboard"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <span>Results per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-slate-500">
                Showing {result.kills.length} items on page {page}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() =>
                  selectedEntity && void loadEntity(selectedEntity.kind, selectedEntity.id, mode, page - 1, pageSize)
                }
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="font-mono text-slate-300 px-1">Page {page}</span>
              <button
                type="button"
                disabled={!result.hasMore || loading}
                onClick={() =>
                  selectedEntity && void loadEntity(selectedEntity.kind, selectedEntity.id, mode, page + 1, pageSize)
                }
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !result && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 border border-dashed border-slate-800 rounded-lg">
          <ShieldAlert className="w-8 h-8 text-slate-600" />
          <p className="text-xs">Start typing a character, corporation, alliance, ship, or solar system above.</p>
        </div>
      )}
    </div>
  );
}
