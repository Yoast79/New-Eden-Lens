import { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Copy, Loader2, Navigation, RefreshCw, Search, X } from 'lucide-react';
import type { SolarSystemRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type { TheraTurnurConnectionDto } from '@shared/types/modules-data';
import { SortableHeader, type SortDirection } from '@/core/components/SortableHeader';
import { useTheme } from '@/core/contexts/ThemeContext';
import { formatDate, getSecurityColorClass } from '@/core/utils/format';

const QUICK_SYSTEMS: Array<{ id: number; name: string }> = [
  { id: 30000142, name: 'Jita' },
  { id: 30002187, name: 'Amarr' },
  { id: 30002659, name: 'Dodixie' },
  { id: 30002510, name: 'Rens' },
  { id: 30002053, name: 'Hek' }
];

type SortKey =
  | 'sourceSystem'
  | 'whType'
  | 'maxShipSize'
  | 'inSystemName'
  | 'inRegionName'
  | 'jumpsFromOrigin'
  | 'jumpsFromJita'
  | 'createdAt'
  | 'remainingHours';

function formatAge(iso: string): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TheraTurnurModule({ activeCharacterId }: ModuleProps) {
  const { settings } = useTheme();
  const [connections, setConnections] = useState<TheraTurnurConnectionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<'all' | 'Thera' | 'Turnur'>('all');
  const [shipFilter, setShipFilter] = useState<string>('all');
  const [spaceFilter, setSpaceFilter] = useState<'all' | 'high' | 'low' | 'null' | 'wh'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [sortKey, setSortKey] = useState<SortKey>('jumpsFromOrigin');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const [originId, setOriginId] = useState<number>(30000142);
  const [originName, setOriginName] = useState<string>('Jita');
  const [originSearch, setOriginSearch] = useState('');
  const [originHits, setOriginHits] = useState<SolarSystemRow[]>([]);
  const [destFeedback, setDestFeedback] = useState<string | null>(null);

  const fetchConnections = useCallback(async (sysId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.eveLens.wh.fetchTheraTurnur(sysId);
      setConnections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch EVE-Scout connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConnections(originId);
  }, [fetchConnections, originId]);

  const handleOriginSearch = async (q: string) => {
    setOriginSearch(q);
    if (q.trim().length < 2) {
      setOriginHits([]);
      return;
    }
    const hits = await window.eveLens.sde.searchSystems(q.trim(), 8);
    setOriginHits(hits);
  };

  const handleSetDestination = async (systemId: number, systemName: string) => {
    if (!activeCharacterId) {
      setDestFeedback('Select an active pilot first to set autopilot destination.');
      return;
    }
    try {
      await window.eveLens.nav.setAutopilotWaypoint(activeCharacterId, systemId, true);
      setDestFeedback(`Autopilot destination set to ${systemName}`);
      setTimeout(() => setDestFeedback(null), 3500);
    } catch (err) {
      setDestFeedback(err instanceof Error ? err.message : 'Failed to set destination.');
    }
  };

  const handleSort = (key: string) => {
    const k = key as SortKey;
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir(k === 'createdAt' || k === 'remainingHours' ? 'desc' : 'asc');
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = connections.filter((c) => {
      if (sourceFilter !== 'all' && c.sourceSystem !== sourceFilter) return false;
      if (shipFilter !== 'all' && c.maxShipSize.toLowerCase() !== shipFilter) return false;
      if (spaceFilter === 'wh' && !c.inSystemClass.toLowerCase().startsWith('c')) return false;
      if (spaceFilter === 'high' && (c.security === null || c.security < 0.45)) return false;
      if (spaceFilter === 'low' && (c.security === null || c.security >= 0.45 || c.security <= 0)) return false;
      if (
        spaceFilter === 'null' &&
        (c.security === null || c.security > 0 || c.inSystemClass.toLowerCase().startsWith('c'))
      ) {
        return false;
      }
      if (q) {
        return (
          c.inSystemName.toLowerCase().includes(q) ||
          c.inRegionName.toLowerCase().includes(q) ||
          c.outSignature.toLowerCase().includes(q) ||
          c.inSignature.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const mul = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === 'sourceSystem') return a.sourceSystem.localeCompare(b.sourceSystem) * mul;
      if (sortKey === 'whType') return a.whType.localeCompare(b.whType) * mul;
      if (sortKey === 'maxShipSize') return a.maxShipSize.localeCompare(b.maxShipSize) * mul;
      if (sortKey === 'inSystemName') return a.inSystemName.localeCompare(b.inSystemName) * mul;
      if (sortKey === 'inRegionName') {
        return (a.inRegionName || a.inSystemClass).localeCompare(b.inRegionName || b.inSystemClass) * mul;
      }
      if (sortKey === 'jumpsFromOrigin') {
        return ((a.jumpsFromOrigin ?? 9999) - (b.jumpsFromOrigin ?? 9999)) * mul;
      }
      if (sortKey === 'jumpsFromJita') {
        return ((a.jumpsFromJita ?? 9999) - (b.jumpsFromJita ?? 9999)) * mul;
      }
      if (sortKey === 'createdAt') {
        return ((Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)) * mul;
      }
      return (a.remainingHours - b.remainingHours) * mul;
    });

    return list;
  }, [connections, sourceFilter, shipFilter, spaceFilter, searchQuery, sortKey, sortDir]);

  return (
    <div className="flex flex-col h-full gap-3 p-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Compass className="w-5 h-5 text-sky-400" />
            Thera / Turnur Connections
          </h1>
          <p className="text-xs text-slate-400">
            Live EVE-Scout wormhole connections for Thera &amp; Turnur with jump distances from {originName}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchConnections(originId)}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh EVE-Scout
        </button>
      </div>

      {/* Origin & Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
        <div className="relative">
          <input
            type="text"
            value={originSearch}
            onChange={(e) => void handleOriginSearch(e.target.value)}
            placeholder={`Origin: ${originName}`}
            className="w-44 bg-slate-950 border border-slate-700 rounded pl-2.5 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-400"
          />
          {originSearch && (
            <button
              type="button"
              onClick={() => {
                setOriginSearch('');
                setOriginHits([]);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {originHits.length > 0 && (
            <div className="absolute z-20 left-0 mt-1 w-56 bg-slate-950 border border-slate-700 rounded shadow-xl max-h-48 overflow-auto">
              {originHits.map((s) => (
                <button
                  key={s.solarSystemId}
                  type="button"
                  onClick={() => {
                    setOriginId(s.solarSystemId);
                    setOriginName(s.solarSystemName);
                    setOriginSearch('');
                    setOriginHits([]);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="text-slate-200">{s.solarSystemName}</span>
                  <span className={`font-mono ${getSecurityColorClass(s.security)}`}>
                    {s.security.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {QUICK_SYSTEMS.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                setOriginId(q.id);
                setOriginName(q.name);
              }}
              className={`px-2 py-1 rounded text-[11px] border ${
                originId === q.id
                  ? 'bg-sky-500/20 border-sky-500/60 text-sky-200'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {q.name}
            </button>
          ))}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as 'all' | 'Thera' | 'Turnur')}
          className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="all">Thera + Turnur</option>
          <option value="Thera">Thera Only</option>
          <option value="Turnur">Turnur Only</option>
        </select>

        <select
          value={shipFilter}
          onChange={(e) => setShipFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="all">Any Ship Size</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="xlarge">Extra Large</option>
        </select>

        <select
          value={spaceFilter}
          onChange={(e) => setSpaceFilter(e.target.value as 'all' | 'high' | 'low' | 'null' | 'wh')}
          className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="all">All Space</option>
          <option value="high">Highsec</option>
          <option value="low">Lowsec</option>
          <option value="null">Nullsec</option>
          <option value="wh">Wormhole</option>
        </select>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter system, region, sig..."
            className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {destFeedback && (
        <div className="px-3 py-1.5 rounded bg-sky-950/60 border border-sky-700/60 text-xs text-sky-200">
          {destFeedback}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded bg-rose-950/60 border border-rose-800/70 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-slate-900/50 border border-slate-800 rounded-lg">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-950/95 text-slate-400 uppercase text-[10px] border-b border-slate-800">
            <tr>
              <SortableHeader label="Hub" field="sourceSystem" activeField={sortKey} direction={sortDir} onSort={handleSort} />
              <th className="py-2 px-3">Out / In Sig</th>
              <SortableHeader label="WH Type" field="whType" activeField={sortKey} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Max Ship" field="maxShipSize" activeField={sortKey} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="System" field="inSystemName" activeField={sortKey} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Region / Class" field="inRegionName" activeField={sortKey} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={`Jumps (${originName})`} field="jumpsFromOrigin" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Jita" field="jumpsFromJita" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Posted" field="createdAt" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="TTL" field="remainingHours" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading && connections.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-10 text-center text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-sky-400" />
                  Loading EVE-Scout signatures...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500">
                  No matching wormhole connections found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        c.sourceSystem === 'Turnur'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {c.sourceSystem}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">
                    {c.outSignature} ↔ {c.inSignature}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-300">{c.whType}</td>
                  <td className="py-2 px-3 capitalize text-slate-300">{c.maxShipSize}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="text-slate-100 font-medium">{c.inSystemName}</span>{' '}
                    {c.security !== null && (
                      <span className={`font-mono text-[11px] ${getSecurityColorClass(c.security)}`}>
                        {c.security.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-400">
                    {c.inRegionName || c.inSystemClass.toUpperCase()}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-sky-300">
                    {c.jumpsFromOrigin !== null ? c.jumpsFromOrigin : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">
                    {c.jumpsFromJita !== null ? c.jumpsFromJita : '—'}
                  </td>
                  <td
                    className="py-2 px-3 text-right text-slate-400 whitespace-nowrap"
                    title={c.createdAt ? formatDate(c.createdAt, settings?.dateFormat, true) : undefined}
                  >
                    {formatAge(c.createdAt)}
                  </td>
                  <td
                    className="py-2 px-3 text-right font-mono text-slate-300 whitespace-nowrap"
                    title="Time To Live (estimated remaining hours before wormhole collapses)"
                  >
                    {c.remainingHours.toFixed(1)}h
                  </td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void window.eveLens.clipboard.writeText(`${c.outSignature} ${c.inSystemName}`)}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                        title="Copy signature & system"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSetDestination(c.inSystemId, c.inSystemName)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white text-[11px] inline-flex items-center gap-1"
                        title="Set Autopilot Destination"
                      >
                        <Navigation className="w-3 h-3" />
                        Dest
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
