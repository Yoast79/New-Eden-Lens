import type { MiningLedgerEntryDto, MiningLedgerSummaryDto } from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { EsiClient } from './esi-client';
import type { MarketService } from './market-service';
import oreReprocessingJson from '../data/ore-reprocessing.json';

interface OreReprocessingSpec {
  typeId: number;
  typeName: string;
  volume: number;
  portionSize: number;
  isCompressed: boolean;
  compressedTypeId: number | null;
  compressedTypeName: string | null;
  materials: Array<{ materialTypeId: number; materialName: string; quantity: number }>;
}

const ORE_SPECS = oreReprocessingJson as OreReprocessingSpec[];
const ORE_BY_TYPE_ID = new Map<number, OreReprocessingSpec>(ORE_SPECS.map((o) => [o.typeId, o]));

interface EsiMiningRow {
  date: string;
  solar_system_id: number;
  type_id: number;
  quantity: number;
}

export class MiningService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly esiClient: EsiClient,
    private readonly marketService: MarketService
  ) {}

  async syncLedger(characterId: number, regionId: number): Promise<MiningLedgerSummaryDto> {
    const rawRows = await this.esiClient.request<EsiMiningRow[]>(
      `/characters/${characterId}/mining/`,
      { characterId }
    );
    const rows = Array.isArray(rawRows) ? rawRows : [];

    const allTypeIds = new Set<number>();
    for (const r of rows) {
      allTypeIds.add(r.type_id);
      const spec = ORE_BY_TYPE_ID.get(r.type_id);
      if (spec) {
        if (spec.compressedTypeId) allTypeIds.add(spec.compressedTypeId);
        for (const m of spec.materials) allTypeIds.add(m.materialTypeId);
      }
    }

    const quotes =
      allTypeIds.size > 0
        ? await this.marketService.getQuotesForTypes(regionId, Array.from(allTypeIds))
        : {};

    const pickPrice = (tid: number | null): number => {
      if (!tid) return 0;
      const q = quotes[tid];
      if (!q) return 0;
      return q.sellMin && q.sellMin > 0 ? q.sellMin : q.buyMax ?? 0;
    };

    const entries: MiningLedgerEntryDto[] = rows
      .map((r) => {
        const spec = ORE_BY_TYPE_ID.get(r.type_id);
        const sysRow = this.db.get<{ solar_system_name: string }>(
          'SELECT solar_system_name FROM sde_solar_systems WHERE solar_system_id = ?',
          [r.solar_system_id]
        );
        const typeRow = !spec
          ? this.db.get<{ type_name: string; volume: number | null }>(
              'SELECT type_name, volume FROM sde_inv_types WHERE type_id = ?',
              [r.type_id]
            )
          : null;

        const typeName = spec?.typeName ?? typeRow?.type_name ?? `Type #${r.type_id}`;
        const unitVol = spec?.volume ?? typeRow?.volume ?? 0.1;
        const portionSize = spec?.portionSize ?? 100;
        const rawUnitPrice = pickPrice(r.type_id);
        const compressedUnitPrice = pickPrice(spec?.compressedTypeId ?? null);

        let reprocessedPerPortion = 0;
        const materials = (spec?.materials ?? []).map((m) => {
          reprocessedPerPortion += m.quantity * pickPrice(m.materialTypeId);
          return {
            materialTypeId: m.materialTypeId,
            materialName: m.materialName,
            quantityPerPortion: m.quantity
          };
        });
        const reprocessedUnitValue = portionSize > 0 ? reprocessedPerPortion / portionSize : 0;

        return {
          date: r.date,
          solarSystemId: r.solar_system_id,
          solarSystemName: sysRow?.solar_system_name ?? `System #${r.solar_system_id}`,
          typeId: r.type_id,
          typeName,
          quantity: r.quantity,
          volumeM3: r.quantity * unitVol,
          rawUnitPrice,
          compressedTypeId: spec?.compressedTypeId ?? null,
          compressedTypeName: spec?.compressedTypeName ?? null,
          compressedUnitPrice,
          reprocessedUnitValue,
          rawTotalIsk: r.quantity * rawUnitPrice,
          compressedTotalIsk:
            compressedUnitPrice > 0 ? r.quantity * compressedUnitPrice : r.quantity * rawUnitPrice,
          reprocessedBaseTotalIsk: r.quantity * reprocessedUnitValue,
          portionSize,
          materials
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.compressedTotalIsk - a.compressedTotalIsk);

    return {
      characterId,
      hubRegionId: regionId,
      entries,
      syncedAt: Date.now()
    };
  }
}

