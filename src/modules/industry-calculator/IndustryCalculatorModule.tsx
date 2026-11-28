import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Check,
  Clock,
  Copy,
  Factory,
  Layers,
  Navigation,
  Package,
  RefreshCw,
  Search
} from 'lucide-react';
import { TRADE_HUBS } from '@shared/constants/eve';
import { useAccounts } from '@/core/contexts/AccountContext';
import type { ModuleProps } from '@shared/types/module';
import type {
  BlueprintSearchItemDto,
  CharacterIndustryJobDto,
  IndustryCalculationResultDto,
  IndustryMaterialNodeDto,
  OwnedBlueprintDto
} from '@shared/types/modules-data';
import { formatIsk } from '@/core/utils/format';

type IndustryTab = 'calculator' | 'blueprints' | 'jobs';

function formatDuration(sec: number): string {
  if (sec <= 0) return '0s';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'READY';
  return formatDuration(Math.floor(diff / 1000));
}

function MaterialTreeRows({
  nodes,
  depth = 0,
  onToggleDecision,
  onToggleMine
}: {
  nodes: IndustryMaterialNodeDto[];
  depth?: number;
  onToggleDecision: (typeId: number, next: 'craft' | 'buy') => void;
  onToggleMine: (typeId: number, next: 'mine' | 'buy') => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        const isCraft = n.decision === 'craft' && n.children.length > 0;
        const isMine = !isCraft && n.acquireMode === 'mine';
        const craftCheaper =
          n.craftTotalPrice !== null && (n.buyTotalPrice === 0 || n.craftTotalPrice < n.buyTotalPrice);
        return (
          <>
            <tr key={`${depth}-${n.typeId}`} className="hover:bg-eve-elevated/40">
              <td className="px-3 py-1.5" style={{ paddingLeft: `${12 + depth * 18}px` }}>
                <div className="flex items-center gap-1.5">
                  <span className={depth > 0 && !isCraft ? 'text-eve-muted' : 'font-semibold text-eve-text'}>
                    {depth > 0 ? '↳ ' : ''}
                    {n.typeName}
                  </span>
                  {n.craftable && n.craftTotalPrice !== null && (
                    <span
                      className={`border px-1 py-0 text-[9px] ${
                        craftCheaper
                          ? 'border-eve-success/40 text-eve-success'
                          : 'border-eve-warning/40 text-eve-warning'
                      }`}
                      title={`Buy: ${formatIsk(n.buyTotalPrice)} vs Craft: ${formatIsk(n.craftTotalPrice)}`}
                    >
                      {craftCheaper ? 'Craft Cheaper' : 'Buy Cheaper'}
                    </span>
                  )}
                </div>
                {n.ownedQuantity > 0 && (
                  <div className="text-[10px] text-eve-success">
                    Owned: {n.ownedQuantity.toLocaleString()} ({isMine ? 'Mine' : 'Buy'}{' '}
                    {n.buyQuantity.toLocaleString()})
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5 text-center">
                {n.craftable && n.children.length > 0 ? (
                  <div className="inline-flex border border-eve-border bg-eve-bg text-[10px]">
                    <button
                      type="button"
                      onClick={() => onToggleDecision(n.typeId, 'craft')}
                      className={`px-1.5 py-0.5 font-semibold ${
                        isCraft
                          ? 'bg-eve-success/20 text-eve-success'
                          : 'text-eve-muted hover:text-eve-text'
                      }`}
                      title={`Craft (${formatIsk(n.craftTotalPrice ?? 0)}, +${formatDuration(n.craftTimeSeconds)})`}
                    >
                      Craft
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleDecision(n.typeId, 'buy')}
                      className={`border-l border-eve-border px-1.5 py-0.5 font-semibold ${
                        !isCraft
                          ? 'bg-eve-success/20 text-eve-success'
                          : 'text-eve-muted hover:text-eve-text'
                      }`}
                      title={`Buy (${formatIsk(n.buyTotalPrice)})`}
                    >
                      Buy
                    </button>
                  </div>
                ) : n.minable ? (
                  <div className="inline-flex border border-eve-border bg-eve-bg text-[10px]">
                    <button
                      type="button"
                      onClick={() => onToggleMine(n.typeId, 'buy')}
                      className={`px-1.5 py-0.5 font-semibold ${
                        !isMine
                          ? 'bg-eve-success/20 text-eve-success'
                          : 'text-eve-muted hover:text-eve-text'
                      }`}
                      title={`Buy from market (${formatIsk(n.buyTotalPrice)})`}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleMine(n.typeId, 'mine')}
                      className={`border-l border-eve-border px-1.5 py-0.5 font-semibold ${
                        isMine
                          ? 'bg-eve-success/20 text-eve-success'
                          : 'text-eve-muted hover:text-eve-text'
                      }`}
                      title="Mine / Gather yourself (0 ISK market cost)"
                    >
                      Mine
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-eve-muted">Buy</span>
                )}
              </td>
              <td className="num-mono px-3 py-1.5 text-right font-semibold text-eve-text">
                {n.adjustedQuantity.toLocaleString()}
              </td>
              <td className="num-mono px-3 py-1.5 text-right text-eve-muted">
                {formatIsk(n.buyTotalPrice)}
              </td>
              <td className="num-mono px-3 py-1.5 text-right text-eve-accent">
                {n.craftTotalPrice !== null ? formatIsk(n.craftTotalPrice) : '—'}
              </td>
            </tr>
            {isCraft && (
              <MaterialTreeRows
                nodes={n.children}
                depth={depth + 1}
                onToggleDecision={onToggleDecision}
                onToggleMine={onToggleMine}
              />
            )}
          </>
        );
      })}
    </>
  );
}

const INDUSTRY_CALC_STORAGE_KEY = 'nel:industry-calculator-state:v1';

interface SavedIndustryCalcState {
  activeTab?: IndustryTab;
  bpQuery?: string;
  selectedBp?: BlueprintSearchItemDto | null;
  runs?: number;
  meLevel?: number;
  teLevel?: number;
  structurePreset?: 'npc' | 'raitaru' | 'azbel' | 'sotiyo';
  rigPreset?: 'none' | 't1' | 't2';
  facilityTaxPct?: number;
  marketRegionId?: number;
  optimizationMode?: 'cheapest' | 'fastest' | 'custom';
  craftOverrides?: Record<number, 'craft' | 'buy'>;
  mineOverrides?: Record<number, 'mine' | 'buy'>;
  mfgImplantOverride?: number | null;
  useOwnedMaterials?: boolean;
  useAllCharactersAssets?: boolean;
  listTab?: 'shopping' | 'gathering' | 'steps' | 'missing';
}

function loadSavedCalcState(): SavedIndustryCalcState {
  try {
    const raw = window.localStorage.getItem(INDUSTRY_CALC_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedIndustryCalcState) : {};
  } catch {
    return {};
  }
}

export function IndustryCalculatorModule({ activeCharacterId }: ModuleProps) {
  const { characters } = useAccounts();
  const [savedInit] = useState<SavedIndustryCalcState>(() => loadSavedCalcState());
  const [activeTab, setActiveTab] = useState<IndustryTab>(savedInit.activeTab ?? 'calculator');
  const [nowMs, setNowMs] = useState(Date.now());
  const [destMsg, setDestMsg] = useState<string | null>(null);

  // Calculator state
  const [bpQuery, setBpQuery] = useState(savedInit.bpQuery ?? '');
  const [bpHits, setBpHits] = useState<BlueprintSearchItemDto[]>([]);
  const [selectedBp, setSelectedBp] = useState<BlueprintSearchItemDto | null>(savedInit.selectedBp ?? null);
  const [runs, setRuns] = useState(savedInit.runs ?? 1);
  const [meLevel, setMeLevel] = useState(savedInit.meLevel ?? 10);
  const [teLevel, setTeLevel] = useState(savedInit.teLevel ?? 20);
  const [structurePreset, setStructurePreset] = useState<'npc' | 'raitaru' | 'azbel' | 'sotiyo'>(
    savedInit.structurePreset ?? 'azbel'
  );
  const [rigPreset, setRigPreset] = useState<'none' | 't1' | 't2'>(savedInit.rigPreset ?? 't2');
  const [facilityTaxPct, setFacilityTaxPct] = useState(savedInit.facilityTaxPct ?? 1.0);
  const [marketRegionId, setMarketRegionId] = useState<number>(
    savedInit.marketRegionId ?? TRADE_HUBS[0].regionId
  );
  const [optimizationMode, setOptimizationMode] = useState<'cheapest' | 'fastest' | 'custom'>(
    savedInit.optimizationMode ?? 'cheapest'
  );
  const [craftOverrides, setCraftOverrides] = useState<Record<number, 'craft' | 'buy'>>(
    savedInit.craftOverrides ?? {}
  );
  const [mineOverrides, setMineOverrides] = useState<Record<number, 'mine' | 'buy'>>(
    savedInit.mineOverrides ?? {}
  );
  const [mfgImplantOverride, setMfgImplantOverride] = useState<number | null>(
    savedInit.mfgImplantOverride ?? null
  );
  const [showImplantsPanel, setShowImplantsPanel] = useState(false);
  const [useOwnedMaterials, setUseOwnedMaterials] = useState(savedInit.useOwnedMaterials ?? false);
  const [useAllCharactersAssets, setUseAllCharactersAssets] = useState(
    savedInit.useAllCharactersAssets ?? true
  );
  const [listTab, setListTab] = useState<'shopping' | 'gathering' | 'steps' | 'missing'>(
    savedInit.listTab ?? 'shopping'
  );

  const [calcResult, setCalcResult] = useState<IndustryCalculationResultDto | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [copiedMultibuy, setCopiedMultibuy] = useState(false);

  // Blueprint Browser state
  const [bpCharScope, setBpCharScope] = useState<number | null>(activeCharacterId);
  const [blueprints, setBlueprints] = useState<OwnedBlueprintDto[]>([]);
  const [bpLoading, setBpLoading] = useState(false);
  const [bpFilterText, setBpFilterText] = useState('');
  const [bpTypeFilter, setBpTypeFilter] = useState<'all' | 'bpo' | 'bpc'>('all');

  // Jobs state
  const [jobsCharScope, setJobsCharScope] = useState<number | null>(activeCharacterId);
  const [jobs, setJobs] = useState<CharacterIndustryJobDto[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const payload: SavedIndustryCalcState = {
        activeTab,
        bpQuery,
        selectedBp,
        runs,
        meLevel,
        teLevel,
        structurePreset,
        rigPreset,
        facilityTaxPct,
        marketRegionId,
        optimizationMode,
        craftOverrides,
        mineOverrides,
        mfgImplantOverride,
        useOwnedMaterials,
        useAllCharactersAssets,
        listTab
      };
      window.localStorage.setItem(INDUSTRY_CALC_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quota errors
    }
  }, [
    activeTab,
    bpQuery,
    selectedBp,
    runs,
    meLevel,
    teLevel,
    structurePreset,
    rigPreset,
    facilityTaxPct,
    marketRegionId,
    optimizationMode,
    craftOverrides,
    mineOverrides,
    mfgImplantOverride,
    useOwnedMaterials,
    useAllCharactersAssets,
    listTab
  ]);

  useEffect(() => {
    if (selectedBp) return;
    void window.eveLens.industry.searchBlueprints('Rifter', 10).then((hits) => {
      if (hits.length > 0) {
        setSelectedBp(hits[0]);
        setBpQuery(hits[0].blueprintName);
      }
    });
  }, []);

  const structureBonuses = useMemo(() => {
    if (structurePreset === 'npc') return { me: 0, te: 0 };
    if (structurePreset === 'raitaru') return { me: 1, te: 15 };
    if (structurePreset === 'azbel') return { me: 1, te: 20 };
    return { me: 1, te: 30 };
  }, [structurePreset]);

  const rigBonuses = useMemo(() => {
    if (rigPreset === 'none') return { me: 0, te: 0 };
    if (rigPreset === 't1') return { me: 2.0, te: 20 };
    return { me: 2.4, te: 24 };
  }, [rigPreset]);

  const runCalculation = useCallback(
    async (override?: {
      bp?: BlueprintSearchItemDto;
      me?: number;
      te?: number;
      mode?: 'cheapest' | 'fastest' | 'custom';
      overrides?: Record<number, 'craft' | 'buy'>;
      mineOverrides?: Record<number, 'mine' | 'buy'>;
      mfgImplantBonusPct?: number | null;
    }) => {
      const bp = override?.bp ?? selectedBp;
      if (!bp) return;
      setCalcLoading(true);
      setCalcError(null);
      const effMode = override?.mode ?? optimizationMode;
      try {
        const res = await window.eveLens.industry.calculate({
          blueprintTypeId: bp.blueprintTypeId,
          activityId: bp.activityId,
          runs,
          meLevel: override?.me ?? meLevel,
          teLevel: override?.te ?? teLevel,
          structureMeBonusPct: structureBonuses.me,
          structureTeBonusPct: structureBonuses.te,
          rigMeBonusPct: rigBonuses.me,
          rigTeBonusPct: rigBonuses.te,
          facilityTaxPct,
          solarSystemId: null,
          inputRegionId: marketRegionId,
          outputRegionId: marketRegionId,
          characterId: activeCharacterId,
          expandSubComponents: effMode !== 'fastest',
          optimizationMode: effMode,
          craftOverrides: override?.overrides ?? craftOverrides,
          mineOverrides: override?.mineOverrides ?? mineOverrides,
          useOwnedMaterials,
          useAllCharactersAssets,
          mfgImplantBonusPct:
            override?.mfgImplantBonusPct !== undefined
              ? override.mfgImplantBonusPct
              : mfgImplantOverride
        });
        setCalcResult(res);
      } catch (err) {
        setCalcError(err instanceof Error ? err.message : 'Calculation failed');
      } finally {
        setCalcLoading(false);
      }
    },
    [
      selectedBp,
      runs,
      meLevel,
      teLevel,
      structureBonuses,
      rigBonuses,
      facilityTaxPct,
      marketRegionId,
      activeCharacterId,
      optimizationMode,
      craftOverrides,
      mineOverrides,
      useOwnedMaterials,
      useAllCharactersAssets,
      mfgImplantOverride
    ]
  );

  useEffect(() => {
    if (selectedBp) void runCalculation();
  }, [
    selectedBp,
    activeCharacterId,
    optimizationMode,
    useOwnedMaterials,
    useAllCharactersAssets,
    mfgImplantOverride,
    marketRegionId
  ]);

  const handleToggleNodeDecision = (typeId: number, next: 'craft' | 'buy') => {
    // Seed overrides from current tree decisions so switching one node preserves the rest
    const seeded: Record<number, 'craft' | 'buy'> = { ...craftOverrides };
    const collectDefaults = (nodes: IndustryMaterialNodeDto[]) => {
      for (const n of nodes) {
        if (n.craftable && !(n.typeId in seeded)) seeded[n.typeId] = n.decision;
        if (n.children.length > 0) collectDefaults(n.children);
      }
    };
    if (calcResult) collectDefaults(calcResult.tree);
    seeded[typeId] = next;
    setCraftOverrides(seeded);
    setOptimizationMode('custom');
    void runCalculation({ mode: 'custom', overrides: seeded });
  };

  const handleToggleMine = (typeId: number, next: 'mine' | 'buy') => {
    const nextOverrides: Record<number, 'mine' | 'buy'> = { ...mineOverrides, [typeId]: next };
    setMineOverrides(nextOverrides);
    void runCalculation({ mineOverrides: nextOverrides });
  };

  const handleMineAllMinerals = (mine: boolean) => {
    if (!calcResult) return;
    const nextOverrides: Record<number, 'mine' | 'buy'> = { ...mineOverrides };
    for (const m of calcResult.flatMaterials) {
      if (m.category === 'mineral') {
        nextOverrides[m.typeId] = mine ? 'mine' : 'buy';
      }
    }
    setMineOverrides(nextOverrides);
    void runCalculation({ mineOverrides: nextOverrides });
  };

  const loadBlueprints = useCallback(async () => {
    setBpLoading(true);
    try {
      const list = await window.eveLens.industry.listOwnedBlueprints(bpCharScope);
      setBlueprints(list);
    } finally {
      setBpLoading(false);
    }
  }, [bpCharScope]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const list = await window.eveLens.industry.listCharacterJobs(jobsCharScope);
      setJobs(list);
    } finally {
      setJobsLoading(false);
    }
  }, [jobsCharScope]);

  useEffect(() => {
    void loadBlueprints();
  }, [loadBlueprints]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleSetDest = async (destinationId: number | null, label: string, ownerCharId: number) => {
    if (!destinationId) return;
    const targetCharId = activeCharacterId ?? ownerCharId;
    try {
      await window.eveLens.nav.setAutopilotWaypoint(targetCharId, destinationId, true, false);
      setDestMsg(`Autopilot set to ${label}`);
      setTimeout(() => setDestMsg(null), 3000);
    } catch (err) {
      setDestMsg(err instanceof Error ? err.message : 'Failed to set destination');
    }
  };

  const filteredBlueprints = useMemo(() => {
    const q = bpFilterText.trim().toLowerCase();
    return blueprints.filter((b) => {
      if (bpTypeFilter === 'bpo' && !b.isBpo) return false;
      if (bpTypeFilter === 'bpc' && b.isBpo) return false;
      if (q) {
        return (
          b.typeName.toLowerCase().includes(q) ||
          b.productName.toLowerCase().includes(q) ||
          b.locationName.toLowerCase().includes(q) ||
          b.characterName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [blueprints, bpFilterText, bpTypeFilter]);

  const activeMfgJobsCount = jobs.filter((j) => j.status === 'active' && j.activityId === 1).length;
  const activeReactionJobsCount = jobs.filter((j) => j.status === 'active' && j.activityId === 11).length;

  const handleCopyMultibuy = () => {
    if (!calcResult) return;
    const text = calcResult.flatMaterials
      .filter((m) => m.quantity > 0 && m.acquireMode === 'buy')
      .map((m) => `${m.typeName} ${m.quantity}`)
      .join('\n');
    void navigator.clipboard.writeText(text);
    setCopiedMultibuy(true);
    setTimeout(() => setCopiedMultibuy(false), 1800);
  };

  const handleLoadOwnedInCalc = async (owned: OwnedBlueprintDto) => {
    const hits = await window.eveLens.industry.searchBlueprints(owned.typeName, 5);
    const match = hits.find((h) => h.blueprintTypeId === owned.typeId) ?? hits[0];
    if (!match) return;
    setSelectedBp(match);
    setBpQuery(match.blueprintName);
    setMeLevel(owned.meLevel);
    setTeLevel(owned.teLevel);
    setActiveTab('calculator');
    void runCalculation({ bp: match, me: owned.meLevel, te: owned.teLevel });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {/* Header + Tabs */}
      <div className="photon-panel flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <Factory className="h-4 w-4 text-eve-accent" />
            Industry Calculator
          </div>
          <div className="flex items-center gap-1">
            {[
              { id: 'calculator', label: 'Crafting Calculator', icon: Calculator },
              { id: 'blueprints', label: `Blueprint Browser (${blueprints.length})`, icon: Layers },
              { id: 'jobs', label: `Active Jobs (${jobs.filter((j) => j.status === 'active').length})`, icon: Clock }
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as IndustryTab)}
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

        {calcResult && (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-eve-muted">
            <span>
              Pilot Skills:{' '}
              <strong className="text-eve-text">Ind {calcResult.pilotSkillsSummary.industryLevel}</strong>
              {' / '}
              <strong className="text-eve-text">Adv {calcResult.pilotSkillsSummary.advIndustryLevel}</strong>
              {' / '}
              <strong className="text-eve-text">Reac {calcResult.pilotSkillsSummary.reactionsLevel}</strong>
            </span>
            <span>
              Mfg Slots:{' '}
              <strong className="text-eve-accent">
                {activeMfgJobsCount}/{calcResult.pilotSkillsSummary.maxMfgSlots}
              </strong>
            </span>
            <span>
              Reaction Slots:{' '}
              <strong className="text-eve-warning">
                {activeReactionJobsCount}/{calcResult.pilotSkillsSummary.maxReactionSlots}
              </strong>
            </span>
          </div>
        )}
      </div>

      {activeTab === 'calculator' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* Controls */}
          <div className="photon-panel relative z-30 grid grid-cols-2 gap-2 p-3 text-xs lg:grid-cols-6">
            <div className="relative col-span-2">
              <span className="mb-0.5 block text-[10px] uppercase text-eve-muted">
                Blueprint / Reaction
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-eve-muted" />
                <input
                  type="text"
                  value={bpQuery}
                  onChange={async (e) => {
                    const q = e.target.value;
                    setBpQuery(q);
                    setBpHits(
                      q.trim().length >= 2
                        ? await window.eveLens.industry.searchBlueprints(q.trim(), 15)
                        : []
                    );
                  }}
                  placeholder="Search blueprint or product..."
                  className="w-full border border-eve-border bg-eve-bg py-1.5 pl-7 pr-2 text-xs text-eve-text outline-none focus:border-eve-accent"
                />
              </div>
              {bpHits.length > 0 && (
                <div className="photon-panel absolute left-0 right-0 top-full z-40 max-h-56 overflow-y-auto shadow-xl">
                  {bpHits.map((b) => (
                    <button
                      key={`${b.blueprintTypeId}-${b.activityId}`}
                      type="button"
                      onClick={() => {
                        setSelectedBp(b);
                        setBpQuery(b.blueprintName);
                        setBpHits([]);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                    >
                      <span className="truncate font-semibold text-eve-text">{b.blueprintName}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-eve-accent">
                        {b.activityId === 11 ? 'Reaction' : 'Mfg'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="space-y-0.5">
              <span className="block text-[10px] uppercase text-eve-muted">Runs</span>
              <input
                type="number"
                min={1}
                max={10000}
                value={runs}
                onChange={(e) => setRuns(Math.max(1, Number(e.target.value) || 1))}
                className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
              />
            </label>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-0.5">
                <span className="block text-[10px] uppercase text-eve-muted">ME %</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={meLevel}
                  onChange={(e) => setMeLevel(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                  className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[10px] uppercase text-eve-muted">TE %</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={teLevel}
                  onChange={(e) => setTeLevel(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                  className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-0.5">
                <span className="block text-[10px] uppercase text-eve-muted">Structure</span>
                <select
                  value={structurePreset}
                  onChange={(e) => setStructurePreset(e.target.value as typeof structurePreset)}
                  className="w-full border border-eve-border bg-eve-bg px-1.5 py-1.5 text-[11px]"
                >
                  <option value="npc">NPC (0%)</option>
                  <option value="raitaru">Raitaru (1%)</option>
                  <option value="azbel">Azbel (1%)</option>
                  <option value="sotiyo">Sotiyo (1%)</option>
                </select>
              </label>
              <label className="space-y-0.5">
                <span className="block text-[10px] uppercase text-eve-muted">Rig</span>
                <select
                  value={rigPreset}
                  onChange={(e) => setRigPreset(e.target.value as typeof rigPreset)}
                  className="w-full border border-eve-border bg-eve-bg px-1.5 py-1.5 text-[11px]"
                >
                  <option value="none">No Rig</option>
                  <option value="t1">T1 (2%)</option>
                  <option value="t2">T2 (2.4%)</option>
                </select>
              </label>
            </div>

            <div className="flex items-end gap-1.5">
              <button
                type="button"
                disabled={calcLoading || !selectedBp}
                onClick={() => void runCalculation()}
                className="inline-flex w-full items-center justify-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 font-semibold text-eve-accent disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${calcLoading ? 'animate-spin' : ''}`} />
                Calculate
              </button>
            </div>

            {/* Row 2: Facility Tax + Market Hub + Route/Implants/Owned */}
            <label className="space-y-0.5">
              <span className="block text-[10px] uppercase text-eve-muted">Facility Tax %</span>
              <input
                type="number"
                min={0}
                max={25}
                step={0.1}
                value={facilityTaxPct}
                onChange={(e) => setFacilityTaxPct(Number(e.target.value) || 0)}
                className="num-mono w-full border border-eve-border bg-eve-bg px-2 py-1 text-xs"
              />
            </label>

            <label className="space-y-0.5">
              <span className="block text-[10px] uppercase text-eve-muted">Market Hub</span>
              <select
                value={marketRegionId}
                onChange={(e) => setMarketRegionId(Number(e.target.value))}
                className="w-full border border-eve-border bg-eve-bg px-2 py-1 text-xs"
              >
                {TRADE_HUBS.map((h) => (
                  <option key={h.regionId} value={h.regionId}>
                    {h.shortName}
                  </option>
                ))}
              </select>
            </label>

            <div className="col-span-2 lg:col-span-4 flex flex-wrap items-center justify-between gap-2 pb-1 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[10px] uppercase text-eve-muted">Route:</span>
                {(['cheapest', 'fastest', 'custom'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setOptimizationMode(m);
                      if (m !== 'custom') setCraftOverrides({});
                    }}
                    className={`border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      optimizationMode === m
                        ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                        : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                    }`}
                  >
                    {m === 'cheapest' ? 'Cheapest' : m === 'fastest' ? 'Fastest' : 'Custom'}
                  </button>
                ))}
                <select
                  value={mfgImplantOverride === null ? 'auto' : String(mfgImplantOverride)}
                  onChange={(e) =>
                    setMfgImplantOverride(e.target.value === 'auto' ? null : Number(e.target.value))
                  }
                  className="ml-1 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[11px] text-eve-text"
                  title="Manufacturing Time Implant (Slot 8)"
                >
                  <option value="auto">
                    Implant: Auto{calcResult ? ` (-${calcResult.appliedMfgImplantBonusPct}%)` : ''}
                  </option>
                  <option value="0">None (0%)</option>
                  <option value="1">BX-801 (-1%)</option>
                  <option value="2">BX-802 (-2%)</option>
                  <option value="4">BX-804 (-4%)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowImplantsPanel((v) => !v)}
                  className={`border px-2 py-0.5 text-[10px] uppercase ${
                    showImplantsPanel
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                  }`}
                >
                  Implants
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={useOwnedMaterials}
                    onChange={(e) => setUseOwnedMaterials(e.target.checked)}
                  />
                  <span>Use Own Materials</span>
                </label>
                {useOwnedMaterials && (
                  <label className="inline-flex items-center gap-1 text-[11px] text-eve-muted">
                    <input
                      type="checkbox"
                      checked={useAllCharactersAssets}
                      onChange={(e) => setUseAllCharactersAssets(e.target.checked)}
                    />
                    All Chars
                  </label>
                )}
              </div>
            </div>
          </div>

          {showImplantsPanel && calcResult && (
            <div className="photon-panel p-3 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-eve-accent">
                  Industry &amp; Research Implants (Zainou &apos;Beancounter&apos;)
                </span>
                <span className="text-[10px] text-eve-muted">
                  Applied Manufacturing Bonus: -{calcResult.appliedMfgImplantBonusPct}% job time
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    { key: 'manufacturing', title: 'Manufacturing Time (Slot 8)' },
                    { key: 'me_research', title: 'ME Research Time (Slot 7)' },
                    { key: 'te_research', title: 'TE Research Time (Slot 6)' },
                    { key: 'copying', title: 'Blueprint Copying (Slot 8)' }
                  ] as const
                ).map((grp) => (
                  <div key={grp.key} className="border border-eve-border/60 bg-eve-bg/60 p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase text-eve-muted">
                      {grp.title}
                    </div>
                    <div className="space-y-1">
                      {calcResult.implants
                        .filter((i) => i.activity === grp.key)
                        .map((imp) => (
                          <div key={imp.typeId} className="flex items-center justify-between gap-1 text-[11px]">
                            <span className={imp.installed ? 'font-semibold text-eve-success' : 'text-eve-text'}>
                              {imp.name.replace("Zainou 'Beancounter' ", '')}
                            </span>
                            <span className="num-mono shrink-0 text-[10px] text-eve-accent">
                              -{imp.bonusPct}%{imp.installed ? ' ✓' : ''}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {calcError && (
            <div className="border border-eve-danger/60 bg-eve-danger/10 px-3 py-2 text-xs text-eve-danger">
              {calcError}
            </div>
          )}

          {/* KPI Summary */}
          {calcResult && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="photon-panel p-3">
                <div className="text-[10px] uppercase text-eve-muted">ISK Required (To Buy + Fee)</div>
                <div className="num-mono mt-1 text-base font-bold text-eve-text">
                  {formatIsk(calcResult.totalCostIsk)}
                </div>
                <div className="text-[10px] text-eve-muted">
                  Mats: {formatIsk(calcResult.materialCostIsk)} + Fee: {formatIsk(calcResult.jobFeeIsk)}
                  {calcResult.ownedSavingsIsk > 0 && (
                    <span className="ml-1 text-eve-success">
                      (Owned -{formatIsk(calcResult.ownedSavingsIsk)})
                    </span>
                  )}
                  {calcResult.minedSavingsIsk > 0 && (
                    <span className="ml-1 text-eve-accent">
                      (Mined -{formatIsk(calcResult.minedSavingsIsk)})
                    </span>
                  )}
                </div>
              </div>

              <div className="photon-panel p-3">
                <div className="text-[10px] uppercase text-eve-muted">
                  Output ({calcResult.totalOutputQuantity.toLocaleString()}x {calcResult.productName})
                </div>
                <div className="num-mono mt-1 text-base font-bold text-eve-accent">
                  {formatIsk(calcResult.outputTotalIsk)}
                </div>
                <div className="text-[10px] text-eve-muted">
                  Unit: {formatIsk(calcResult.outputUnitPrice)}
                </div>
              </div>

              <div className="photon-panel p-3">
                <div className="text-[10px] uppercase text-eve-muted">Net Profit &amp; Margin</div>
                <div
                  className={`num-mono mt-1 text-base font-bold ${
                    calcResult.profitIsk >= 0 ? 'text-eve-success' : 'text-eve-danger'
                  }`}
                >
                  {formatIsk(calcResult.profitIsk)} ({calcResult.marginPct.toFixed(1)}%)
                </div>
              </div>

              <div className="photon-panel p-3">
                <div className="text-[10px] uppercase text-eve-muted">Total Tree Time</div>
                <div className="num-mono mt-1 text-base font-bold text-eve-warning">
                  {formatDuration(calcResult.totalTreeTimeSeconds)}
                </div>
                <div className="text-[10px] text-eve-muted">
                  Final Job: {formatDuration(calcResult.effectiveTimeSeconds)}
                  {calcResult.appliedMfgImplantBonusPct > 0 && (
                    <span className="ml-1 text-eve-success">
                      (-{calcResult.appliedMfgImplantBonusPct}% imp)
                    </span>
                  )}
                </div>
              </div>

              <div className="photon-panel p-3">
                <div className="text-[10px] uppercase text-eve-muted">Profit Rate</div>
                <div
                  className={`num-mono mt-1 text-base font-bold ${
                    calcResult.iskPerHour >= 0 ? 'text-eve-success' : 'text-eve-danger'
                  }`}
                >
                  {formatIsk(calcResult.iskPerHour)}/hr
                </div>
              </div>
            </div>
          )}

          {/* BOM Tree + Tabbed Shopping / Gathering / Crafting Queue */}
          {calcResult && (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="photon-panel flex min-h-0 flex-col lg:col-span-7">
                <div className="photon-header flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider">
                  <span>Material Tree ({calcResult.blueprintName})</span>
                  <span className="text-[10px] font-normal normal-case text-eve-accent">
                    Mode: {calcResult.optimizationMode.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase text-eve-muted">
                      <tr className="border-b border-eve-border">
                        <th className="px-3 py-2">Material</th>
                        <th className="px-2 py-2 text-center">Action</th>
                        <th className="px-3 py-2 text-right">Req Qty</th>
                        <th className="px-3 py-2 text-right">Buy ISK</th>
                        <th className="px-3 py-2 text-right">Craft ISK</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-eve-border/40">
                      <MaterialTreeRows
                        nodes={calcResult.tree}
                        onToggleDecision={handleToggleNodeDecision}
                        onToggleMine={handleToggleMine}
                      />
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="photon-panel flex min-h-0 flex-col lg:col-span-5">
                <div className="flex flex-wrap items-center justify-between gap-1 border-b border-eve-border bg-eve-panel/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      {
                        id: 'shopping',
                        label: `Shopping (${calcResult.flatMaterials.filter((m) => m.quantity > 0 && m.acquireMode === 'buy').length})`
                      },
                      {
                        id: 'gathering',
                        label: `Gathering (${calcResult.flatMaterials.filter((m) => m.quantity > 0 && m.acquireMode === 'mine').length})`
                      },
                      {
                        id: 'steps',
                        label: `Craft Queue (${calcResult.craftingSteps.length})`
                      },
                      {
                        id: 'missing',
                        label: `Missing BPs (${calcResult.missingBlueprints.length})`
                      }
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setListTab(t.id as typeof listTab)}
                        className={`border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          listTab === t.id
                            ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                            : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {listTab === 'shopping' && (
                    <button
                      type="button"
                      onClick={handleCopyMultibuy}
                      className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2 py-0.5 text-[10px] font-semibold text-eve-accent"
                    >
                      {copiedMultibuy ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedMultibuy ? 'Copied' : 'Multibuy'}
                    </button>
                  )}
                  {listTab === 'gathering' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMineAllMinerals(true)}
                        className="border border-eve-success/60 bg-eve-success/10 px-2 py-0.5 text-[10px] font-semibold text-eve-success"
                      >
                        Mine Minerals
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMineAllMinerals(false)}
                        className="border border-eve-border bg-eve-bg px-2 py-0.5 text-[10px] text-eve-muted hover:text-eve-text"
                      >
                        Buy All
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 divide-y divide-eve-border/40 overflow-auto">
                  {listTab === 'shopping' &&
                    calcResult.flatMaterials
                      .filter((m) => m.quantity > 0 && m.acquireMode === 'buy')
                      .map((m) => (
                        <div key={m.typeId} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                          <div className="min-w-0">
                            <div className="truncate text-eve-text">{m.typeName}</div>
                            {m.ownedQuantity > 0 && (
                              <div className="text-[10px] text-eve-success">
                                Owned: {m.ownedQuantity.toLocaleString()} / Need: {m.requiredQuantity.toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-right">
                            <div>
                              <span className="num-mono font-semibold text-eve-accent">
                                {m.quantity.toLocaleString()}x
                              </span>
                              <span className="num-mono ml-2 text-[11px] text-eve-muted">
                                {formatIsk(m.totalPrice)}
                              </span>
                            </div>
                            {m.minable && (
                              <button
                                type="button"
                                onClick={() => handleToggleMine(m.typeId, 'mine')}
                                className="border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[10px] text-eve-muted hover:border-eve-success hover:text-eve-success"
                                title="Move to Gathering / Mine yourself"
                              >
                                Mine
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                  {listTab === 'gathering' &&
                    (() => {
                      const mineItems = calcResult.flatMaterials.filter(
                        (m) => m.quantity > 0 && m.acquireMode === 'mine'
                      );
                      if (mineItems.length === 0) {
                        return (
                          <div className="p-4 text-center text-xs text-eve-muted">
                            No items set to Mine yet. Toggle any material to <span className="text-eve-success">Mine</span> in the tree or click <span className="text-eve-success">Mine Minerals</span> above.
                          </div>
                        );
                      }
                      return mineItems.map((m) => (
                        <div key={m.typeId} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                          <div>
                            <div className="font-semibold text-eve-text">{m.typeName}</div>
                            <div className="text-[10px] text-eve-muted">
                              Total Needed: {m.requiredQuantity.toLocaleString()} • Owned:{' '}
                              {m.ownedQuantity.toLocaleString()}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-right">
                            <div>
                              <div className="num-mono font-semibold text-eve-success">
                                Mine {m.quantity.toLocaleString()}x
                              </div>
                              <div className="num-mono text-[10px] text-eve-muted">
                                Est: {formatIsk(m.estMarketValue)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleMine(m.typeId, 'buy')}
                              className="border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[10px] text-eve-muted hover:border-eve-warning hover:text-eve-warning"
                              title="Move back to Shopping / Buy"
                            >
                              Buy
                            </button>
                          </div>
                        </div>
                      ));
                    })()}

                  {listTab === 'steps' &&
                    calcResult.craftingSteps.map((st, i) => (
                      <div key={`${st.blueprintTypeId}-${i}`} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div>
                          <div className="font-semibold text-eve-text">
                            {i + 1}. {st.productName}
                          </div>
                          <div className="text-[10px] text-eve-muted">
                            {st.blueprintName} • {st.runs.toLocaleString()} run{st.runs === 1 ? '' : 's'}
                          </div>
                        </div>
                        <span className="num-mono font-semibold text-eve-warning">
                          {formatDuration(st.timeSeconds)}
                        </span>
                      </div>
                    ))}

                  {listTab === 'missing' &&
                    (calcResult.missingBlueprints.length === 0 ? (
                      <div className="p-4 text-center text-xs text-eve-success">
                        All required blueprints for this build are owned!
                      </div>
                    ) : (
                      <>
                        <div className="border-b border-eve-border/60 bg-eve-panel/40 px-3 py-1.5 text-[10px] text-eve-muted">
                          Note: Listed prices are NPC/Market <span className="font-semibold text-eve-text">BPO</span> prices — cheaper <span className="font-semibold text-eve-accent">BPCs</span> may be available on Contracts.
                        </div>
                        {calcResult.missingBlueprints.map((bp) => (
                        <div key={bp.blueprintTypeId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-eve-danger">
                              {bp.blueprintName}
                            </div>
                            <div className="text-[10px] text-eve-muted">
                              For: {bp.productName} ({bp.activityId === 11 ? 'Reaction' : 'Manufacturing'})
                              {bp.ownedByOtherChar && (
                                <span className="ml-1 text-eve-warning">
                                  • Owned by {bp.ownedByOtherChar}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="num-mono shrink-0 text-right text-[11px] text-eve-muted">
                            {bp.unitPrice > 0 ? formatIsk(bp.unitPrice) : 'Contract / NPC'}
                          </div>
                        </div>
                        ))}
                      </>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'blueprints' && (
        <div className="photon-panel flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel/60 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bpCharScope === null ? 'all' : String(bpCharScope)}
                onChange={(e) => setBpCharScope(e.target.value === 'all' ? null : Number(e.target.value))}
                className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text outline-none focus:border-eve-accent"
              >
                <option value="all">All Registered Characters</option>
                {characters.map((c) => (
                  <option key={c.characterId} value={c.characterId}>
                    {c.characterName}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={bpFilterText}
                onChange={(e) => setBpFilterText(e.target.value)}
                placeholder="Filter blueprints, products, pilots, or locations..."
                className="w-64 border border-eve-border bg-eve-bg px-2.5 py-1 text-xs outline-none focus:border-eve-accent"
              />
              {(['all', 'bpo', 'bpc'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setBpTypeFilter(f)}
                  className={`border px-2 py-0.5 text-[11px] uppercase ${
                    bpTypeFilter === f
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent font-semibold'
                      : 'border-eve-border bg-eve-bg text-eve-muted'
                  }`}
                >
                  {f === 'all' ? 'All' : f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {destMsg && <span className="text-[11px] text-eve-accent">{destMsg}</span>}
              <button
                type="button"
                disabled={bpLoading}
                onClick={() => void loadBlueprints()}
                className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs font-semibold text-eve-accent disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${bpLoading ? 'animate-spin' : ''}`} />
                Sync Blueprints
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {filteredBlueprints.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
                No blueprints found. Click Sync Blueprints to load from ESI.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase text-eve-muted">
                  <tr className="border-b border-eve-border">
                    <th className="px-3 py-2">Blueprint</th>
                    <th className="px-3 py-2">Pilot</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">ME</th>
                    <th className="px-3 py-2 text-right">TE</th>
                    <th className="px-3 py-2">Potential</th>
                    <th className="px-3 py-2 text-right">Runs</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/40">
                  {filteredBlueprints.map((b) => (
                    <tr key={`${b.characterId}-${b.itemId}`} className="hover:bg-eve-elevated/40">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-eve-text">{b.typeName}</div>
                        <div className="text-[10px] text-eve-muted">Output: {b.productName}</div>
                      </td>
                      <td className="px-3 py-2 text-eve-muted">{b.characterName}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            b.isBpo
                              ? 'border-eve-accent/60 bg-eve-accent-muted text-eve-accent'
                              : 'border-eve-warning/60 bg-eve-warning/10 text-eve-warning'
                          }`}
                        >
                          {b.isBpo ? 'BPO' : 'BPC'}
                        </span>
                      </td>
                      <td className="num-mono px-3 py-2 text-right text-eve-success">{b.meLevel}%</td>
                      <td className="num-mono px-3 py-2 text-right text-eve-accent">{b.teLevel}%</td>
                      <td className="px-3 py-2">
                        {!b.isBpo ? (
                          <span className="border border-eve-border px-1.5 py-0.5 text-[10px] text-eve-muted">
                            BPC (Locked)
                          </span>
                        ) : b.meLevel >= 10 && b.teLevel >= 20 ? (
                          <span className="border border-eve-success/60 bg-eve-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-eve-success">
                            Maxed (10/20)
                          </span>
                        ) : (
                          <span
                            className="border border-eve-warning/60 bg-eve-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-eve-warning"
                            title={`Researchable up to ME 10 / TE 20 (currently ME ${b.meLevel}, TE ${b.teLevel})`}
                          >
                            Can Improve ({b.meLevel}/10 • {b.teLevel}/20)
                          </span>
                        )}
                      </td>
                      <td className="num-mono px-3 py-2 text-right">
                        {b.isBpo ? '∞' : b.runs.toLocaleString()}
                      </td>
                      <td className="num-mono px-3 py-2 text-right">{b.quantity}</td>
                      <td className="px-3 py-2 text-eve-text">
                        <div>{b.locationName}</div>
                        <div className="text-[10px] text-eve-muted">{b.locationFlag}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {b.destinationId && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleSetDest(b.destinationId, b.locationName, b.characterId)
                              }
                              className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-0.5 text-[10px] text-eve-text hover:border-eve-accent hover:text-eve-accent"
                            >
                              <Navigation className="h-2.5 w-2.5" />
                              Set Dest
                            </button>
                          )}
                          {b.hasRecipe && (
                            <button
                              type="button"
                              onClick={() => void handleLoadOwnedInCalc(b)}
                              className="border border-eve-accent/60 bg-eve-accent-muted px-2 py-0.5 text-[10px] font-semibold text-eve-accent hover:bg-eve-accent/25"
                            >
                              Load in Calc
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="photon-panel flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel/60 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider">
                Industry Jobs ({jobs.length})
              </span>
              <select
                value={jobsCharScope === null ? 'all' : String(jobsCharScope)}
                onChange={(e) =>
                  setJobsCharScope(e.target.value === 'all' ? null : Number(e.target.value))
                }
                className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text outline-none focus:border-eve-accent"
              >
                <option value="all">All Registered Characters</option>
                {characters.map((c) => (
                  <option key={c.characterId} value={c.characterId}>
                    {c.characterName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {destMsg && <span className="text-[11px] text-eve-accent">{destMsg}</span>}
              <button
                type="button"
                disabled={jobsLoading}
                onClick={() => void loadJobs()}
                className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs font-semibold text-eve-accent disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${jobsLoading ? 'animate-spin' : ''}`} />
                Sync Jobs
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {jobs.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
                No industry jobs found. Click Sync Jobs to fetch from ESI.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase text-eve-muted">
                  <tr className="border-b border-eve-border">
                    <th className="px-3 py-2">Activity</th>
                    <th className="px-3 py-2">Pilot</th>
                    <th className="px-3 py-2">Blueprint / Product</th>
                    <th className="px-3 py-2">Facility</th>
                    <th className="px-3 py-2 text-right">Runs</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Job Cost</th>
                    <th className="px-3 py-2 text-right">Timer</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/40">
                  {jobs.map((j) => (
                    <tr key={`${j.characterId}-${j.jobId}`} className="hover:bg-eve-elevated/40">
                      <td className="px-3 py-2 font-semibold text-eve-accent">{j.activityName}</td>
                      <td className="px-3 py-2 text-eve-muted">{j.characterName}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-eve-text">{j.productName}</div>
                        <div className="text-[10px] text-eve-muted">{j.blueprintName}</div>
                      </td>
                      <td className="px-3 py-2 text-eve-muted">{j.facilityName}</td>
                      <td className="num-mono px-3 py-2 text-right">{j.runs.toLocaleString()}</td>
                      <td className="px-3 py-2 uppercase text-[10px]">
                        <span
                          className={
                            j.status === 'active'
                              ? 'font-semibold text-eve-warning'
                              : 'text-eve-success'
                          }
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="num-mono px-3 py-2 text-right text-eve-muted">
                        {formatIsk(j.cost)}
                      </td>
                      <td className="num-mono px-3 py-2 text-right font-semibold text-eve-text">
                        {j.status === 'active' ? formatCountdown(j.endDate, nowMs) : 'DONE'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void handleSetDest(j.facilityId, j.facilityName, j.characterId)
                          }
                          className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-0.5 text-[10px] text-eve-text hover:border-eve-accent hover:text-eve-accent"
                        >
                          <Navigation className="h-2.5 w-2.5" />
                          Set Dest
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

