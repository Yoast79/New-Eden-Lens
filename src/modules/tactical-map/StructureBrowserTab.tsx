import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Navigation, RefreshCw, Search, X } from 'lucide-react';
import type { SolarSystemRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type { StationServiceInfoDto } from '@shared/types/modules-data';
import { getSecurityColorClass } from '@/core/utils/format';

const SERVICE_FILTERS: Array<{ id: string; label: string; match: string[] }> = [
  { id: 'all', label: 'All Services', match: [] },
  { id: 'cloning', label: 'Clone Bay', match: ['cloning', 'jump-clone-facility', 'clone bay'] },
  { id: 'reprocessing', label: 'Reprocessing', match: ['reprocessing-plant', 'refinery', 'reprocessing'] },
  { id: 'research', label: 'Research Lab', match: ['labratory', 'research'] },
  { id: 'factory', label: 'Factory / Industry', match: ['factory', 'manufacturing'] },
  { id: 'lp', label: 'LP Store', match: ['loyalty-point-store'] },
  { id: 'market', label: 'Market', match: ['market'] },
  { id: 'repair', label: 'Repair', match: ['repair-facilities', 'repair'] },
  { id: 'offices', label: 'Offices', match: ['office-rental'] }
];

const SERVICE_BADGE_LABELS: Record<string, string> = {
  cloning: 'Clone Bay',
  'jump-clone-facility': 'Jump Clone',
  'reprocessing-plant': 'Reprocessing',
  refinery: 'Refinery',
  labratory: 'Research',
  factory: 'Factory',
  'loyalty-point-store': 'LP Store',
  market: 'Market',
  'repair-facilities': 'Repair',
  'office-rental': 'Offices',
  fitting: 'Fitting',
  insurance: 'Insurance'
};

export function StructureBrowserTab({ activeCharacterId }: ModuleProps) {
  const [regions, setRegions] = useState<Array<{ regionId: number; regionName: string }>>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<number>(10000043); // Domain
  const [sysQuery, setSysQuery] = useState('');
  const [sysHits, setSysHits] = useState<SolarSystemRow[]>([]);
  const [stations, setStations] = useState<StationServiceInfoDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [serviceFilter, setServiceFilter] = useState('all');
  const [textFilter, setTextFilter] = useState('');
  const [destMsg, setDestMsg] = useState<string | null>(null);

  useEffect(() => {
    void window.eveLens.nav.listRegions().then(setRegions);
  }, []);

  const loadRegion = useCallback(
    async (regionId: number) => {
      setLoading(true);
      try {
        const data = await window.eveLens.nav.scanRegionStations(regionId, activeCharacterId);
        setStations(data);
      } finally {
        setLoading(false);
      }
    },
    [activeCharacterId]
  );

  const loadSystem = async (sys: SolarSystemRow) => {
    setSysQuery(sys.solarSystemName);
    setSysHits([]);
    setLoading(true);
    try {
      const data = await window.eveLens.nav.getSystemStations(sys.solarSystemId, activeCharacterId);
      setStations(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRegion(selectedRegionId);
  }, [selectedRegionId, loadRegion]);

  const handleSysSearch = async (q: string) => {
    setSysQuery(q);
    if (q.trim().length < 2) {
      setSysHits([]);
      return;
    }
    const hits = await window.eveLens.sde.searchSystems(q.trim(), 10);
    setSysHits(hits);
  };

  const handleSetDest = async (systemId: number, name: string) => {
    if (!activeCharacterId) {
      setDestMsg('Select an active pilot first to set autopilot destination.');
      return;
    }
    await window.eveLens.nav.setAutopilotWaypoint(activeCharacterId, systemId, true);
    setDestMsg(`Autopilot destination set to ${name}`);
    setTimeout(() => setDestMsg(null), 3000);
  };

  const filtered = useMemo(() => {
    const svcObj = SERVICE_FILTERS.find((f) => f.id === serviceFilter);
    const q = textFilter.trim().toLowerCase();
    return stations.filter((st) => {
      const svcs = Array.isArray(st.services) ? st.services : [];
      if (svcObj && svcObj.match.length > 0) {
        const lowerSvcs = svcs.map((s) => s.toLowerCase());
        const hasMatch = svcObj.match.some((m) => lowerSvcs.some((ls) => ls.includes(m)));
        if (!hasMatch) return false;
      }
      if (q) {
        return (
          st.name.toLowerCase().includes(q) ||
          st.solarSystemName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [stations, serviceFilter, textFilter]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <Building2 className="h-5 w-5 text-sky-400" />
            Station &amp; Structure Service Browser
          </h1>
          <p className="text-xs text-slate-400">
            Find NPC stations and corporation Upwell structures with Clone Bays, Reprocessing Plants, Research Labs, Factories, and LP Stores.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRegion(selectedRegionId)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Scan Region Stations
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
        <select
          value={selectedRegionId}
          onChange={(e) => setSelectedRegionId(Number(e.target.value))}
          className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
        >
          {regions.map((r) => (
            <option key={r.regionId} value={r.regionId}>
              {r.regionName}
            </option>
          ))}
        </select>

        <div className="relative w-48">
          <input
            type="text"
            value={sysQuery}
            onChange={(e) => void handleSysSearch(e.target.value)}
            placeholder="Lookup exact system..."
            className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 pl-2.5 pr-7 text-xs text-slate-100 placeholder-slate-500"
          />
          {sysQuery && (
            <button
              type="button"
              onClick={() => {
                setSysQuery('');
                setSysHits([]);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {sysHits.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded border border-slate-700 bg-slate-950 shadow-xl">
              {sysHits.map((s) => (
                <button
                  key={s.solarSystemId}
                  type="button"
                  onClick={() => void loadSystem(s)}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-slate-800"
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

        <div className="flex flex-wrap items-center gap-1">
          {SERVICE_FILTERS.map((sf) => (
            <button
              key={sf.id}
              type="button"
              onClick={() => setServiceFilter(sf.id)}
              className={`rounded border px-2 py-1 text-[11px] ${
                serviceFilter === sf.id
                  ? 'border-sky-500/60 bg-sky-500/20 font-medium text-sky-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              {sf.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Filter station or system..."
            className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-7 text-xs text-slate-100 placeholder-slate-500"
          />
          {textFilter && (
            <button
              type="button"
              onClick={() => setTextFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {destMsg && (
        <div className="rounded border border-sky-700/60 bg-sky-950/60 px-3 py-1.5 text-xs text-sky-200">
          {destMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-900/50">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 border-b border-slate-800 bg-slate-950/95 text-[10px] uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Station / Structure</th>
              <th className="px-3 py-2">System</th>
              <th className="px-3 py-2">Services</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading && stations.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-sky-400" />
                  Scanning ESI station &amp; structure services...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  No stations/structures match this service filter. Click Scan Region Stations or search a specific system.
                </td>
              </tr>
            ) : (
              filtered.map((st) => (
                <tr key={`${st.kind}-${st.id}`} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-100">{st.name}</div>
                    <div className="text-[10px] uppercase text-slate-400">
                      {st.kind === 'structure' ? st.typeName ?? 'Upwell Structure' : 'NPC Station'}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-slate-200">{st.solarSystemName}</span>{' '}
                    <span className={`font-mono text-[11px] ${getSecurityColorClass(st.security)}`}>
                      {st.security.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(st.services) ? st.services : [])
                        .filter((s) => SERVICE_BADGE_LABELS[s] || st.kind === 'structure')
                        .map((s) => (
                          <span
                            key={s}
                            className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-300"
                          >
                            {SERVICE_BADGE_LABELS[s] ?? s}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void handleSetDest(st.solarSystemId, st.solarSystemName)}
                      className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-sky-600 hover:text-white"
                    >
                      <Navigation className="h-3 w-3" />
                      Set Dest
                    </button>
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

