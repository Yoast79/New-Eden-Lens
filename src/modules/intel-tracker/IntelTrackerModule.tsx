import { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  Edit3,
  Eye,
  FolderOpen,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Volume2,
  X
} from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type {
  AlertSoundId,
  IntelTrackerAlertEvent,
  IntelTrackerSetupDto
} from '@shared/types/modules-data';
import { useAccounts } from '@/core/contexts/AccountContext';
import { ConfirmModal } from '@/core/components/ConfirmModal';
import { ALERT_SOUND_OPTIONS, playAlertSound } from '@/core/utils/alertSounds';

function createDefaultSetup(index = 1): IntelTrackerSetupDto {
  return {
    id: `setup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: index === 1 ? 'Main Intel' : `Alert Tracker ${index}`,
    description: index === 1 ? 'Primary home-defense & hostile intel channel alerts' : '',
    enabled: true,
    channels: [],
    watches:
      index === 1
        ? [
            { id: 'w-1', keyword: 'red', sound: 'siren' },
            { id: 'w-2', keyword: 'neut', sound: 'ping' },
            { id: 'w-3', keyword: 'cyno', sound: 'alarm' },
            { id: 'w-4', keyword: 'gatecamp', sound: 'horn' }
          ]
        : [],
    rangeBased: true,
    maxJumps: 5,
    rangeSource: 'live',
    rangeSystemId: null,
    rangeSystemName: '',
    rangeCharacterId: null,
    showInOverlay: true,
    systemAlertSound: 'chime'
  };
}

function normalizeSetup(s: IntelTrackerSetupDto): IntelTrackerSetupDto {
  return {
    ...s,
    rangeBased: s.rangeBased !== false,
    rangeSource: s.rangeSource ?? 'live',
    showInOverlay: s.showInOverlay !== false,
    channels: Array.isArray(s.channels) ? s.channels : [],
    watches: Array.isArray(s.watches) ? s.watches : []
  };
}

export function IntelTrackerModule({ activeCharacterId }: ModuleProps) {
  const { characters } = useAccounts();
  const [logDir, setLogDir] = useState('');
  const [setups, setSetups] = useState<IntelTrackerSetupDto[]>([createDefaultSetup(1)]);
  const [modalDraft, setModalDraft] = useState<IntelTrackerSetupDto | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newWatchText, setNewWatchText] = useState('');
  const [newWatchSound, setNewWatchSound] = useState<AlertSoundId>('ping');

  const [systemSearch, setSystemSearch] = useState('');
  const [systemHits, setSystemHits] = useState<Array<{ solarSystemId: number; solarSystemName: string }>>([]);
  const [liveSystemName, setLiveSystemName] = useState('');

  const [windowsPopup, setWindowsPopup] = useState(true);
  const [volumePct, setVolumePct] = useState(70);

  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [events, setEvents] = useState<IntelTrackerAlertEvent[]>([]);
  const [confirmDeleteSetupId, setConfirmDeleteSetupId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const persistSetups = useCallback((next: IntelTrackerSetupDto[]) => {
    setSetups(next);
    void window.eveLens.intelTracker.setSetups(next);
  }, []);

  const scanChannels = useCallback(async () => {
    const channels = await window.eveLens.intelTracker.listChannels();
    setAvailableChannels(channels);
  }, []);

  useEffect(() => {
    void scanChannels();
  }, [scanChannels]);

  useEffect(() => {
    void window.eveLens.intelTracker.start();
    void window.eveLens.intelTracker.getLogDir().then(setLogDir);
    void window.eveLens.intelTracker.getRecentEvents().then(setEvents);
    void window.eveLens.app.getSettings().then((s) => {
      if (Array.isArray(s.intelTrackerSetups) && s.intelTrackerSetups.length > 0) {
        const normalized = s.intelTrackerSetups.map(normalizeSetup);
        setSetups(normalized);
        void window.eveLens.intelTracker.setSetups(normalized);
      } else {
        const def = createDefaultSetup(1);
        setSetups([def]);
        void window.eveLens.intelTracker.setSetups([def]);
      }
      if (typeof s.intelTrackerVolumePct === 'number') setVolumePct(s.intelTrackerVolumePct);
    });
  }, []);

  useEffect(() => {
    const unsubEvent = window.eveLens.intelTracker.onEvent((ev) => {
      setEvents((prev) => [ev, ...prev].slice(0, 150));
      playAlertSound(ev.soundId, volumePct);
    });
    const unsubSync = window.eveLens.intelTracker.onEventsSync((synced) => {
      setEvents(synced);
    });
    return () => {
      unsubEvent();
      unsubSync();
    };
  }, [volumePct]);

  // Poll live location for activeCharacterId + any character referenced by active setups
  useEffect(() => {
    const charIds = new Set<number>();
    if (activeCharacterId !== null) charIds.add(activeCharacterId);
    for (const s of setups) {
      if (s.enabled && s.rangeSource === 'character' && s.rangeCharacterId) {
        charIds.add(s.rangeCharacterId);
      }
    }
    if (charIds.size === 0) return;

    let cancelled = false;
    const poll = async () => {
      for (const charId of charIds) {
        try {
          const loc = await window.eveLens.esi.request<{ solar_system_id: number }>(
            `/characters/${charId}/location`,
            { characterId: charId }
          );
          if (cancelled || !loc?.solar_system_id) continue;
          await window.eveLens.intelTracker.setCharacterSystemId(charId, loc.solar_system_id);
          if (charId === activeCharacterId) {
            await window.eveLens.intelTracker.setActiveSystemId(loc.solar_system_id);
            const sysInfo = await window.eveLens.esi
              .request<{ name: string }>(`/universe/systems/${loc.solar_system_id}`)
              .catch(() => null);
            if (!cancelled && sysInfo?.name) setLiveSystemName(sysInfo.name);
          }
        } catch {
          // ignore transient ESI errors
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeCharacterId, setups]);

  const handleSelectFolder = async () => {
    const chosen = await window.eveLens.intelTracker.selectLogDir();
    if (chosen) {
      setLogDir(chosen);
      await scanChannels();
    }
  };

  const updateModalDraft = (patch: Partial<IntelTrackerSetupDto>) => {
    setModalDraft((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const handleAddTracker = () => {
    const draft = createDefaultSetup(setups.length + 1);
    setSystemSearch('');
    setSystemHits([]);
    setNewWatchText('');
    setIsCreatingNew(true);
    setModalDraft(draft);
  };

  const handleOpenEdit = (setup: IntelTrackerSetupDto) => {
    setSystemSearch(setup.rangeSystemName ?? '');
    setSystemHits([]);
    setNewWatchText('');
    setIsCreatingNew(false);
    setModalDraft({
      ...setup,
      channels: [...setup.channels],
      watches: [...setup.watches]
    });
  };

  const handleSaveModal = () => {
    if (!modalDraft) return;
    if (isCreatingNew) {
      persistSetups([...setups, modalDraft]);
    } else {
      persistSetups(setups.map((s) => (s.id === modalDraft.id ? modalDraft : s)));
    }
    setModalDraft(null);
    setIsCreatingNew(false);
  };

  const deleteSetup = (id: string) => {
    if (setups.length <= 1) return;
    const next = setups.filter((s) => s.id !== id);
    persistSetups(next);
    if (modalDraft?.id === id) setModalDraft(null);
  };

  const addWatchToModalDraft = () => {
    if (!modalDraft) return;
    const kw = newWatchText.trim();
    if (!kw) return;
    if (modalDraft.watches.some((w) => w.keyword.toLowerCase() === kw.toLowerCase())) {
      setNewWatchText('');
      return;
    }
    updateModalDraft({
      watches: [
        ...modalDraft.watches,
        { id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, keyword: kw, sound: newWatchSound }
      ]
    });
    setNewWatchText('');
  };

  const activeSetups = setups.filter((s) => s.enabled);
  const inactiveSetups = setups.filter((s) => !s.enabled);

  const gridClass =
    activeSetups.length <= 1
      ? 'grid-cols-1'
      : activeSetups.length === 2
        ? 'grid-cols-1 md:grid-cols-2'
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {/* Header Controls */}
      <div className="photon-panel flex shrink-0 flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <BellRing className="h-4 w-4 text-eve-success" />
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span>Live Chatlog Intel</span>
              <span className="border border-eve-success/50 bg-eve-success/10 px-1.5 py-0 text-[9px] font-semibold uppercase text-eve-success">
                Watching Live
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-eve-muted">
              <FolderOpen className="h-3 w-3" />
              <span className="max-w-md truncate font-mono">{logDir || 'Default EVE Chatlogs'}</span>
              <button
                type="button"
                onClick={() => void handleSelectFolder()}
                className="border border-eve-border bg-eve-bg px-1.5 py-0.5 font-sans text-[10px] text-eve-accent hover:border-eve-accent/60"
              >
                Select Folder
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5 text-eve-accent" />
            <input
              type="range"
              min={0}
              max={100}
              value={volumePct}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolumePct(v);
                void window.eveLens.app.updateSettings({ intelTrackerVolumePct: v });
              }}
              className="w-20 accent-eve-accent"
            />
            <span className="num-mono w-7 text-[10px] text-eve-muted">{volumePct}%</span>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={windowsPopup}
              onChange={(e) => {
                setWindowsPopup(e.target.checked);
                void window.eveLens.intelTracker.setNotifyEnabled(e.target.checked);
              }}
            />
            Windows Popup
          </label>

          {events.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2.5 py-1 text-xs text-eve-muted hover:border-eve-danger/60 hover:text-eve-danger"
            >
              <Trash2 className="h-3 w-3" />
              Clear All ({events.length})
            </button>
          )}

          <button
            type="button"
            onClick={handleAddTracker}
            className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs font-semibold text-eve-accent hover:bg-eve-accent/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Alert Tracker
          </button>
        </div>
      </div>

      {/* Scrollable Active Alert Trackers + Stacked Inactive Trackers */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {activeSetups.length === 0 ? (
          <div className="photon-panel p-6 text-center text-xs text-eve-muted">
            All alert trackers are currently turned off. Turn one on below or click &ldquo;Add Alert Tracker&rdquo;.
          </div>
        ) : (
          <div className={`grid gap-3 ${gridClass} ${activeSetups.length === 1 ? 'h-full' : ''}`}>
            {activeSetups.map((setup) => {
              const paneEvents = events.filter((ev) => ev.matchedSetupIds?.includes(setup.id));
              const rangeSummary = !setup.rangeBased
                ? 'Any Range'
                : setup.rangeSource === 'system'
                  ? `${setup.maxJumps}j from ${setup.rangeSystemName || 'System'}`
                  : setup.rangeSource === 'character'
                    ? `${setup.maxJumps}j from ${characters.find((c) => c.characterId === setup.rangeCharacterId)?.characterName ?? 'Pilot'}`
                    : `${setup.maxJumps}j from ${liveSystemName || 'Live'}`;

              return (
                <div
                  key={setup.id}
                  className={`photon-panel flex flex-col border-eve-success/40 ${
                    activeSetups.length === 1
                      ? 'h-full min-h-[340px]'
                      : activeSetups.length === 2
                        ? 'h-[460px]'
                        : 'h-[350px]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-eve-border bg-eve-panel/60 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-eve-success animate-pulse"
                          title="Tracker is active and listening"
                        />
                        <span className="truncate text-xs font-semibold text-eve-text">{setup.name}</span>
                        <span className="text-[10px] text-eve-muted">({paneEvents.length})</span>
                        <span className="text-[10px] text-eve-accent">• {rangeSummary}</span>
                      </div>
                      {setup.description && (
                        <div className="truncate text-[10px] text-eve-muted">{setup.description}</div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          persistSetups(
                            setups.map((s) =>
                              s.id === setup.id ? { ...s, showInOverlay: !s.showInOverlay } : s
                            )
                          )
                        }
                        title={
                          setup.showInOverlay
                            ? 'Sending alerts to Popout Overlay (click to disable)'
                            : 'Not sending alerts to Popout Overlay (click to enable)'
                        }
                        className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          setup.showInOverlay
                            ? 'border-eve-success/60 bg-eve-success/15 text-eve-success'
                            : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                        }`}
                      >
                        <Eye className="h-2.5 w-2.5" />
                        In Overlay
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          persistSetups(
                            setups.map((s) => (s.id === setup.id ? { ...s, enabled: false } : s))
                          )
                        }
                        title="Turn off tracker (minimize)"
                        className="border border-eve-success/60 bg-eve-success/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-eve-success hover:border-eve-danger/50 hover:bg-eve-danger/15 hover:text-eve-danger"
                      >
                        On
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(setup)}
                        title="Configure Alert Tracker"
                        className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[10px] text-eve-accent hover:border-eve-accent"
                      >
                        <Edit3 className="h-2.5 w-2.5" />
                        Edit
                      </button>
                      {setups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSetupId(setup.id)}
                          title="Delete Alert Tracker"
                          className="border border-eve-border bg-eve-bg p-0.5 text-eve-muted hover:border-eve-danger/60 hover:text-eve-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 divide-y divide-eve-border/40 overflow-y-auto">
                    {paneEvents.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center text-xs text-eve-muted">
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-eve-success">
                          <span className="h-2 w-2 rounded-full bg-eve-success animate-pulse" />
                          Active — Listening Live
                        </div>
                        <div>
                          Watching{' '}
                          <span className="text-eve-text">
                            {setup.channels.length === 0 ? 'All Channels' : setup.channels.join(', ')}
                          </span>
                          {setup.watches.length === 0
                            ? ' (showing all messages).'
                            : ` (${setup.watches.length} keyword alert${setup.watches.length === 1 ? '' : 's'}).`}
                        </div>
                      </div>
                    ) : (
                      paneEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className={`flex items-start justify-between gap-2 px-3 py-2 text-xs ${
                            ev.nameCalled ? 'bg-eve-danger/10' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="num-mono text-eve-muted">
                                {new Date(ev.timestamp).toLocaleTimeString()}
                              </span>
                              <span className="border border-eve-border bg-eve-bg px-1 py-0 text-[10px] text-eve-accent">
                                {ev.channel}
                              </span>
                              <span className="font-semibold text-eve-text">{ev.sender}</span>
                              {ev.systemName && (
                                <span className="border border-eve-warning/50 bg-eve-warning/10 px-1.5 py-0 text-[10px] font-semibold text-eve-warning">
                                  {ev.systemName}
                                  {ev.jumpsAway !== null ? ` (${ev.jumpsAway}j)` : ''}
                                </span>
                              )}
                              {ev.matchedWatches.map((w) => (
                                <span
                                  key={w}
                                  className="border border-eve-danger/50 bg-eve-danger/10 px-1 py-0 text-[10px] text-eve-danger"
                                >
                                  {w}
                                </span>
                              ))}
                            </div>
                            <div className="break-words text-eve-text">{ev.message}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void window.eveLens.intelTracker.dismissEvent(ev.id)}
                            title="Dismiss this alert"
                            className="shrink-0 p-0.5 text-eve-muted hover:text-eve-danger"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Minimized Stacked Inactive Trackers */}
        {inactiveSetups.length > 0 && (
          <div className="space-y-1.5 border-t border-eve-border pt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-eve-muted">
              Turned Off Trackers ({inactiveSetups.length})
            </div>
            <div className="space-y-1">
              {inactiveSetups.map((setup) => (
                <div
                  key={setup.id}
                  className="photon-panel flex items-center justify-between gap-2 px-3 py-1.5 opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-eve-text">{setup.name}</span>
                    {setup.description && (
                      <span className="ml-2 text-[11px] text-eve-muted">— {setup.description}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        persistSetups(
                          setups.map((s) => (s.id === setup.id ? { ...s, enabled: true } : s))
                        )
                      }
                      className="inline-flex items-center gap-1 border border-eve-success/60 bg-eve-success/10 px-2 py-0.5 text-[10px] font-semibold text-eve-success hover:bg-eve-success/20"
                    >
                      <Power className="h-2.5 w-2.5" />
                      Turn On
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(setup)}
                      className="border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[10px] text-eve-accent hover:border-eve-accent"
                    >
                      Edit
                    </button>
                    {setups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSetupId(setup.id)}
                        className="border border-eve-border bg-eve-bg p-0.5 text-eve-muted hover:text-eve-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Alert Tracker Configuration Modal (draft only committed on Done) */}
      {modalDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => setModalDraft(null)}
        >
          <div
            className="photon-panel max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto border border-eve-accent/50 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-eve-accent" />
                <span className="text-sm font-semibold">
                  {isCreatingNew ? 'New Alert Tracker' : 'Configure Alert Tracker'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalDraft(null)}
                className="text-eve-muted hover:text-eve-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-[10px] uppercase text-eve-muted">Tracker Name</label>
                <input
                  type="text"
                  value={modalDraft.name}
                  onChange={(e) => updateModalDraft({ name: e.target.value })}
                  className="w-full border border-eve-border bg-eve-bg px-2.5 py-1 text-xs outline-none focus:border-eve-accent"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] uppercase text-eve-muted">Description</label>
                <input
                  type="text"
                  value={modalDraft.description}
                  onChange={(e) => updateModalDraft({ description: e.target.value })}
                  placeholder="Optional notes for this alert tracker..."
                  className="w-full border border-eve-border bg-eve-bg px-2.5 py-1 text-xs outline-none focus:border-eve-accent"
                />
              </div>
            </div>

            {/* Range & Overlay Options */}
            <div className="space-y-2 border-y border-eve-border/60 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-1.5 font-semibold text-eve-text">
                  <input
                    type="checkbox"
                    checked={modalDraft.rangeBased}
                    onChange={(e) => updateModalDraft({ rangeBased: e.target.checked })}
                  />
                  Range-Based Alert
                </label>

                <label className="inline-flex items-center gap-1.5 font-semibold text-eve-text">
                  <input
                    type="checkbox"
                    checked={modalDraft.showInOverlay}
                    onChange={(e) => updateModalDraft({ showInOverlay: e.target.checked })}
                  />
                  Show in Overlay
                </label>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase text-eve-muted">Channel/System Sound:</span>
                  <select
                    value={modalDraft.systemAlertSound}
                    onChange={(e) => {
                      const s = e.target.value as AlertSoundId;
                      updateModalDraft({ systemAlertSound: s });
                      playAlertSound(s, volumePct);
                    }}
                    className="border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[11px] text-eve-text outline-none focus:border-eve-accent"
                  >
                    {ALERT_SOUND_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {modalDraft.rangeBased && (
                <div className="flex flex-wrap items-center gap-2 bg-eve-bg/50 p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase text-eve-muted">Max Jumps:</span>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={modalDraft.maxJumps}
                      onChange={(e) =>
                        updateModalDraft({ maxJumps: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })
                      }
                      className="num-mono w-14 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-center text-xs outline-none focus:border-eve-accent"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase text-eve-muted">Range From:</span>
                    <select
                      value={modalDraft.rangeSource}
                      onChange={(e) =>
                        updateModalDraft({
                          rangeSource: e.target.value as IntelTrackerSetupDto['rangeSource']
                        })
                      }
                      className="border border-eve-border bg-eve-bg px-2 py-0.5 text-xs text-eve-text outline-none focus:border-eve-accent"
                    >
                      <option value="live">Live Location (Active Pilot)</option>
                      <option value="system">Specific Solar System</option>
                      <option value="character">Other Character Location</option>
                    </select>
                  </div>

                  {modalDraft.rangeSource === 'system' && (
                    <div className="relative min-w-[180px] flex-1">
                      <input
                        type="text"
                        value={systemSearch}
                        onChange={async (e) => {
                          const q = e.target.value;
                          setSystemSearch(q);
                          setSystemHits(q.length >= 2 ? await window.eveLens.sde.searchSystems(q, 8) : []);
                        }}
                        placeholder="Search solar system..."
                        className="w-full border border-eve-border bg-eve-bg px-2 py-0.5 text-xs outline-none focus:border-eve-accent"
                      />
                      {systemHits.length > 0 && (
                        <div className="absolute left-0 top-full z-40 mt-0.5 w-full border border-eve-border bg-eve-panel shadow-xl">
                          {systemHits.map((sys) => (
                            <button
                              key={sys.solarSystemId}
                              type="button"
                              onClick={() => {
                                setSystemSearch(sys.solarSystemName);
                                setSystemHits([]);
                                updateModalDraft({
                                  rangeSystemId: sys.solarSystemId,
                                  rangeSystemName: sys.solarSystemName
                                });
                              }}
                              className="block w-full px-2 py-1 text-left text-xs hover:bg-eve-accent-muted"
                            >
                              {sys.solarSystemName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {modalDraft.rangeSource === 'character' && (
                    <select
                      value={modalDraft.rangeCharacterId ?? ''}
                      onChange={(e) =>
                        updateModalDraft({
                          rangeCharacterId: e.target.value ? Number(e.target.value) : null
                        })
                      }
                      className="border border-eve-border bg-eve-bg px-2 py-0.5 text-xs text-eve-text outline-none focus:border-eve-accent"
                    >
                      <option value="">Select character...</option>
                      {characters.map((c) => (
                        <option key={c.characterId} value={c.characterId}>
                          {c.characterName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Monitored Channels Dropdown + Chips */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase text-eve-muted">Monitored Channels:</span>
                <button
                  type="button"
                  onClick={() => void scanChannels()}
                  className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-1.5 py-0.5 text-[10px] text-eve-muted hover:border-eve-accent hover:text-eve-accent"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  Scan Folder
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value=""
                  onChange={(e) => {
                    const ch = e.target.value;
                    if (!ch || modalDraft.channels.includes(ch)) return;
                    updateModalDraft({ channels: [...modalDraft.channels, ch] });
                  }}
                  className="min-w-[200px] border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text outline-none focus:border-eve-accent"
                >
                  <option value="">Select a channel to add...</option>
                  {availableChannels
                    .filter((ch) => !modalDraft.channels.includes(ch))
                    .map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                </select>
                {modalDraft.channels.length === 0 ? (
                  <span className="border border-eve-accent/50 bg-eve-accent-muted px-2 py-0.5 text-[10px] font-semibold text-eve-accent">
                    All Channels (none selected)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateModalDraft({ channels: [] })}
                    className="text-[10px] text-eve-muted underline hover:text-eve-accent"
                  >
                    Clear (All Channels)
                  </button>
                )}
              </div>
              {modalDraft.channels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {modalDraft.channels.map((ch) => (
                    <span
                      key={ch}
                      className="inline-flex items-center gap-1 border border-eve-accent/50 bg-eve-accent-muted px-2 py-0.5 text-[10px] font-semibold text-eve-accent"
                    >
                      {ch}
                      <button
                        type="button"
                        onClick={() =>
                          updateModalDraft({
                            channels: modalDraft.channels.filter((c) => c !== ch)
                          })
                        }
                        className="hover:text-eve-danger"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Keywords */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase text-eve-muted">
                  Keyword / Pilot Alerts (leave empty to show all messages from selected channels):
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={newWatchText}
                  onChange={(e) => setNewWatchText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addWatchToModalDraft()}
                  placeholder="Optional keyword or pilot name (empty = show all channel messages)..."
                  className="flex-1 min-w-[180px] border border-eve-border bg-eve-bg px-2.5 py-1 text-xs outline-none focus:border-eve-accent"
                />
                <select
                  value={newWatchSound}
                  onChange={(e) => {
                    const s = e.target.value as AlertSoundId;
                    setNewWatchSound(s);
                    playAlertSound(s, volumePct);
                  }}
                  className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text outline-none focus:border-eve-accent"
                >
                  {ALERT_SOUND_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addWatchToModalDraft}
                  className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs text-eve-accent"
                >
                  <Plus className="h-3 w-3" /> Add Alert
                </button>
              </div>

              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pt-1">
                {modalDraft.watches.map((rule) => (
                  <span
                    key={rule.id}
                    className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-0.5 text-[11px]"
                  >
                    <span className="font-semibold text-eve-text">{rule.keyword}</span>
                    <select
                      value={rule.sound}
                      onChange={(e) => {
                        const s = e.target.value as AlertSoundId;
                        updateModalDraft({
                          watches: modalDraft.watches.map((w) =>
                            w.id === rule.id ? { ...w, sound: s } : w
                          )
                        });
                        playAlertSound(s, volumePct);
                      }}
                      className="border-l border-eve-border bg-transparent pl-1 text-[10px] text-eve-accent outline-none"
                    >
                      {ALERT_SOUND_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id} className="bg-eve-panel text-eve-text">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        updateModalDraft({
                          watches: modalDraft.watches.filter((w) => w.id !== rule.id)
                        })
                      }
                      className="text-eve-muted hover:text-eve-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-eve-border pt-2">
              <button
                type="button"
                onClick={() => setModalDraft(null)}
                className="border border-eve-border bg-eve-bg px-3 py-1 text-xs text-eve-muted hover:text-eve-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="border border-eve-accent bg-eve-accent-muted px-4 py-1 text-xs font-semibold text-eve-accent hover:bg-eve-accent/20"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDeleteSetupId !== null}
        title="Delete Alert Tracker"
        message="Are you sure you want to delete this alert tracker? This cannot be undone."
        onCancel={() => setConfirmDeleteSetupId(null)}
        onConfirm={() => {
          if (confirmDeleteSetupId) deleteSetup(confirmDeleteSetupId);
          setConfirmDeleteSetupId(null);
        }}
      />

      <ConfirmModal
        open={confirmClearAll}
        title="Clear All Alerts"
        message="Are you sure you want to clear all captured alerts from the feed?"
        confirmLabel="Clear All"
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={() => {
          void window.eveLens.intelTracker.clearEvents();
          setConfirmClearAll(false);
        }}
      />
    </div>
  );
}

