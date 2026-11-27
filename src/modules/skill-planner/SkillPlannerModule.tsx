import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Clock, Cpu, GraduationCap, Search, Syringe } from 'lucide-react';
import type { InvTypeRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type {
  CharacterAttributesDto,
  ImplantDetailDto,
  SkillRequirementNode
} from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { SortableHeader, type SortDirection } from '@/core/components/SortableHeader';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';
import { formatSp } from '@/core/utils/format';
import {
  calculateInjectorsNeeded,
  calculateTrainingMinutes,
  formatDurationDhm
} from './injectorMath';

export function SkillPlannerModule({ activeCharacterId, incomingClipboard }: ModuleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<InvTypeRow[]>([]);
  const [eftText, setEftText] = useState('');
  const [targetLevel, setTargetLevel] = useState(5);
  const [nodes, setNodes] = useState<SkillRequirementNode[]>([]);
  const [currentTotalSp, setCurrentTotalSp] = useState<number>(3_500_000);
  const [implants, setImplants] = useState<ImplantDetailDto[]>([]);
  const [attributes, setAttributes] = useState<CharacterAttributesDto>({
    charisma: 19,
    intelligence: 23,
    memory: 21,
    perception: 23,
    willpower: 21
  });
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'skillName' | 'rank' | 'currentSp' | 'missingSp'>('missingSp');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const handleSort = (field: 'skillName' | 'rank' | 'currentSp' | 'missingSp') => {
    if (sortBy === field) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(field);
      setSortDir(field === 'skillName' ? 'asc' : 'desc');
    }
  };

  const sortedNodes = useMemo(() => {
    const copy = [...nodes];
    const mult = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (sortBy === 'skillName') return a.skillName.localeCompare(b.skillName) * mult;
      return (a[sortBy] - b[sortBy]) * mult;
    });
    return copy;
  }, [nodes, sortBy, sortDir]);

  // Sync character SP & attributes when character changes
  useEffect(() => {
    if (activeCharacterId === null) {
      setImplants([]);
      return;
    }
    void (async () => {
      const [skillsRes, attrRes] = await Promise.all([
        window.eveLens.db.getCharacterSkills(activeCharacterId),
        window.eveLens.skills.syncAttributesAndImplants(activeCharacterId).catch(() => null)
      ]);
      if (skillsRes.totalSp > 0) setCurrentTotalSp(skillsRes.totalSp);
      if (attrRes?.attributes) setAttributes(attrRes.attributes);
      if (attrRes?.implants) setImplants(attrRes.implants);
    })();
  }, [activeCharacterId]);

  const analyzeEft = useCallback(
    async (raw: string) => {
      const parsed = parseEveClipboard(raw);
      if (parsed.format !== 'eft') return;
      setLoading(true);
      try {
        const names = [parsed.shipName, ...parsed.lines.map((l) => l.name), ...parsed.lines.map((l) => l.charge ?? '').filter(Boolean)];
        const lookup = await window.eveLens.sde.lookupTypesByNames(names);
        const targets = Object.values(lookup).map((t) => ({ typeId: t.typeId }));
        if (targets.length === 0) {
          setNodes([]);
          return;
        }
        const resolved = await window.eveLens.skills.resolveRequirements(targets, activeCharacterId);
        setNodes(resolved);
      } finally {
        setLoading(false);
      }
    },
    [activeCharacterId]
  );

  useEffect(() => {
    if (incomingClipboard && incomingClipboard.format === 'eft') {
      setEftText(incomingClipboard.raw);
      void analyzeEft(incomingClipboard.raw);
    }
  }, [incomingClipboard, analyzeEft]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const found = await window.eveLens.sde.searchTypes(q, 18);
    setSearchResults(found);
  };

  const selectTypeTarget = async (item: InvTypeRow) => {
    setLoading(true);
    try {
      const resolved = await window.eveLens.skills.resolveRequirements(
        [{ typeId: item.typeId, targetLevel }],
        activeCharacterId
      );
      setNodes(resolved);
    } finally {
      setLoading(false);
    }
  };

  const totalMissingSp = useMemo(
    () => nodes.reduce((sum, n) => sum + n.missingSp, 0),
    [nodes]
  );

  const totalMinutes = useMemo(
    () => calculateTrainingMinutes(nodes, attributes),
    [nodes, attributes]
  );

  const injectorPlan = useMemo(
    () => calculateInjectorsNeeded(currentTotalSp, totalMissingSp),
    [currentTotalSp, totalMissingSp]
  );

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      {/* Top Grid: Target Input & Injector/Time Summary */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: Target Search or EFT Fit Paste */}
        <div className="photon-panel relative z-30 flex flex-col gap-3 p-3 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-eve-border pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <GraduationCap className="h-4 w-4 text-eve-accent" />
              Target Ship, Skill, or EFT Fit
            </div>
            <button
              type="button"
              onClick={async () => {
                const txt = await window.eveLens.clipboard.readText();
                setEftText(txt);
                void analyzeEft(txt);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
            >
              <ClipboardPaste className="h-3 w-3" />
              Paste EFT
            </button>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-eve-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => void handleSearch(e.target.value)}
                placeholder="Search Ship, Module, or Skill in SDE..."
                className="w-full border border-eve-border bg-eve-bg py-1.5 pl-8 pr-3 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
              />
            </div>
            <select
              value={targetLevel}
              onChange={(e) => setTargetLevel(Number(e.target.value))}
              className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              title="Target Skill Level (when selecting a Skill)"
            >
              {[1, 2, 3, 4, 5].map((lvl) => (
                <option key={lvl} value={lvl}>
                  Lvl {lvl}
                </option>
              ))}
            </select>
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-36 divide-y divide-eve-border/50 overflow-y-auto border border-eve-border bg-eve-bg">
              {searchResults.map((item) => (
                <button
                  key={item.typeId}
                  type="button"
                  onClick={() => void selectTypeTarget(item)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-eve-elevated"
                >
                  <EveIcon path={`types/${item.typeId}/icon?size=64`} size={20} alt={item.typeName} />
                  <span className="truncate font-medium text-eve-text">{item.typeName}</span>
                  <span className="ml-auto text-[10px] text-eve-muted">{item.groupName}</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            rows={3}
            value={eftText}
            onChange={(e) => setEftText(e.target.value)}
            placeholder="[Gila, Abyssal]&#10;Drone Damage Amplifier II&#10;..."
            className="w-full resize-none border border-eve-border bg-eve-bg p-2 font-mono text-xs text-eve-text focus:border-eve-accent focus:outline-none"
          />
          <button
            type="button"
            disabled={loading || !eftText.trim()}
            onClick={() => void analyzeEft(eftText)}
            className="border border-eve-accent/60 bg-eve-accent-muted py-1.5 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25 disabled:opacity-40"
          >
            {loading ? 'Resolving Prerequisites...' : 'Analyze EFT Fit Requirements'}
          </button>
        </div>

        {/* Right: Training Time & Diminishing Returns Injector Plan */}
        <div className="photon-panel flex flex-col justify-between p-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Training & Skill Injector Breakdown
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-eve-muted">Current Pilot SP:</span>
              <input
                type="number"
                value={currentTotalSp}
                onChange={(e) => setCurrentTotalSp(Math.max(0, Number(e.target.value)))}
                className="num-mono w-32 border border-eve-border bg-eve-bg px-2 py-0.5 text-right text-xs text-eve-text focus:border-eve-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricBox
              icon={GraduationCap}
              label="Missing SP"
              value={formatSp(totalMissingSp)}
              accent
            />
            <MetricBox
              icon={Clock}
              label="Training Time"
              value={formatDurationDhm(totalMinutes)}
            />
            <MetricBox
              icon={Syringe}
              label="Large Injectors"
              value={`${injectorPlan.largeInjectors}x`}
            />
            <MetricBox
              icon={Syringe}
              label="Small Injectors"
              value={`${injectorPlan.smallInjectors}x`}
              sub={`${formatSp(injectorPlan.leftoverSp)} spare`}
            />
          </div>

          {/* Diminishing Returns Brackets & Attributes */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="border border-eve-border bg-eve-bg/60 p-2.5 text-[11px]">
              <div className="mb-1.5 font-semibold uppercase tracking-wider text-eve-muted">
                Injector Bracket Usage
              </div>
              {injectorPlan.bracketBreakdown.length === 0 ? (
                <div className="text-eve-muted">No injectors required.</div>
              ) : (
                <div className="space-y-1">
                  {injectorPlan.bracketBreakdown.map((b) => (
                    <div key={b.label} className="flex justify-between">
                      <span className="text-eve-text">{b.label}</span>
                      <span className="num-mono text-eve-accent">
                        {b.largeUsed > 0 ? `${b.largeUsed}L ` : ''}
                        {b.smallUsed > 0 ? `${b.smallUsed}S` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-eve-border bg-eve-bg/60 p-2.5 text-[11px]">
              <div className="mb-1.5 flex items-center justify-between font-semibold uppercase tracking-wider text-eve-muted">
                <span>Pilot Attributes (with Implants)</span>
                {implants.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-eve-accent">
                    <Cpu className="h-3 w-3" />
                    {implants.length} Active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {(['intelligence', 'perception', 'memory', 'willpower', 'charisma'] as const).map(
                  (attr) => (
                    <label key={attr} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase text-eve-muted">
                        {attr.slice(0, 3)}
                      </span>
                      <input
                        type="number"
                        value={attributes[attr]}
                        onChange={(e) =>
                          setAttributes((prev) => ({ ...prev, [attr]: Number(e.target.value) }))
                        }
                        className="num-mono border border-eve-border bg-eve-panel py-0.5 text-center text-xs text-eve-text"
                      />
                    </label>
                  )
                )}
              </div>
              {implants.length > 0 && (
                <div className="mt-2 max-h-20 space-y-0.5 overflow-y-auto border-t border-eve-border/60 pt-1.5">
                  {implants.map((imp) => {
                    const bonusParts = [
                      imp.bonuses.intelligence ? `+${imp.bonuses.intelligence} INT` : '',
                      imp.bonuses.perception ? `+${imp.bonuses.perception} PER` : '',
                      imp.bonuses.memory ? `+${imp.bonuses.memory} MEM` : '',
                      imp.bonuses.willpower ? `+${imp.bonuses.willpower} WIL` : '',
                      imp.bonuses.charisma ? `+${imp.bonuses.charisma} CHA` : ''
                    ].filter(Boolean);
                    return (
                      <div key={imp.typeId} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate text-eve-text">
                          {imp.slot ? `[S${imp.slot}] ` : ''}
                          {imp.name}
                        </span>
                        {bonusParts.length > 0 && (
                          <span className="num-mono shrink-0 text-eve-accent">
                            {bonusParts.join(' ')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Required Skills Table */}
      <div className="photon-panel flex min-h-0 flex-1 flex-col">
        <div className="photon-header flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider">
            Required Skills Tree ({nodes.length})
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          {nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
              Search an item/skill or paste an EFT fit to inspect missing skills and injector math.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                <tr className="border-b border-eve-border">
                  <SortableHeader label="Skill" field="skillName" activeField={sortBy} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Rank" field="rank" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <th className="px-3 py-2 text-center">Trained / Req</th>
                  <SortableHeader label="Current SP" field="currentSp" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Missing SP" field="missingSp" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-eve-border/50">
                {sortedNodes.map((node) => {
                  const satisfied = node.missingSp === 0;
                  return (
                    <tr key={node.skillId} className="hover:bg-eve-elevated/60">
                      <td className="px-3 py-2 font-medium text-eve-text">{node.skillName}</td>
                      <td className="num-mono px-3 py-2 text-right text-eve-muted">
                        {node.rank}x
                      </td>
                      <td className="num-mono px-3 py-2 text-center">
                        <span className={satisfied ? 'text-eve-success' : 'text-eve-warning'}>
                          {node.trainedLevel}
                        </span>
                        <span className="text-eve-muted"> / {node.requiredLevel}</span>
                      </td>
                      <td className="num-mono px-3 py-2 text-right text-eve-muted">
                        {node.currentSp.toLocaleString()}
                      </td>
                      <td
                        className={`num-mono px-3 py-2 text-right font-semibold ${
                          satisfied ? 'text-eve-success' : 'text-eve-accent'
                        }`}
                      >
                        {satisfied ? 'Trained' : formatSp(node.missingSp)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricBox({
  icon: Icon,
  label,
  value,
  sub,
  accent = false
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-eve-border bg-eve-bg/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-eve-muted">
        <Icon className="h-3 w-3 text-eve-accent" />
        {label}
      </div>
      <div className={`num-mono mt-1 text-sm font-bold ${accent ? 'text-eve-accent' : 'text-eve-text'}`}>
        {value}
      </div>
      {sub && <div className="num-mono mt-0.5 text-[10px] text-eve-muted">{sub}</div>}
    </div>
  );
}

