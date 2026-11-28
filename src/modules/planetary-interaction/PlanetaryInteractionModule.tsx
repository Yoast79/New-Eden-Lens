import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Calculator,
  Clock,
  Globe2,
  Navigation,
  RefreshCw,
  Search
} from 'lucide-react';
import { TRADE_HUBS } from '@shared/constants/eve';
import { useAccounts } from '@/core/contexts/AccountContext';
import type { ModuleProps } from '@shared/types/module';
import type {
  PlanetaryCommodityProfitDto,
  PlanetaryOverviewDto
} from '@shared/types/modules-data';
import { formatIsk } from '@/core/utils/format';

type PiTab = 'colonies' | 'profit' | 'guide';

function formatCountdown(targetMs: number | null, nowMs: number): string {
  if (!targetMs) return 'Idle';
  const diff = Math.floor((targetMs - nowMs) / 1000);
  if (diff <= 0) return 'EXPIRED';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function PlanetaryInteractionModule({ activeCharacterId }: ModuleProps) {
  const { characters } = useAccounts();
  const [activeTab, setActiveTab] = useState<PiTab>('colonies');
  const [charScope, setCharScope] = useState<number | null>(activeCharacterId);
  const [regionId, setRegionId] = useState<number>(TRADE_HUBS[0].regionId);
  const [pocoTaxPct, setPocoTaxPct] = useState<number>(10);
  const [overview, setOverview] = useState<PlanetaryOverviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [destMsg, setDestMsg] = useState<string | null>(null);

  // Profit calculator filters
  const [tierFilter, setTierFilter] = useState<'all' | 'P1' | 'P2' | 'P3' | 'P4'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommodity, setSelectedCommodity] = useState<PlanetaryCommodityProfitDto | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);

  const syncOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.eveLens.planetary.getOverview(charScope, regionId, pocoTaxPct);
      setOverview(res);
      if (res.commodities.length > 0 && !selectedCommodity) {
        setSelectedCommodity(res.commodities[0]);
      } else if (selectedCommodity) {
        const updated = res.commodities.find((c) => c.typeId === selectedCommodity.typeId);
        if (updated) setSelectedCommodity(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Planetary Interaction data');
    } finally {
      setLoading(false);
    }
  }, [charScope, regionId, pocoTaxPct]);

  useEffect(() => {
    void syncOverview();
  }, [syncOverview]);

  const handleSetDest = async (solarSystemId: number, label: string, ownerCharId: number) => {
    const targetCharId = activeCharacterId ?? ownerCharId;
    try {
      await window.eveLens.nav.setAutopilotWaypoint(targetCharId, solarSystemId, true, false);
      setDestMsg(`Autopilot set to ${label}`);
      setTimeout(() => setDestMsg(null), 3000);
    } catch (err) {
      setDestMsg(err instanceof Error ? err.message : 'Failed to set destination');
    }
  };

  const colonyStats = useMemo(() => {
    const cols = overview?.colonies ?? [];
    let expired = 0;
    let expiringSoon = 0;
    let totalStoredIsk = 0;
    for (const c of cols) {
      totalStoredIsk += c.estStorageValueIsk;
      for (const ex of c.extractors) {
        if (ex.status === 'expired') expired += 1;
        else if (ex.status === 'expiring_soon') expiringSoon += 1;
      }
    }
    return { count: cols.length, expired, expiringSoon, totalStoredIsk };
  }, [overview]);

  const filteredCommodities = useMemo(() => {
    const list = overview?.commodities ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((c) => {
      if (tierFilter !== 'all' && c.tier !== tierFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [overview, tierFilter, searchQuery]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {/* Header */}
      <div className="photon-panel flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <Globe2 className="h-4 w-4 text-eve-accent" />
            Planetary Interaction
          </div>
          <div className="flex items-center gap-1">
            {[
              { id: 'colonies', label: `Colonies (${colonyStats.count})`, icon: Clock },
              { id: 'profit', label: 'P1–P4 Profit Calculator', icon: Calculator },
              { id: 'guide', label: 'Planet Guide', icon: Box }
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as PiTab)}
                  className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold ${
                    activeTab === t.id
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {destMsg && <span className="text-[11px] text-eve-accent">{destMsg}</span>}
          <select
            value={charScope === null ? 'all' : String(charScope)}
            onChange={(e) => setCharScope(e.target.value === 'all' ? null : Number(e.target.value))}
            className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text outline-none focus:border-eve-accent"
          >
            <option value="all">All Registered Characters</option>
            {characters.map((c) => (
              <option key={c.characterId} value={c.characterId}>
                {c.characterName}
              </option>
            ))}
          </select>

          <select
            value={regionId}
            onChange={(e) => setRegionId(Number(e.target.value))}
            className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text outline-none focus:border-eve-accent"
          >
            {TRADE_HUBS.map((h) => (
              <option key={h.regionId} value={h.regionId}>
                {h.shortName}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={loading}
            onClick={() => void syncOverview()}
            className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs font-semibold text-eve-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Sync PI
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-eve-danger/60 bg-eve-danger/10 px-3 py-2 text-xs text-eve-danger">
          {error}
        </div>
      )}

      {/* Colonies & Timers Tab */}
      {activeTab === 'colonies' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="photon-panel p-3">
              <div className="text-[10px] uppercase text-eve-muted">Active Colonies</div>
              <div className="num-mono mt-1 text-base font-bold text-eve-text">{colonyStats.count}</div>
            </div>
            <div className="photon-panel p-3">
              <div className="text-[10px] uppercase text-eve-muted">Expired Extractors</div>
              <div
                className={`num-mono mt-1 text-base font-bold ${
                  colonyStats.expired > 0 ? 'text-eve-danger' : 'text-eve-success'
                }`}
              >
                {colonyStats.expired}
              </div>
            </div>
            <div className="photon-panel p-3">
              <div className="text-[10px] uppercase text-eve-muted">Expiring &lt; 24h</div>
              <div
                className={`num-mono mt-1 text-base font-bold ${
                  colonyStats.expiringSoon > 0 ? 'text-eve-warning' : 'text-eve-text'
                }`}
              >
                {colonyStats.expiringSoon}
              </div>
            </div>
            <div className="photon-panel p-3">
              <div className="text-[10px] uppercase text-eve-muted">Stored Colony Value</div>
              <div className="num-mono mt-1 text-base font-bold text-eve-accent">
                {formatIsk(colonyStats.totalStoredIsk)}
              </div>
            </div>
          </div>

          {colonyStats.count === 0 ? (
            <div className="photon-panel flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <Globe2 className="h-8 w-8 text-eve-muted" />
              <div className="text-sm font-semibold text-eve-text">No Planetary Colonies Found</div>
              <p className="max-w-md text-xs text-eve-muted">
                No active PI colonies were returned by ESI for the selected scope. To start PI in EVE Online,
                buy a <span className="text-eve-text">Command Center</span> matching a planet type, warp to the
                planet, and click <span className="text-eve-accent">View in Planetary Industry</span>. Meanwhile,
                check the <span className="text-eve-accent">P1–P4 Profit Calculator</span> and{' '}
                <span className="text-eve-accent">Planet Guide</span> tabs to find the most profitable chains!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(overview?.colonies ?? []).map((c) => (
                <div key={`${c.characterId}-${c.planetId}`} className="photon-panel flex flex-col gap-2.5 p-3 text-xs">
                  <div className="flex items-start justify-between gap-2 border-b border-eve-border/60 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-eve-text">{c.planetName}</span>
                        <span className="border border-eve-accent/50 bg-eve-accent-muted px-1.5 py-0.5 text-[10px] uppercase text-eve-accent">
                          {c.planetType}
                        </span>
                        <span className="text-[10px] text-eve-muted">CC Lv.{c.upgradeLevel}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-eve-muted">
                        Pilot: <span className="text-eve-text">{c.characterName}</span> • System:{' '}
                        <span className="text-eve-text">{c.solarSystemName}</span> • Factories: {c.factoryCount}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSetDest(c.solarSystemId, c.solarSystemName, c.characterId)}
                      className="inline-flex shrink-0 items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-[10px] text-eve-text hover:border-eve-accent hover:text-eve-accent"
                    >
                      <Navigation className="h-2.5 w-2.5" />
                      Set Dest
                    </button>
                  </div>

                  {/* Extractors */}
                  {c.extractors.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase text-eve-muted">Extractors</div>
                      {c.extractors.map((ex) => (
                        <div
                          key={ex.pinId}
                          className="flex items-center justify-between border border-eve-border/40 bg-eve-bg/50 px-2 py-1"
                        >
                          <div>
                            <span className="font-semibold text-eve-text">{ex.productName}</span>
                            <span className="num-mono ml-2 text-[10px] text-eve-muted">
                              {ex.unitsPerHour.toLocaleString()}/hr
                            </span>
                          </div>
                          <span
                            className={`num-mono inline-flex items-center gap-1 text-[11px] font-semibold ${
                              ex.status === 'expired'
                                ? 'text-eve-danger'
                                : ex.status === 'expiring_soon'
                                  ? 'text-eve-warning'
                                  : 'text-eve-success'
                            }`}
                          >
                            {ex.status !== 'active' && <AlertTriangle className="h-3 w-3" />}
                            {formatCountdown(ex.expiryMs, nowMs)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Storages / Launchpads */}
                  {c.storages.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-eve-muted">
                        <span>Launchpads &amp; Storage</span>
                        <span className="num-mono text-eve-accent">{formatIsk(c.estStorageValueIsk)}</span>
                      </div>
                      {c.storages.map((st) => (
                        <div key={st.pinId} className="space-y-1 border border-eve-border/40 bg-eve-bg/50 p-2">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="uppercase text-eve-muted">{st.kind.replace('_', ' ')}</span>
                            <span className="num-mono text-eve-text">
                              {st.totalVolumeM3.toFixed(0)} / {st.capacityM3.toLocaleString()} m³ ({st.fillPct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-eve-border/50">
                            <div
                              className={`h-full ${
                                st.fillPct > 85
                                  ? 'bg-eve-danger'
                                  : st.fillPct > 65
                                    ? 'bg-eve-warning'
                                    : 'bg-eve-accent'
                              }`}
                              style={{ width: `${Math.min(100, st.fillPct)}%` }}
                            />
                          </div>
                          {st.contents.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5 text-[10px] text-eve-muted">
                              {st.contents.map((item) => (
                                <span key={item.typeId} className="border border-eve-border/60 px-1.5 py-0.5">
                                  {item.amount.toLocaleString()}x {item.typeName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* P1-P4 Profit Calculator Tab */}
      {activeTab === 'profit' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="photon-panel flex min-h-0 flex-col lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel/60 px-3 py-2 text-xs">
              <div className="flex items-center gap-1">
                {(['all', 'P1', 'P2', 'P3', 'P4'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setTierFilter(tier)}
                    className={`border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      tierFilter === tier
                        ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                        : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 text-[11px] text-eve-muted">
                  <span>POCO Tax %</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={pocoTaxPct}
                    onChange={(e) => setPocoTaxPct(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                    className="num-mono w-14 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-xs text-eve-text"
                  />
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1.5 h-3 w-3 text-eve-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter commodity..."
                    className="w-44 border border-eve-border bg-eve-bg py-0.5 pl-6 pr-2 text-xs outline-none focus:border-eve-accent"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase text-eve-muted">
                  <tr className="border-b border-eve-border">
                    <th className="px-3 py-2">Commodity</th>
                    <th className="px-2 py-2">Tier</th>
                    <th className="px-3 py-2 text-right">Output Price</th>
                    <th className="px-3 py-2 text-right">Input + Tax</th>
                    <th className="px-3 py-2 text-right">Profit / Day (1 Fac)</th>
                    <th className="px-3 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/40">
                  {filteredCommodities.map((c) => {
                    const selected = selectedCommodity?.typeId === c.typeId;
                    return (
                      <tr
                        key={c.typeId}
                        onClick={() => setSelectedCommodity(c)}
                        className={`cursor-pointer hover:bg-eve-elevated/40 ${
                          selected ? 'bg-eve-accent-muted/30' : ''
                        }`}
                      >
                        <td className="px-3 py-1.5 font-semibold text-eve-text">{c.name}</td>
                        <td className="px-2 py-1.5">
                          <span className="border border-eve-border px-1.5 py-0.5 text-[10px] font-semibold text-eve-accent">
                            {c.tier}
                          </span>
                        </td>
                        <td className="num-mono px-3 py-1.5 text-right text-eve-muted">
                          {formatIsk(c.outputUnitPrice)}
                        </td>
                        <td className="num-mono px-3 py-1.5 text-right text-eve-muted">
                          {formatIsk(c.inputCycleCostIsk + c.customsTaxIsk)}
                        </td>
                        <td
                          className={`num-mono px-3 py-1.5 text-right font-semibold ${
                            c.profitPerDayIsk >= 0 ? 'text-eve-success' : 'text-eve-danger'
                          }`}
                        >
                          {formatIsk(c.profitPerDayIsk)}
                        </td>
                        <td
                          className={`num-mono px-3 py-1.5 text-right ${
                            c.marginPct >= 0 ? 'text-eve-success' : 'text-eve-danger'
                          }`}
                        >
                          {c.marginPct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chain Inspector */}
          <div className="photon-panel flex min-h-0 flex-col p-3 text-xs lg:col-span-4">
            <div className="border-b border-eve-border pb-2 text-[11px] font-semibold uppercase tracking-wider text-eve-accent">
              Production Chain Inspector
            </div>
            {selectedCommodity ? (
              <div className="mt-3 space-y-3 overflow-auto">
                <div>
                  <div className="text-sm font-bold text-eve-text">
                    {selectedCommodity.name}{' '}
                    <span className="text-xs font-normal text-eve-accent">({selectedCommodity.tier})</span>
                  </div>
                  <div className="text-[11px] text-eve-muted">
                    Outputs {selectedCommodity.outputQty}x per {selectedCommodity.cycleTimeSeconds / 60}m cycle •{' '}
                    {selectedCommodity.volumeM3} m³/unit
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border border-eve-border/60 bg-eve-bg/50 p-2">
                  <div>
                    <div className="text-[10px] uppercase text-eve-muted">Profit / Cycle</div>
                    <div
                      className={`num-mono font-semibold ${
                        selectedCommodity.profitPerCycleIsk >= 0 ? 'text-eve-success' : 'text-eve-danger'
                      }`}
                    >
                      {formatIsk(selectedCommodity.profitPerCycleIsk)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-eve-muted">POCO Tax / Cycle</div>
                    <div className="num-mono font-semibold text-eve-warning">
                      {formatIsk(selectedCommodity.customsTaxIsk)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-eve-muted">
                    Required Inputs (per cycle)
                  </div>
                  <div className="divide-y divide-eve-border/40 border border-eve-border/60">
                    {selectedCommodity.inputs.map((inp) => (
                      <div key={inp.typeId} className="flex items-center justify-between px-2 py-1.5">
                        <div>
                          <span className="font-semibold text-eve-text">{inp.name}</span>
                          <span className="ml-1.5 text-[10px] text-eve-accent">({inp.tier})</span>
                        </div>
                        <div className="num-mono text-right">
                          <span className="font-semibold text-eve-text">{inp.quantity.toLocaleString()}x</span>
                          <span className="ml-2 text-[10px] text-eve-muted">
                            {formatIsk(inp.unitPrice * inp.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-eve-muted">
                    Best Planet Types
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCommodity.sourcePlanets.length > 0 ? (
                      selectedCommodity.sourcePlanets.map((pl) => (
                        <span
                          key={pl}
                          className="border border-eve-accent/50 bg-eve-accent-muted px-2 py-0.5 text-[10px] font-semibold text-eve-accent"
                        >
                          {pl}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-eve-muted">
                        Requires importing P1 inputs from 2+ different planets
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-eve-muted">
                Select a commodity to inspect its production chain.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Planet Guide Tab */}
      {activeTab === 'guide' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          <div className="photon-panel p-3 text-xs">
            <div className="font-semibold uppercase tracking-wider text-eve-accent">
              Quick PI Beginner&apos;s Guide
            </div>
            <p className="mt-1 text-eve-muted">
              <strong className="text-eve-text">1. Extract (P0 → P1):</strong> Place an Extractor Control Unit +
              Basic Industry Facilities to refine raw P0 into P1 on each planet.{' '}
              <strong className="text-eve-text">2. Refine (P1 → P2):</strong> Combine two P1 materials in an
              Advanced Industry Facility (some planets can make P2 on a single planet!).{' '}
              <strong className="text-eve-text">3. Specialize (P2 → P3 → P4):</strong> Haul P1/P2 outputs to a
              dedicated Factory Planet (often Barren/Temperate) for high-value P3/P4 goods.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {(overview?.planetMatrix ?? []).map((pm) => (
              <div key={pm.planetType} className="photon-panel flex flex-col gap-2 p-3 text-xs">
                <div className="border-b border-eve-border/60 pb-1.5 text-sm font-bold text-eve-accent">
                  {pm.planetType} Planet
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-eve-muted">Raw P0 Resources</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pm.p0Resources.map((r) => (
                      <span key={r} className="border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[10px]">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-eve-muted">
                    Single-Planet P2 Outputs
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pm.singlePlanetP2.map((p2) => (
                      <span
                        key={p2}
                        className="border border-eve-success/40 bg-eve-success/10 px-1.5 py-0.5 text-[10px] text-eve-success"
                      >
                        {p2}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

