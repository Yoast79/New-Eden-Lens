import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Plus,
  Radar,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Users,
  X
} from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type {
  DScanGroupSummary,
  LocalPilotIntelDto,
  ManualStandingRow
} from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { ConfirmModal } from '@/core/components/ConfirmModal';
import { SortableHeader, type SortDirection } from '@/core/components/SortableHeader';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';

const THREAT_BADGE_STYLES: Record<DScanGroupSummary['threatTag'], string> = {
  CAPITAL: 'border-red-500/60 bg-red-500/15 text-red-400',
  'RECON/CYNO': 'border-amber-500/60 bg-amber-500/15 text-amber-300',
  LOGI: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300',
  TACKLE: 'border-sky-500/60 bg-sky-500/15 text-sky-300',
  COMMAND: 'border-purple-500/60 bg-purple-500/15 text-purple-300',
  'T3 CRUISER': 'border-orange-500/60 bg-orange-500/15 text-orange-300',
  BATTLESHIP: 'border-rose-500/60 bg-rose-500/15 text-rose-300',
  BATTLECRUISER: 'border-amber-400/50 bg-amber-400/10 text-amber-200',
  CRUISER: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300',
  DESTROYER: 'border-teal-500/50 bg-teal-500/10 text-teal-300',
  FRIGATE: 'border-blue-400/50 bg-blue-400/10 text-blue-300',
  MINING: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300',
  HAULER: 'border-slate-400/50 bg-slate-400/10 text-slate-300',
  STRUCTURE: 'border-indigo-400/50 bg-indigo-400/10 text-indigo-300',
  DRONE: 'border-zinc-500/50 bg-zinc-500/10 text-zinc-300',
  COMBAT: 'border-eve-border-strong bg-eve-elevated text-eve-text',
  OTHER: 'border-eve-border bg-eve-bg text-eve-muted'
};

type DScanSort = 'priority' | 'count' | 'name';
type LocalSortField = 'name' | 'corporationName' | 'allianceName' | 'standing' | 'dangerRatio' | 'shipsDestroyed';

export function LocalIntelModule({ activeCharacterId, incomingClipboard }: ModuleProps) {
  const [rawText, setRawText] = useState('');
  const [mode, setMode] = useState<'dscan' | 'local'>('dscan');
  const [dscanGroups, setDscanGroups] = useState<DScanGroupSummary[]>([]);
  const [localPilots, setLocalPilots] = useState<LocalPilotIntelDto[]>([]);
  const [manualStandings, setManualStandings] = useState<ManualStandingRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Sorting state
  const [dscanSort, setDscanSort] = useState<DScanSort>('priority');
  const [dscanDir, setDscanDir] = useState<SortDirection>('desc');
  const [localSort, setLocalSort] = useState<LocalSortField>('dangerRatio');
  const [localDir, setLocalDir] = useState<SortDirection>('desc');

  // Click-pilot standing popup state
  const [editingPilot, setEditingPilot] = useState<LocalPilotIntelDto | null>(null);
  const [popupStanding, setPopupStanding] = useState('-10');
  const [popupNote, setPopupNote] = useState('');

  // zKillboard browser confirmation popup
  const [zkillTarget, setZkillTarget] = useState<LocalPilotIntelDto | null>(null);
  const [zkillDontShow, setZkillDontShow] = useState(false);

  // Delete confirmation
  const [confirmDeleteStandingId, setConfirmDeleteStandingId] = useState<number | null>(null);

  // Quick manual bar state
  const [standTarget, setStandTarget] = useState('');
  const [standValue, setStandValue] = useState('-10');

  const openPilotZkill = (pilot: LocalPilotIntelDto) => {
    if (!pilot.characterId) return;
    if (localStorage.getItem('nel:zkillConfirmSkip') === '1') {
      void window.eveLens.app.openExternal(`https://zkillboard.com/character/${pilot.characterId}/`);
      return;
    }
    setZkillDontShow(false);
    setZkillTarget(pilot);
  };

  useEffect(() => {
    void window.eveLens.intel.listManualStandings().then(setManualStandings);
  }, []);

  const analyzeInput = useCallback(
    async (text: string) => {
      const parsed = parseEveClipboard(text);
      if (parsed.format !== 'dscan' && parsed.format !== 'local') return;

      setLoading(true);
      try {
        if (parsed.format === 'dscan') {
          setMode('dscan');
          const grouped = await window.eveLens.intel.analyzeDScan(parsed.entries);
          setDscanGroups(grouped);
        } else {
          setMode('local');
          const pilots = await window.eveLens.intel.analyzeLocalPilots(
            parsed.pilotNames,
            activeCharacterId
          );
          setLocalPilots(pilots);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeCharacterId]
  );

  useEffect(() => {
    if (
      incomingClipboard &&
      (incomingClipboard.format === 'dscan' || incomingClipboard.format === 'local')
    ) {
      setRawText(incomingClipboard.raw);
      void analyzeInput(incomingClipboard.raw);
    }
  }, [incomingClipboard, analyzeInput]);

  const sortedDscan = useMemo(() => {
    const copy = [...dscanGroups];
    const mult = dscanDir === 'asc' ? 1 : -1;
    const priorityMap: Record<DScanGroupSummary['threatTag'], number> = {
      CAPITAL: 16,
      'RECON/CYNO': 15,
      LOGI: 14,
      TACKLE: 13,
      COMMAND: 12,
      'T3 CRUISER': 11,
      BATTLESHIP: 10,
      BATTLECRUISER: 9,
      CRUISER: 8,
      DESTROYER: 7,
      FRIGATE: 6,
      COMBAT: 5,
      MINING: 4,
      HAULER: 3,
      STRUCTURE: 2,
      DRONE: 1,
      OTHER: 0
    };
    copy.sort((a, b) => {
      if (dscanSort === 'name') return a.groupName.localeCompare(b.groupName) * mult;
      if (dscanSort === 'count') return (a.count - b.count) * mult;
      return (priorityMap[a.threatTag] - priorityMap[b.threatTag] || a.count - b.count) * mult;
    });
    return copy;
  }, [dscanGroups, dscanSort, dscanDir]);

  const sortedLocal = useMemo(() => {
    const copy = [...localPilots];
    const mult = localDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (localSort === 'name' || localSort === 'corporationName' || localSort === 'allianceName') {
        return (a[localSort] ?? '').localeCompare(b[localSort] ?? '') * mult;
      }
      return ((a[localSort] ?? -999) - (b[localSort] ?? -999)) * mult;
    });
    return copy;
  }, [localPilots, localSort, localDir]);

  const handleLocalSort = (field: LocalSortField) => {
    if (localSort === field) setLocalDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setLocalSort(field);
      setLocalDir(field === 'name' || field === 'corporationName' || field === 'allianceName' ? 'asc' : 'desc');
    }
  };

  const dscanTotals = useMemo(() => {
    let total = 0;
    let caps = 0;
    let recon = 0;
    let logi = 0;
    let tackle = 0;
    for (const g of dscanGroups) {
      total += g.count;
      if (g.threatTag === 'CAPITAL') caps += g.count;
      if (g.threatTag === 'RECON/CYNO') recon += g.count;
      if (g.threatTag === 'LOGI') logi += g.count;
      if (g.threatTag === 'TACKLE') tackle += g.count;
    }
    return { total, caps, recon, logi, tackle };
  }, [dscanGroups]);

  const openPilotModal = (pilot: LocalPilotIntelDto) => {
    const existing = manualStandings.find(
      (m) => m.targetName.toLowerCase() === pilot.name.toLowerCase()
    );
    setEditingPilot(pilot);
    setPopupStanding(String(existing?.standing ?? pilot.standing ?? -10));
    setPopupNote(existing?.notes ?? '');
  };

  const savePilotModal = async () => {
    if (!editingPilot) return;
    const list = await window.eveLens.intel.upsertManualStanding({
      targetName: editingPilot.name,
      standing: Number(popupStanding),
      sourceLabel: 'Manual',
      notes: popupNote.trim()
    });
    setManualStandings(list);
    setEditingPilot(null);
    if (rawText.trim()) await analyzeInput(rawText);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      {/* Input & Summary Header */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="photon-panel flex flex-col gap-2 p-3 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-eve-border pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <Radar className="h-4 w-4 text-eve-accent" />
              Paste D-Scan or Local Chat
            </div>
            <button
              type="button"
              onClick={async () => {
                const txt = await window.eveLens.clipboard.readText();
                setRawText(txt);
                void analyzeInput(txt);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
            >
              <ClipboardPaste className="h-3 w-3" />
              Paste &amp; Scan
            </button>
          </div>
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste EVE D-Scan (Ctrl+A -> Ctrl+C) or Local Chat pilot list..."
            className="w-full resize-none border border-eve-border bg-eve-bg p-2 font-mono text-xs text-eve-text focus:border-eve-accent focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setMode('dscan')}
                className={`border px-2.5 py-1 ${
                  mode === 'dscan'
                    ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                    : 'border-eve-border bg-eve-bg text-eve-muted'
                }`}
              >
                D-Scan View
              </button>
              <button
                type="button"
                onClick={() => setMode('local')}
                className={`border px-2.5 py-1 ${
                  mode === 'local'
                    ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                    : 'border-eve-border bg-eve-bg text-eve-muted'
                }`}
              >
                Local Threat View
              </button>
            </div>
            <button
              type="button"
              disabled={loading || !rawText.trim()}
              onClick={() => void analyzeInput(rawText)}
              className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25 disabled:opacity-40"
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
              Analyze
            </button>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="photon-panel flex flex-col justify-between p-3 lg:col-span-6">
          <div className="border-b border-eve-border pb-2 text-xs font-semibold uppercase tracking-wider">
            {mode === 'dscan' ? 'D-Scan Fleet Composition' : 'Local Chat Threat Summary'}
          </div>

          {mode === 'dscan' ? (
            <div className="grid grid-cols-5 gap-2 py-2">
              <CountBox label="Total" value={dscanTotals.total} accent />
              <CountBox label="Capitals" value={dscanTotals.caps} danger={dscanTotals.caps > 0} />
              <CountBox label="Recon/Cyno" value={dscanTotals.recon} warn={dscanTotals.recon > 0} />
              <CountBox label="Logi" value={dscanTotals.logi} />
              <CountBox label="Tackle" value={dscanTotals.tackle} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 py-2">
              <CountBox label="Pilots in Local" value={localPilots.length} accent />
              <CountBox
                label="High Danger"
                value={localPilots.filter((p) => p.threatBadges.includes('HIGH DANGER')).length}
                danger
              />
              <CountBox
                label="Potential Cynos"
                value={localPilots.filter((p) => p.threatBadges.includes('POTENTIAL CYNO/ALT')).length}
                warn
              />
            </div>
          )}

          <div className="text-[11px] text-eve-muted">
            {mode === 'dscan'
              ? 'Ships grouped by SDE hull class. Use sort buttons below to reorder.'
              : 'Click any pilot name to set manual standing & intel notes.'}
          </div>
        </div>
      </div>

      {/* Results Body */}
      <div className="photon-panel flex min-h-0 flex-1 flex-col">
        <div className="photon-header flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            {mode === 'dscan' ? (
              <>
                <Radar className="h-3.5 w-3.5 text-eve-accent" />
                Ship Class Breakdown ({dscanGroups.length} classes)
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5 text-eve-accent" />
                Local Pilots ({localPilots.length})
              </>
            )}
          </div>

          {mode === 'dscan' && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-eve-muted">Sort:</span>
              {(
                [
                  ['priority', 'Priority'],
                  ['count', 'Count'],
                  ['name', 'Class']
                ] as Array<[DScanSort, string]>
              ).map(([field, label]) => {
                const active = dscanSort === field;
                return (
                  <button
                    key={field}
                    type="button"
                    onClick={() => {
                      if (dscanSort === field) setDscanDir((d) => (d === 'desc' ? 'asc' : 'desc'));
                      else {
                        setDscanSort(field);
                        setDscanDir(field === 'name' ? 'asc' : 'desc');
                      }
                    }}
                    className={`inline-flex items-center gap-1 border px-2 py-0.5 ${
                      active
                        ? 'border-eve-accent/60 bg-eve-accent-muted text-eve-accent'
                        : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                    }`}
                  >
                    <span>{label}</span>
                    {active && (dscanDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-3">
          {mode === 'dscan' ? (
            sortedDscan.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-eve-muted">
                Paste D-Scan results above to group hulls by class.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sortedDscan.map((g) => (
                  <div key={g.groupName} className="border border-eve-border bg-eve-bg/60">
                    <div className="flex items-center justify-between border-b border-eve-border bg-eve-panel px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-eve-text">{g.groupName}</span>
                        <span
                          className={`border px-1.5 py-0.2 text-[10px] font-semibold uppercase ${
                            THREAT_BADGE_STYLES[g.threatTag]
                          }`}
                        >
                          {g.threatTag}
                        </span>
                      </div>
                      <span className="num-mono text-sm font-bold text-eve-accent">{g.count}</span>
                    </div>
                    <div className="max-h-44 divide-y divide-eve-border/40 overflow-y-auto">
                      {g.items.map((item, idx) => (
                        <div
                          key={`${item.typeName}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {item.typeId && (
                              <EveIcon
                                path={`types/${item.typeId}/icon?size=64`}
                                size={20}
                                alt={item.typeName}
                              />
                            )}
                            <span className="truncate text-eve-text">{item.typeName}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-[11px]">
                            <span className="num-mono text-eve-muted">{item.distanceRaw}</span>
                            {item.count > 1 && (
                              <span className="num-mono font-semibold text-eve-accent">
                                x{item.count}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : sortedLocal.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-eve-muted">
              Paste Local chat pilot names above to check alliances, standings, and zKillboard threat badges.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                <tr className="border-b border-eve-border">
                  <SortableHeader label="Pilot" field="name" activeField={localSort} direction={localDir} onSort={handleLocalSort} />
                  <SortableHeader label="Corporation" field="corporationName" activeField={localSort} direction={localDir} onSort={handleLocalSort} />
                  <SortableHeader label="Alliance" field="allianceName" activeField={localSort} direction={localDir} onSort={handleLocalSort} />
                  <SortableHeader label="Standing" field="standing" activeField={localSort} direction={localDir} onSort={handleLocalSort} />
                  <SortableHeader label="Danger" field="dangerRatio" activeField={localSort} direction={localDir} onSort={handleLocalSort} align="right" />
                  <SortableHeader label="Kills" field="shipsDestroyed" activeField={localSort} direction={localDir} onSort={handleLocalSort} align="right" />
                  <th className="px-3 py-2">Threat Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eve-border/50">
                {sortedLocal.map((pilot) => {
                  const st = pilot.standing;
                  const noteMatch = manualStandings.find(
                    (m) => m.targetName.toLowerCase() === pilot.name.toLowerCase()
                  )?.notes;
                  const stColor =
                    st === null
                      ? 'text-eve-muted'
                      : st > 0
                        ? 'text-sky-400'
                        : st < 0
                          ? 'text-eve-danger'
                          : 'text-eve-text';
                  const rowBg =
                    st === null
                      ? 'hover:bg-eve-elevated/50'
                      : st >= 5
                        ? 'bg-sky-500/15 hover:bg-sky-500/25'
                        : st > 0
                          ? 'bg-cyan-500/10 hover:bg-cyan-500/20'
                          : st <= -5
                            ? 'bg-red-500/15 hover:bg-red-500/25'
                            : st < 0
                              ? 'bg-amber-500/10 hover:bg-amber-500/20'
                              : 'hover:bg-eve-elevated/50';
                  return (
                    <tr key={pilot.name} className={rowBg}>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openPilotZkill(pilot)}
                          title={pilot.characterId ? 'Open zKillboard in default browser' : undefined}
                          className="flex items-center gap-2 text-left hover:text-eve-accent"
                        >
                          {pilot.characterId && (
                            <EveIcon
                              path={`characters/${pilot.characterId}/portrait?size=64`}
                              size={24}
                              alt={pilot.name}
                            />
                          )}
                          <div>
                            <div className="font-medium text-eve-text underline-offset-2 hover:underline">
                              {pilot.name}
                            </div>
                            {noteMatch && (
                              <div className="truncate text-[10px] text-eve-accent">{noteMatch}</div>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-eve-muted">{pilot.corporationName ?? '—'}</td>
                      <td className="px-3 py-2 text-eve-text">{pilot.allianceName ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {st !== null && (
                            <span className={`num-mono font-semibold ${stColor}`}>
                              {st > 0 ? `+${st}` : st}{' '}
                              <span className="font-sans text-[10px] font-normal text-eve-muted">
                                ({pilot.standingSource ?? 'ESI'})
                              </span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openPilotModal(pilot)}
                            className="border border-eve-border/70 bg-eve-bg/60 px-1.5 py-0.5 text-[10px] text-eve-muted hover:border-eve-accent/60 hover:text-eve-accent"
                          >
                            Set
                          </button>
                        </div>
                      </td>
                      <td
                        className={`num-mono px-3 py-2 text-right font-semibold ${
                          (pilot.dangerRatio ?? 0) >= 75 ? 'text-eve-danger' : 'text-eve-text'
                        }`}
                      >
                        {pilot.dangerRatio !== null ? `${pilot.dangerRatio}%` : '—'}
                      </td>
                      <td className="num-mono px-3 py-2 text-right text-eve-muted">
                        {pilot.shipsDestroyed !== null
                          ? `${pilot.shipsDestroyed} / ${pilot.shipsLost ?? 0}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {pilot.threatBadges.map((badge) => (
                            <span
                              key={badge}
                              className="inline-flex items-center gap-1 border border-eve-danger/50 bg-eve-danger/10 px-1.5 py-0.2 text-[10px] font-semibold text-eve-danger"
                            >
                              <ShieldAlert className="h-2.5 w-2.5" />
                              {badge}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Manual Standings Bar */}
        {mode === 'local' && (
          <div className="border-t border-eve-border bg-eve-panel/60 p-2.5 text-xs">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!standTarget.trim()) return;
                const list = await window.eveLens.intel.upsertManualStanding({
                  targetName: standTarget.trim(),
                  standing: Number(standValue),
                  sourceLabel: 'Manual'
                });
                setManualStandings(list);
                setStandTarget('');
                if (rawText.trim()) await analyzeInput(rawText);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-eve-muted">
                Manual Standing:
              </span>
              <input
                type="text"
                value={standTarget}
                onChange={(e) => setStandTarget(e.target.value)}
                placeholder="Pilot, Corp, or Alliance name..."
                className="w-48 border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              />
              <select
                value={standValue}
                onChange={(e) => setStandValue(e.target.value)}
                className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              >
                <option value="10">+10 (Excellent)</option>
                <option value="5">+5 (Good)</option>
                <option value="0">0 (Neutral)</option>
                <option value="-5">-5 (Bad)</option>
                <option value="-10">-10 (Terrible)</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-[11px] text-eve-accent"
              >
                <Plus className="h-3 w-3" />
                Set Standing
              </button>

              <div className="flex flex-wrap gap-1.5">
                {manualStandings.slice(0, 6).map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[10px]"
                  >
                    <span>
                      {m.targetName}: {m.standing > 0 ? `+${m.standing}` : m.standing} ({m.sourceLabel})
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteStandingId(m.id)}
                      className="text-eve-muted hover:text-eve-danger"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Click-Pilot Standing & Note Modal */}
      {editingPilot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-md space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <div className="flex items-center gap-2">
                {editingPilot.characterId && (
                  <EveIcon
                    path={`characters/${editingPilot.characterId}/portrait?size=64`}
                    size={24}
                    alt={editingPilot.name}
                  />
                )}
                <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                  {editingPilot.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingPilot(null)}
                className="text-eve-muted hover:text-eve-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Standing</span>
                <select
                  value={popupStanding}
                  onChange={(e) => setPopupStanding(e.target.value)}
                  className="w-full border border-eve-border bg-eve-bg px-2 py-1.5 text-xs text-eve-text"
                >
                  <option value="10">+10 (Excellent)</option>
                  <option value="5">+5 (Good)</option>
                  <option value="0">0 (Neutral)</option>
                  <option value="-5">-5 (Bad)</option>
                  <option value="-10">-10 (Terrible)</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="text-[10px] uppercase text-eve-muted">Pilot Intel Note</span>
              <textarea
                rows={3}
                value={popupNote}
                onChange={(e) => setPopupNote(e.target.value)}
                placeholder="e.g. Known BLOPS hunter, cyno alt, neutral scout..."
                className="w-full resize-none border border-eve-border bg-eve-bg p-2 text-xs text-eve-text"
              />
            </label>

            <div className="flex items-center justify-between gap-2 border-t border-eve-border pt-2">
              <div>
                {manualStandings.some(
                  (m) => m.targetName.toLowerCase() === editingPilot.name.toLowerCase()
                ) && (
                  <button
                    type="button"
                    onClick={() => {
                      const match = manualStandings.find(
                        (m) => m.targetName.toLowerCase() === editingPilot.name.toLowerCase()
                      );
                      if (match) {
                        setEditingPilot(null);
                        setConfirmDeleteStandingId(match.id);
                      }
                    }}
                    className="inline-flex items-center gap-1 border border-eve-danger/60 bg-eve-danger/10 px-2.5 py-1 text-xs text-eve-danger hover:bg-eve-danger/20"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPilot(null)}
                  className="border border-eve-border bg-eve-panel px-3 py-1 text-xs text-eve-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void savePilotModal()}
                  className="border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold text-eve-accent"
                >
                  Save Standing &amp; Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* zKillboard External Browser Confirmation */}
      {zkillTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-sm space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Open zKillboard
              </span>
              <button
                type="button"
                onClick={() => setZkillTarget(null)}
                className="text-eve-muted hover:text-eve-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-eve-text">
              This will open zKill in your default browser for{' '}
              <strong className="text-eve-accent">{zkillTarget.name}</strong>. Okay?
            </p>
            <label className="flex items-center gap-2 text-xs text-eve-muted">
              <input
                type="checkbox"
                checked={zkillDontShow}
                onChange={(e) => setZkillDontShow(e.target.checked)}
              />
              Don&apos;t show again
            </label>
            <div className="flex justify-end gap-2 border-t border-eve-border pt-2">
              <button
                type="button"
                onClick={() => setZkillTarget(null)}
                className="border border-eve-border bg-eve-panel px-3 py-1 text-xs text-eve-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (zkillDontShow) localStorage.setItem('nel:zkillConfirmSkip', '1');
                  if (zkillTarget.characterId) {
                    void window.eveLens.app.openExternal(
                      `https://zkillboard.com/character/${zkillTarget.characterId}/`
                    );
                  }
                  setZkillTarget(null);
                }}
                className="border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold text-eve-accent"
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDeleteStandingId !== null}
        title="Delete Standing"
        onCancel={() => setConfirmDeleteStandingId(null)}
        onConfirm={async () => {
          if (confirmDeleteStandingId !== null) {
            setManualStandings(await window.eveLens.intel.deleteManualStanding(confirmDeleteStandingId));
            if (rawText.trim()) await analyzeInput(rawText);
          }
          setConfirmDeleteStandingId(null);
        }}
      />
    </div>
  );
}

function CountBox({
  label,
  value,
  accent = false,
  warn = false,
  danger = false
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  const color = danger
    ? 'text-eve-danger'
    : warn
      ? 'text-eve-warning'
      : accent
        ? 'text-eve-accent'
        : 'text-eve-text';

  return (
    <div className="border border-eve-border bg-eve-bg/60 p-2">
      <div className="text-[10px] uppercase tracking-wider text-eve-muted">{label}</div>
      <div className={`num-mono mt-0.5 text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}
