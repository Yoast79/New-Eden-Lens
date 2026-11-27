import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { TRADE_HUBS } from '@shared/constants/eve';
import type { ModuleProps } from '@shared/types/module';
import type { CharacterLpBalanceDto, LpOfferDto } from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { SortableHeader, type SortDirection } from '@/core/components/SortableHeader';
import { formatIsk } from '@/core/utils/format';

const KNOWN_LP_CORPS: Array<{ id: number; name: string }> = [
  { id: 1000130, name: 'Sisters of EVE' },
  { id: 1000035, name: 'Caldari Navy' },
  { id: 1000120, name: 'Federation Navy' },
  { id: 1000051, name: 'Republic Fleet' },
  { id: 1000125, name: 'CONCORD' },
  { id: 1000129, name: 'Outer Ring Excavations' },
  { id: 1000160, name: 'Thukker Mix' },
  { id: 1000127, name: 'Guristas' },
  { id: 1000135, name: 'Serpentis Corporation' },
  { id: 1000134, name: 'Blood Raiders' },
  { id: 1000179, name: '24th Imperial Crusade' },
  { id: 1000180, name: 'State Protectorate' },
  { id: 1000181, name: 'Federal Defense Union' },
  { id: 1000182, name: 'Tribal Liberation Force' }
];

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  if (t.includes(q)) return 600;
  // Subsequence + bigram overlap so typos like "tukker" -> "Thukker Mix" score high
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  const subseqRatio = qi / q.length;
  let bigrams = 0;
  for (let i = 0; i < q.length - 1; i++) {
    if (t.includes(q.slice(i, i + 2))) bigrams++;
  }
  const bigramRatio = q.length > 1 ? bigrams / (q.length - 1) : 0;
  const score = subseqRatio * 300 + bigramRatio * 250;
  return score >= 180 ? score : 0;
}

type SortKey = 'typeName' | 'lpCost' | 'iskCost' | 'netProfit' | 'iskPerLp';

export function LpConversionModule({ activeCharacterId }: ModuleProps) {
  const [corpId, setCorpId] = useState<number>(1000130);
  const [corpName, setCorpName] = useState<string>('Sisters of EVE');
  const [corpQuery, setCorpQuery] = useState('');
  const [corpHits, setCorpHits] = useState<Array<{ id: number; name: string }>>([]);
  const [npcCorps, setNpcCorps] = useState<Array<{ id: number; name: string }>>(KNOWN_LP_CORPS);

  const [regionId, setRegionId] = useState<number>(TRADE_HUBS[0].regionId);
  const [priceMode, setPriceMode] = useState<'buy' | 'sell'>('buy');
  const [searchQuery, setSearchQuery] = useState('');
  const [minIskPerLp, setMinIskPerLp] = useState('0');

  const [offers, setOffers] = useState<LpOfferDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balances, setBalances] = useState<CharacterLpBalanceDto[]>([]);
  const [scopeMissing, setScopeMissing] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('iskPerLp');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const loadOffers = useCallback(async (targetCorpId: number, targetRegionId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.eveLens.market.getLpOffers(targetCorpId, targetRegionId);
      setOffers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LP store offers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOffers(corpId, regionId);
  }, [corpId, regionId, loadOffers]);

  useEffect(() => {
    if (!activeCharacterId) {
      setBalances([]);
      setScopeMissing(false);
      return;
    }
    void (async () => {
      try {
        const res = await window.eveLens.market.getCharacterLp(activeCharacterId);
        setBalances(res.balances);
        setScopeMissing(Boolean(res.scopeMissing));
      } catch {
        setBalances([]);
      }
    })();
  }, [activeCharacterId]);

  useEffect(() => {
    void window.eveLens.market
      .listNpcCorporations()
      .then((list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        const merged = [...KNOWN_LP_CORPS];
        const seen = new Set(merged.map((c) => c.id));
        for (const c of list) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            merged.push(c);
          }
        }
        setNpcCorps(merged);
      })
      .catch(() => {});
  }, []);

  // Live fuzzy suggestions restricted strictly to official NPC corporations
  useEffect(() => {
    const trimmed = corpQuery.trim();
    if (trimmed.length < 2) {
      setCorpHits([]);
      return;
    }
    const localMatches = npcCorps
      .map((c) => ({ ...c, score: fuzzyScore(trimmed, c.name) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ id, name }) => ({ id, name }));

    setCorpHits(localMatches);
  }, [corpQuery, npcCorps]);

  const handleSort = (key: string) => {
    const k = key as SortKey;
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const minRatio = Number(minIskPerLp) || 0;
    const filtered = offers.filter((o) => {
      const ratio = priceMode === 'buy' ? o.iskPerLpBuy : o.iskPerLpSell;
      if (ratio < minRatio) return false;
      if (q && !o.typeName.toLowerCase().includes(q) && !o.groupName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'typeName') return a.typeName.localeCompare(b.typeName) * mul;
      if (sortKey === 'lpCost') return (a.lpCost - b.lpCost) * mul;
      if (sortKey === 'iskCost') return (a.iskCost - b.iskCost) * mul;
      if (sortKey === 'netProfit') {
        const ap = priceMode === 'buy' ? a.netProfitBuy : a.netProfitSell;
        const bp = priceMode === 'buy' ? b.netProfitBuy : b.netProfitSell;
        return (ap - bp) * mul;
      }
      const ar = priceMode === 'buy' ? a.iskPerLpBuy : a.iskPerLpSell;
      const br = priceMode === 'buy' ? b.iskPerLpBuy : b.iskPerLpSell;
      return (ar - br) * mul;
    });

    return filtered;
  }, [offers, searchQuery, minIskPerLp, priceMode, sortKey, sortDir]);

  return (
    <div className="flex flex-col h-full gap-3 p-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            LP Conversion Optimizer
            <span className="ml-2 inline-flex items-center gap-1.5 rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-200">
              <EveIcon path={`corporations/${corpId}/logo?size=32`} size={16} alt={corpName} />
              {corpName}
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Showing LP store offers for <span className="text-slate-200 font-medium">{corpName}</span> against live trade hub orders.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadOffers(corpId, regionId)}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Store
        </button>
      </div>

      {/* Character LP Balances (if available) */}
      {balances.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-lg p-2">
          <span className="text-[11px] text-slate-400 mr-1">Pilot LP:</span>
          {balances.slice(0, 8).map((b) => (
            <button
              key={b.corporationId}
              type="button"
              onClick={() => {
                setCorpId(b.corporationId);
                setCorpName(b.corporationName);
              }}
              className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                corpId === b.corporationId
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              {b.corporationName}: <span className="font-mono">{b.loyaltyPoints.toLocaleString()} LP</span>
            </button>
          ))}
        </div>
      )}

      {scopeMissing && activeCharacterId && (
        <div className="px-3 py-1.5 rounded bg-amber-950/40 border border-amber-800/50 text-[11px] text-amber-200">
          Character LP balances require ESI scope <code className="font-mono">esi-characters.read_loyalty.v1</code>; public LP stores still work below.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {KNOWN_LP_CORPS.slice(0, 7).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCorpId(c.id);
                setCorpName(c.name);
              }}
              className={`px-2 py-1 rounded text-[11px] border ${
                corpId === c.id
                  ? 'bg-sky-500/20 border-sky-500/60 text-sky-200'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            value={corpQuery}
            onChange={(e) => setCorpQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && corpHits.length > 0) {
                setCorpId(corpHits[0].id);
                setCorpName(corpHits[0].name);
                setCorpQuery('');
                setCorpHits([]);
              }
            }}
            placeholder="Search LP Store"
            className="w-52 bg-slate-950 border border-slate-700 rounded pl-2.5 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-500"
          />
          {corpQuery && (
            <button
              type="button"
              onClick={() => {
                setCorpQuery('');
                setCorpHits([]);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {corpHits.length > 0 && (
            <div className="absolute z-20 left-0 mt-1 w-64 bg-slate-950 border border-slate-700 rounded shadow-xl max-h-52 overflow-auto">
              {corpHits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCorpId(c.id);
                    setCorpName(c.name);
                    setCorpQuery('');
                    setCorpHits([]);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          value={regionId}
          onChange={(e) => setRegionId(Number(e.target.value))}
          className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
        >
          {TRADE_HUBS.map((h) => (
            <option key={h.regionId} value={h.regionId}>
              {h.shortName}
            </option>
          ))}
        </select>

        <div className="flex items-center rounded border border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setPriceMode('buy')}
            className={`px-2.5 py-1 text-xs ${
              priceMode === 'buy' ? 'bg-sky-600 text-white font-medium' : 'bg-slate-950 text-slate-400'
            }`}
          >
            Instant Buy
          </button>
          <button
            type="button"
            onClick={() => setPriceMode('sell')}
            className={`px-2.5 py-1 text-xs ${
              priceMode === 'sell' ? 'bg-sky-600 text-white font-medium' : 'bg-slate-950 text-slate-400'
            }`}
          >
            Sell Order
          </button>
        </div>

        <input
          type="number"
          value={minIskPerLp}
          onChange={(e) => setMinIskPerLp(e.target.value)}
          placeholder="Min ISK/LP"
          className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100"
          title="Minimum ISK per LP"
        />

        <div className="relative flex-1 min-w-[150px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter items..."
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

      {error && (
        <div className="px-3 py-2 rounded bg-rose-950/60 border border-rose-800/70 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-slate-900/50 border border-slate-800 rounded-lg">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-950/95 text-slate-400 uppercase text-[10px] border-b border-slate-800">
            <tr>
              <SortableHeader label="Reward Item" field="typeName" activeField={sortKey} direction={sortDir} onSort={handleSort} />
              <th className="py-2 px-3">NPC Corp</th>
              <th className="py-2 px-3">Qty</th>
              <SortableHeader label="LP Cost" field="lpCost" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="ISK Fee" field="iskCost" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
              <th className="py-2 px-3">Required Items</th>
              <th className="py-2 px-3 text-right">Hub Price</th>
              <SortableHeader label="Net Profit" field="netProfit" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="ISK / LP" field="iskPerLp" activeField={sortKey} direction={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading && offers.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-sky-400" />
                  Loading LP store &amp; fetching hub prices...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  No LP offers match the current filter.
                </td>
              </tr>
            ) : (
              rows.map((o) => {
                const unitPrice = priceMode === 'buy' ? o.itemBuyPrice : o.itemSellPrice;
                const netProfit = priceMode === 'buy' ? o.netProfitBuy : o.netProfitSell;
                const iskPerLp = priceMode === 'buy' ? o.iskPerLpBuy : o.iskPerLpSell;
                return (
                  <tr key={o.offerId} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <EveIcon path={`types/${o.typeId}/icon?size=64`} size={24} alt={o.typeName} />
                        <div>
                          <div className="text-slate-100 font-medium">{o.typeName}</div>
                          <div className="text-[10px] text-slate-400">{o.groupName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <EveIcon path={`corporations/${o.corporationId}/logo?size=32`} size={18} alt={corpName} />
                        <span>{corpName}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-300">x{o.quantity}</td>
                    <td className="py-2 px-3 text-right font-mono text-amber-300">
                      {o.lpCost.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-300">
                      {formatIsk(o.iskCost)}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-400">
                      {o.requiredItems.length === 0 ? (
                        <span className="text-slate-600">None</span>
                      ) : (
                        <div>
                          {o.requiredItems.map((r) => (
                            <div key={r.typeId}>
                              {r.quantity}x {r.typeName}
                            </div>
                          ))}
                          <div className="text-[10px] text-slate-500">
                            Cost: {formatIsk(o.requiredItemsCost)}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-200">
                      {unitPrice > 0 ? formatIsk(unitPrice * o.quantity) : '—'}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono ${
                        netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatIsk(netProfit)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono font-semibold ${
                        iskPerLp >= 1500
                          ? 'text-emerald-400'
                          : iskPerLp >= 800
                            ? 'text-amber-300'
                            : iskPerLp > 0
                              ? 'text-slate-200'
                              : 'text-rose-400'
                      }`}
                    >
                      {Math.round(iskPerLp).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
