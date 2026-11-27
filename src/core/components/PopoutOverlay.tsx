import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BellRing,
  ClipboardPaste,
  Crosshair,
  Orbit,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Settings,
  Square,
  Trash2,
  X
} from 'lucide-react';
import type {
  DScanGroupSummary,
  KillTrackerGroupDto,
  KillmailRow,
  LocalPilotIntelDto,
  IntelTrackerAlertEvent,
  WhEdgeDto,
  WhNodeDto
} from '@shared/types/modules-data';
import { useAccounts } from '@/core/contexts/AccountContext';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';
import { formatIsk, getSecurityColorClass } from '@/core/utils/format';
import { playAlertSound } from '@/core/utils/alertSounds';
import { EveIcon } from './EveIcon';
import { ConfirmModal } from './ConfirmModal';
import { NewEdenLensLogo } from './NewEdenLensLogo';

type PopoutTab = 'local' | 'killboard' | 'chatlog' | 'wormhole';

const NAV_ITEMS: Array<{ id: PopoutTab; label: string; icon: typeof Radar }> = [
  { id: 'local', label: 'Scan', icon: Radar },
  { id: 'killboard', label: 'Kills', icon: Crosshair },
  { id: 'chatlog', label: 'Alert', icon: Radio },
  { id: 'wormhole', label: 'WH', icon: Orbit }
];

export function PopoutOverlay() {
  const { activeCharacterId } = useAccounts();
  const [activeTab, setActiveTab] = useState<PopoutTab>('local');
  const activeTabRef = useRef<PopoutTab>('local');
  const [unreadKills, setUnreadKills] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [attachToEve, setAttachToEve] = useState(true);
  const [opacity, setOpacity] = useState(95);
  const [compactFontPx, setCompactFontPx] = useState(12);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === 'killboard') setUnreadKills(false);
    if (activeTab === 'chatlog') setUnreadAlerts(false);
  }, [activeTab]);

  useEffect(() => {
    const unsubKill = window.eveLens.killboard.onNewKill(() => {
      if (activeTabRef.current !== 'killboard') {
        setUnreadKills(true);
      }
    });
    const unsubAlert = window.eveLens.intelTracker.onEvent((ev) => {
      if (ev.showInOverlay !== false && activeTabRef.current !== 'chatlog') {
        setUnreadAlerts(true);
      }
    });
    return () => {
      unsubKill();
      unsubAlert();
    };
  }, []);

  const handleToggleTop = (next: boolean) => {
    setAlwaysOnTop(next);
    void window.eveLens.app.setPopoutOptions({ alwaysOnTop: next });
  };

  const handleToggleAttach = (next: boolean) => {
    setAttachToEve(next);
    void window.eveLens.app.setPopoutOptions({ attachToEve: next });
  };

  const handleOpacity = (pct: number) => {
    setOpacity(pct);
    void window.eveLens.app.setPopoutOptions({ opacity: pct / 100 });
  };

  const activeLabel =
    activeTab === 'local'
      ? 'Local & D-Scan'
      : activeTab === 'killboard'
        ? 'Live Killboard'
        : activeTab === 'chatlog'
          ? 'Live Alerts'
          : 'Wormhole Mapper';

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden border border-eve-border-strong bg-eve-bg text-eve-text select-none"
      style={{ fontSize: `${compactFontPx}px` }}
    >
      {/* Draggable Title Bar */}
      <header
        className="flex h-8 shrink-0 items-center justify-between border-b border-eve-border bg-eve-panel px-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <NewEdenLensLogo size={14} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-eve-accent">
            {activeLabel}
          </span>
        </div>

        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Overlay Settings"
            className={`p-1 hover:text-eve-accent ${settingsOpen ? 'text-eve-accent' : 'text-eve-muted'}`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void window.eveLens.app.closePopout()}
            title="Close Overlay"
            className="p-1 text-eve-muted hover:text-eve-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Popout Settings Drawer */}
      {settingsOpen && (
        <div className="space-y-2 border-b border-eve-border bg-eve-panel/95 px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-eve-text">
              <input
                type="checkbox"
                checked={alwaysOnTop}
                onChange={(e) => handleToggleTop(e.target.checked)}
                className="accent-[var(--eve-accent)]"
              />
              Always on Top
            </label>
            <label className="inline-flex items-center gap-1.5 text-eve-text">
              <input
                type="checkbox"
                checked={attachToEve}
                onChange={(e) => handleToggleAttach(e.target.checked)}
                className="accent-[var(--eve-accent)]"
              />
              Attach to EVE Client
            </label>
            <label className="inline-flex items-center gap-1.5 text-eve-muted">
              <span>Text</span>
              <select
                value={compactFontPx}
                onChange={(e) => setCompactFontPx(Number(e.target.value))}
                className="border border-eve-border bg-eve-bg px-1 py-0.5 text-[10px] text-eve-text"
              >
                <option value={11}>11px</option>
                <option value={12}>12px</option>
                <option value={13}>13px</option>
                <option value={14}>14px</option>
              </select>
            </label>
          </div>
          <label className="flex items-center justify-between gap-2 text-eve-muted">
            <span>Opacity</span>
            <input
              type="range"
              min={50}
              max={100}
              value={opacity}
              onChange={(e) => handleOpacity(Number(e.target.value))}
              className="flex-1 accent-[var(--eve-accent)]"
            />
            <span className="num-mono w-8 text-right text-[10px] text-eve-text">{opacity}%</span>
          </label>
        </div>
      )}

      {/* Body: Mini Sidebar + Compact Module */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-eve-border bg-eve-panel/80 py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const hasUnread =
              (item.id === 'killboard' && unreadKills) ||
              (item.id === 'chatlog' && unreadAlerts);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                className={`relative flex w-9 flex-col items-center gap-0.5 border py-1.5 text-[9px] uppercase ${
                  active
                    ? 'border-eve-accent/60 bg-eve-accent-muted text-eve-accent'
                    : 'border-transparent text-eve-muted hover:text-eve-text'
                }`}
              >
                {hasUnread && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-eve-danger" />
                )}
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden">
          <div className={activeTab === 'local' ? 'h-full' : 'hidden'}>
            <CompactLocalDScan activeCharacterId={activeCharacterId} />
          </div>
          <div className={activeTab === 'killboard' ? 'h-full' : 'hidden'}>
            <CompactKillboard />
          </div>
          <div className={activeTab === 'chatlog' ? 'h-full' : 'hidden'}>
            <CompactChatlog />
          </div>
          <div className={activeTab === 'wormhole' ? 'h-full' : 'hidden'}>
            <CompactWormhole activeCharacterId={activeCharacterId} />
          </div>
        </main>
      </div>
    </div>
  );
}

function CompactLocalDScan({ activeCharacterId }: { activeCharacterId: number | null }) {
  const [mode, setMode] = useState<'dscan' | 'local'>('dscan');
  const [dscanGroups, setDscanGroups] = useState<DScanGroupSummary[]>([]);
  const [localPilots, setLocalPilots] = useState<LocalPilotIntelDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [zkillTarget, setZkillTarget] = useState<LocalPilotIntelDto | null>(null);
  const [zkillDontShow, setZkillDontShow] = useState(false);

  const openPilotZkill = (p: LocalPilotIntelDto) => {
    if (!p.characterId) return;
    if (localStorage.getItem('nel:zkillConfirmSkip') === '1') {
      void window.eveLens.app.openExternal(`https://zkillboard.com/character/${p.characterId}/`);
      return;
    }
    setZkillDontShow(false);
    setZkillTarget(p);
  };

  const pasteAndScan = async () => {
    const text = await window.eveLens.clipboard.readText();
    const parsed = parseEveClipboard(text);
    if (parsed.format !== 'dscan' && parsed.format !== 'local') return;
    setLoading(true);
    try {
      if (parsed.format === 'dscan') {
        setMode('dscan');
        setDscanGroups(await window.eveLens.intel.analyzeDScan(parsed.entries));
      } else {
        setMode('local');
        setLocalPilots(await window.eveLens.intel.analyzeLocalPilots(parsed.pilotNames, activeCharacterId));
      }
    } finally {
      setLoading(false);
    }
  };

  const flattenedShips = (() => {
    const stacked = new Map<
      string,
      {
        key: string;
        typeId: number | null;
        typeName: string;
        groupName: string;
        threatTag: DScanGroupSummary['threatTag'];
        count: number;
      }
    >();
    for (const g of dscanGroups) {
      for (const item of g.items) {
        const mapKey = `${g.groupName}::${item.typeName}`;
        const existing = stacked.get(mapKey);
        if (existing) {
          existing.count += item.count;
        } else {
          stacked.set(mapKey, {
            key: mapKey,
            typeId: item.typeId,
            typeName: item.typeName,
            groupName: g.groupName,
            threatTag: g.threatTag,
            count: item.count
          });
        }
      }
    }
    return Array.from(stacked.values());
  })();

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-eve-border bg-eve-panel/40 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase text-eve-muted">
          {mode === 'dscan'
            ? `D-Scan (${dscanGroups.reduce((s, g) => s + g.count, 0)} hulls)`
            : `Local (${localPilots.length} pilots)`}
        </span>
        <button
          type="button"
          disabled={loading}
          onClick={() => void pasteAndScan()}
          className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2 py-0.5 text-[10px] font-semibold text-eve-accent"
        >
          <ClipboardPaste className="h-3 w-3" />
          {loading ? 'Scanning...' : 'Paste Scan'}
        </button>
      </div>

      {/* Column Labels */}
      <div className="flex items-center justify-between border-b border-eve-border/70 bg-eve-panel/70 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-eve-muted">
        <span>{mode === 'dscan' ? 'Ship Type' : 'Name'}</span>
        <span>{mode === 'dscan' ? 'Count' : 'Standing / Danger'}</span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {mode === 'dscan' ? (
          flattenedShips.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-eve-muted">
              Copy D-Scan or Local in EVE and click Paste Scan.
            </div>
          ) : (
            flattenedShips.map((ship) => (
              <div
                key={ship.key}
                className="flex items-center justify-between gap-2 border border-eve-border bg-eve-panel/60 px-2 py-1"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  {ship.typeId && (
                    <EveIcon path={`types/${ship.typeId}/icon?size=64`} size={18} alt={ship.typeName} />
                  )}
                  <span className="truncate font-medium text-eve-text">{ship.typeName}</span>
                  <span className="shrink-0 border border-eve-border px-1 text-[9px] uppercase text-eve-accent">
                    [{ship.groupName}]
                  </span>
                </div>
                <span className="num-mono shrink-0 font-bold text-eve-accent">x{ship.count}</span>
              </div>
            ))
          )
        ) : (
          localPilots.map((p) => {
            const st = p.standing;
            const rowBg =
              st === null
                ? 'bg-eve-panel/50'
                : st >= 5
                  ? 'bg-sky-500/20'
                  : st > 0
                    ? 'bg-cyan-500/15'
                    : st <= -5
                      ? 'bg-red-500/20'
                      : st < 0
                        ? 'bg-amber-500/15'
                        : 'bg-eve-panel/50';
            return (
              <div
                key={p.name}
                className={`flex items-center justify-between gap-2 border border-eve-border px-2 py-1 ${rowBg}`}
              >
                <button
                  type="button"
                  onClick={() => openPilotZkill(p)}
                  title={p.characterId ? 'Open zKillboard in default browser' : undefined}
                  className="min-w-0 flex-1 text-left hover:text-eve-accent"
                >
                  <div className="truncate font-medium text-eve-text underline-offset-2 hover:underline">
                    {p.name}
                  </div>
                  <div className="truncate text-[10px] text-eve-muted">
                    {p.allianceName ?? p.corporationName ?? '—'}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
                  {st !== null && (
                    <span
                      className={`num-mono border px-1 py-0.2 font-bold ${
                        st > 0
                          ? 'border-sky-400/50 bg-sky-500/15 text-sky-300'
                          : st < 0
                            ? 'border-red-400/50 bg-red-500/15 text-red-300'
                            : 'border-eve-border text-eve-muted'
                      }`}
                    >
                      {st > 0 ? `+${st}` : st}
                    </span>
                  )}
                  <span
                    className={`num-mono w-9 text-right font-semibold ${
                      (p.dangerRatio ?? 0) >= 75 ? 'text-eve-danger' : 'text-eve-muted'
                    }`}
                  >
                    {p.dangerRatio !== null ? `${p.dangerRatio}%` : '—'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {zkillTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
          <div className="photon-panel w-full max-w-xs space-y-2.5 p-3 shadow-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-eve-text">
              Open zKillboard
            </div>
            <p className="text-[11px] text-eve-text">
              This will open zKill in your default browser for{' '}
              <strong className="text-eve-accent">{zkillTarget.name}</strong>. Okay?
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-eve-muted">
              <input
                type="checkbox"
                checked={zkillDontShow}
                onChange={(e) => setZkillDontShow(e.target.checked)}
              />
              Don&apos;t show again
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setZkillTarget(null)}
                className="border border-eve-border bg-eve-panel px-2.5 py-1 text-[11px] text-eve-muted"
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
                className="border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-[11px] font-semibold text-eve-accent"
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactKillboard() {
  const [popoutGroup, setPopoutGroup] = useState<KillTrackerGroupDto | null>(null);
  const [kills, setKills] = useState<KillmailRow[]>([]);

  const loadPopoutData = useCallback(async () => {
    const groups = await window.eveLens.killboard.listGroups();
    const active = groups.find((g) => g.isPopoutActive) ?? null;
    setPopoutGroup(active);
    if (active) {
      setKills(await window.eveLens.killboard.getRecent(50, '', active.id));
    } else {
      setKills([]);
    }
  }, []);

  useEffect(() => {
    void loadPopoutData();
    const u1 = window.eveLens.killboard.onNewKill((k) => {
      setPopoutGroup((curr) => {
        if (curr && k.matchedGroupIds?.includes(curr.id)) {
          setKills((prev) => [k, ...prev].slice(0, 60));
        }
        return curr;
      });
    });
    const u2 = window.eveLens.killboard.onPopoutGroupChanged(() => {
      void loadPopoutData();
    });
    return () => {
      u1();
      u2();
    };
  }, [loadPopoutData]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-eve-border bg-eve-panel/40 px-2.5 py-1.5">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase text-eve-accent">
            {popoutGroup ? popoutGroup.name : 'No Tracker Group Pinned'}
          </div>
          {popoutGroup && (
            <div className="truncate text-[9px] text-eve-muted">
              {popoutGroup.originSystemName
                ? `${popoutGroup.maxJumps ?? 0}j ${popoutGroup.originSystemName}`
                : popoutGroup.secFilter.toUpperCase()}
              {' · '}
              {popoutGroup.activityFilter.replace('_', ' ')}
            </div>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold uppercase text-eve-success">
          <span className="h-1.5 w-1.5 rounded-full bg-eve-success animate-pulse" />
          Live
        </span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {!popoutGroup ? (
          <div className="p-4 text-center text-[11px] text-eve-muted">
            In the main Kill Tracker, click <strong>Send to Pop-Out</strong> on any Tracker Group.
          </div>
        ) : kills.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-eve-muted">
            Waiting for kills matching <strong>{popoutGroup.name}</strong>...
          </div>
        ) : (
          kills.map((k) => (
            <button
              key={k.killmailId}
              type="button"
              onClick={() =>
                void window.eveLens.app.openExternal(`https://zkillboard.com/kill/${k.killmailId}/`)
              }
              className="flex w-full items-center justify-between gap-2 border border-eve-border bg-eve-panel/60 px-2 py-1 text-left hover:border-eve-accent/60"
            >
              <div className="flex min-w-0 items-center gap-2">
                <EveIcon path={`types/${k.victimShipTypeId}/icon?size=64`} size={20} alt={k.victimShipName} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-eve-text">{k.victimShipName}</span>
                    {k.classification && (
                      <span className="shrink-0 border border-eve-border px-1 text-[8px] uppercase text-eve-warning">
                        {k.classification}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[10px]">
                    <span className={getSecurityColorClass(k.security)}>
                      {k.solarSystemName} ({k.security.toFixed(1)})
                    </span>
                    <span className="text-eve-muted"> · {k.attackerCount} pilots</span>
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num-mono font-semibold text-eve-accent">
                  {formatIsk(k.totalValue, true)}
                </div>
                <div className="num-mono text-[9px] text-eve-muted">
                  {new Date(k.killmailTime).toLocaleTimeString()}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CompactChatlog() {
  const [events, setEvents] = useState<IntelTrackerAlertEvent[]>([]);
  const [volumePct, setVolumePct] = useState(70);

  useEffect(() => {
    void window.eveLens.intelTracker.start();
    void window.eveLens.intelTracker.getRecentEvents().then(setEvents);
    void window.eveLens.app.getSettings().then((s) => {
      if (typeof s.intelTrackerVolumePct === 'number') setVolumePct(s.intelTrackerVolumePct);
    });
  }, []);

  useEffect(() => {
    const unsubEvent = window.eveLens.intelTracker.onEvent((ev) => {
      setEvents((prev) => [ev, ...prev].slice(0, 60));
      if (ev.showInOverlay !== false) {
        playAlertSound(ev.soundId, volumePct);
      }
    });
    const unsubSync = window.eveLens.intelTracker.onEventsSync((synced) => {
      setEvents(synced);
    });
    return () => {
      unsubEvent();
      unsubSync();
    };
  }, [volumePct]);

  const visibleEvents = events.filter((ev) => ev.showInOverlay !== false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-eve-border bg-eve-panel/40 px-2.5 py-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-eve-muted">
          <BellRing className="h-3 w-3 text-eve-warning" />
          Intel ({visibleEvents.length})
        </span>
        <div className="flex items-center gap-1.5">
          {visibleEvents.length > 0 && (
            <button
              type="button"
              onClick={() => void window.eveLens.intelTracker.clearEvents()}
              title="Clear all alerts"
              className="inline-flex items-center gap-0.5 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[9px] text-eve-muted hover:border-eve-danger/60 hover:text-eve-danger"
            >
              <Trash2 className="h-2.5 w-2.5" />
              Clear
            </button>
          )}
          <span className="inline-flex items-center gap-1 border border-eve-success/50 bg-eve-success/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-eve-success">
            Live
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {visibleEvents.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-eve-muted">
            Listening for active trackers with &ldquo;Show in Overlay&rdquo; enabled.
          </div>
        ) : (
          visibleEvents.map((ev) => (
            <div
              key={ev.id}
              className={`border px-2 py-1 ${
                ev.nameCalled
                  ? 'border-eve-danger/60 bg-eve-danger/10'
                  : 'border-eve-border bg-eve-panel/60'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="truncate font-semibold text-eve-accent">
                  {ev.systemName ? `${ev.systemName}${ev.jumpsAway !== null ? ` (${ev.jumpsAway}j)` : ''}` : ev.channel}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="num-mono text-eve-muted">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => void window.eveLens.intelTracker.dismissEvent(ev.id)}
                    title="Dismiss alert"
                    className="text-eve-muted hover:text-eve-danger"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
              <div className="truncate text-eve-text">
                <span className="text-eve-muted">{ev.sender}: </span>
                {ev.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CompactWormhole({ activeCharacterId }: { activeCharacterId: number | null }) {
  const [mapId, setMapId] = useState<number | null>(null);
  const [nodes, setNodes] = useState<WhNodeDto[]>([]);
  const [edges, setEdges] = useState<WhEdgeDto[]>([]);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const loadState = useCallback(async (id: number) => {
    const state = await window.eveLens.wh.getMapState(id);
    setNodes(state.nodes);
    setEdges(state.edges);
  }, []);

  useEffect(() => {
    void window.eveLens.wh.listMaps().then((list) => {
      if (list[0]) {
        setMapId(list[0].id);
        void loadState(list[0].id);
      }
    });
  }, [loadState]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-eve-border bg-eve-panel/40 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase text-eve-muted">
          Primary Chain ({nodes.length})
        </span>
        {mapId && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-0.5 text-[10px] text-eve-muted hover:border-eve-danger/60 hover:text-eve-danger"
            >
              <Trash2 className="h-2.5 w-2.5" />
              Clear
            </button>
            <button
              type="button"
              onClick={() =>
                void window.eveLens.wh.pollLocations(mapId, activeCharacterId).then(() => loadState(mapId))
              }
              className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2 py-0.5 text-[10px] text-eve-accent"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Sync
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {(() => {
          const chainNodes = nodes;
          if (chainNodes.length === 0) {
            return (
              <div className="p-4 text-center text-[11px] text-eve-muted">
                No wormhole chain mapped yet. Jump a wormhole or click Sync.
              </div>
            );
          }
          return (
            <div className="flex flex-col items-stretch">
              {chainNodes.map((n, idx) => {
                const isJ = /^J\d{6}$/i.test(n.solarSystemName);
                const nextNode = chainNodes[idx + 1];
                const edgeOut = nextNode
                  ? edges.find(
                      (e) =>
                        e.sourceSystemId === n.solarSystemId &&
                        e.targetSystemId === nextNode.solarSystemId
                    )
                  : undefined;
                const edgeIn = nextNode
                  ? edges.find(
                      (e) =>
                        e.targetSystemId === n.solarSystemId &&
                        e.sourceSystemId === nextNode.solarSystemId
                    )
                  : undefined;
                return (
                  <div key={n.solarSystemId} className="flex flex-col">
                    <div className="flex items-center justify-between border border-eve-border bg-eve-panel/70 px-2.5 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`border px-1.5 py-0.2 text-[10px] font-bold ${
                            isJ
                              ? 'border-eve-accent/50 bg-eve-accent-muted text-eve-accent'
                              : `border-eve-border bg-eve-bg ${getSecurityColorClass(n.security)}`
                          }`}
                        >
                          {isJ ? (n.wormholeClass ? `C${n.wormholeClass}` : 'WH') : n.security.toFixed(1)}
                        </span>
                        <span className="truncate font-semibold text-eve-text">
                          {n.customLabel || n.solarSystemName}
                        </span>
                      </div>
                      {n.wormholeEffect && (
                        <span className="truncate text-[10px] text-eve-warning">
                          {n.wormholeEffect}
                        </span>
                      )}
                    </div>
                    {idx < chainNodes.length - 1 && (
                      <div className="flex items-center justify-center py-0.5 text-[11px] text-eve-accent">
                        <span className="inline-flex items-center gap-1 border-l border-eve-accent/50 pl-2">
                          {edgeIn && !edgeOut ? '↑' : '↓'}
                          <span className="text-[9px] text-eve-muted">
                            {(edgeOut ?? edgeIn)?.whType ?? 'K162'}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <ConfirmModal
        open={confirmClearOpen}
        title="Clear Wormhole Chain"
        message="Are you sure? This will clear all mapped wormholes and connections in this chain!"
        confirmLabel="Clear"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          if (mapId) {
            await window.eveLens.wh.clearMap(mapId);
            await loadState(mapId);
          }
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}
