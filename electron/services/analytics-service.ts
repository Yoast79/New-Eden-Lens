import type { PilotAnalyticsDto } from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { CharacterRepository } from '../db/repositories/characterRepo';
import type { EsiClient } from './esi-client';
import type { SkillPlannerService } from './skill-planner-service';

export class AnalyticsService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly characterRepo: CharacterRepository,
    private readonly esiClient: EsiClient,
    private readonly skillPlanner: SkillPlannerService
  ) { }

  async syncAndGetAnalytics(characterId: number | null): Promise<PilotAnalyticsDto> {
    const targetIds =
      characterId !== null
        ? [characterId]
        : this.characterRepo.listCharacters().map((c) => c.characterId);

    for (const cid of targetIds) {
      await this.syncCharacterFinanceAndClones(cid);
    }

    const now = Date.now();
    await this.ensureGlobalPricesSynced(now);

    const walletHistory = this.characterRepo.getWalletHistory(characterId).map((w) => ({
      capturedAt: w.capturedAt,
      balance: w.balance,
      estimatedAssetValue: w.estimatedAssetValue
    }));

    const latestByChar = new Map<number, { balance: number; assetVal: number }>();
    for (const cid of targetIds) {
      const latest = this.db.get<{ balance: number; estimated_asset_value: number }>(
        'SELECT balance, estimated_asset_value FROM wallet_snapshots WHERE character_id = ? ORDER BY captured_at DESC LIMIT 1',
        [cid]
      );
      if (latest) {
        latestByChar.set(cid, {
          balance: latest.balance,
          assetVal: latest.estimated_asset_value
        });
      }
    }

    let totalWalletBalance = 0;
    let totalAssetValue = 0;
    for (const v of latestByChar.values()) {
      totalWalletBalance += v.balance;
      totalAssetValue += v.assetVal;
    }

    // Journal ticks
    const journalRows =
      targetIds.length > 0
        ? this.db.all<{
          journal_id: number;
          date: number;
          ref_type: string;
          amount: number;
          reason: string | null;
        }>(
          `SELECT journal_id, date, ref_type, amount, reason
             FROM wallet_journal
             WHERE character_id IN (${targetIds.map(() => '?').join(',')})
             ORDER BY date DESC
             LIMIT 100`,
          targetIds
        )
        : [];

    const sumSince = (ms: number) =>
      journalRows
        .filter((j) => now - j.date <= ms)
        .reduce((acc, j) => acc + j.amount, 0);

    const isk24h = sumSince(24 * 3600 * 1000);
    const isk7d = sumSince(7 * 24 * 3600 * 1000);
    const isk30d = sumSince(30 * 24 * 3600 * 1000);
    const iskPerHour = Math.round(sumSince(3600 * 1000));

    // Most expensive asset & ship from local assets + cached Jita/global prices
    const assetRows =
      targetIds.length > 0
        ? this.db.all<{
          type_id: number;
          quantity: number;
          type_name: string | null;
          category_id: number | null;
          sell_price: number | null;
        }>(
          `SELECT a.type_id, SUM(a.quantity) AS quantity, t.type_name, g.category_id,
                    COALESCE(
                      (SELECT MIN(m.price) FROM market_orders_cache m
                       WHERE m.region_id IN (10000002, 19000001) AND m.type_id = a.type_id AND m.is_buy_order = 0),
                      NULLIF(gp.average_price, 0),
                      NULLIF(gp.adjusted_price, 0),
                      0
                    ) AS sell_price
             FROM character_assets a
             LEFT JOIN sde_inv_types t ON t.type_id = a.type_id
             LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
             LEFT JOIN market_global_prices gp ON gp.type_id = a.type_id
             WHERE a.character_id IN (${targetIds.map(() => '?').join(',')})
             GROUP BY a.type_id`,
          targetIds
        )
        : [];

    let mostExpensiveAssetName: string | null = null;
    let mostExpensiveAssetValue = 0;
    let mostExpensiveShipName: string | null = null;
    let mostExpensiveShipValue = 0;

    for (const a of assetRows) {
      const unit = a.sell_price ?? 0;
      const total = unit * a.quantity;
      if (total > mostExpensiveAssetValue) {
        mostExpensiveAssetValue = total;
        mostExpensiveAssetName = a.type_name ?? `Type #${a.type_id}`;
      }
      if (a.category_id === 6 && unit > mostExpensiveShipValue) {
        mostExpensiveShipValue = unit;
        mostExpensiveShipName = a.type_name ?? `Ship #${a.type_id}`;
      }
    }

    // K/D from local killmails
    const losses =
      targetIds.length > 0
        ? (this.db.get<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM killmails WHERE victim_character_id IN (${targetIds
            .map(() => '?')
            .join(',')})`,
          targetIds
        )?.cnt ?? 0)
        : 0;
    const kills = this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM killmails')?.cnt ?? 0;
    const kdRatio = losses > 0 ? Number((kills / losses).toFixed(2)) : kills;

    // Clones for active character (or first)
    const cloneTarget = targetIds[0] ?? null;
    let clones: PilotAnalyticsDto['clones'] = {
      homeLocationId: null,
      lastCloneJumpDate: null,
      cooldownRemainingSec: 0,
      activeImplants: [],
      jumpClones: []
    };

    if (cloneTarget !== null) {
      const cloneRow = this.db.get<{
        home_location_id: number | null;
        last_clone_jump_date: number | null;
        jump_clones_json: string;
      }>('SELECT * FROM character_clones WHERE character_id = ?', [cloneTarget]);
      const impRes = await this.skillPlanner
        .syncCharacterAttributesAndImplants(cloneTarget)
        .catch(() => null);

      const lastJump = cloneRow?.last_clone_jump_date ?? null;
      const cooldownEnd = lastJump ? lastJump + 24 * 3600 * 1000 : 0;
      const cooldownRemainingSec = Math.max(0, Math.floor((cooldownEnd - now) / 1000));

      const parsedClones: Array<{
        jumpCloneId: number;
        locationId: number;
        locationName?: string;
        name: string;
        implants: number[];
      }> = cloneRow ? JSON.parse(cloneRow.jump_clones_json) : [];

      await this.resolveCloneLocationNames(
        parsedClones.map((c) => c.locationId),
        cloneTarget,
        now
      );

      for (const jc of parsedClones) {
        const cachedLoc = this.db.get<{ name: string }>(
          'SELECT name FROM location_names_cache WHERE location_id = ?',
          [jc.locationId]
        );
        jc.locationName = cachedLoc?.name ?? `Location #${jc.locationId}`;
      }

      clones = {
        homeLocationId: cloneRow?.home_location_id ?? null,
        lastCloneJumpDate: lastJump,
        cooldownRemainingSec,
        activeImplants: impRes?.implants ?? [],
        jumpClones: parsedClones
      };
    }

    return {
      totalWalletBalance,
      totalAssetValue,
      mostExpensiveAssetName,
      mostExpensiveAssetValue,
      mostExpensiveShipName,
      mostExpensiveShipValue,
      iskPerHour,
      isk24h,
      isk7d,
      isk30d,
      kdRatio,
      walletHistory,
      journalTicks: journalRows.map((j) => {
        const rawReason = (j.reason ?? '').trim();
        const isBountyOrNumeric =
          j.ref_type === 'bounty_prizes' ||
          j.ref_type === 'bounty_prize' ||
          /^[\d\s,.:;-]+$/.test(rawReason);
        return {
          journalId: j.journal_id,
          date: j.date,
          refType: j.ref_type,
          amount: j.amount,
          reason: isBountyOrNumeric ? '' : rawReason
        };
      }),
      clones
    };
  }

  private async ensureGlobalPricesSynced(now: number): Promise<void> {
    const latest = this.db.get<{ updated_at: number }>(
      'SELECT updated_at FROM market_global_prices LIMIT 1'
    );
    if (latest && now - latest.updated_at < 60 * 60 * 1000) return;

    const prices = await this.esiClient
      .request<Array<{ type_id: number; average_price?: number; adjusted_price?: number }>>(
        '/markets/prices'
      )
      .catch(() => null);
    if (!prices || prices.length === 0) return;

    this.db.transaction((raw) => {
      const stmt = raw.prepare(
        `INSERT OR REPLACE INTO market_global_prices (type_id, average_price, adjusted_price, updated_at)
         VALUES (?, ?, ?, ?)`
      );
      try {
        for (const p of prices) {
          stmt.run([p.type_id, p.average_price ?? 0, p.adjusted_price ?? 0, now]);
        }
      } finally {
        stmt.free();
      }
    });
  }

  private async resolveCloneLocationNames(
    locationIds: number[],
    characterId: number,
    now: number
  ): Promise<void> {
    const unique = Array.from(new Set(locationIds.filter((id) => id > 0)));
    if (unique.length === 0) return;
    const cached = new Set(
      this.db
        .all<{ location_id: number }>('SELECT location_id FROM location_names_cache')
        .map((r) => r.location_id)
    );
    const missingStations = unique.filter((id) => !cached.has(id) && id >= 60_000_000 && id < 64_000_000);
    if (missingStations.length > 0) {
      const resolved = await this.esiClient
        .request<Array<{ id: number; name: string }>>('/universe/names', {
          method: 'POST',
          body: missingStations
        })
        .catch(() => []);
      for (const r of resolved) {
        this.db.run(
          'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)',
          [r.id, r.name, now]
        );
      }
    }
    const missingStructures = unique.filter((id) => !cached.has(id) && id >= 1_000_000_000_000);
    for (const sid of missingStructures) {
      const info = await this.esiClient
        .request<{ name?: string }>(`/universe/structures/${sid}`, { characterId })
        .catch(() => null);
      if (info?.name) {
        this.db.run(
          'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)',
          [sid, info.name, now]
        );
      }
    }
  }

  private async syncCharacterFinanceAndClones(characterId: number): Promise<void> {
    const [wallet, journal, assets, clones] = await Promise.all([
      this.esiClient.request<number>(`/characters/${characterId}/wallet`, { characterId }).catch(() => null),
      this.esiClient
        .request<
          Array<{
            id: number;
            date: string;
            ref_type: string;
            amount: number;
            balance?: number;
            first_party_id?: number;
            second_party_id?: number;
            reason?: string;
          }>
        >(`/characters/${characterId}/wallet/journal`, { characterId })
        .catch(() => null),
      this.esiClient
        .requestAllPages<{
          item_id: number;
          type_id: number;
          location_id: number;
          location_type: string;
          location_flag: string;
          quantity: number;
          is_singleton: boolean;
        }>(`/characters/${characterId}/assets`, { characterId })
        .catch(() => null),
      this.esiClient
        .request<{
          home_location?: { location_id: number };
          last_clone_jump_date?: string;
          jump_clones?: Array<{
            jump_clone_id: number;
            location_id: number;
            name?: string;
            implants: number[];
          }>;
        }>(`/characters/${characterId}/clones`, { characterId })
        .catch(() => null)
    ]);

    const now = Date.now();
    if (wallet !== null) {
      this.characterRepo.saveWalletSnapshot(characterId, wallet, 0);
    }

    if (journal) {
      this.db.transaction((raw) => {
        const stmt = raw.prepare(
          `INSERT OR IGNORE INTO wallet_journal (
             character_id, journal_id, date, ref_type, amount, balance, first_party_id, second_party_id, reason
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        try {
          for (const j of journal) {
            stmt.run([
              characterId,
              j.id,
              Date.parse(j.date) || now,
              j.ref_type,
              j.amount,
              j.balance ?? null,
              j.first_party_id ?? null,
              j.second_party_id ?? null,
              j.reason ?? ''
            ]);
          }
        } finally {
          stmt.free();
        }
      });
    }

    if (assets) {
      this.db.transaction((raw) => {
        raw.run('DELETE FROM character_assets WHERE character_id = ?', [characterId]);
        const stmt = raw.prepare(
          `INSERT INTO character_assets (
             character_id, item_id, type_id, location_id, location_type, location_flag, quantity, is_singleton, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        try {
          for (const a of assets) {
            stmt.run([
              characterId,
              a.item_id,
              a.type_id,
              a.location_id,
              a.location_type,
              a.location_flag,
              a.quantity,
              a.is_singleton ? 1 : 0,
              now
            ]);
          }
        } finally {
          stmt.free();
        }
      });
    }

    if (clones) {
      this.db.run(
        `INSERT INTO character_clones (
           character_id, home_location_id, last_clone_jump_date, active_implants_json, jump_clones_json, updated_at
         ) VALUES (?, ?, ?, '[]', ?, ?)
         ON CONFLICT(character_id) DO UPDATE SET
           home_location_id = excluded.home_location_id,
           last_clone_jump_date = excluded.last_clone_jump_date,
           jump_clones_json = excluded.jump_clones_json,
           updated_at = excluded.updated_at`,
        [
          characterId,
          clones.home_location?.location_id ?? null,
          clones.last_clone_jump_date ? Date.parse(clones.last_clone_jump_date) : null,
          JSON.stringify(
            (clones.jump_clones ?? []).map((jc) => ({
              jumpCloneId: jc.jump_clone_id,
              locationId: jc.location_id,
              name: jc.name ?? `Clone #${jc.jump_clone_id}`,
              implants: jc.implants ?? []
            }))
          ),
          now
        ]
      );
    }
  }
}

