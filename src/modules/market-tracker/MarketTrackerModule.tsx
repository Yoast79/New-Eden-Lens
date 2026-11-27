import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Check, FileText, LineChart, Loader2, Plus, RefreshCw, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { TRADE_HUBS } from '@shared/constants/eve';
import type { InvTypeRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type {
  CharacterContractDto,
  CharacterMarketOrderDto,
  ContractDetailDto,
  MarketHistoryPoint,
  MarketInvestmentRow,
  MarketQuote
} from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { ConfirmModal } from '@/core/components/ConfirmModal';
import { SortableHeader, type SortDirection } from '@/core/components/SortableHeader';
import { useTheme } from '@/core/contexts/ThemeContext';
import { formatDate, formatIsk, formatVolume } from '@/core/utils/format';

interface MarketTrackerProps extends ModuleProps {
  forcedTab?: 'market' | 'orders' | 'contracts';
}

export function MarketTrackerModule({ activeCharacterId, forcedTab }: MarketTrackerProps) {
  const { settings } = useTheme();
  const [internalTab, setInternalTab] = useState<'market' | 'orders' | 'contracts'>('market');
  const activeTab = forcedTab ?? internalTab;
  const setActiveTab = setInternalTab;
  const [allChars, setAllChars] = useState(false);

  const [orders, setOrders] = useState<CharacterMarketOrderDto[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSideFilter, setOrderSideFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [onlyOutbid, setOnlyOutbid] = useState(false);

  const [contracts, setContracts] = useState<CharacterContractDto[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractTypeFilter, setContractTypeFilter] = useState<string>('all');
  const [contractStatusFilter, setContractStatusFilter] = useState<'active' | 'history' | 'all'>('active');
  const [expandedContractId, setExpandedContractId] = useState<number | null>(null);
  const [contractDetails, setContractDetails] = useState<Record<number, ContractDetailDto>>({});

  const [regionId, setRegionId] = useState<number>(TRADE_HUBS[0].regionId);
  const [searchQuery, setSearchQuery] = useState('PLEX');
  const [searchHits, setSearchHits] = useState<InvTypeRow[]>([]);
  const [selectedItem, setSelectedItem] = useState<InvTypeRow | null>(null);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [history, setHistory] = useState<MarketHistoryPoint[]>([]);

  const [investments, setInvestments] = useState<MarketInvestmentRow[]>([]);
  const [buyQty, setBuyQty] = useState('10');
  const [buyPrice, setBuyPrice] = useState('');
  const [brokerPct, setBrokerPct] = useState('3.0');
  const [taxPct, setTaxPct] = useState('3.6');
  const [sortBy, setSortBy] = useState<'typeName' | 'quantity' | 'buyPrice' | 'currentSellPrice' | 'netProfit'>('netProfit');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [confirmDeleteInvId, setConfirmDeleteInvId] = useState<number | null>(null);

  const handleSort = (field: 'typeName' | 'quantity' | 'buyPrice' | 'currentSellPrice' | 'netProfit') => {
    if (sortBy === field) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(field);
      setSortDir(field === 'typeName' ? 'asc' : 'desc');
    }
  };

  const sortedInvestments = useMemo(() => {
    const copy = [...investments];
    const mult = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (sortBy === 'typeName') return a.typeName.localeCompare(b.typeName) * mult;
      return ((a[sortBy] ?? 0) - (b[sortBy] ?? 0)) * mult;
    });
    return copy;
  }, [investments, sortBy, sortDir]);

  const loadInvestments = useCallback(async () => {
    const list = await window.eveLens.market.listInvestments(activeCharacterId);
    setInvestments(list);
  }, [activeCharacterId]);

  useEffect(() => {
    void loadInvestments();
  }, [loadInvestments]);

  const loadOrders = useCallback(async (forceRefresh = false) => {
    setOrdersLoading(true);
    try {
      const data = await window.eveLens.market.getCharacterOrders(
        allChars ? null : activeCharacterId,
        forceRefresh
      );
      setOrders(data);
    } finally {
      setOrdersLoading(false);
    }
  }, [allChars, activeCharacterId]);

  const loadContracts = useCallback(async (forceRefresh = false) => {
    setContractsLoading(true);
    try {
      const data = await window.eveLens.market.getCharacterContracts(
        allChars ? null : activeCharacterId,
        forceRefresh
      );
      setContracts(data);
    } finally {
      setContractsLoading(false);
    }
  }, [allChars, activeCharacterId]);

  useEffect(() => {
    if (activeTab === 'orders') void loadOrders();
    else if (activeTab === 'contracts') void loadContracts();
  }, [activeTab, loadOrders, loadContracts]);

  const toggleContractExpand = async (c: CharacterContractDto) => {
    if (expandedContractId === c.contractId) {
      setExpandedContractId(null);
      return;
    }
    setExpandedContractId(c.contractId);
    if (!contractDetails[c.contractId]) {
      const detail = await window.eveLens.market.getContractDetails(c.characterId, c.contractId, c.type);
      setContractDetails((prev) => ({ ...prev, [c.contractId]: detail }));
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (orderSideFilter === 'buy' && !o.isBuyOrder) return false;
      if (orderSideFilter === 'sell' && o.isBuyOrder) return false;
      if (onlyOutbid && !o.isUndercutOrOverbid) return false;
      return true;
    });
  }, [orders, orderSideFilter, onlyOutbid]);

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      if (contractTypeFilter !== 'all' && c.type !== contractTypeFilter) return false;
      const isActive = c.status === 'outstanding' || c.status === 'in_progress';
      if (contractStatusFilter === 'active' && !isActive) return false;
      if (contractStatusFilter === 'history' && isActive) return false;
      return true;
    });
  }, [contracts, contractTypeFilter, contractStatusFilter]);

  const activeContractCount = useMemo(
    () => contracts.filter((c) => c.status === 'outstanding' || c.status === 'in_progress').length,
    [contracts]
  );
  const historyContractCount = contracts.length - activeContractCount;

  const selectType = async (item: InvTypeRow) => {
    setSelectedItem(item);
    setSearchHits([]);
    setSearchQuery(item.typeName);
    const [hist, quotes] = await Promise.all([
      window.eveLens.market.getHistory(regionId, item.typeId),
      window.eveLens.market.getQuotesForTypes(regionId, [item.typeId])
    ]);
    setHistory(hist.slice(-60));
    setQuote(quotes[item.typeId] ?? null);
  };

  useEffect(() => {
    if (!selectedItem) return;
    void Promise.all([
      window.eveLens.market.getHistory(regionId, selectedItem.typeId),
      window.eveLens.market.getQuotesForTypes(regionId, [selectedItem.typeId])
    ]).then(([h, q]) => {
      setHistory(h.slice(-60));
      setQuote(q[selectedItem.typeId] ?? null);
    });
  }, [regionId, selectedItem]);

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const qty = Number(buyQty);
    const price = Number(buyPrice);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) return;

    await window.eveLens.market.addInvestment({
      characterId: activeCharacterId,
      typeId: selectedItem.typeId,
      quantity: qty,
      buyPrice: price,
      targetRegionId: regionId,
      brokerFeePct: Number(brokerPct) || 0,
      salesTaxPct: Number(taxPct) || 0
    });
    setBuyPrice('');
    await loadInvestments();
  };

  const latestVelocity = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      {/* Module Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border pb-2">
        {!forcedTab ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('market')}
              className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
                activeTab === 'market'
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              <LineChart className="h-3.5 w-3.5" />
              Market &amp; Investments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
                activeTab === 'orders'
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Active Orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contracts')}
              className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
                activeTab === 'contracts'
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Contracts ({contracts.length})
            </button>
          </div>
        ) : (
          <div className="text-xs font-semibold uppercase tracking-wider text-eve-accent">
            {activeTab === 'market'
              ? 'Market & Investments'
              : activeTab === 'orders'
                ? `Active Orders (${orders.length})`
                : `Contracts (${contracts.length})`}
          </div>
        )}

        {activeTab !== 'market' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setAllChars(false)}
                className={`border px-2 py-1 ${
                  !allChars
                    ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                    : 'border-eve-border bg-eve-bg text-eve-muted'
                }`}
              >
                Active Pilot
              </button>
              <button
                type="button"
                onClick={() => setAllChars(true)}
                className={`border px-2 py-1 ${
                  allChars
                    ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                    : 'border-eve-border bg-eve-bg text-eve-muted'
                }`}
              >
                All Characters
              </button>
            </div>
            <button
              type="button"
              onClick={() => void (activeTab === 'orders' ? loadOrders(true) : loadContracts(true))}
              disabled={ordersLoading || contractsLoading}
              className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs font-semibold text-eve-accent disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${ordersLoading || contractsLoading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </div>
        )}
      </div>

      {activeTab === 'orders' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              {(['all', 'buy', 'sell'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setOrderSideFilter(s)}
                  className={`border px-2.5 py-1 capitalize ${
                    orderSideFilter === s
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted'
                  }`}
                >
                  {s === 'all' ? 'All Orders' : `${s} Orders`}
                </button>
              ))}
              <label className="ml-2 flex cursor-pointer items-center gap-1.5 border border-eve-border bg-eve-bg px-2.5 py-1 text-eve-text">
                <input
                  type="checkbox"
                  checked={onlyOutbid}
                  onChange={(e) => setOnlyOutbid(e.target.checked)}
                  className="accent-[var(--eve-accent)]"
                />
                <span>Undercut / Overbid Only</span>
              </label>
            </div>
            <div className="text-[11px] text-eve-muted">
              <span className="mr-3 inline-block h-2 w-2 bg-rose-500/80" /> Undercut / Overbid
              <span className="ml-3 mr-1 inline-block h-2 w-2 bg-emerald-500/80" /> Top Price
            </div>
          </div>

          <div className="photon-panel flex-1 overflow-auto">
            {ordersLoading && orders.length === 0 ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-eve-muted">
                <Loader2 className="h-4 w-4 animate-spin text-eve-accent" />
                Loading active market orders &amp; comparing hub prices...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-eve-muted">
                No active orders found.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 border-b border-eve-border bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">My Price</th>
                    <th className="px-3 py-2 text-right">Hub Best</th>
                    <th className="px-3 py-2 text-right">Volume</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2 text-right">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/40">
                  {filteredOrders.map((o) => (
                    <tr
                      key={o.orderId}
                      className={
                        o.isUndercutOrOverbid
                          ? 'border-l-2 border-l-rose-500/80 bg-rose-950/35 hover:bg-rose-950/55'
                          : 'border-l-2 border-l-emerald-500/80 bg-emerald-950/25 hover:bg-emerald-950/45'
                      }
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <EveIcon path={`types/${o.typeId}/icon?size=64`} size={22} alt={o.typeName} />
                          <span className="font-medium text-eve-text">{o.typeName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            o.isBuyOrder
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {o.isBuyOrder ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {o.isUndercutOrOverbid ? (
                          <span className="font-semibold text-rose-300">
                            {o.isBuyOrder ? 'Overbid' : 'Undercut'} ({formatIsk(Math.abs(o.priceDiff))})
                          </span>
                        ) : (
                          <span className="font-semibold text-emerald-300">
                            {o.isBuyOrder ? 'Top Bid' : 'Best Sell'}
                          </span>
                        )}
                      </td>
                      <td className="num-mono px-3 py-2 text-right text-eve-text">
                        {formatIsk(o.price)}
                      </td>
                      <td className="num-mono px-3 py-2 text-right text-eve-muted">
                        {o.hubBestPrice > 0 ? formatIsk(o.hubBestPrice) : '—'}
                      </td>
                      <td className="num-mono px-3 py-2 text-right text-eve-text">
                        {o.volumeRemain.toLocaleString()} / {o.volumeTotal.toLocaleString()}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-eve-muted" title={o.locationName}>
                        {o.locationName}
                      </td>
                      <td className="px-3 py-2 text-eve-text">{o.characterName}</td>
                      <td className="num-mono px-3 py-2 text-right text-eve-muted">
                        {formatDate(o.expiresAt, settings?.dateFormat, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'contracts' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={contractTypeFilter}
              onChange={(e) => setContractTypeFilter(e.target.value)}
              className="border border-eve-border bg-eve-bg px-2.5 py-1 text-eve-text"
            >
              <option value="all">All Types</option>
              <option value="item_exchange">Item Exchange</option>
              <option value="courier">Courier</option>
              <option value="auction">Auction</option>
            </select>
            <div className="flex items-center gap-1">
              {(
                [
                  ['active', `Active (${activeContractCount})`],
                  ['history', `Contract History (${historyContractCount})`],
                  ['all', `All (${contracts.length})`]
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setContractStatusFilter(mode)}
                  className={`border px-2.5 py-1 ${
                    contractStatusFilter === mode
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="photon-panel flex-1 overflow-auto">
            {contractsLoading && contracts.length === 0 ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-eve-muted">
                <Loader2 className="h-4 w-4 animate-spin text-eve-accent" />
                Loading character contracts...
              </div>
            ) : filteredContracts.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-eve-muted">
                No contracts match the selected filter.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 border-b border-eve-border bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Title / Owner</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Issuer → Assignee</th>
                    <th className="px-3 py-2 text-right">Price / Reward</th>
                    <th className="px-3 py-2 text-right">Collateral</th>
                    <th className="px-3 py-2 text-right">Volume</th>
                    <th className="px-3 py-2">Route / Location</th>
                    <th className="px-3 py-2 text-right">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/50">
                  {filteredContracts.map((c) => {
                    const isOpen = expandedContractId === c.contractId;
                    const detail = contractDetails[c.contractId];
                    return (
                      <>
                        <tr
                          key={c.contractId}
                          onClick={() => void toggleContractExpand(c)}
                          className="cursor-pointer hover:bg-eve-elevated/50"
                        >
                          <td className="px-3 py-2 uppercase text-[10px] font-semibold text-eve-accent">
                            {c.type.replace('_', ' ')}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-eve-text">{c.title || `Contract #${c.contractId}`}</div>
                            <div className="text-[10px] text-eve-muted">{c.characterName}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
                                c.status.startsWith('finished')
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : c.status === 'outstanding' || c.status === 'in_progress'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {c.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-eve-muted">
                            {c.issuerName} → {c.assigneeName}
                          </td>
                          <td className="num-mono px-3 py-2 text-right text-eve-text">
                            {c.type === 'courier' ? formatIsk(c.reward) : formatIsk(c.price)}
                          </td>
                          <td className="num-mono px-3 py-2 text-right text-eve-muted">
                            {c.collateral > 0 ? formatIsk(c.collateral) : '—'}
                          </td>
                          <td className="num-mono px-3 py-2 text-right text-eve-muted">
                            {c.volume > 0 ? formatVolume(c.volume) : '—'}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-eve-muted" title={`${c.startLocationName} → ${c.endLocationName}`}>
                            {c.startLocationName}
                            {c.endLocationId && c.endLocationId !== c.startLocationId
                              ? ` → ${c.endLocationName}`
                              : ''}
                          </td>
                          <td className="num-mono px-3 py-2 text-right text-eve-muted">
                            {formatDate(c.dateExpired, settings?.dateFormat, true)}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${c.contractId}-detail`} className="bg-eve-bg/70">
                            <td colSpan={9} className="px-6 py-3">
                              {!detail ? (
                                <div className="text-xs text-eve-muted">Loading contract items &amp; bids...</div>
                              ) : (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                  <div>
                                    <div className="mb-1 text-[10px] font-semibold uppercase text-eve-accent">
                                      Items ({detail.items.length})
                                    </div>
                                    {detail.items.length === 0 ? (
                                      <div className="text-[11px] text-eve-muted">No items listed.</div>
                                    ) : (
                                      <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-eve-text">
                                        {detail.items.map((it) => (
                                          <li key={it.recordId}>
                                            {it.quantity.toLocaleString()}x {it.typeName}{' '}
                                            <span className="text-eve-muted">
                                              ({it.isIncluded ? 'Included' : 'Requested'})
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  {c.type === 'auction' && (
                                    <div>
                                      <div className="mb-1 text-[10px] font-semibold uppercase text-eve-accent">
                                        Auction Bids ({detail.bids.length})
                                      </div>
                                      {detail.bids.length === 0 ? (
                                        <div className="text-[11px] text-eve-muted">No bids yet.</div>
                                      ) : (
                                        <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-eve-text">
                                          {detail.bids.map((b) => (
                                            <li key={b.bidId}>
                                              {b.bidderName}: <span className="num-mono">{formatIsk(b.amount)}</span>{' '}
                                              <span className="text-eve-muted">
                                                ({formatDate(b.dateBid, settings?.dateFormat, true)})
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'market' && (
        <>
      {/* Top Search & Hub Selector (z-30 so dropdown floats above chart panel) */}
      <div className="photon-panel relative z-30 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="relative flex items-center gap-2">
          <LineChart className="h-4 w-4 text-eve-accent" />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-eve-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={async (e) => {
                const q = e.target.value;
                setSearchQuery(q);
                if (q.length >= 2) {
                  const hits = await window.eveLens.sde.searchTypes(q, 30);
                  setSearchHits(hits.filter((i) => i.marketGroupId !== null).slice(0, 12));
                } else {
                  setSearchHits([]);
                }
              }}
              placeholder="Search tradable item in SDE..."
              className="w-72 border border-eve-border bg-eve-bg py-1 pl-8 pr-3 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
            />
            {searchHits.length > 0 && (
              <div className="photon-panel absolute left-0 right-0 top-full z-30 max-h-56 overflow-y-auto shadow-2xl">
                {searchHits.map((t) => (
                  <button
                    key={t.typeId}
                    type="button"
                    onClick={() => void selectType(t)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                  >
                    <EveIcon path={`types/${t.typeId}/icon?size=64`} size={20} alt={t.typeName} />
                    <span className="truncate text-eve-text">{t.typeName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TRADE_HUBS.map((hub) => (
            <button
              key={hub.regionId}
              type="button"
              onClick={() => setRegionId(hub.regionId)}
              className={`border px-2.5 py-1 text-[11px] ${
                regionId === hub.regionId
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              {hub.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* Chart + Add Investment */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="photon-panel flex h-72 flex-col p-3 lg:col-span-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider">
            <span>
              {selectedItem ? `${selectedItem.typeName} — 60d Market History` : 'Select an Item to View Price History'}
            </span>
            {selectedItem && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-normal normal-case">
                <span>
                  Buy: <strong className="num-mono text-eve-text">{formatIsk(quote?.buyMax ?? 0)}</strong>
                </span>
                <span>
                  Sell: <strong className="num-mono text-eve-accent">{formatIsk(quote?.sellMin ?? 0)}</strong>
                </span>
                {latestVelocity && (
                  <span className="text-eve-muted">
                    Velocity:{' '}
                    <strong className="num-mono text-eve-text">
                      {latestVelocity.volume.toLocaleString()}
                    </strong>{' '}
                    units sold on <span className="num-mono">{latestVelocity.date}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {history.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-eve-muted">
                {selectedItem
                  ? selectedItem.marketGroupId === null
                    ? "This item can't be sold on local markets."
                    : 'No market data available for this item in the selected region.'
                  : 'Search and click an item above to load ESI historical prices.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8b9bb4' }} minTickGap={24} />
                  <YAxis
                    yAxisId="price"
                    tick={{ fontSize: 10, fill: '#8b9bb4' }}
                    tickFormatter={(v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString())}
                    width={64}
                  />
                  <YAxis
                    yAxisId="vol"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v))}
                    width={46}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#131822', borderColor: '#232d3f', fontSize: 11 }}
                    formatter={(val: number, name: string) =>
                      name === 'volume' ? [`${val.toLocaleString()} units`, 'Velocity'] : [formatIsk(val), 'Avg Price']
                    }
                  />
                  <Bar
                    yAxisId="vol"
                    dataKey="volume"
                    fill="rgba(245, 158, 11, 0.28)"
                    barSize={6}
                  />
                  <Area
                    yAxisId="price"
                    type="monotone"
                    dataKey="average"
                    stroke="var(--eve-accent)"
                    fill="var(--eve-accent-muted)"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <form onSubmit={(e) => void handleAddInvestment(e)} className="photon-panel flex flex-col justify-between gap-2 p-3 lg:col-span-4">
          <div className="border-b border-eve-border pb-2 text-xs font-semibold uppercase tracking-wider">
            Log Personal Investment
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Quantity</span>
              <input
                type="number"
                value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)}
                className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Buy Price (ISK)</span>
              <input
                type="number"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="Unit ISK"
                className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Broker Fee %</span>
              <input
                type="number"
                step="0.1"
                value={brokerPct}
                onChange={(e) => setBrokerPct(e.target.value)}
                className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Sales Tax %</span>
              <input
                type="number"
                step="0.1"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={!selectedItem}
            className="inline-flex items-center justify-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted py-1.5 text-xs font-semibold uppercase tracking-wider text-eve-accent disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Track {selectedItem?.typeName ?? 'Item'}
          </button>
        </form>
      </div>

      {/* Investments Table */}
      <div className="photon-panel flex min-h-0 flex-1 flex-col">
        <div className="photon-header px-3 py-2 text-xs font-semibold uppercase tracking-wider">
          Tracked Investments ({investments.length})
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
              <tr className="border-b border-eve-border">
                <SortableHeader label="Item" field="typeName" activeField={sortBy} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Qty" field="quantity" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Buy Price" field="buyPrice" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Hub Sell" field="currentSellPrice" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Net Profit (After Fees)" field="netProfit" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-eve-border/50">
              {sortedInvestments.map((inv) => {
                const profit = inv.netProfit ?? 0;
                return (
                  <tr key={inv.id} className="hover:bg-eve-elevated/50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <EveIcon path={`types/${inv.typeId}/icon?size=64`} size={22} alt={inv.typeName} />
                        <span className="font-medium text-eve-text">{inv.typeName}</span>
                        {inv.status === 'SOLD' && (
                          <span className="border border-eve-success/50 px-1 text-[10px] text-eve-success">
                            SOLD
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="num-mono px-3 py-2 text-right">{inv.quantity.toLocaleString()}</td>
                    <td className="num-mono px-3 py-2 text-right text-eve-muted">
                      {formatIsk(inv.buyPrice)}
                    </td>
                    <td className="num-mono px-3 py-2 text-right text-eve-text">
                      {formatIsk(inv.currentSellPrice ?? 0)}
                    </td>
                    <td
                      className={`num-mono px-3 py-2 text-right font-semibold ${
                        profit >= 0 ? 'text-eve-success' : 'text-eve-danger'
                      }`}
                    >
                      {formatIsk(profit)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1.5">
                        {inv.status === 'HOLDING' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await window.eveLens.market.markInvestmentSold(
                                inv.id,
                                inv.currentSellPrice ?? inv.buyPrice
                              );
                              await loadInvestments();
                            }}
                            title="Mark Sold at Current Hub Price"
                            className="border border-eve-border p-1 text-eve-success hover:border-eve-success"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteInvId(inv.id)}
                          className="border border-eve-border p-1 text-eve-muted hover:text-eve-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmModal
        open={confirmDeleteInvId !== null}
        title="Delete Investment"
        onCancel={() => setConfirmDeleteInvId(null)}
        onConfirm={async () => {
          if (confirmDeleteInvId !== null) {
            await window.eveLens.market.deleteInvestment(confirmDeleteInvId);
            await loadInvestments();
          }
          setConfirmDeleteInvId(null);
        }}
      />
        </>
      )}
    </div>
  );
}
