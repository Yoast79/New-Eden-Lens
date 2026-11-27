import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ClipboardPaste,
  Copy,
  PackageCheck,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react';
import { TRADE_HUBS } from '@shared/constants/eve';
import type { ModuleProps } from '@shared/types/module';
import type { EvaluatedItemRow } from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { ConfirmModal } from '@/core/components/ConfirmModal';
import { SortableHeader, type SortDirection } from '@/core/components/SortableHeader';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';
import { formatIsk, formatVolume } from '@/core/utils/format';

type SortField = 'sellTotal' | 'buyTotal' | 'splitTotal' | 'totalVolume' | 'quantity' | 'name';

export function ItemEvaluatorModule({ incomingClipboard }: ModuleProps) {
  const [rawText, setRawText] = useState('');
  const [regionId, setRegionId] = useState<number>(TRADE_HUBS[0].regionId);
  const [rows, setRows] = useState<EvaluatedItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('sellTotal');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const evaluateText = useCallback(
    async (text: string, targetRegionId: number) => {
      const parsed = parseEveClipboard(text);
      const items =
        parsed.format === 'hangar'
          ? parsed.items
          : text
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .map((name) => ({ name, quantity: 1 }));

      if (items.length === 0) {
        setRows([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Aggregate duplicate item lines
        const aggregated = new Map<string, number>();
        for (const item of items) {
          const prev = aggregated.get(item.name) ?? 0;
          aggregated.set(item.name, prev + item.quantity);
        }

        const uniqueNames = Array.from(aggregated.keys());
        const sdeLookup = await window.eveLens.sde.lookupTypesByNames(uniqueNames);

        const matchedTypeIds = Object.values(sdeLookup).map((t) => t.typeId);
        const quotes =
          matchedTypeIds.length > 0
            ? await window.eveLens.market.getQuotesForTypes(targetRegionId, matchedTypeIds)
            : {};

        const evaluated: EvaluatedItemRow[] = uniqueNames.map((name) => {
          const quantity = aggregated.get(name) ?? 1;
          const sde = sdeLookup[name.toLowerCase()];
          const quote = sde ? quotes[sde.typeId] : undefined;

          const volUnit = sde ? (sde.packagedVolume ?? sde.volume ?? 0) : 0;
          const buyUnit = quote?.buyMax ?? 0;
          const sellUnit = quote?.sellMin ?? 0;
          const splitUnit = quote?.split ?? 0;

          return {
            name,
            quantity,
            typeId: sde?.typeId ?? null,
            matchedName: sde?.typeName ?? null,
            groupName: sde?.groupName ?? null,
            volumePerUnit: volUnit,
            totalVolume: volUnit * quantity,
            buyUnit,
            sellUnit,
            splitUnit,
            buyTotal: buyUnit * quantity,
            sellTotal: sellUnit * quantity,
            splitTotal: splitUnit * quantity
          };
        });

        setRows(evaluated);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Appraisal failed');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (incomingClipboard && incomingClipboard.format === 'hangar') {
      setRawText(incomingClipboard.raw);
      void evaluateText(incomingClipboard.raw, regionId);
    }
  }, [incomingClipboard, regionId, evaluateText]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const mult = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.matchedName ?? a.name).localeCompare(b.matchedName ?? b.name) * mult;
      }
      return (a[sortBy] - b[sortBy]) * mult;
    });
    return copy;
  }, [rows, sortBy, sortDir]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.buy += r.buyTotal;
        acc.sell += r.sellTotal;
        acc.split += r.splitTotal;
        acc.volume += r.totalVolume;
        if (r.typeId !== null) acc.matched += 1;
        return acc;
      },
      { buy: 0, sell: 0, split: 0, volume: 0, matched: 0 }
    );
  }, [rows]);

  const hubName = TRADE_HUBS.find((h) => h.regionId === regionId)?.shortName ?? 'Jita';

  const handleCopySummary = async () => {
    const summary = [
      `New Eden Lens Appraisal (${hubName})`,
      `Buy: ${formatIsk(totals.buy)}`,
      `Sell: ${formatIsk(totals.sell)}`,
      `Split: ${formatIsk(totals.split)}`,
      `Volume: ${formatVolume(totals.volume)}`
    ].join(' | ');
    await window.eveLens.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 1500);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      {/* Top Controls & Input */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="photon-panel flex flex-col lg:col-span-5">
          <div className="photon-header flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <PackageCheck className="h-3.5 w-3.5 text-eve-accent" />
              Hangar / Contract Paste
            </div>
            <button
              type="button"
              onClick={async () => {
                const text = await window.eveLens.clipboard.readText();
                setRawText(text);
                void evaluateText(text, regionId);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
            >
              <ClipboardPaste className="h-3 w-3" />
              Paste & Appraise
            </button>
          </div>
          <div className="flex flex-col gap-2 p-3">
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Tritanium\t500000\nPyerite\t250000\nGila\t1`}
              className="w-full resize-none border border-eve-border bg-eve-bg p-2.5 font-mono text-xs text-eve-text placeholder:text-eve-muted/50 focus:border-eve-accent focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {TRADE_HUBS.map((hub) => (
                  <button
                    key={hub.regionId}
                    type="button"
                    onClick={() => {
                      setRegionId(hub.regionId);
                      if (rawText.trim()) void evaluateText(rawText, hub.regionId);
                    }}
                    className={`border px-2 py-1 text-[11px] font-medium ${
                      regionId === hub.regionId
                        ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                        : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                    }`}
                  >
                    {hub.shortName}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {(rawText.trim() || rows.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(true)}
                    className="inline-flex items-center gap-1 border border-eve-border bg-eve-panel px-2.5 py-1 text-xs text-eve-muted hover:border-eve-danger/50 hover:text-eve-danger"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  disabled={loading || !rawText.trim()}
                  onClick={() => void evaluateText(rawText, regionId)}
                  className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25 disabled:opacity-40"
                >
                  {loading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  Appraise
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary KPI Panel */}
        <div className="photon-panel flex flex-col justify-between lg:col-span-7">
          <div className="photon-header flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {hubName} Market Appraisal Summary
            </span>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => void handleCopySummary()}
                className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
              >
                <Copy className="h-3 w-3" />
                {copiedSummary ? 'Copied!' : 'Copy Summary'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            <KpiCard label={`${hubName} Buy`} value={formatIsk(totals.buy, true)} sub={formatIsk(totals.buy)} />
            <KpiCard label={`${hubName} Sell`} value={formatIsk(totals.sell, true)} sub={formatIsk(totals.sell)} accent />
            <KpiCard label="Split Price" value={formatIsk(totals.split, true)} sub={formatIsk(totals.split)} />
            <KpiCard
              label="Total Volume"
              value={formatVolume(totals.volume)}
              sub={`${totals.matched}/${rows.length} SDE matched`}
            />
          </div>
          {error && (
            <div className="mx-3 mb-3 flex items-center gap-2 border border-eve-danger/50 bg-eve-danger/10 px-3 py-1.5 text-xs text-eve-danger">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Item Breakdown Table */}
      <div className="photon-panel flex min-h-0 flex-1 flex-col">
        <div className="photon-header flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider">
            Item Breakdown ({rows.length})
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          {sortedRows.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
              Paste EVE hangar, cargo, or contract items above to calculate {hubName} Buy/Sell/Split values and hauling m³.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                <tr className="border-b border-eve-border">
                  <SortableHeader label="Item" field="name" activeField={sortBy} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Qty" field="quantity" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Volume" field="totalVolume" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label={`${hubName} Buy`} field="buyTotal" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label={`${hubName} Sell`} field="sellTotal" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Split Total" field="splitTotal" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-eve-border/50">
                {sortedRows.map((row) => (
                  <tr key={row.name} className="hover:bg-eve-elevated/60">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        {row.typeId ? (
                          <EveIcon path={`types/${row.typeId}/icon?size=64`} size={24} alt={row.name} />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center border border-eve-warning/50 text-[10px] text-eve-warning">
                            ?
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-eve-text">{row.matchedName ?? row.name}</div>
                          <div className="text-[10px] text-eve-muted">
                            {row.groupName ?? (row.typeId === null ? 'Not found in local SDE' : 'Item')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num-mono px-3 py-2 text-right text-eve-text">
                      {row.quantity.toLocaleString()}
                    </td>
                    <td className="num-mono px-3 py-2 text-right text-eve-muted">
                      {formatVolume(row.totalVolume)}
                    </td>
                    <td className="num-mono px-3 py-2 text-right text-eve-text">
                      {formatIsk(row.buyTotal)}
                    </td>
                    <td className="num-mono px-3 py-2 text-right text-eve-accent">
                      {formatIsk(row.sellTotal)}
                    </td>
                    <td className="num-mono px-3 py-2 text-right text-eve-text">
                      {formatIsk(row.splitTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmClearOpen}
        title="Clear Appraisal"
        message="Are you sure? This will clear the pasted items and appraisal results!"
        confirmLabel="Clear"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          setRawText('');
          setRows([]);
          setError(null);
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = false
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-eve-border bg-eve-bg/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-eve-muted">{label}</div>
      <div className={`num-mono mt-1 text-base font-bold ${accent ? 'text-eve-accent' : 'text-eve-text'}`}>
        {value}
      </div>
      <div className="num-mono mt-0.5 truncate text-[10px] text-eve-muted">{sub}</div>
    </div>
  );
}

