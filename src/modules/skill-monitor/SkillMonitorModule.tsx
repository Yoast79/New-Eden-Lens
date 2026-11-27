import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock,
  Cpu,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type { SkillMonitorDto } from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { useTheme } from '@/core/contexts/ThemeContext';
import { formatDate, formatSp } from '@/core/utils/format';

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Done';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function LevelPips({ level, trainingTo }: { level: number; trainingTo: number | null }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const trained = n <= level;
        const training = !trained && trainingTo !== null && n <= trainingTo;
        return (
          <span
            key={n}
            className={`h-2.5 w-2.5 border ${
              trained
                ? 'border-sky-400 bg-sky-400'
                : training
                  ? 'border-amber-400 bg-amber-400/40 animate-pulse'
                  : 'border-slate-700 bg-slate-900'
            }`}
          />
        );
      })}
    </div>
  );
}

export function SkillMonitorModule({ activeCharacterId }: ModuleProps) {
  const { settings } = useTheme();
  const [data, setData] = useState<SkillMonitorDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [tab, setTab] = useState<'queue' | 'skills'>('queue');
  const [filterMode, setFilterMode] = useState<'all' | 'trained' | 'untrained' | 'level5' | 'training'>('trained');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadMonitor = useCallback(async () => {
    if (!activeCharacterId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await window.eveLens.skills.getSkillMonitor(activeCharacterId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill monitor.');
    } finally {
      setLoading(false);
    }
  }, [activeCharacterId]);

  useEffect(() => {
    void loadMonitor();
  }, [loadMonitor]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const activeSkill = useMemo(() => {
    if (!data || data.queue.length === 0) return null;
    return data.queue.find((q) => !q.finishDate || Date.parse(q.finishDate) > nowMs) ?? data.queue[0];
  }, [data, nowMs]);

  const queueEndMs = useMemo(() => {
    if (!data || data.queue.length === 0) return null;
    let maxMs = 0;
    for (const q of data.queue) {
      if (q.finishDate) {
        const ms = Date.parse(q.finishDate);
        if (ms > maxMs) maxMs = ms;
      }
    }
    return maxMs > 0 ? maxMs : null;
  }, [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.skills.map((s) => s.groupName))).sort();
  }, [data]);

  const filteredSkills = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.skills.filter((s) => {
      if (filterMode === 'trained' && s.trainedLevel === 0) return false;
      if (filterMode === 'untrained' && s.trainedLevel > 0) return false;
      if (filterMode === 'level5' && s.trainedLevel < 5) return false;
      if (filterMode === 'training' && !s.isTraining) return false;
      if (groupFilter !== 'all' && s.groupName !== groupFilter) return false;
      if (q && !s.skillName.toLowerCase().includes(q) && !s.groupName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data, filterMode, groupFilter, search]);

  if (!activeCharacterId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-slate-400">
        Select a pilot in the top bar to monitor their trained skills, active queue, and implants.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <GraduationCap className="h-5 w-5 text-sky-400" />
            Skill Monitor
          </h1>
          <p className="text-xs text-slate-400">
            Live skill queue countdown, trained &amp; untrained skill catalog, attributes, and active implants.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadMonitor()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync Skills &amp; Queue
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-800/70 bg-rose-950/60 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
          Syncing skills, queue, attributes, and implants...
        </div>
      ) : data ? (
        <>
          {/* Top KPI & Implants Grid */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            {/* Active Training Card */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 lg:col-span-5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Active Training
                </span>
                <span className="font-mono text-[11px] text-sky-300">
                  {formatSp(data.totalSp)}
                  {data.unallocatedSp > 0 && (
                    <span className="ml-2 text-amber-300">
                      (+{data.unallocatedSp.toLocaleString()} unallocated)
                    </span>
                  )}
                </span>
              </div>
              {activeSkill ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">
                      {activeSkill.skillName} {activeSkill.finishedLevel}
                    </span>
                    <span className="font-mono text-xs font-semibold text-emerald-400">
                      {activeSkill.finishDate
                        ? formatCountdown(Date.parse(activeSkill.finishDate) - nowMs)
                        : 'Paused'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Finishes:{' '}
                      {activeSkill.finishDate
                        ? formatDate(activeSkill.finishDate, settings?.dateFormat, true)
                        : 'Queue Paused'}
                    </span>
                    {queueEndMs && (
                      <span>
                        Queue Total: {formatCountdown(queueEndMs - nowMs)} (
                        {data.queue.length} queued)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-2 text-xs text-amber-300">
                  No skill currently in training queue.
                </div>
              )}
            </div>

            {/* Attributes Card */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 lg:col-span-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Cpu className="h-3.5 w-3.5 text-sky-400" />
                Neural Attributes
              </div>
              <div className="grid grid-cols-5 gap-1 text-center text-xs">
                {[
                  ['INT', data.attributes.intelligence],
                  ['MEM', data.attributes.memory],
                  ['PER', data.attributes.perception],
                  ['WIL', data.attributes.willpower],
                  ['CHA', data.attributes.charisma]
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} className="rounded border border-slate-800 bg-slate-950/80 py-1">
                    <div className="text-[9px] text-slate-400">{lbl}</div>
                    <div className="font-mono font-semibold text-sky-300">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Implants Card */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 lg:col-span-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Active Implants ({data.implants.length})
              </div>
              {data.implants.length === 0 ? (
                <div className="text-xs text-slate-500">No active implants plugged in.</div>
              ) : (
                <div className="flex max-h-16 flex-wrap gap-1.5 overflow-y-auto">
                  {data.implants.map((imp) => {
                    const bonusList = [
                      imp.bonuses.intelligence ? `+${imp.bonuses.intelligence} INT` : '',
                      imp.bonuses.memory ? `+${imp.bonuses.memory} MEM` : '',
                      imp.bonuses.perception ? `+${imp.bonuses.perception} PER` : '',
                      imp.bonuses.willpower ? `+${imp.bonuses.willpower} WIL` : '',
                      imp.bonuses.charisma ? `+${imp.bonuses.charisma} CHA` : ''
                    ].filter(Boolean);
                    return (
                      <span
                        key={imp.typeId}
                        title={bonusList.join(' • ') || imp.name}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-200"
                      >
                        <EveIcon path={`types/${imp.typeId}/icon?size=32`} size={16} alt={imp.name} />
                        <span className="max-w-[140px] truncate">{imp.name}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTab('queue')}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
                  tab === 'queue'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Skill Queue ({data.queue.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('skills')}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
                  tab === 'skills'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                Skill Catalog ({data.skills.filter((s) => s.trainedLevel > 0).length} / {data.skills.length})
              </button>
            </div>

            {tab === 'skills' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center overflow-hidden rounded border border-slate-700">
                  {(
                    [
                      ['trained', 'Trained'],
                      ['untrained', 'Untrained'],
                      ['training', 'Training'],
                      ['level5', 'Level V'],
                      ['all', 'All']
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFilterMode(id)}
                      className={`px-2.5 py-1 text-[11px] ${
                        filterMode === id
                          ? 'bg-sky-600 font-medium text-white'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                >
                  <option value="all">All Categories</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>

                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter skills..."
                    className="w-full rounded border border-slate-700 bg-slate-950 py-1 pl-8 pr-7 text-xs text-slate-100 placeholder-slate-500"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Content Table */}
          <div className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-900/50">
            {tab === 'queue' ? (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-800 bg-slate-950/95 text-[10px] uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Skill</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Target Level</th>
                    <th className="px-3 py-2 text-right">SP Needed</th>
                    <th className="px-3 py-2">Finishes</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.queue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Skill queue is empty.
                      </td>
                    </tr>
                  ) : (
                    data.queue.map((q) => {
                      const remMs = q.finishDate ? Date.parse(q.finishDate) - nowMs : 0;
                      const isFirst = activeSkill?.queuePosition === q.queuePosition;
                      return (
                        <tr
                          key={`${q.queuePosition}-${q.skillId}-${q.finishedLevel}`}
                          className={isFirst ? 'bg-sky-950/35' : 'hover:bg-slate-800/40'}
                        >
                          <td className="px-3 py-2 font-mono text-slate-400">{q.queuePosition + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-100">{q.skillName}</td>
                          <td className="px-3 py-2 text-slate-400">{q.groupName}</td>
                          <td className="px-3 py-2 font-mono text-amber-300">Level {q.finishedLevel}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-300">
                            {Math.max(0, q.levelEndSp - q.trainingStartSp).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                            {q.finishDate ? formatDate(q.finishDate, settings?.dateFormat, true) : 'Paused'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-400">
                            {q.finishDate ? formatCountdown(remMs) : 'Paused'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-800 bg-slate-950/95 text-[10px] uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Skill</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Rank</th>
                    <th className="px-3 py-2">Level</th>
                    <th className="px-3 py-2 text-right">Skillpoints</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredSkills.slice(0, 500).map((s) => (
                    <tr
                      key={s.skillId}
                      className={s.isTraining ? 'bg-sky-950/30' : 'hover:bg-slate-800/40'}
                    >
                      <td className="px-3 py-1.5 font-medium text-slate-100">
                        {s.skillName}
                        {s.isTraining && (
                          <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-300">
                            Training → L{s.trainingToLevel}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-400">{s.groupName}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-400">x{s.rank}</td>
                      <td className="px-3 py-1.5">
                        <LevelPips level={s.trainedLevel} trainingTo={s.trainingToLevel} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-300">
                        {s.skillpointsInSkill.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
