import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Activity, Clock, Cpu, RefreshCw, Shield } from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type { PilotAnalyticsDto } from '@shared/types/modules-data';
import { useTheme } from '@/core/contexts/ThemeContext';
import { formatDate, formatIsk } from '@/core/utils/format';

export function PilotAnalyticsModule({ activeCharacterId }: ModuleProps) {
  const { settings } = useTheme();
  const [data, setData] = useState<PilotAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.eveLens.analytics.getPilotAnalytics(activeCharacterId);
      setData(res);
      setCooldownSec(res.clones.cooldownRemainingSec);
    } finally {
      setLoading(false);
    }
  }, [activeCharacterId]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec > 0]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.walletHistory.map((w) => ({
      time: formatDate(w.capturedAt, settings?.dateFormat, false),
      netWorth: w.balance + w.estimatedAssetValue
    }));
  }, [data, settings?.dateFormat]);

  const cooldownText = useMemo(() => {
    if (cooldownSec <= 0) return 'Ready to Jump';
    const h = Math.floor(cooldownSec / 3600);
    const m = Math.floor((cooldownSec % 3600) / 60);
    const s = cooldownSec % 60;
    return `${h}h ${m}m ${s}s`;
  }, [cooldownSec]);

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-y-auto">
      {/* Header */}
      <div className="photon-panel flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <Activity className="h-4 w-4 text-eve-accent" />
          Pilot Wealth, PvE Ticks &amp; Clone Tracker
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadAnalytics()}
          className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold text-eve-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync ESI
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi title="Wallet Balance" value={formatIsk(data?.totalWalletBalance ?? 0, true)} accent />
        <Kpi title="ISK / Hour" value={formatIsk(data?.iskPerHour ?? 0, true)} />
        <Kpi title="24h / 7d Delta" value={`${formatIsk(data?.isk24h ?? 0, true)}`} sub={`7d: ${formatIsk(data?.isk7d ?? 0, true)}`} />
        <Kpi title="K/D Ratio" value={`${data?.kdRatio ?? 0}`} />
        <Kpi
          title="Top Asset"
          value={data?.mostExpensiveAssetName ?? '—'}
          sub={data?.mostExpensiveAssetValue ? formatIsk(data.mostExpensiveAssetValue, true) : ''}
        />
        <Kpi
          title="Top Ship"
          value={data?.mostExpensiveShipName ?? '—'}
          sub={data?.mostExpensiveShipValue ? formatIsk(data.mostExpensiveShipValue, true) : ''}
        />
      </div>

      {/* Chart + Clones */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="photon-panel flex h-64 flex-col p-3 lg:col-span-7">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider">
            Net Worth Over Time (Local SQLite Snapshots)
          </div>
          <div className="min-h-0 flex-1">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-eve-muted">
                Sync a linked character to record wallet snapshots over time.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8b9bb4' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#8b9bb4' }}
                    tickFormatter={(v: number) => `${(v / 1e9).toFixed(1)}B`}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#131822', borderColor: '#232d3f', fontSize: 11 }}
                    formatter={(val: number) => formatIsk(val)}
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke="var(--eve-accent)"
                    fill="var(--eve-accent-muted)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Clones & Active Implants */}
        <div className="photon-panel flex flex-col gap-2.5 p-3 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-eve-border pb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
              <Shield className="h-3.5 w-3.5 text-eve-accent" />
              Jump Clones &amp; Implants
            </span>
            <span className="num-mono inline-flex items-center gap-1 text-xs text-eve-accent">
              <Clock className="h-3 w-3" />
              {cooldownText}
            </span>
          </div>

          <div className="text-[11px] font-semibold uppercase text-eve-muted">
            Active Implants ({data?.clones.activeImplants.length ?? 0})
          </div>
          <div className="max-h-24 space-y-1 overflow-y-auto text-xs">
            {(data?.clones.activeImplants ?? []).length === 0 ? (
              <div className="text-eve-muted">No implants detected.</div>
            ) : (
              data?.clones.activeImplants.map((imp) => (
                <div key={imp.typeId} className="flex items-center gap-1.5 text-eve-text">
                  <Cpu className="h-3 w-3 text-eve-accent" />
                  <span className="truncate">{imp.name}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-1 border-t border-eve-border pt-2 text-[11px] font-semibold uppercase text-eve-muted">
            Jump Clones ({data?.clones.jumpClones.length ?? 0})
          </div>
          <div className="max-h-24 space-y-1 overflow-y-auto text-xs">
            {(data?.clones.jumpClones ?? []).map((jc) => (
              <div key={jc.jumpCloneId} className="flex justify-between gap-2 text-eve-text">
                <span className="truncate">{jc.name}</span>
                <span className="num-mono shrink-0 text-eve-muted">
                  {(jc as { locationName?: string }).locationName ?? `Loc ${jc.locationId}`} ({jc.implants.length} imp)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wallet Journal Ticks */}
      <div className="photon-panel flex min-h-[220px] flex-1 flex-col">
        <div className="photon-header px-3 py-2 text-xs font-semibold uppercase tracking-wider">
          Abyssal / PvE Bounty &amp; Wallet Journal ({data?.journalTicks.length ?? 0})
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase text-eve-muted">
              <tr className="border-b border-eve-border">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-eve-border/50">
              {(data?.journalTicks ?? []).map((j) => (
                <tr key={j.journalId} className="hover:bg-eve-elevated/50">
                  <td className="num-mono px-3 py-1.5 text-eve-muted">
                    {formatDate(j.date, settings?.dateFormat, true)}
                  </td>
                  <td className="px-3 py-1.5 text-eve-text">{j.refType}</td>
                  <td className="truncate px-3 py-1.5 text-eve-muted">
                    {j.refType === 'bounty_prizes' ||
                    j.refType === 'bounty_prize' ||
                    !j.reason ||
                    /^[\d\s,.:;-]+$/.test(j.reason.trim())
                      ? '—'
                      : j.reason}
                  </td>
                  <td
                    className={`num-mono px-3 py-1.5 text-right font-semibold ${
                      j.amount >= 0 ? 'text-eve-success' : 'text-eve-danger'
                    }`}
                  >
                    {formatIsk(j.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  sub,
  accent = false
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="photon-panel p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-eve-muted">{title}</div>
      <div className={`num-mono mt-1 truncate text-sm font-bold ${accent ? 'text-eve-accent' : 'text-eve-text'}`}>
        {value}
      </div>
      {sub && <div className="num-mono mt-0.5 truncate text-[10px] text-eve-muted">{sub}</div>}
    </div>
  );
}
