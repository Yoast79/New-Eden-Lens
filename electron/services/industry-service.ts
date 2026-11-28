import type {
  BlueprintSearchItemDto,
  CharacterIndustryJobDto,
  IndustryCalculationRequest,
  IndustryCalculationResultDto,
  IndustryImplantInfoDto,
  IndustryMaterialNodeDto,
  OwnedBlueprintDto
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { EsiClient } from './esi-client';
import type { MarketService } from './market-service';
import blueprintsJson from '../data/blueprints.json';
import npcStationsJson from '../data/npc-stations.json';

interface StaticBlueprintSpec {
  blueprintTypeId: number;
  blueprintName: string;
  activityId: number;
  time: number;
  productTypeId: number;
  productName: string;
  productQuantity: number;
  materials: Array<{ typeId: number; typeName: string; quantity: number }>;
}

const BLUEPRINTS = blueprintsJson as StaticBlueprintSpec[];
const BP_BY_KEY = new Map<string, StaticBlueprintSpec>(
  BLUEPRINTS.map((b) => [`${b.blueprintTypeId}:${b.activityId}`, b])
);
const BP_BY_PRODUCT = new Map<number, StaticBlueprintSpec>();
const BP_BY_TYPE_ID = new Map<number, StaticBlueprintSpec>();
for (const b of BLUEPRINTS) {
  if (!BP_BY_PRODUCT.has(b.productTypeId)) BP_BY_PRODUCT.set(b.productTypeId, b);
  if (!BP_BY_TYPE_ID.has(b.blueprintTypeId)) BP_BY_TYPE_ID.set(b.blueprintTypeId, b);
}

const STATION_NAME_MAP = new Map<number, string>(
  (npcStationsJson as Array<{ id: number; name: string }>).map((s) => [s.id, s.name])
);

const MINABLE_FALLBACK_NAMES = new Set([
  'tritanium',
  'pyerite',
  'mexallon',
  'isogen',
  'nocxium',
  'zydrine',
  'megacyte',
  'morphite',
  'heavy water',
  'liquid ozone',
  'strontium clathrates',
  'helium isotopes',
  'hydrogen isotopes',
  'nitrogen isotopes',
  'oxygen isotopes'
]);

const ACTIVITY_NAMES: Record<number, string> = {
  1: 'Manufacturing',
  3: 'TE Research',
  4: 'ME Research',
  5: 'Copying',
  8: 'Invention',
  11: 'Reactions'
};

const INDUSTRY_IMPLANTS_CATALOG: Array<Omit<IndustryImplantInfoDto, 'installed'>> = [
  // Slot 8: Manufacturing Time
  { typeId: 27170, name: "Zainou 'Beancounter' Industry BX-801", slot: 8, activity: 'manufacturing', bonusPct: 1 },
  { typeId: 27167, name: "Zainou 'Beancounter' Industry BX-802", slot: 8, activity: 'manufacturing', bonusPct: 2 },
  { typeId: 27171, name: "Zainou 'Beancounter' Industry BX-804", slot: 8, activity: 'manufacturing', bonusPct: 4 },
  // Slot 7: ME Research Time
  { typeId: 27182, name: "Zainou 'Beancounter' Metallurgy MY-701", slot: 7, activity: 'me_research', bonusPct: 1 },
  { typeId: 27180, name: "Zainou 'Beancounter' Metallurgy MY-703", slot: 7, activity: 'me_research', bonusPct: 3 },
  { typeId: 27181, name: "Zainou 'Beancounter' Metallurgy MY-705", slot: 7, activity: 'me_research', bonusPct: 5 },
  // Slot 6: TE Research Time
  { typeId: 27175, name: "Zainou 'Beancounter' Research RR-601", slot: 6, activity: 'te_research', bonusPct: 1 },
  { typeId: 27174, name: "Zainou 'Beancounter' Research RR-603", slot: 6, activity: 'te_research', bonusPct: 3 },
  { typeId: 27169, name: "Zainou 'Beancounter' Research RR-605", slot: 6, activity: 'te_research', bonusPct: 5 },
  // Slot 8: Blueprint Copying Time
  { typeId: 27176, name: "Zainou 'Beancounter' Science SC-801", slot: 8, activity: 'copying', bonusPct: 1 },
  { typeId: 27177, name: "Zainou 'Beancounter' Science SC-803", slot: 8, activity: 'copying', bonusPct: 3 },
  { typeId: 27179, name: "Zainou 'Beancounter' Science SC-805", slot: 8, activity: 'copying', bonusPct: 5 }
];

interface EsiIndustrySystem {
  solar_system_id: number;
  cost_indices: Array<{ activity: string; cost_index: number }>;
}

export class IndustryService {
  private systemIndicesCache: { at: number; map: Map<number, Record<string, number>> } | null = null;
  private implantCache = new Map<number, { at: number; ids: Set<number> }>();
  private ownedBpCache = new Map<number, { at: number; typeIds: Set<number> }>();
  private minableCache = new Map<number, boolean>();

  constructor(
    private readonly db: LocalDatabase,
    private readonly esiClient: EsiClient,
    private readonly marketService: MarketService
  ) {}

  private isMinableType(typeId: number, typeName: string): boolean {
    const cached = this.minableCache.get(typeId);
    if (cached !== undefined) return cached;

    const row = this.db.get<{ group_id: number; category_id: number | null }>(
      `SELECT t.group_id, g.category_id
       FROM sde_inv_types t
       LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
       WHERE t.type_id = ?`,
      [typeId]
    );

    let minable = false;
    if (row) {
      // Category 25: Asteroid (all ores + moon ores); Group 18: Mineral; Group 423: Ice Product; Group 465: Ice; Group 711: Harvestable Cloud (Gas)
      minable =
        row.category_id === 25 ||
        row.group_id === 18 ||
        row.group_id === 423 ||
        row.group_id === 465 ||
        row.group_id === 711;
    } else {
      minable = MINABLE_FALLBACK_NAMES.has(typeName.toLowerCase());
    }
    this.minableCache.set(typeId, minable);
    return minable;
  }

  searchBlueprints(query: string, limit = 30): BlueprintSearchItemDto[] {
    const q = query.trim().toLowerCase();
    if (!q) return BLUEPRINTS.slice(0, limit).map(toSearchDto);
    const hits: BlueprintSearchItemDto[] = [];
    for (const b of BLUEPRINTS) {
      if (
        b.productName.toLowerCase().includes(q) ||
        b.blueprintName.toLowerCase().includes(q)
      ) {
        hits.push(toSearchDto(b));
        if (hits.length >= limit) break;
      }
    }
    return hits;
  }

  async getSystemCostIndex(solarSystemId: number): Promise<{
    manufacturing: number;
    reaction: number;
    copying: number;
    researchMe: number;
    researchTe: number;
  }> {
    const now = Date.now();
    if (!this.systemIndicesCache || now - this.systemIndicesCache.at > 60 * 60 * 1000) {
      const list = await this.esiClient
        .request<EsiIndustrySystem[]>('/industry/systems/')
        .catch(() => []);
      const map = new Map<number, Record<string, number>>();
      for (const sys of Array.isArray(list) ? list : []) {
        const rec: Record<string, number> = {};
        for (const ci of sys.cost_indices ?? []) rec[ci.activity] = ci.cost_index;
        map.set(sys.solar_system_id, rec);
      }
      this.systemIndicesCache = { at: now, map };
    }
    const rec = this.systemIndicesCache.map.get(solarSystemId) ?? {};
    return {
      manufacturing: rec.manufacturing ?? 0.02,
      reaction: rec.reaction ?? 0.02,
      copying: rec.copying ?? 0.01,
      researchMe: rec.researching_material_efficiency ?? 0.01,
      researchTe: rec.researching_time_efficiency ?? 0.01
    };
  }

  private getPilotSkills(characterId: number | null) {
    const defaults = {
      industryLevel: 0,
      advIndustryLevel: 0,
      reactionsLevel: 0,
      maxMfgSlots: 1,
      maxReactionSlots: 1
    };
    if (!characterId) return defaults;

    const rows = this.db.all<{ skill_id: number; trained_skill_level: number }>(
      `SELECT skill_id, trained_skill_level FROM character_skills
       WHERE character_id = ? AND skill_id IN (3380, 3388, 45746, 3387, 24625, 45748, 45749)`,
      [characterId]
    );
    const map = new Map(rows.map((r) => [r.skill_id, r.trained_skill_level]));
    const industryLevel = map.get(3380) ?? 0;
    const advIndustryLevel = map.get(3388) ?? 0;
    const reactionsLevel = map.get(45746) ?? 0;
    const massProd = map.get(3387) ?? 0;
    const advMassProd = map.get(24625) ?? 0;
    const massReac = map.get(45748) ?? 0;
    const advMassReac = map.get(45749) ?? 0;

    return {
      industryLevel,
      advIndustryLevel,
      reactionsLevel,
      maxMfgSlots: 1 + massProd + advMassProd,
      maxReactionSlots: 1 + massReac + advMassReac
    };
  }

  private async getPilotImplantIds(characterId: number | null): Promise<Set<number>> {
    if (!characterId) return new Set();
    const now = Date.now();
    const cached = this.implantCache.get(characterId);
    if (cached && now - cached.at < 5 * 60 * 1000) return cached.ids;
    const raw = await this.esiClient
      .request<number[]>(`/characters/${characterId}/implants`, { characterId })
      .catch(() => [] as number[]);
    const ids = new Set(Array.isArray(raw) ? raw : []);
    this.implantCache.set(characterId, { at: now, ids });
    return ids;
  }

  private async getOwnedBlueprintTypeIdsForChar(characterId: number): Promise<Set<number>> {
    const now = Date.now();
    const cached = this.ownedBpCache.get(characterId);
    if (cached && now - cached.at < 5 * 60 * 1000) return cached.typeIds;
    const raw = await this.esiClient
      .request<Array<{ type_id: number }>>(`/characters/${characterId}/blueprints/`, { characterId })
      .catch(() => [] as Array<{ type_id: number }>);
    const typeIds = new Set<number>();
    for (const r of Array.isArray(raw) ? raw : []) {
      typeIds.add(r.type_id);
    }
    this.ownedBpCache.set(characterId, { at: now, typeIds });
    return typeIds;
  }

  async calculate(req: IndustryCalculationRequest): Promise<IndustryCalculationResultDto> {
    const root =
      BP_BY_KEY.get(`${req.blueprintTypeId}:${req.activityId}`) ??
      BP_BY_TYPE_ID.get(req.blueprintTypeId);
    if (!root) {
      throw new Error(`Blueprint #${req.blueprintTypeId} not found in SDE catalog.`);
    }

    const runs = Math.max(1, Math.floor(req.runs));
    const mode = req.optimizationMode ?? (req.expandSubComponents ? 'cheapest' : 'fastest');
    const overrides = req.craftOverrides ?? {};
    const mineOverrides = req.mineOverrides ?? {};
    const pilotSkillsSummary = this.getPilotSkills(req.characterId);

    const installedImplantIds = await this.getPilotImplantIds(req.characterId);
    const implants: IndustryImplantInfoDto[] = INDUSTRY_IMPLANTS_CATALOG.map((imp) => ({
      ...imp,
      installed: installedImplantIds.has(imp.typeId)
    }));
    const detectedMfgBonus = implants
      .filter((i) => i.installed && i.activity === 'manufacturing')
      .reduce((max, i) => Math.max(max, i.bonusPct), 0);
    const appliedMfgImplantBonusPct =
      req.mfgImplantBonusPct !== null && req.mfgImplantBonusPct !== undefined
        ? Math.max(0, req.mfgImplantBonusPct)
        : detectedMfgBonus;

    const calcMeFactor = (activityId: number) =>
      activityId === 11
        ? 1 - req.rigMeBonusPct / 100
        : (1 - req.meLevel / 100) *
          (1 - req.structureMeBonusPct / 100) *
          (1 - req.rigMeBonusPct / 100);

    const calcTimeMult = (activityId: number) =>
      activityId === 11
        ? (1 - 0.04 * pilotSkillsSummary.reactionsLevel) *
          (1 - req.structureTeBonusPct / 100) *
          (1 - req.rigTeBonusPct / 100)
        : (1 - 0.04 * pilotSkillsSummary.industryLevel) *
          (1 - 0.03 * pilotSkillsSummary.advIndustryLevel) *
          (1 - req.teLevel / 100) *
          (1 - req.structureTeBonusPct / 100) *
          (1 - req.rigTeBonusPct / 100) *
          (1 - appliedMfgImplantBonusPct / 100);

    // 1. Expand full potential tree (up to depth 4) so we can price ALL nodes (craftable & leaves)
    const allTypeIds = new Set<number>([root.productTypeId]);
    const visited = new Set<number>();

    const buildSkeleton = (
      spec: StaticBlueprintSpec,
      nodeRuns: number,
      depth: number
    ): IndustryMaterialNodeDto[] => {
      const meFactor = calcMeFactor(spec.activityId);
      return spec.materials.map((m) => {
        const baseQuantity = m.quantity * nodeRuns;
        const adjustedQuantity = Math.max(nodeRuns, Math.ceil(baseQuantity * meFactor));
        allTypeIds.add(m.typeId);
        const subBp = depth < 4 ? BP_BY_PRODUCT.get(m.typeId) : undefined;
        let children: IndustryMaterialNodeDto[] = [];
        let subRuns = 0;
        let craftTimeSeconds = 0;
        if (subBp && !visited.has(subBp.productTypeId)) {
          visited.add(subBp.productTypeId);
          subRuns = Math.ceil(adjustedQuantity / Math.max(1, subBp.productQuantity));
          craftTimeSeconds = Math.max(
            1,
            Math.round(subBp.time * subRuns * Math.max(0.1, calcTimeMult(subBp.activityId)))
          );
          children = buildSkeleton(subBp, subRuns, depth + 1);
          visited.delete(subBp.productTypeId);
        }
        const minable = !subBp && this.isMinableType(m.typeId, m.typeName);
        return {
          typeId: m.typeId,
          typeName: m.typeName,
          baseQuantity,
          adjustedQuantity,
          ownedQuantity: 0,
          buyQuantity: adjustedQuantity,
          unitPrice: 0,
          buyTotalPrice: 0,
          craftTotalPrice: null,
          totalPrice: 0,
          craftTimeSeconds,
          craftable: Boolean(subBp),
          minable,
          decision: 'buy',
          acquireMode: minable && mineOverrides[m.typeId] === 'mine' ? 'mine' : 'buy',
          blueprintTypeId: subBp?.blueprintTypeId ?? null,
          runsNeeded: subRuns,
          children
        };
      });
    };

    const tree = buildSkeleton(root, runs, 0);

    // 2. Fetch market prices + system cost index + owned assets
    const [inputQuotes, outputQuotes, sysIdx] = await Promise.all([
      allTypeIds.size > 0
        ? this.marketService.getQuotesForTypes(req.inputRegionId, Array.from(allTypeIds))
        : Promise.resolve({} as Record<number, { sellMin?: number | null; buyMax?: number | null }>),
      this.marketService.getQuotesForTypes(req.outputRegionId, [root.productTypeId]),
      req.solarSystemId ? this.getSystemCostIndex(req.solarSystemId) : Promise.resolve(null)
    ]);

    const pickPrice = (q?: { sellMin?: number | null; buyMax?: number | null }): number =>
      q ? (q.sellMin && q.sellMin > 0 ? q.sellMin : q.buyMax ?? 0) : 0;

    // Owned asset pool from character_assets
    const ownedPool = new Map<number, number>();
    if (req.useOwnedMaterials) {
      const assetRows =
        req.useAllCharactersAssets || !req.characterId
          ? this.db.all<{ type_id: number; qty: number }>(
              'SELECT type_id, SUM(quantity) AS qty FROM character_assets GROUP BY type_id'
            )
          : this.db.all<{ type_id: number; qty: number }>(
              'SELECT type_id, SUM(quantity) AS qty FROM character_assets WHERE character_id = ? GROUP BY type_id',
              [req.characterId]
            );
      for (const r of assetRows) {
        if (r.qty > 0) ownedPool.set(r.type_id, r.qty);
      }
    }

    const mfgSci = sysIdx ? sysIdx.manufacturing : 0.02;
    const reacSci = sysIdx ? sysIdx.reaction : 0.02;
    const systemCostIndex = root.activityId === 11 ? reacSci : mfgSci;

    // 3. Bottom-up evaluation: compute buyTotalPrice vs craftTotalPrice + optimal decision per node
    const evaluateBottomUp = (nodes: IndustryMaterialNodeDto[]): number => {
      let sum = 0;
      for (const n of nodes) {
        n.unitPrice = pickPrice(inputQuotes[n.typeId]);
        n.buyTotalPrice = n.unitPrice * n.adjustedQuantity;

        if (n.children.length > 0) {
          const childrenCost = evaluateBottomUp(n.children);
          const subBp = BP_BY_PRODUCT.get(n.typeId);
          const subSci = subBp?.activityId === 11 ? reacSci : mfgSci;
          const subJobFee = childrenCost * (subSci + req.facilityTaxPct / 100);
          n.craftTotalPrice = childrenCost + subJobFee;

          if (mode === 'fastest') {
            n.decision = 'buy';
          } else if (mode === 'custom' && overrides[n.typeId]) {
            n.decision = overrides[n.typeId];
          } else if (mode === 'cheapest') {
            n.decision =
              n.buyTotalPrice > 0 && n.craftTotalPrice >= n.buyTotalPrice ? 'buy' : 'craft';
          } else {
            n.decision = req.expandSubComponents ? 'craft' : 'buy';
          }
        } else {
          n.decision = 'buy';
          n.craftTotalPrice = null;
        }

        n.totalPrice =
          n.decision === 'craft' && n.craftTotalPrice !== null
            ? n.craftTotalPrice
            : n.buyTotalPrice;
        sum += n.totalPrice;
      }
      return sum;
    };

    evaluateBottomUp(tree);

    // 4. Walk active decisions top-down to deduct owned materials & build flat shopping list + crafting steps
    const flatMap = new Map<
      number,
      { typeId: number; typeName: string; requiredQuantity: number; ownedQuantity: number; quantity: number }
    >();
    const stepMap = new Map<
      number,
      {
        blueprintTypeId: number;
        blueprintName: string;
        productName: string;
        runs: number;
        timeSeconds: number;
        depth: number;
      }
    >();
    const requiredBpMap = new Map<number, StaticBlueprintSpec>([[root.blueprintTypeId, root]]);
    let subTreeTimeSeconds = 0;
    let ownedSavingsIsk = 0;

    const collectActive = (nodes: IndustryMaterialNodeDto[], depth: number) => {
      for (const n of nodes) {
        // Deduct owned stock for this node first if useOwnedMaterials is enabled
        if (req.useOwnedMaterials) {
          const avail = ownedPool.get(n.typeId) ?? 0;
          const used = Math.min(avail, n.adjustedQuantity);
          if (used > 0) {
            ownedPool.set(n.typeId, avail - used);
            n.ownedQuantity = used;
            n.buyQuantity = n.adjustedQuantity - used;
            ownedSavingsIsk += used * n.unitPrice;
          } else {
            n.ownedQuantity = 0;
            n.buyQuantity = n.adjustedQuantity;
          }
        } else {
          n.ownedQuantity = 0;
          n.buyQuantity = n.adjustedQuantity;
        }

        if (n.decision === 'craft' && n.children.length > 0 && n.buyQuantity > 0) {
          const subBp = BP_BY_PRODUCT.get(n.typeId);
          if (subBp) {
            requiredBpMap.set(subBp.blueprintTypeId, subBp);
            const actualRuns = Math.ceil(n.buyQuantity / Math.max(1, subBp.productQuantity));
            const actualTime = Math.max(
              1,
              Math.round(subBp.time * actualRuns * Math.max(0.1, calcTimeMult(subBp.activityId)))
            );
            subTreeTimeSeconds += actualTime;
            const prevStep = stepMap.get(subBp.blueprintTypeId);
            if (prevStep) {
              prevStep.runs += actualRuns;
              prevStep.timeSeconds += actualTime;
              prevStep.depth = Math.max(prevStep.depth, depth + 1);
            } else {
              stepMap.set(subBp.blueprintTypeId, {
                blueprintTypeId: subBp.blueprintTypeId,
                blueprintName: subBp.blueprintName,
                productName: subBp.productName,
                runs: actualRuns,
                timeSeconds: actualTime,
                depth: depth + 1
              });
            }
          }
          collectActive(n.children, depth + 1);
        } else {
          const prev = flatMap.get(n.typeId);
          if (prev) {
            prev.requiredQuantity += n.adjustedQuantity;
            prev.ownedQuantity += n.ownedQuantity;
            prev.quantity += n.buyQuantity;
          } else {
            flatMap.set(n.typeId, {
              typeId: n.typeId,
              typeName: n.typeName,
              requiredQuantity: n.adjustedQuantity,
              ownedQuantity: n.ownedQuantity,
              quantity: n.buyQuantity
            });
          }
        }
      }
    };

    collectActive(tree, 0);

    const flatMaterials = Array.from(flatMap.values())
      .map((m) => {
        const unitPrice = pickPrice(inputQuotes[m.typeId]);
        const minable = this.isMinableType(m.typeId, m.typeName);
        const category: 'market' | 'mineral' | 'pi' | 'component' = minable
          ? 'mineral'
          : BP_BY_PRODUCT.has(m.typeId)
            ? 'component'
            : 'market';
        const acquireMode: 'buy' | 'mine' =
          minable && mineOverrides[m.typeId] === 'mine' ? 'mine' : 'buy';
        const estMarketValue = unitPrice * m.quantity;
        return {
          ...m,
          unitPrice,
          totalPrice: acquireMode === 'mine' ? 0 : estMarketValue,
          estMarketValue,
          category,
          minable,
          acquireMode
        };
      })
      .sort((a, b) => b.estMarketValue - a.estMarketValue);

    const materialCostIsk = flatMaterials.reduce((s, m) => s + m.totalPrice, 0);
    const minedSavingsIsk = flatMaterials.reduce(
      (s, m) => s + (m.acquireMode === 'mine' ? m.estMarketValue : 0),
      0
    );
    const eivBaseIsk = flatMaterials.reduce((s, m) => s + m.estMarketValue, 0);
    const jobFeeIsk = eivBaseIsk * (systemCostIndex + req.facilityTaxPct / 100);
    const totalCostIsk = materialCostIsk + jobFeeIsk;

    const totalOutputQuantity = runs * root.productQuantity;
    const outputUnitPrice = pickPrice(outputQuotes[root.productTypeId]);
    const outputTotalIsk = outputUnitPrice * totalOutputQuantity;
    const profitIsk = outputTotalIsk - totalCostIsk;
    const marginPct = totalCostIsk > 0 ? (profitIsk / totalCostIsk) * 100 : 0;

    const baseTimeSeconds = root.time * runs;
    const effectiveTimeSeconds = Math.max(
      1,
      Math.round(baseTimeSeconds * Math.max(0.1, calcTimeMult(root.activityId)))
    );
    const totalTreeTimeSeconds = effectiveTimeSeconds + subTreeTimeSeconds;
    const iskPerHour = totalTreeTimeSeconds > 0 ? (profitIsk / totalTreeTimeSeconds) * 3600 : 0;

    // Sort strictly deepest-first so every dependency is crafted before any step that consumes it
    const orderedSteps = [
      ...Array.from(stepMap.values()).sort((a, b) => b.depth - a.depth),
      {
        blueprintTypeId: root.blueprintTypeId,
        blueprintName: root.blueprintName,
        productName: root.productName,
        runs,
        timeSeconds: effectiveTimeSeconds,
        depth: 0
      }
    ];

    // Check missing blueprints against active character (and all registered characters)
    const allChars = this.db.all<{ character_id: number; character_name: string }>(
      'SELECT character_id, character_name FROM characters'
    );
    const bpSetsByChar = new Map<number, { name: string; typeIds: Set<number> }>();
    await Promise.all(
      allChars.map(async (c) => {
        const typeIds = await this.getOwnedBlueprintTypeIdsForChar(c.character_id);
        bpSetsByChar.set(c.character_id, { name: c.character_name, typeIds });
      })
    );

    const missingBpSpecs: StaticBlueprintSpec[] = [];
    const missingOtherOwner = new Map<number, string | null>();
    for (const spec of requiredBpMap.values()) {
      let ownedInScope = false;
      let otherOwner: string | null = null;
      for (const [cid, info] of bpSetsByChar.entries()) {
        if (info.typeIds.has(spec.blueprintTypeId)) {
          if (req.useAllCharactersAssets || !req.characterId || cid === req.characterId) {
            ownedInScope = true;
          } else if (!otherOwner) {
            otherOwner = info.name;
          }
        }
      }
      if (!ownedInScope) {
        missingBpSpecs.push(spec);
        missingOtherOwner.set(spec.blueprintTypeId, otherOwner);
      }
    }

    const missingBpQuotes =
      missingBpSpecs.length > 0
        ? await this.marketService
            .getQuotesForTypes(
              req.inputRegionId,
              missingBpSpecs.map((s) => s.blueprintTypeId)
            )
            .catch(() => ({} as Record<number, { sellMin?: number | null; buyMax?: number | null }>))
        : ({} as Record<number, { sellMin?: number | null; buyMax?: number | null }>);

    const missingBlueprints = missingBpSpecs.map((s) => ({
      blueprintTypeId: s.blueprintTypeId,
      blueprintName: s.blueprintName,
      productName: s.productName,
      activityId: s.activityId,
      unitPrice: pickPrice(missingBpQuotes[s.blueprintTypeId]),
      ownedByOtherChar: missingOtherOwner.get(s.blueprintTypeId) ?? null
    }));

    return {
      blueprintTypeId: root.blueprintTypeId,
      blueprintName: root.blueprintName,
      activityId: root.activityId,
      productTypeId: root.productTypeId,
      productName: root.productName,
      totalOutputQuantity,
      optimizationMode: mode,
      tree,
      flatMaterials,
      craftingSteps: orderedSteps,
      missingBlueprints,
      materialCostIsk,
      ownedSavingsIsk,
      minedSavingsIsk,
      systemCostIndex,
      jobFeeIsk,
      totalCostIsk,
      outputUnitPrice,
      outputTotalIsk,
      profitIsk,
      marginPct,
      iskPerHour,
      baseTimeSeconds,
      effectiveTimeSeconds,
      totalTreeTimeSeconds,
      appliedMfgImplantBonusPct,
      implants,
      pilotSkillsSummary
    };
  }

  private resolveFacilityOrSystemName(id: number): string | null {
    if (STATION_NAME_MAP.has(id)) return STATION_NAME_MAP.get(id)!;
    const cached = this.db.get<{ name: string }>(
      'SELECT name FROM location_names_cache WHERE location_id = ?',
      [id]
    );
    if (cached?.name) return cached.name;
    const sys = this.db.get<{ solar_system_name: string }>(
      'SELECT solar_system_name FROM sde_solar_systems WHERE solar_system_id = ?',
      [id]
    );
    return sys?.solar_system_name ?? null;
  }

  private async resolveRemoteLocationName(id: number, characterId: number): Promise<string | null> {
    const local = this.resolveFacilityOrSystemName(id);
    if (local) return local;
    if (id >= 60_000_000 && id < 64_000_000) {
      const st = await this.esiClient
        .request<{ name?: string }>(`/universe/stations/${id}/`)
        .catch(() => null);
      if (st?.name) {
        this.db.run(
          'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)',
          [id, st.name, Date.now()]
        );
        return st.name;
      }
    } else if (id >= 1_000_000_000_000) {
      const st = await this.esiClient
        .request<{ name?: string }>(`/universe/structures/${id}/`, { characterId })
        .catch(() => null);
      if (st?.name) {
        this.db.run(
          'INSERT OR REPLACE INTO location_names_cache (location_id, name, updated_at) VALUES (?, ?, ?)',
          [id, st.name, Date.now()]
        );
        return st.name;
      }
    }
    return null;
  }

  async listOwnedBlueprints(characterId: number | null): Promise<OwnedBlueprintDto[]> {
    const chars =
      characterId !== null
        ? this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters WHERE character_id = ?',
            [characterId]
          )
        : this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters ORDER BY character_name ASC'
          );

    if (chars.length === 0) return [];

    // Load asset hierarchy from SQLite so blueprints inside containers/ships resolve to their station/structure
    const assetRows = this.db.all<{
      item_id: number;
      location_id: number;
      type_id: number;
      type_name: string | null;
      custom_name: string | null;
    }>(
      `SELECT a.item_id, a.location_id, a.type_id, t.type_name, an.name AS custom_name
       FROM character_assets a
       LEFT JOIN sde_inv_types t ON t.type_id = a.type_id
       LEFT JOIN character_asset_names an ON an.character_id = a.character_id AND an.item_id = a.item_id`
    );
    const assetByItemId = new Map(assetRows.map((a) => [a.item_id, a]));

    const out: OwnedBlueprintDto[] = [];

    for (const ch of chars) {
      const raw = await this.esiClient
        .request<
          Array<{
            item_id: number;
            type_id: number;
            location_id: number;
            location_flag: string;
            quantity: number;
            runs: number;
            material_efficiency: number;
            time_efficiency: number;
          }>
        >(`/characters/${ch.character_id}/blueprints/`, { characterId: ch.character_id })
        .catch(() => []);

      const rows = Array.isArray(raw) ? raw : [];
      this.ownedBpCache.set(ch.character_id, {
        at: Date.now(),
        typeIds: new Set(rows.map((r) => r.type_id))
      });

      for (const r of rows) {
        // Walk up container/ship chain if location_id is an asset item_id
        let rootId = r.location_id;
        const chain: string[] = [];
        const visited = new Set<number>([r.item_id]);
        for (let hop = 0; hop < 6; hop++) {
          const parent = assetByItemId.get(rootId);
          if (!parent || visited.has(parent.item_id)) break;
          visited.add(parent.item_id);
          const pType = parent.type_name ?? `Type #${parent.type_id}`;
          const pLabel =
            parent.custom_name && parent.custom_name !== pType
              ? `${parent.custom_name} (${pType})`
              : pType;
          chain.push(pLabel);
          rootId = parent.location_id;
        }

        const rootName =
          (await this.resolveRemoteLocationName(rootId, ch.character_id)) ??
          (rootId >= 1_000_000_000_000
            ? `Structure #${rootId}`
            : rootId >= 60_000_000 && rootId < 64_000_000
              ? `Station #${rootId}`
              : `Location #${rootId}`);

        const locationName = chain.length > 0 ? `${chain.join(' › ')} — ${rootName}` : rootName;
        const destinationId = rootId >= 30_000_000 && !assetByItemId.has(rootId) ? rootId : null;

        const bp = BP_BY_TYPE_ID.get(r.type_id);
        const typeRow = !bp
          ? this.db.get<{ type_name: string }>(
              'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
              [r.type_id]
            )
          : null;

        out.push({
          characterId: ch.character_id,
          characterName: ch.character_name,
          itemId: r.item_id,
          typeId: r.type_id,
          typeName: bp?.blueprintName ?? typeRow?.type_name ?? `Blueprint #${r.type_id}`,
          productName: bp?.productName ?? '—',
          activityId: bp?.activityId ?? 1,
          locationId: r.location_id,
          destinationId,
          locationName,
          locationFlag: r.location_flag,
          quantity: r.quantity === -1 || r.quantity === -2 ? 1 : r.quantity,
          runs: r.runs,
          isBpo: r.runs === -1,
          meLevel: r.material_efficiency,
          teLevel: r.time_efficiency,
          hasRecipe: Boolean(bp)
        });
      }
    }

    return out.sort((a, b) => a.typeName.localeCompare(b.typeName));
  }

  async listCharacterJobs(characterId: number | null): Promise<CharacterIndustryJobDto[]> {
    const chars =
      characterId !== null
        ? this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters WHERE character_id = ?',
            [characterId]
          )
        : this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters ORDER BY character_name ASC'
          );

    if (chars.length === 0) return [];
    const out: CharacterIndustryJobDto[] = [];

    for (const ch of chars) {
      const raw = await this.esiClient
        .request<
          Array<{
            job_id: number;
            activity_id: number;
            blueprint_type_id: number;
            product_type_id?: number;
            runs: number;
            status: string;
            start_date: string;
            end_date: string;
            facility_id: number;
            cost?: number;
          }>
        >(`/characters/${ch.character_id}/industry/jobs/`, {
          characterId: ch.character_id,
          query: { include_completed: true }
        })
        .catch(() => []);

      const rows = Array.isArray(raw) ? raw : [];
      for (const j of rows) {
        const bp = BP_BY_TYPE_ID.get(j.blueprint_type_id);
        const bpTypeRow = !bp
          ? this.db.get<{ type_name: string }>(
              'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
              [j.blueprint_type_id]
            )
          : null;
        const prodTypeRow = j.product_type_id
          ? this.db.get<{ type_name: string }>(
              'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
              [j.product_type_id]
            )
          : null;

        const facilityName =
          (await this.resolveRemoteLocationName(j.facility_id, ch.character_id)) ??
          `Facility #${j.facility_id}`;

        out.push({
          characterId: ch.character_id,
          characterName: ch.character_name,
          jobId: j.job_id,
          activityId: j.activity_id,
          activityName: ACTIVITY_NAMES[j.activity_id] ?? `Activity #${j.activity_id}`,
          blueprintTypeId: j.blueprint_type_id,
          blueprintName: bp?.blueprintName ?? bpTypeRow?.type_name ?? `Blueprint #${j.blueprint_type_id}`,
          productTypeId: j.product_type_id ?? bp?.productTypeId ?? 0,
          productName: prodTypeRow?.type_name ?? bp?.productName ?? '—',
          runs: j.runs,
          status: j.status,
          startDate: Date.parse(j.start_date) || 0,
          endDate: Date.parse(j.end_date) || 0,
          facilityId: j.facility_id,
          facilityName,
          cost: j.cost ?? 0
        });
      }
    }

    return out.sort((a, b) => b.endDate - a.endDate);
  }
}

function toSearchDto(b: StaticBlueprintSpec): BlueprintSearchItemDto {
  return {
    blueprintTypeId: b.blueprintTypeId,
    blueprintName: b.blueprintName,
    activityId: b.activityId,
    time: b.time,
    productTypeId: b.productTypeId,
    productName: b.productName,
    productQuantity: b.productQuantity
  };
}

