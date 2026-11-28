import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Coins,
  Copy,
  Factory,
  Gauge,
  Pause,
  Pickaxe,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Users
} from 'lucide-react';
import { TRADE_HUBS } from '@shared/constants/eve';
import type { ModuleProps } from '@shared/types/module';
import type { MiningLedgerSummaryDto } from '@shared/types/modules-data';
import { formatIsk } from '@/core/utils/format';

type MiningTab = 'ledger' | 'rates' | 'fleet';

interface HullPreset {
  id: string;
  name: string;
  role: string;
  baseM3PerMin: number; // baseline fitted m³/min unboosted
  oreHoldM3: number;
}

const HULL_PRESETS: HullPreset[] = [
  { id: 'venture', name: 'Venture', role: 'Mining Frigate', baseM3PerMin: 320, oreHoldM3: 5000 },
  { id: 'procurer', name: 'Procurer', role: 'Tank Barge', baseM3PerMin: 980, oreHoldM3: 15000 },
  { id: 'retriever', name: 'Retriever', role: 'Ore Hold Barge', baseM3PerMin: 1080, oreHoldM3: 27500 },
  { id: 'covetor', name: 'Covetor', role: 'Max Yield Barge', baseM3PerMin: 1320, oreHoldM3: 9000 },
  { id: 'skiff', name: 'Skiff', role: 'Tank Exhumer', baseM3PerMin: 1380, oreHoldM3: 18500 },
  { id: 'mackinaw', name: 'Mackinaw', role: 'Ore Hold Exhumer', baseM3PerMin: 1540, oreHoldM3: 35000 },
  { id: 'hulk', name: 'Hulk', role: 'Max Yield Exhumer', baseM3PerMin: 1920, oreHoldM3: 11500 }
];

const YIELD_PRESETS = [
  { label: '50.0% (NPC Station)', pct: 50 },
  { label: '54.0% (Highsec Athanor)', pct: 54 },
  { label: '72.4% (Highsec Tatara T2)', pct: 72.4 },
  { label: '78.5% (Null/WH Athanor T2)', pct: 78.5 },
  { label: '89.3% (Null/WH Tatara Max)', pct: 89.3 }
];

const BOOST_PRESETS = [
  { label: 'Unboosted (0%)', pct: 0 },
  { label: 'Porpoise T1/T2 (+25%)', pct: 25 },
  { label: 'Orca Max Links (+38%)', pct: 38 },
  { label: 'Rorqual Industrial Core (+47%)', pct: 47 }
];

interface FleetMemberSplit {
  id: string;
  name: string;
  role: string;
  weight: number;
}

export function MiningTrackerModule({ activeCharacterId }: ModuleProps) {
  const [activeTab, setActiveTab] = useState<MiningTab>('ledger');
  const [hubRegionId, setHubRegionId] = useState<number>(TRADE_HUBS[0].regionId);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('30d');
  const [yieldPct, setYieldPct] = useState<number>(72.4);

  const [ledger, setLedger] = useState<MiningLedgerSummaryDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Rates / Barge Calculator & Live Session Timer
  const [selectedHullId, setSelectedHullId] = useState<string>('hulk');
  const [customM3PerMin, setCustomM3PerMin] = useState<number>(1920);
  const [boostPct, setBoostPct] = useState<number>(38);
  const [selectedOreTypeId, setSelectedOreTypeId] = useState<number>(0);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionM3Override, setSessionM3Override] = useState<number>(0);

  // Fleet Payout Splits
  const [corpTaxPct, setCorpTaxPct] = useState<number>(5);
  const [customPoolIsk, setCustomPoolIsk] = useState<string>('');
  const [fleetMembers, setFleetMembers] = useState<FleetMemberSplit[]>([
    { id: 'fm-1', name: 'Main Miner', role: 'Exhumer', weight: 1.0 },
    { id: 'fm-2', name: 'Fleet Booster', role: 'Orca / Rorqual', weight: 1.25 }
  ]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Miner');
  const [newMemberWeight, setNewMemberWeight] = useState(1.0);
  const [copiedSplit, setCopiedSplit] = useState(false);

  const sync = useCallback(async () => {
    if (!activeCharacterId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await window.eveLens.mining.syncLedger(activeCharacterId, hubRegionId);
      setLedger(res);
      if (res.entries.length > 0 && selectedOreTypeId === 0) {
        setSelectedOreTypeId(res.entries[0].typeId);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sync mining ledger');
    } finally {
      setLoading(false);
    }
  }, [activeCharacterId, hubRegionId, selectedOreTypeId]);

  useEffect(() => {
    if (activeCharacterId) void sync();
  }, [activeCharacterId, hubRegionId]);

  useEffect(() => {
    if (!sessionRunning) return;
    const t = window.setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [sessionRunning]);

  const filteredEntries = useMemo(() => {
    const all = ledger?.entries ?? [];
    if (dateFilter === 'all') return all;
    const now = Date.now();
    const days = dateFilter === 'today' ? 1 : dateFilter === '7d' ? 7 : 30;
    const cutoff = now - days * 86400 * 1000;
    return all.filter((e) => Date.parse(e.date) >= cutoff);
  }, [ledger, dateFilter]);

  const totals = useMemo(() => {
    let volumeM3 = 0;
    let rawIsk = 0;
    let compressedIsk = 0;
    let reprocessedIsk = 0;
    const yieldFactor = yieldPct / 100;
    for (const e of filteredEntries) {
      volumeM3 += e.volumeM3;
      rawIsk += e.rawTotalIsk;
      compressedIsk += e.compressedTotalIsk;
      reprocessedIsk += e.reprocessedBaseTotalIsk * yieldFactor;
    }
    return {
      volumeM3,
      rawIsk,
      compressedIsk,
      reprocessedIsk,
      bestIsk: Math.max(compressedIsk, reprocessedIsk),
      recommend: reprocessedIsk > compressedIsk ? 'Reprocess' : 'Compress'
    };
  }, [filteredEntries, yieldPct]);

  // Unique ore types from ledger for the ISK/hr calculator
  const uniqueOres = useMemo(() => {
    const map = new Map<
      number,
      {
        typeId: number;
        typeName: string;
        unitVol: number;
        compressedUnitPrice: number;
        reprocessedUnitValue: number;
      }
    >();
    for (const e of ledger?.entries ?? []) {
      if (!map.has(e.typeId)) {
        map.set(e.typeId, {
          typeId: e.typeId,
          typeName: e.typeName,
          unitVol: e.quantity > 0 ? e.volumeM3 / e.quantity : 1,
          compressedUnitPrice: e.compressedUnitPrice > 0 ? e.compressedUnitPrice : e.rawUnitPrice,
          reprocessedUnitValue: e.reprocessedUnitValue
        });
      }
    }
    return Array.from(map.values());
  }, [ledger]);

  const activeOre = uniqueOres.find((o) => o.typeId === selectedOreTypeId) ?? uniqueOres[0] ?? null;
  const activeHull = HULL_PRESETS.find((h) => h.id === selectedHullId) ?? HULL_PRESETS[6];
  const effectiveM3PerHour = customM3PerMin * 60 * (1 + boostPct / 100);
  const unitsPerHour = activeOre && activeOre.unitVol > 0 ? effectiveM3PerHour / activeOre.unitVol : 0;
  const compressedIskPerHour = activeOre ? unitsPerHour * activeOre.compressedUnitPrice : 0;
  const reprocessedIskPerHour = activeOre
    ? unitsPerHour * activeOre.reprocessedUnitValue * (yieldPct / 100)
    : 0;

  const sessionHours = sessionSeconds > 0 ? sessionSeconds / 3600 : 0;
  const liveSessionM3 =
    sessionM3Override > 0 ? sessionM3Override : (effectiveM3PerHour / 3600) * sessionSeconds;
  const liveSessionM3PerHour = sessionHours > 0 ? liveSessionM3 / sessionHours : effectiveM3PerHour;
  const liveSessionIskPerHour =
    activeOre && activeOre.unitVol > 0
      ? (liveSessionM3PerHour / activeOre.unitVol) *
        Math.max(activeOre.compressedUnitPrice, activeOre.reprocessedUnitValue * (yieldPct / 100))
      : 0;

  // Fleet Payout Math
  const grossPoolIsk = customPoolIsk.trim() ? Number(customPoolIsk) || 0 : totals.bestIsk;
  const netPoolIsk = grossPoolIsk * (1 - Math.max(0, Math.min(100, corpTaxPct)) / 100);
  const totalWeight = fleetMembers.reduce((sum, m) => sum + Math.max(0, m.weight), 0);

  const handleCopySplit = () => {
    const lines = [
      `Mining Fleet Payout — Net Pool: ${formatIsk(netPoolIsk)} (Corp Tax: ${corpTaxPct}%)`,
      ...fleetMembers.map((m) => {
        const share = totalWeight > 0 ? (netPoolIsk * m.weight) / totalWeight : 0;
        return `- ${m.name} (${m.role}, ${m.weight}x): ${formatIsk(share)}`;
      })
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSplit(true);
    setTimeout(() => setCopiedSplit(false), 1800);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {/* Header Bar */}
      <div className="photon-panel flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <Pickaxe className="h-4 w-4 text-eve-accent" />
            Mining Tracker
          </div>
          <div className="flex items-center gap-1">
            {[
              { id: 'ledger', label: 'Ledger & Reprocessing' },
              { id: 'rates', label: 'Barge ISK/hr & m³/hr' },
              { id: 'fleet', label: 'Fleet Payout Splits' }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as MiningTab)}
                className={`border px-2.5 py-1 text-xs font-semibold ${
                  activeTab === t.id
                    ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                    : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={hubRegionId}
            onChange={(e) => setHubRegionId(Number(e.target.value))}
            className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
          >
            {TRADE_HUBS.map((h) => (
              <option key={h.regionId} value={h.regionId}>
                Hub: {h.shortName}
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
            className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Ledger</option>
          </select>

          <button
            type="button"
            disabled={loading || !activeCharacterId}
            onClick={() => void sync()}
            className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 font-semibold text-eve-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Ledger
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="border border-eve-danger/60 bg-eve-danger/10 px-3 py-2 text-xs text-eve-danger">
          {errorMsg}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="photon-panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-eve-muted">Mined Volume</div>
          <div className="num-mono mt-1 text-lg font-bold text-eve-accent">
            {totals.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³
          </div>
        </div>
        <div className="photon-panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-eve-muted">Compressed Ore Value</div>
          <div className="num-mono mt-1 text-lg font-bold text-eve-text">
            {formatIsk(totals.compressedIsk)}
          </div>
        </div>
        <div className="photon-panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-eve-muted">
            Reprocessed ({yieldPct.toFixed(1)}% Yield)
          </div>
          <div className="num-mono mt-1 text-lg font-bold text-eve-warning">
            {formatIsk(totals.reprocessedIsk)}
          </div>
        </div>
        <div className="photon-panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-eve-muted">Best Strategy</div>
          <div className="mt-1 text-lg font-bold text-eve-success">
            {totals.recommend} (+{formatIsk(Math.abs(totals.reprocessedIsk - totals.compressedIsk))})
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'ledger' && (
        <div className="photon-panel flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel/60 px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider">
              <Factory className="h-3.5 w-3.5 text-eve-accent" />
              Mining Ledger &amp; Reprocessing Comparison ({filteredEntries.length} entries)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase text-eve-muted">Reprocessing Yield:</span>
              <select
                value={
                  YIELD_PRESETS.some((p) => p.pct === yieldPct) ? String(yieldPct) : 'custom'
                }
                onChange={(e) => {
                  if (e.target.value !== 'custom') setYieldPct(Number(e.target.value));
                }}
                className="border border-eve-border bg-eve-bg px-2 py-0.5 text-xs text-eve-text"
              >
                {YIELD_PRESETS.map((p) => (
                  <option key={p.label} value={p.pct}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom ({yieldPct.toFixed(1)}%)</option>
              </select>
              <input
                type="number"
                min={30}
                max={95}
                step={0.1}
                value={yieldPct}
                onChange={(e) => setYieldPct(Math.max(30, Math.min(95, Number(e.target.value) || 50)))}
                className="num-mono w-16 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-center text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {!activeCharacterId ? (
              <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
                Select a character in the top bar to sync their EVE mining ledger.
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
                No mining ledger entries found for this period. Click Sync Ledger to fetch from ESI.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                  <tr className="border-b border-eve-border">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">System</th>
                    <th className="px-3 py-2">Ore / Ice</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Volume</th>
                    <th className="px-3 py-2 text-right">Compressed ISK</th>
                    <th className="px-3 py-2 text-right">Reprocessed ISK</th>
                    <th className="px-3 py-2 text-right">Better Option</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/40">
                  {filteredEntries.map((e, idx) => {
                    const reproc = e.reprocessedBaseTotalIsk * (yieldPct / 100);
                    const compBetter = e.compressedTotalIsk >= reproc;
                    return (
                      <tr key={`${e.date}-${e.solarSystemId}-${e.typeId}-${idx}`} className="hover:bg-eve-elevated/40">
                        <td className="num-mono px-3 py-2 text-eve-muted">{e.date}</td>
                        <td className="px-3 py-2 text-eve-text">{e.solarSystemName}</td>
                        <td className="px-3 py-2 font-semibold text-eve-text">{e.typeName}</td>
                        <td className="num-mono px-3 py-2 text-right">{e.quantity.toLocaleString()}</td>
                        <td className="num-mono px-3 py-2 text-right text-eve-muted">
                          {e.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³
                        </td>
                        <td className="num-mono px-3 py-2 text-right text-eve-accent">
                          {formatIsk(e.compressedTotalIsk)}
                        </td>
                        <td className="num-mono px-3 py-2 text-right text-eve-warning">
                          {formatIsk(reproc)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                              compBetter
                                ? 'border-eve-accent/50 bg-eve-accent-muted text-eve-accent'
                                : 'border-eve-warning/50 bg-eve-warning/10 text-eve-warning'
                            }`}
                          >
                            {compBetter ? 'Compress' : 'Reprocess'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'rates' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-12">
          <div className="photon-panel space-y-3 p-4 text-xs lg:col-span-6">
            <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-eve-accent">
              <Gauge className="h-4 w-4" />
              Barge &amp; Exhumer Yield Setup
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Hull Preset</span>
                <select
                  value={selectedHullId}
                  onChange={(e) => {
                    const h = HULL_PRESETS.find((x) => x.id === e.target.value);
                    setSelectedHullId(e.target.value);
                    if (h) setCustomM3PerMin(h.baseM3PerMin);
                  }}
                  className="w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                >
                  {HULL_PRESETS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Unboosted m³/min</span>
                <input
                  type="number"
                  min={50}
                  max={10000}
                  value={customM3PerMin}
                  onChange={(e) => setCustomM3PerMin(Math.max(1, Number(e.target.value) || 0))}
                  className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Foreman Burst Boost</span>
                <select
                  value={boostPct}
                  onChange={(e) => setBoostPct(Number(e.target.value))}
                  className="w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                >
                  {BOOST_PRESETS.map((b) => (
                    <option key={b.label} value={b.pct}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Target Ore (from Ledger)</span>
                <select
                  value={activeOre?.typeId ?? 0}
                  onChange={(e) => setSelectedOreTypeId(Number(e.target.value))}
                  className="w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                >
                  {uniqueOres.length === 0 ? (
                    <option value={0}>Sync ledger first for live ore prices</option>
                  ) : (
                    uniqueOres.map((o) => (
                      <option key={o.typeId} value={o.typeId}>
                        {o.typeName}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-eve-border pt-3">
              <div className="border border-eve-border bg-eve-bg/60 p-2.5">
                <div className="text-[10px] uppercase text-eve-muted">Effective Rate</div>
                <div className="num-mono text-base font-bold text-eve-accent">
                  {effectiveM3PerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³/hr
                </div>
                <div className="text-[10px] text-eve-muted">
                  Fills {activeHull.name} hold ({activeHull.oreHoldM3.toLocaleString()} m³) every{' '}
                  {((activeHull.oreHoldM3 / Math.max(1, effectiveM3PerHour)) * 60).toFixed(1)} min
                </div>
              </div>

              <div className="border border-eve-border bg-eve-bg/60 p-2.5">
                <div className="text-[10px] uppercase text-eve-muted">Estimated ISK/hr</div>
                <div className="num-mono text-base font-bold text-eve-success">
                  {formatIsk(Math.max(compressedIskPerHour, reprocessedIskPerHour))}/hr
                </div>
                <div className="text-[10px] text-eve-muted">
                  Comp: {formatIsk(compressedIskPerHour)} | Reproc: {formatIsk(reprocessedIskPerHour)}
                </div>
              </div>
            </div>
          </div>

          {/* Live Session Timer */}
          <div className="photon-panel space-y-3 p-4 text-xs lg:col-span-6">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-eve-accent">
                Live Mining Session Timer
              </span>
              <span className="num-mono text-sm font-bold text-eve-text">
                {Math.floor(sessionSeconds / 3600)
                  .toString()
                  .padStart(2, '0')}
                :
                {Math.floor((sessionSeconds % 3600) / 60)
                  .toString()
                  .padStart(2, '0')}
                :{(sessionSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSessionRunning((r) => !r)}
                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 font-semibold ${
                  sessionRunning
                    ? 'border-eve-warning/60 bg-eve-warning/10 text-eve-warning'
                    : 'border-eve-success/60 bg-eve-success/10 text-eve-success'
                }`}
              >
                {sessionRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {sessionRunning ? 'Pause Session' : 'Start Session'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSessionRunning(false);
                  setSessionSeconds(0);
                  setSessionM3Override(0);
                }}
                className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-3 py-1.5 text-eve-muted hover:text-eve-text"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">
                Actual Mined Volume This Session (m³, optional override)
              </span>
              <input
                type="number"
                min={0}
                value={sessionM3Override || ''}
                onChange={(e) => setSessionM3Override(Number(e.target.value) || 0)}
                placeholder="Leave 0 to estimate from hull rate"
                className="num-mono w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs"
              />
            </label>

            <div className="grid grid-cols-2 gap-2 border-t border-eve-border pt-3">
              <div className="border border-eve-border bg-eve-bg/60 p-2.5">
                <div className="text-[10px] uppercase text-eve-muted">Session Pace</div>
                <div className="num-mono text-base font-bold text-eve-accent">
                  {liveSessionM3PerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³/hr
                </div>
              </div>
              <div className="border border-eve-border bg-eve-bg/60 p-2.5">
                <div className="text-[10px] uppercase text-eve-muted">Session ISK/hr</div>
                <div className="num-mono text-base font-bold text-eve-success">
                  {formatIsk(liveSessionIskPerHour)}/hr
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fleet' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-12">
          <div className="photon-panel space-y-3 p-4 text-xs lg:col-span-5">
            <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-eve-accent">
              <Coins className="h-4 w-4" />
              Payout Pool &amp; Add Fleet Member
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">
                  Custom ISK Pool (blank = Ledger Best)
                </span>
                <input
                  type="number"
                  min={0}
                  value={customPoolIsk}
                  onChange={(e) => setCustomPoolIsk(e.target.value)}
                  placeholder={Math.round(totals.bestIsk).toString()}
                  className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Corp Tax / Buyback %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={corpTaxPct}
                  onChange={(e) => setCorpTaxPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                />
              </label>
            </div>

            <div className="space-y-2 border-t border-eve-border pt-3">
              <div className="text-[10px] font-semibold uppercase text-eve-muted">Add Pilot to Split</div>
              <div className="flex flex-wrap gap-1.5">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Pilot name..."
                  className="flex-1 min-w-[120px] border border-eve-border bg-eve-bg px-2 py-1 text-xs"
                />
                <input
                  type="text"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  placeholder="Role"
                  className="w-24 border border-eve-border bg-eve-bg px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={5}
                  value={newMemberWeight}
                  onChange={(e) => setNewMemberWeight(Number(e.target.value) || 1)}
                  title="Share weight (e.g. 1.0x for miner, 1.25x for booster)"
                  className="num-mono w-16 border border-eve-border bg-eve-bg px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newMemberName.trim()) return;
                    setFleetMembers((prev) => [
                      ...prev,
                      {
                        id: `fm-${Date.now()}`,
                        name: newMemberName.trim(),
                        role: newMemberRole.trim() || 'Miner',
                        weight: newMemberWeight
                      }
                    ]);
                    setNewMemberName('');
                  }}
                  className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 font-semibold text-eve-accent"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </div>
          </div>

          <div className="photon-panel flex flex-col p-4 text-xs lg:col-span-7">
            <div className="mb-3 flex items-center justify-between border-b border-eve-border pb-2">
              <div className="flex items-center gap-2 font-semibold uppercase tracking-wider">
                <Users className="h-4 w-4 text-eve-accent" />
                Fleet Splits — Net Pool: {formatIsk(netPoolIsk)}
              </div>
              <button
                type="button"
                onClick={handleCopySplit}
                className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-[11px] font-semibold text-eve-accent"
              >
                {copiedSplit ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedSplit ? 'Copied' : 'Copy Payout'}
              </button>
            </div>

            <div className="space-y-1.5">
              {fleetMembers.map((m) => {
                const payout = totalWeight > 0 ? (netPoolIsk * m.weight) / totalWeight : 0;
                const pct = totalWeight > 0 ? (m.weight / totalWeight) * 100 : 0;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 border border-eve-border bg-eve-bg/60 px-3 py-2"
                  >
                    <div>
                      <span className="font-semibold text-eve-text">{m.name}</span>
                      <span className="ml-2 text-[11px] text-eve-muted">
                        {m.role} • {m.weight}x ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num-mono font-bold text-eve-success">{formatIsk(payout)}</span>
                      <button
                        type="button"
                        onClick={() => setFleetMembers((prev) => prev.filter((x) => x.id !== m.id))}
                        className="text-eve-muted hover:text-eve-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

