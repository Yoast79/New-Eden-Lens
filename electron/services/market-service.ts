import type { EsiRequestOptions } from '@shared/types/ipc';
import type {
  CharacterContractDto,
  CharacterLpBalanceDto,
  CharacterMarketOrderDto,
  ContractDetailDto,
  LpOfferDto,
  MarketHistoryPoint,
  MarketInvestmentRow,
  MarketQuote
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { EsiClient } from './esi-client';

interface EsiMarketOrder {
  order_id: number;
  type_id: number;
  is_buy_order: boolean;
  price: number;
  volume_remain: number;
  min_volume: number;
  location_id: number;
  system_id: number;
  issued: string;
  duration: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const PLEX_TYPE_ID = 44992;
const PLEX_GLOBAL_REGION_ID = 19000001;

function resolveEffectiveRegion(regionId: number, typeId: number): number {
  return typeId === PLEX_TYPE_ID ? PLEX_GLOBAL_REGION_ID : regionId;
}

export class MarketService {
  private npcCorpCache: Array<{ id: number; name: string }> | null = null;
  private ordersCache = new Map<string, { at: number; data: CharacterMarketOrderDto[] }>();
  private contractsCache = new Map<string, { at: number; data: CharacterContractDto[] }>();
  private failedStructureIds = new Set<number>();

  constructor(
    private readonly db: LocalDatabase,
    private readonly esiClient: EsiClient
  ) {}

  async getQuotesForTypes(regionId: number, typeIds: number[]): Promise<Record<number, MarketQuote>> {
    const uniqueIds = Array.from(new Set(typeIds.filter((id) => id > 0)));
    const result: Record<number, MarketQuote> = {};
    const now = Date.now();
    const staleIds: number[] = [];

    for (const typeId of uniqueIds) {
      const effRegion = resolveEffectiveRegion(regionId, typeId);
      const cached = this.readCachedQuote(effRegion, typeId, now);
      if (cached) {
        result[typeId] = { ...cached, regionId };
      } else {
        staleIds.push(typeId);
      }
    }

    // Fetch missing/stale types in small concurrent batches
    const concurrency = 6;
    for (let i = 0; i < staleIds.length; i += concurrency) {
      const batch = staleIds.slice(i, i + concurrency);
      const quotes = await Promise.all(
        batch.map(async (typeId) => {
          const effRegion = resolveEffectiveRegion(regionId, typeId);
          try {
            const q = await this.fetchAndCacheTypeOrders(effRegion, typeId);
            return { ...q, regionId };
          } catch {
            return {
              typeId,
              regionId,
              buyMax: 0,
              sellMin: 0,
              split: 0,
              buyVolume: 0,
              sellVolume: 0,
              fetchedAt: Date.now()
            } satisfies MarketQuote;
          }
        })
      );
      for (const q of quotes) {
        result[q.typeId] = q;
      }
    }

    return result;
  }

  private readCachedQuote(regionId: number, typeId: number, now: number): MarketQuote | null {
    const rows = this.db.all<{
      is_buy_order: number;
      price: number;
      volume_remain: number;
      fetched_at: number;
    }>(
      `SELECT is_buy_order, price, volume_remain, fetched_at
       FROM market_orders_cache
       WHERE region_id = ? AND type_id = ?`,
      [regionId, typeId]
    );

    if (rows.length === 0) return null;
    const fetchedAt = rows[0].fetched_at;
    if (now - fetchedAt > CACHE_TTL_MS) return null;

    return summarizeOrders(regionId, typeId, rows, fetchedAt);
  }

  private async fetchAndCacheTypeOrders(regionId: number, typeId: number): Promise<MarketQuote> {
    const opts: EsiRequestOptions = {
      query: { order_type: 'all', type_id: typeId, page: 1 }
    };
    const orders = await this.esiClient.request<EsiMarketOrder[]>(
      `/markets/${regionId}/orders`,
      opts
    );

    const now = Date.now();
    this.db.transaction((raw) => {
      raw.run('DELETE FROM market_orders_cache WHERE region_id = ? AND type_id = ?', [
        regionId,
        typeId
      ]);
      const stmt = raw.prepare(
        `INSERT OR REPLACE INTO market_orders_cache (
           region_id, order_id, type_id, is_buy_order, price, volume_remain,
           min_volume, location_id, system_id, issued, duration, fetched_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      try {
        for (const o of orders) {
          stmt.run([
            regionId,
            o.order_id,
            o.type_id,
            o.is_buy_order ? 1 : 0,
            o.price,
            o.volume_remain,
            o.min_volume,
            o.location_id,
            o.system_id,
            o.issued,
            o.duration,
            now
          ]);
        }
      } finally {
        stmt.free();
      }
    });

    const mapped = orders.map((o) => ({
      is_buy_order: o.is_buy_order ? 1 : 0,
      price: o.price,
      volume_remain: o.volume_remain
    }));
    return summarizeOrders(regionId, typeId, mapped, now);
  }

  async getMarketHistory(regionId: number, typeId: number): Promise<MarketHistoryPoint[]> {
    const effRegion = resolveEffectiveRegion(regionId, typeId);
    const cached = this.db.all<{
      date: string;
      average: number;
      highest: number;
      lowest: number;
      order_count: number;
      volume: number;
      fetched_at: number;
    }>(
      `SELECT date, average, highest, lowest, order_count, volume, fetched_at
       FROM market_history_cache
       WHERE region_id = ? AND type_id = ?
       ORDER BY date ASC`,
      [effRegion, typeId]
    );

    const now = Date.now();
    if (cached.length > 0 && now - cached[0].fetched_at < 60 * 60 * 1000) {
      return cached.map((r) => ({
        date: r.date,
        average: r.average,
        highest: r.highest,
        lowest: r.lowest,
        orderCount: r.order_count,
        volume: r.volume
      }));
    }

    const remote = await this.esiClient.request<
      Array<{
        date: string;
        average: number;
        highest: number;
        lowest: number;
        order_count: number;
        volume: number;
      }>
    >(`/markets/${effRegion}/history`, { query: { type_id: typeId } });

    this.db.transaction((raw) => {
      raw.run('DELETE FROM market_history_cache WHERE region_id = ? AND type_id = ?', [
        effRegion,
        typeId
      ]);
      const stmt = raw.prepare(
        `INSERT INTO market_history_cache (
           region_id, type_id, date, average, highest, lowest, order_count, volume, fetched_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      try {
        for (const p of remote) {
          stmt.run([
            effRegion,
            typeId,
            p.date,
            p.average,
            p.highest,
            p.lowest,
            p.order_count,
            p.volume,
            now
          ]);
        }
      } finally {
        stmt.free();
      }
    });

    return remote.map((p) => ({
      date: p.date,
      average: p.average,
      highest: p.highest,
      lowest: p.lowest,
      orderCount: p.order_count,
      volume: p.volume
    }));
  }

  async listInvestments(characterId: number | null): Promise<MarketInvestmentRow[]> {
    const where = characterId !== null ? 'WHERE i.character_id = ? OR i.character_id IS NULL' : '';
    const rows = this.db.all<{
      id: number;
      character_id: number | null;
      type_id: number;
      type_name: string | null;
      quantity: number;
      buy_price: number;
      target_region_id: number;
      broker_fee_pct: number;
      sales_tax_pct: number;
      status: 'HOLDING' | 'SOLD';
      sold_price: number | null;
      notes: string | null;
      created_at: number;
    }>(
      `SELECT i.*, t.type_name
       FROM market_investments i
       LEFT JOIN sde_inv_types t ON t.type_id = i.type_id
       ${where}
       ORDER BY i.created_at DESC`,
      characterId !== null ? [characterId] : undefined
    );

    const byRegion = new Map<number, number[]>();
    for (const r of rows) {
      const list = byRegion.get(r.target_region_id) ?? [];
      list.push(r.type_id);
      byRegion.set(r.target_region_id, list);
    }

    const quotesByRegion = new Map<number, Record<number, MarketQuote>>();
    for (const [regId, ids] of byRegion.entries()) {
      quotesByRegion.set(regId, await this.getQuotesForTypes(regId, ids));
    }

    return rows.map((r) => {
      const quote = quotesByRegion.get(r.target_region_id)?.[r.type_id];
      const currentSell = quote?.sellMin ?? 0;
      const effectiveSell = r.status === 'SOLD' ? (r.sold_price ?? currentSell) : currentSell;
      const gross = effectiveSell * r.quantity;
      const cost = r.buy_price * r.quantity;
      const fees = gross * ((r.broker_fee_pct + r.sales_tax_pct) / 100);
      const netProfit = effectiveSell > 0 ? gross - fees - cost : 0;

      return {
        id: r.id,
        characterId: r.character_id,
        typeId: r.type_id,
        typeName: r.type_name ?? `Type #${r.type_id}`,
        quantity: r.quantity,
        buyPrice: r.buy_price,
        targetRegionId: r.target_region_id,
        brokerFeePct: r.broker_fee_pct,
        salesTaxPct: r.sales_tax_pct,
        status: r.status,
        soldPrice: r.sold_price,
        notes: r.notes ?? '',
        createdAt: r.created_at,
        currentSellPrice: currentSell,
        netProfit
      };
    });
  }

  addInvestment(input: {
    characterId: number | null;
    typeId: number;
    quantity: number;
    buyPrice: number;
    targetRegionId: number;
    brokerFeePct: number;
    salesTaxPct: number;
    notes?: string;
  }): void {
    this.db.run(
      `INSERT INTO market_investments (
         character_id, type_id, quantity, buy_price, target_region_id,
         broker_fee_pct, sales_tax_pct, status, notes, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'HOLDING', ?, ?)`,
      [
        input.characterId,
        input.typeId,
        input.quantity,
        input.buyPrice,
        input.targetRegionId,
        input.brokerFeePct,
        input.salesTaxPct,
        input.notes ?? '',
        Date.now()
      ]
    );
  }

  markInvestmentSold(id: number, soldPrice: number): void {
    this.db.run("UPDATE market_investments SET status = 'SOLD', sold_price = ? WHERE id = ?", [
      soldPrice,
      id
    ]);
  }

  deleteInvestment(id: number): void {
    this.db.run('DELETE FROM market_investments WHERE id = ?', [id]);
  }

  async getLpOffers(corporationId: number, regionId: number): Promise<LpOfferDto[]> {
    interface EsiLpOffer {
      offer_id: number;
      type_id: number;
      quantity: number;
      lp_cost: number;
      isk_cost: number;
      ak_cost?: number;
      required_items: Array<{ type_id: number; quantity: number }>;
    }

    const res = await fetch(
      `https://esi.evetech.net/latest/loyalty/stores/${corporationId}/offers/?datasource=tranquility`,
      { headers: { 'User-Agent': 'NewEdenLens/0.1.0', Accept: 'application/json' } }
    );
    if (!res.ok) {
      throw new Error(`ESI LP store returned HTTP ${res.status}`);
    }
    const rawOffers = (await res.json()) as EsiLpOffer[];
    if (!Array.isArray(rawOffers) || rawOffers.length === 0) return [];

    const allTypeIds = new Set<number>();
    for (const o of rawOffers) {
      if (o.type_id > 0) allTypeIds.add(o.type_id);
      for (const req of o.required_items ?? []) {
        if (req.type_id > 0) allTypeIds.add(req.type_id);
      }
    }

    const typeMeta = new Map<number, { typeName: string; groupName: string }>();
    if (allTypeIds.size > 0) {
      const idsArr = Array.from(allTypeIds);
      const ph = idsArr.map(() => '?').join(',');
      const rows = this.db.all<{ type_id: number; type_name: string; group_name: string | null }>(
        `SELECT t.type_id, t.type_name, g.group_name
         FROM sde_inv_types t
         LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
         WHERE t.type_id IN (${ph})`,
        idsArr
      );
      for (const r of rows) {
        typeMeta.set(r.type_id, { typeName: r.type_name, groupName: r.group_name ?? 'Item' });
      }
    }

    const quotes = await this.getQuotesForTypes(regionId, Array.from(allTypeIds));

    const results: LpOfferDto[] = rawOffers.map((o) => {
      const meta = typeMeta.get(o.type_id);
      const quote = quotes[o.type_id];
      const itemBuyPrice = quote?.buyMax ?? 0;
      const itemSellPrice = quote?.sellMin ?? 0;

      let requiredItemsCost = 0;
      const requiredItems = (o.required_items ?? []).map((req) => {
        const rq = quotes[req.type_id];
        const unitPrice = rq?.sellMin && rq.sellMin > 0 ? rq.sellMin : (rq?.buyMax ?? 0);
        requiredItemsCost += unitPrice * req.quantity;
        return {
          typeId: req.type_id,
          typeName: typeMeta.get(req.type_id)?.typeName ?? `Type ${req.type_id}`,
          quantity: req.quantity,
          unitPrice
        };
      });

      const totalCost = (o.isk_cost ?? 0) + requiredItemsCost;
      const netProfitBuy = itemBuyPrice * o.quantity - totalCost;
      const netProfitSell = itemSellPrice * o.quantity - totalCost;
      const iskPerLpBuy = o.lp_cost > 0 ? netProfitBuy / o.lp_cost : 0;
      const iskPerLpSell = o.lp_cost > 0 ? netProfitSell / o.lp_cost : 0;

      return {
        offerId: o.offer_id,
        corporationId,
        typeId: o.type_id,
        typeName: meta?.typeName ?? `Type ${o.type_id}`,
        groupName: meta?.groupName ?? 'Item',
        quantity: o.quantity,
        lpCost: o.lp_cost,
        iskCost: o.isk_cost,
        akCost: o.ak_cost ?? 0,
        requiredItems,
        itemBuyPrice,
        itemSellPrice,
        requiredItemsCost,
        netProfitBuy,
        netProfitSell,
        iskPerLpBuy,
        iskPerLpSell
      };
    });

    results.sort((a, b) => b.iskPerLpBuy - a.iskPerLpBuy);
    return results;
  }

  async getCharacterLp(
    characterId: number
  ): Promise<{ balances: CharacterLpBalanceDto[]; scopeMissing?: boolean }> {
    try {
      const rows = await this.esiClient.request<Array<{ corporation_id: number; loyalty_points: number }>>(
        `/characters/${characterId}/loyalty/points/`,
        { characterId }
      );
      if (!Array.isArray(rows) || rows.length === 0) return { balances: [] };

      const corpIds = Array.from(new Set(rows.map((r) => r.corporation_id)));
      const nameMap = new Map<number, string>();
      try {
        const res = await fetch('https://esi.evetech.net/latest/universe/names/?datasource=tranquility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'NewEdenLens/0.1.0' },
          body: JSON.stringify(corpIds)
        });
        if (res.ok) {
          const names = (await res.json()) as Array<{ id: number; name: string }>;
          for (const n of names) nameMap.set(n.id, n.name);
        }
      } catch {
        // ignore universe/names failure
      }

      const balances: CharacterLpBalanceDto[] = rows
        .map((r) => ({
          corporationId: r.corporation_id,
          corporationName: nameMap.get(r.corporation_id) ?? `Corp ${r.corporation_id}`,
          loyaltyPoints: r.loyalty_points
        }))
        .sort((a, b) => b.loyaltyPoints - a.loyaltyPoints);

      return { balances };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('scope')) {
        return { balances: [], scopeMissing: true };
      }
      throw err;
    }
  }

  async listNpcCorporations(): Promise<Array<{ id: number; name: string }>> {
    if (this.npcCorpCache) return this.npcCorpCache;

    const cachedRow = this.db.get<{ value: string; updated_at: number }>(
      "SELECT value, updated_at FROM app_settings WHERE key = 'npcLpCorpsCache'"
    );
    if (cachedRow && Date.now() - cachedRow.updated_at < 7 * 24 * 60 * 60 * 1000) {
      try {
        const parsed = JSON.parse(cachedRow.value) as Array<{ id: number; name: string }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.npcCorpCache = parsed;
          return parsed;
        }
      } catch {
        // ignore corrupt cache
      }
    }

    const res = await fetch('https://esi.evetech.net/latest/corporations/npccorps/?datasource=tranquility', {
      headers: { 'User-Agent': 'NewEdenLens/0.1.0', Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const ids = (await res.json()) as number[];
    if (!Array.isArray(ids) || ids.length === 0) return [];

    // Filter strictly to NPC corporations that actually have a non-empty LP store
    const lpCorpIds: number[] = [];
    for (let i = 0; i < ids.length; i += 25) {
      const batch = ids.slice(i, i + 25);
      await Promise.all(
        batch.map(async (id) => {
          try {
            const storeRes = await fetch(
              `https://esi.evetech.net/latest/loyalty/stores/${id}/offers/?datasource=tranquility`,
              { headers: { 'User-Agent': 'NewEdenLens/0.1.0', Accept: 'application/json' } }
            );
            if (storeRes.ok) {
              const offers = (await storeRes.json()) as unknown[];
              if (Array.isArray(offers) && offers.length > 0) lpCorpIds.push(id);
            }
          } catch {
            // ignore transient store probe error
          }
        })
      );
    }

    const resolved: Array<{ id: number; name: string }> = [];
    for (let i = 0; i < lpCorpIds.length; i += 500) {
      const chunk = lpCorpIds.slice(i, i + 500);
      const nRes = await fetch('https://esi.evetech.net/latest/universe/names/?datasource=tranquility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'NewEdenLens/0.1.0' },
        body: JSON.stringify(chunk)
      }).catch(() => null);
      if (nRes && nRes.ok) {
        const names = (await nRes.json()) as Array<{ id: number; name: string }>;
        for (const n of names) {
          if (n.id && n.name) resolved.push({ id: n.id, name: n.name });
        }
      }
    }
    resolved.sort((a, b) => a.name.localeCompare(b.name));
    this.npcCorpCache = resolved;
    if (resolved.length > 0) {
      this.db.run(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('npcLpCorpsCache', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [JSON.stringify(resolved), Date.now()]
      );
    }
    return resolved;
  }

  private async resolveLocationNamesMap(
    locationIds: number[],
    characterId: number
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    const unique = Array.from(new Set(locationIds.filter((id) => id > 0)));
    if (unique.length === 0) return out;

    const ph = unique.map(() => '?').join(',');
    const cached = this.db.all<{ location_id: number; name: string }>(
      `SELECT location_id, name FROM location_names_cache WHERE location_id IN (${ph})`,
      unique
    );
    for (const r of cached) out.set(r.location_id, r.name);

    const missingStations = unique.filter((id) => !out.has(id) && id >= 60_000_000 && id < 64_000_000);
    if (missingStations.length > 0) {
      const resolved = await this.esiClient
        .request<Array<{ id: number; name: string }>>('/universe/names', {
          method: 'POST',
          body: missingStations.slice(0, 500)
        })
        .catch(() => []);
      const now = Date.now();
      for (const r of resolved) {
        out.set(r.id, r.name);
        this.db.run(
          'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)',
          [r.id, r.name, now]
        );
      }
    }

    const missingStructures = unique.filter(
      (id) => !out.has(id) && id >= 1_000_000_000_000 && !this.failedStructureIds.has(id)
    );
    for (let i = 0; i < missingStructures.length; i += 2) {
      const batch = missingStructures.slice(i, i + 2);
      await Promise.all(
        batch.map(async (sid) => {
          const info = await this.esiClient
            .request<{ name?: string }>(`/universe/structures/${sid}`, { characterId })
            .catch(() => null);
          if (info?.name) {
            out.set(sid, info.name);
            this.db.run(
              'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)',
              [sid, info.name, Date.now()]
            );
          } else {
            this.failedStructureIds.add(sid);
          }
        })
      );
    }

    return out;
  }

  async getCharacterOrders(
    characterId: number | null,
    forceRefresh = false
  ): Promise<CharacterMarketOrderDto[]> {
    const cacheKey = String(characterId ?? 'all');
    const cached = this.ordersCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.at < 60_000) {
      return cached.data;
    }
    interface EsiCharOrder {
      order_id: number;
      type_id: number;
      region_id: number;
      location_id: number;
      range: string;
      is_buy_order?: boolean;
      price: number;
      volume_total: number;
      volume_remain: number;
      issued: string;
      duration: number;
      escrow?: number;
    }

    const chars =
      characterId !== null
        ? this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters WHERE character_id = ?',
            [characterId]
          )
        : this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters'
          );

    const allRaw: Array<{ cid: number; cname: string; order: EsiCharOrder }> = [];
    for (const c of chars) {
      const orders = await this.esiClient
        .request<EsiCharOrder[]>(`/characters/${c.character_id}/orders/`, {
          characterId: c.character_id
        })
        .catch(() => []);
      for (const o of orders) {
        allRaw.push({ cid: c.character_id, cname: c.character_name, order: o });
      }
    }

    if (allRaw.length === 0) return [];

    const typeIds = Array.from(new Set(allRaw.map((x) => x.order.type_id)));
    const regionIds = Array.from(new Set(allRaw.map((x) => x.order.region_id)));
    const locationIds = Array.from(new Set(allRaw.map((x) => x.order.location_id)));

    const typeMap = new Map<number, string>();
    if (typeIds.length > 0) {
      const ph = typeIds.map(() => '?').join(',');
      const rows = this.db.all<{ type_id: number; type_name: string }>(
        `SELECT type_id, type_name FROM sde_inv_types WHERE type_id IN (${ph})`,
        typeIds
      );
      for (const r of rows) typeMap.set(r.type_id, r.type_name);
    }

    const regionMap = new Map<number, string>();
    if (regionIds.length > 0) {
      const ph = regionIds.map(() => '?').join(',');
      const rows = this.db.all<{ region_id: number; region_name: string }>(
        `SELECT region_id, region_name FROM sde_regions WHERE region_id IN (${ph})`,
        regionIds
      );
      for (const r of rows) regionMap.set(r.region_id, r.region_name);
    }

    const locMap = await this.resolveLocationNamesMap(locationIds, chars[0].character_id);

    // Fetch live hub quotes per region so we can highlight undercut / overbid orders
    const quotesByRegion = new Map<number, Record<number, MarketQuote>>();
    for (const rid of regionIds) {
      const rTypes = Array.from(
        new Set(allRaw.filter((x) => x.order.region_id === rid).map((x) => x.order.type_id))
      );
      const q = await this.getQuotesForTypes(rid, rTypes);
      quotesByRegion.set(rid, q);
    }

    const result = allRaw
      .map(({ cid, cname, order }) => {
        const isBuy = Boolean(order.is_buy_order);
        const quote = quotesByRegion.get(order.region_id)?.[order.type_id];
        const hubBestPrice = isBuy ? (quote?.buyMax ?? 0) : (quote?.sellMin ?? 0);
        const isUndercutOrOverbid = isBuy
          ? hubBestPrice > 0 && order.price < hubBestPrice
          : hubBestPrice > 0 && order.price > hubBestPrice;
        const priceDiff = hubBestPrice > 0 ? order.price - hubBestPrice : 0;
        const issuedMs = Date.parse(order.issued) || Date.now();
        const expiresAt = issuedMs + order.duration * 24 * 60 * 60 * 1000;

        return {
          orderId: order.order_id,
          characterId: cid,
          characterName: cname,
          typeId: order.type_id,
          typeName: typeMap.get(order.type_id) ?? `Type #${order.type_id}`,
          isBuyOrder: isBuy,
          price: order.price,
          hubBestPrice,
          priceDiff,
          isUndercutOrOverbid,
          volumeRemain: order.volume_remain,
          volumeTotal: order.volume_total,
          locationId: order.location_id,
          locationName: locMap.get(order.location_id) ?? `Location #${order.location_id}`,
          regionId: order.region_id,
          regionName: regionMap.get(order.region_id) ?? `Region #${order.region_id}`,
          issued: order.issued,
          duration: order.duration,
          expiresAt,
          escrow: order.escrow ?? 0,
          range: order.range
        };
      })
      .sort((a, b) => Number(b.isUndercutOrOverbid) - Number(a.isUndercutOrOverbid) || a.expiresAt - b.expiresAt);
    this.ordersCache.set(cacheKey, { at: Date.now(), data: result });
    return result;
  }

  async getCharacterContracts(
    characterId: number | null,
    forceRefresh = false
  ): Promise<CharacterContractDto[]> {
    const cacheKey = String(characterId ?? 'all');
    const cached = this.contractsCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.at < 60_000) {
      return cached.data;
    }
    interface EsiContract {
      contract_id: number;
      issuer_id: number;
      issuer_corporation_id: number;
      assignee_id: number;
      acceptor_id: number;
      start_location_id?: number;
      end_location_id?: number;
      type: 'unknown' | 'item_exchange' | 'auction' | 'courier' | 'loan';
      status: string;
      title?: string;
      for_corporation: boolean;
      date_issued: string;
      date_expired: string;
      date_accepted?: string;
      days_to_complete?: number;
      price?: number;
      reward?: number;
      collateral?: number;
      buyout?: number;
      volume?: number;
    }

    const chars =
      characterId !== null
        ? this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters WHERE character_id = ?',
            [characterId]
          )
        : this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters'
          );

    const rawList: Array<{ cid: number; cname: string; contract: EsiContract }> = [];
    const seenContractIds = new Set<number>();
    for (const c of chars) {
      const list = await this.esiClient
        .requestAllPages<EsiContract>(`/characters/${c.character_id}/contracts/`, {
          characterId: c.character_id
        })
        .catch(() => []);
      for (const ct of list) {
        if (seenContractIds.has(ct.contract_id)) continue;
        seenContractIds.add(ct.contract_id);
        rawList.push({ cid: c.character_id, cname: c.character_name, contract: ct });
      }
    }

    if (rawList.length === 0) return [];

    const entityIds = new Set<number>();
    const locIds: number[] = [];
    for (const { contract } of rawList) {
      if (contract.issuer_id > 0) entityIds.add(contract.issuer_id);
      if (contract.assignee_id > 0) entityIds.add(contract.assignee_id);
      if (contract.start_location_id) locIds.push(contract.start_location_id);
      if (contract.end_location_id) locIds.push(contract.end_location_id);
    }

    const nameMap = new Map<number, string>();
    if (entityIds.size > 0) {
      const resolved = await this.esiClient
        .request<Array<{ id: number; name: string }>>('/universe/names', {
          method: 'POST',
          body: Array.from(entityIds).slice(0, 500)
        })
        .catch(() => []);
      for (const r of resolved) nameMap.set(r.id, r.name);
    }

    const locMap = await this.resolveLocationNamesMap(locIds, chars[0].character_id);

    const result = rawList
      .map(({ cid, cname, contract }) => ({
        contractId: contract.contract_id,
        characterId: cid,
        characterName: cname,
        type: contract.type,
        status: contract.status,
        title: contract.title ?? '',
        issuerId: contract.issuer_id,
        issuerName: nameMap.get(contract.issuer_id) ?? `#${contract.issuer_id}`,
        assigneeId: contract.assignee_id,
        assigneeName: contract.assignee_id > 0 ? (nameMap.get(contract.assignee_id) ?? `#${contract.assignee_id}`) : 'Public',
        acceptorId: contract.acceptor_id,
        price: contract.price ?? 0,
        reward: contract.reward ?? 0,
        collateral: contract.collateral ?? 0,
        buyout: contract.buyout ?? 0,
        volume: contract.volume ?? 0,
        startLocationId: contract.start_location_id ?? null,
        startLocationName: contract.start_location_id
          ? (locMap.get(contract.start_location_id) ?? `Location #${contract.start_location_id}`)
          : '—',
        endLocationId: contract.end_location_id ?? null,
        endLocationName: contract.end_location_id
          ? (locMap.get(contract.end_location_id) ?? `Location #${contract.end_location_id}`)
          : '—',
        dateIssued: contract.date_issued,
        dateExpired: contract.date_expired,
        dateAccepted: contract.date_accepted ?? null,
        daysToComplete: contract.days_to_complete ?? 0,
        forCorporation: contract.for_corporation
      }))
      .sort((a, b) => Date.parse(b.dateIssued) - Date.parse(a.dateIssued));
    this.contractsCache.set(cacheKey, { at: Date.now(), data: result });
    return result;
  }

  async getContractDetails(
    characterId: number,
    contractId: number,
    contractType: string
  ): Promise<ContractDetailDto> {
    const [rawItems, rawBids] = await Promise.all([
      this.esiClient
        .request<
          Array<{
            record_id: number;
            type_id: number;
            quantity: number;
            is_included: boolean;
            is_singleton: boolean;
          }>
        >(`/characters/${characterId}/contracts/${contractId}/items/`, { characterId })
        .catch(() => []),
      contractType === 'auction'
        ? this.esiClient
            .request<
              Array<{ bid_id: number; bidder_id: number; amount: number; date_bid: string }>
            >(`/characters/${characterId}/contracts/${contractId}/bids/`, { characterId })
            .catch(() => [])
        : Promise.resolve([])
    ]);

    const typeIds = Array.from(new Set(rawItems.map((i) => i.type_id)));
    const typeMap = new Map<number, string>();
    if (typeIds.length > 0) {
      const ph = typeIds.map(() => '?').join(',');
      const rows = this.db.all<{ type_id: number; type_name: string }>(
        `SELECT type_id, type_name FROM sde_inv_types WHERE type_id IN (${ph})`,
        typeIds
      );
      for (const r of rows) typeMap.set(r.type_id, r.type_name);
    }

    const bidderIds = Array.from(new Set(rawBids.map((b) => b.bidder_id).filter((id) => id > 0)));
    const bidderMap = new Map<number, string>();
    if (bidderIds.length > 0) {
      const resolved = await this.esiClient
        .request<Array<{ id: number; name: string }>>('/universe/names', {
          method: 'POST',
          body: bidderIds
        })
        .catch(() => []);
      for (const r of resolved) bidderMap.set(r.id, r.name);
    }

    return {
      items: rawItems.map((i) => ({
        recordId: i.record_id,
        typeId: i.type_id,
        typeName: typeMap.get(i.type_id) ?? `Type #${i.type_id}`,
        quantity: i.quantity,
        isIncluded: i.is_included,
        isSingleton: i.is_singleton
      })),
      bids: rawBids.map((b) => ({
        bidId: b.bid_id,
        bidderId: b.bidder_id,
        bidderName: bidderMap.get(b.bidder_id) ?? `#${b.bidder_id}`,
        amount: b.amount,
        dateBid: b.date_bid
      }))
    };
  }
}

function summarizeOrders(
  regionId: number,
  typeId: number,
  orders: Array<{ is_buy_order: number; price: number; volume_remain: number }>,
  fetchedAt: number
): MarketQuote {
  let buyMax = 0;
  let sellMin = 0;
  let buyVolume = 0;
  let sellVolume = 0;

  for (const o of orders) {
    if (o.is_buy_order === 1) {
      if (o.price > buyMax) buyMax = o.price;
      buyVolume += o.volume_remain;
    } else {
      if (sellMin === 0 || o.price < sellMin) sellMin = o.price;
      sellVolume += o.volume_remain;
    }
  }

  const split =
    buyMax > 0 && sellMin > 0 ? (buyMax + sellMin) / 2 : sellMin > 0 ? sellMin : buyMax;

  return {
    typeId,
    regionId,
    buyMax,
    sellMin,
    split,
    buyVolume,
    sellVolume,
    fetchedAt
  };
}

