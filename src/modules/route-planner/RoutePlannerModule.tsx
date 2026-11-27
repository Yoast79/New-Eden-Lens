import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardPaste,
  Compass,
  Copy,
  FolderOpen,
  Navigation,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Waypoints,
  X
} from 'lucide-react';
import type { SolarSystemRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type {
  JumpGateRow,
  RouteResultDto,
  RouteSecurityMode,
  SavedRouteRow
} from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { ConfirmModal } from '@/core/components/ConfirmModal';
import { getSecurityColorClass } from '@/core/utils/format';

export function RoutePlannerModule({ activeCharacterId, incomingClipboard }: ModuleProps) {
  const [originQuery, setOriginQuery] = useState('Jita');
  const [destQuery, setDestQuery] = useState('Amarr');
  const [originSystem, setOriginSystem] = useState<SolarSystemRow | null>(null);
  const [destSystem, setDestSystem] = useState<SolarSystemRow | null>(null);
  const [originHits, setOriginHits] = useState<SolarSystemRow[]>([]);
  const [destHits, setDestHits] = useState<SolarSystemRow[]>([]);

  const [securityMode, setSecurityMode] = useState<RouteSecurityMode>('shortest');
  const [useTheraTurnur, setUseTheraTurnur] = useState(false);
  const [useJumpGates, setUseJumpGates] = useState(false);
  const [avoidQuery, setAvoidQuery] = useState('');
  const [avoidHits, setAvoidHits] = useState<SolarSystemRow[]>([]);
  const [avoidSystems, setAvoidSystems] = useState<SolarSystemRow[]>([]);

  const [waypointIds, setWaypointIds] = useState<number[]>([]);
  const [route, setRoute] = useState<RouteResultDto | null>(null);
  const [pushEveryJump, setPushEveryJump] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Saved routes state
  const [savedRoutes, setSavedRoutes] = useState<SavedRouteRow[]>([]);
  const [routeName, setRouteName] = useState('');
  const [routeDesc, setRouteDesc] = useState('');
  const [selectedSavedId, setSelectedSavedId] = useState<number | null>(null);
  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [savePopupOpen, setSavePopupOpen] = useState(false);
  const [showTruesec, setShowTruesec] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'route' | 'gate'; id: number } | null>(null);

  // Jump Gates state
  const [jumpGates, setJumpGates] = useState<JumpGateRow[]>([]);
  const [jumpGateDrawerOpen, setJumpGateDrawerOpen] = useState(false);
  const [jumpGateInput, setJumpGateInput] = useState('');

  const loadSavedAndGates = useCallback(async () => {
    const [routesList, gatesList] = await Promise.all([
      window.eveLens.nav.listSavedRoutes(),
      window.eveLens.nav.listJumpGates()
    ]);
    setSavedRoutes(routesList);
    setJumpGates(gatesList);
  }, []);

  useEffect(() => {
    void loadSavedAndGates();
    void (async () => {
      const [jita, amarr] = await Promise.all([
        window.eveLens.sde.searchSystems('Jita', 1),
        window.eveLens.sde.searchSystems('Amarr', 1)
      ]);
      if (jita[0]) setOriginSystem(jita[0]);
      if (amarr[0]) setDestSystem(amarr[0]);
    })();
  }, [loadSavedAndGates]);

  const parseAndLoadPastedSystems = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('NEL-R1:')) {
        const res = await window.eveLens.nav.resolveRouteShareCode({ shareCode: trimmed });
        setRoute(res);
        setWaypointIds(res.majorWaypoints.map((w) => w.solarSystemId));
        setStatusMsg(`Loaded shared route (${res.totalJumps} jumps).`);
        return;
      }

      const lines = trimmed
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      // Detect EVE "Manage Route" / Autopilot format (`Current location: X`, `• Y`, `1. Z(Solar System) ...`)
      const hasGameFormat = lines.some(
        (l) => /^Current location:/i.test(l) || /^[•·*-]\s+/.test(l) || /^\d+\.\s+/.test(l)
      );

      if (hasGameFormat) {
        const entries: Array<{ name: string; isWaypoint: boolean; waypointIndex?: number }> = [];
        for (const line of lines) {
          const curMatch = /^Current location:\s*(.+)$/i.exec(line);
          if (curMatch) {
            entries.push({ name: curMatch[1].trim(), isWaypoint: true, waypointIndex: 0 });
            continue;
          }
          const wpMatch = /^(\d+)\.\s*([^(]+?)(?:\(.*)?$/.exec(line);
          if (wpMatch) {
            entries.push({
              name: wpMatch[2].trim(),
              isWaypoint: true,
              waypointIndex: Number(wpMatch[1])
            });
            continue;
          }
          const dotMatch = /^[•·*-]\s*(.+)$/.exec(line);
          if (dotMatch) {
            entries.push({ name: dotMatch[1].trim(), isWaypoint: false });
          }
        }

        const res = await window.eveLens.nav.resolveRouteShareCode({ entries });
        if (res.jumps.length > 0) {
          setRoute(res);
          const wps = res.jumps.filter((j) => j.isWaypoint).map((j) => j.solarSystemId);
          setWaypointIds(wps);
          const first = res.jumps[0];
          const last = res.jumps[res.jumps.length - 1];
          setOriginQuery(first.solarSystemName);
          setDestQuery(last.solarSystemName);
          setStatusMsg(
            `Loaded ${res.jumps.length} systems (${wps.length} waypoints) from EVE route.`
          );
        }
        return;
      }

      // Plain list of systems (e.g. Finid / Zimmem / Cleyd / ...)
      const plainNames = trimmed
        .split(/\r?\n|->|,|\t/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);

      if (plainNames.length === 0) return;

      const resolved = await window.eveLens.nav.resolveRouteShareCode({ systemNames: plainNames });
      const wpIds = resolved.jumps.map((j) => j.solarSystemId);
      if (wpIds.length >= 2) {
        setWaypointIds(wpIds);
        setOriginQuery(resolved.jumps[0].solarSystemName);
        setDestQuery(resolved.jumps[resolved.jumps.length - 1].solarSystemName);
        const solved = await window.eveLens.nav.findRoute({
          originSystemId: wpIds[0],
          destinationSystemId: wpIds[wpIds.length - 1],
          waypointSystemIds: wpIds,
          securityMode,
          avoidSystemIds: avoidSystems.map((s) => s.solarSystemId),
          useTheraTurnur,
          useJumpGates
        });
        setRoute(solved);
        setStatusMsg(
          `Plotted ${wpIds.length} waypoints (${solved.totalJumps} total jumps).`
        );
      }
    },
    [securityMode, avoidSystems, useTheraTurnur, useJumpGates]
  );

  useEffect(() => {
    if (incomingClipboard && incomingClipboard.format === 'route') {
      setPasteInput(incomingClipboard.raw);
      void parseAndLoadPastedSystems(incomingClipboard.raw);
    }
  }, [incomingClipboard, parseAndLoadPastedSystems]);

  const handleOptimize = async (modeOverride?: RouteSecurityMode) => {
    const mode = modeOverride ?? securityMode;
    const wpList =
      waypointIds.length >= 2
        ? waypointIds
        : originSystem && destSystem
          ? [originSystem.solarSystemId, destSystem.solarSystemId]
          : [];
    if (wpList.length < 2) return;

    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await window.eveLens.nav.findRoute({
        originSystemId: wpList[0],
        destinationSystemId: wpList[wpList.length - 1],
        waypointSystemIds: wpList,
        securityMode: mode,
        avoidSystemIds: avoidSystems.map((s) => s.solarSystemId),
        useTheraTurnur,
        useJumpGates
      });
      setRoute(res);
      if (res.jumps.length === 0) {
        setStatusMsg('No valid route found with the current security/avoid filters.');
      } else {
        setStatusMsg(`Optimized (${mode.replace('_', ' ')}): ${res.totalJumps} jumps.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRoute = async () => {
    if (!route || route.jumps.length === 0) return;
    const wpIds =
      route.majorWaypoints.length >= 2
        ? route.majorWaypoints.map((w) => w.solarSystemId)
        : route.jumps.map((j) => j.solarSystemId);
    const sharePayload = {
      v: 2,
      mode: securityMode,
      useTheraTurnur,
      useJumpGates,
      pushEveryJump,
      waypointIds: wpIds,
      ids: route.jumps.map((j) => j.solarSystemId)
    };
    const encoded = 'NEL-R1:' + btoa(JSON.stringify(sharePayload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const list = await window.eveLens.nav.saveRoute({
      name:
        routeName.trim() ||
        `${route.jumps[0].solarSystemName} → ${route.jumps[route.jumps.length - 1].solarSystemName}`,
      description: routeDesc.trim(),
      waypoints: wpIds,
      securityMode,
      shareCode: encoded
    });
    setSavedRoutes(list);
    setStatusMsg('Route saved with waypoints & options.');
  };

  const handleRenameSelected = async () => {
    if (!selectedSavedId) return;
    const list = await window.eveLens.nav.renameRoute(selectedSavedId, routeName, routeDesc);
    setSavedRoutes(list);
    setStatusMsg('Route renamed.');
  };

  const handleDeleteSelected = async (id: number) => {
    const list = await window.eveLens.nav.deleteRoute(id);
    setSavedRoutes(list);
    if (selectedSavedId === id) setSelectedSavedId(null);
  };

  const handlePushToAutopilot = async () => {
    if (!route || route.jumps.length === 0) return;
    if (activeCharacterId === null) {
      setStatusMsg('Select a single character in the top bar to push waypoints to EVE.');
      return;
    }

    const targets = pushEveryJump ? route.jumps.slice(1) : route.majorWaypoints.filter((w) => w.waypointIndex !== 0);
    if (targets.length === 0) return;

    setLoading(true);
    try {
      for (let i = 0; i < targets.length; i++) {
        await window.eveLens.nav.setAutopilotWaypoint(
          activeCharacterId,
          targets[i].solarSystemId,
          i === 0,
          false
        );
      }
      setStatusMsg(
        `Pushed ${targets.length} ${pushEveryJump ? 'systems' : 'waypoints'} to EVE Autopilot.`
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to push waypoints');
    } finally {
      setLoading(false);
    }
  };

  const displayedList = route ? route.jumps : [];

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      <div className="relative z-30 grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Route Matrix Controls */}
        <div className="photon-panel space-y-2.5 p-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <Compass className="h-4 w-4 text-eve-accent" />
              New Eden Route Matrix
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setJumpGateDrawerOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
              >
                <Waypoints className="h-3 w-3" />
                Jump Gates ({jumpGates.length})
              </button>
              <button
                type="button"
                onClick={() => setSavedDrawerOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
              >
                <FolderOpen className="h-3 w-3" />
                Saved ({savedRoutes.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setOriginSystem(destSystem);
                  setDestSystem(originSystem);
                  setOriginQuery(destQuery);
                  setDestQuery(originQuery);
                  setWaypointIds([]);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
              >
                <ArrowLeftRight className="h-3 w-3" />
                Swap
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SystemPicker
              label="Origin"
              query={originQuery}
              selected={originSystem}
              hits={originHits}
              onQueryChange={async (q) => {
                setOriginQuery(q);
                setOriginHits(q.length >= 2 ? await window.eveLens.sde.searchSystems(q, 8) : []);
              }}
              onSelect={(s) => {
                setOriginSystem(s);
                setOriginQuery(s.solarSystemName);
                setOriginHits([]);
                setWaypointIds([]);
              }}
            />
            <SystemPicker
              label="Destination"
              query={destQuery}
              selected={destSystem}
              hits={destHits}
              onQueryChange={async (q) => {
                setDestQuery(q);
                setDestHits(q.length >= 2 ? await window.eveLens.sde.searchSystems(q, 8) : []);
              }}
              onSelect={(s) => {
                setDestSystem(s);
                setDestQuery(s.solarSystemName);
                setDestHits([]);
                setWaypointIds([]);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['shortest', 'Shortest'],
                  ['highsec_only', 'Safest (Highsec)'],
                  ['avoid_low_null', 'Avoid Low/Null'],
                  ['most_dangerous', 'Most Dangerous']
                ] as Array<[RouteSecurityMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSecurityMode(mode)}
                  className={`border px-2 py-1 text-[11px] ${
                    securityMode === mode
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs text-eve-text">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={useJumpGates}
                  onChange={(e) => setUseJumpGates(e.target.checked)}
                />
                Use Jump Gates
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={useTheraTurnur}
                  onChange={(e) => setUseTheraTurnur(e.target.checked)}
                />
                Thera / Turnur
              </label>
            </div>
          </div>

          {useJumpGates && (
            <div className="flex items-start gap-2 border border-eve-warning/50 bg-eve-warning/10 px-2.5 py-1.5 text-[11px] text-eve-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                {jumpGates.length === 0
                  ? 'No jump gates saved yet (click "Jump Gates" above to paste System A > System B pairs). '
                  : ''}
                Caution: Alliance jump gates may be inaccessible due to wrong character/standings,
                low fuel, or being reinforced/under attack.
              </div>
            </div>
          )}

          {/* Avoid Systems & Optimize Button */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={avoidQuery}
                onChange={async (e) => {
                  const q = e.target.value;
                  setAvoidQuery(q);
                  setAvoidHits(q.length >= 2 ? await window.eveLens.sde.searchSystems(q, 6) : []);
                }}
                placeholder="Avoid system (e.g. Uedama, Ahbazon)..."
                className="flex-1 border border-eve-border bg-eve-bg px-2.5 py-1 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={loading || (waypointIds.length < 2 && (!originSystem || !destSystem))}
                onClick={() => void handleOptimize()}
                className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-4 py-1 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25 disabled:opacity-40"
              >
                <Navigation className="h-3.5 w-3.5" />
                {loading ? 'Optimizing...' : 'Optimize Route'}
              </button>
            </div>
            {avoidHits.length > 0 && (
              <div className="flex flex-wrap gap-1 border border-eve-border bg-eve-bg p-1.5">
                {avoidHits.map((s) => (
                  <button
                    key={s.solarSystemId}
                    type="button"
                    onClick={() => {
                      if (!avoidSystems.some((a) => a.solarSystemId === s.solarSystemId)) {
                        setAvoidSystems((prev) => [...prev, s]);
                      }
                      setAvoidQuery('');
                      setAvoidHits([]);
                    }}
                    className="inline-flex items-center gap-1 border border-eve-border px-2 py-0.5 text-[11px] hover:border-eve-accent"
                  >
                    <Plus className="h-3 w-3 text-eve-accent" />
                    {s.solarSystemName}
                  </button>
                ))}
              </div>
            )}
            {avoidSystems.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {avoidSystems.map((s) => (
                  <span
                    key={s.solarSystemId}
                    className="inline-flex items-center gap-1 border border-eve-danger/40 bg-eve-danger/10 px-2 py-0.5 text-[11px] text-eve-danger"
                  >
                    {s.solarSystemName}
                    <button
                      type="button"
                      onClick={() =>
                        setAvoidSystems((prev) =>
                          prev.filter((a) => a.solarSystemId !== s.solarSystemId)
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Paste, Save/Load & In-Game Sync */}
        <div className="photon-panel flex flex-col justify-between gap-2 p-3 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-eve-border pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Paste Game Route / Save &amp; Sync
            </span>
            <button
              type="button"
              onClick={async () => {
                const txt = await window.eveLens.clipboard.readText();
                setPasteInput(txt);
                void parseAndLoadPastedSystems(txt);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
            >
              <ClipboardPaste className="h-3 w-3" />
              Paste &amp; Load
            </button>
          </div>

          <textarea
            rows={3}
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            placeholder="Paste EVE 'Manage Route' copy (numbered waypoints + • jumps), a list of systems, or NEL-R1:... code..."
            className="w-full resize-none border border-eve-border bg-eve-bg p-2 font-mono text-xs text-eve-text focus:border-eve-accent focus:outline-none"
          />

          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Route name..."
              className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
            />
            <input
              type="text"
              value={routeDesc}
              onChange={(e) => setRouteDesc(e.target.value)}
              placeholder="Description..."
              className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-eve-text">
            <input
              type="checkbox"
              checked={pushEveryJump}
              onChange={(e) => setPushEveryJump(e.target.checked)}
            />
            Push every system in order (unchecked = waypoints only)
          </label>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void parseAndLoadPastedSystems(pasteInput)}
              className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-elevated px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent"
            >
              Load Paste
            </button>
            <button
              type="button"
              disabled={!route || route.jumps.length === 0}
              onClick={() => {
                if (route && !routeName.trim()) {
                  setRouteName(
                    `${route.jumps[0].solarSystemName} → ${route.jumps[route.jumps.length - 1].solarSystemName}`
                  );
                }
                setSavePopupOpen(true);
              }}
              className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-elevated px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent disabled:opacity-40"
            >
              <Save className="h-3 w-3 text-eve-accent" />
              Save
            </button>
            <button
              type="button"
              onClick={() => setSavedDrawerOpen((v) => !v)}
              className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-elevated px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent"
            >
              <FolderOpen className="h-3 w-3 text-eve-accent" />
              Load
            </button>
            {selectedSavedId && (
              <button
                type="button"
                onClick={() => void handleRenameSelected()}
                className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-elevated px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent"
              >
                <Pencil className="h-3 w-3 text-eve-accent" />
                Rename
              </button>
            )}
            {route?.shareCode && (
              <button
                type="button"
                onClick={async () => {
                  await window.eveLens.clipboard.writeText(route.shareCode);
                  setStatusMsg('Copied fleet share code.');
                }}
                className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-elevated px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent"
              >
                <Copy className="h-3 w-3 text-eve-accent" />
                Share
              </button>
            )}
            <button
              type="button"
              disabled={!route || route.jumps.length === 0 || loading}
              onClick={() => void handlePushToAutopilot()}
              className="ml-auto inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-[11px] font-semibold text-eve-accent disabled:opacity-40"
            >
              <Send className="h-3 w-3" />
              Push to EVE
            </button>
          </div>
          {statusMsg && <div className="text-[11px] text-eve-accent">{statusMsg}</div>}
        </div>
      </div>

      {/* Jump Gates Manager Drawer */}
      {jumpGateDrawerOpen && (
        <div className="photon-panel space-y-2 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-eve-accent">
              Alliance Jump Gates (Ansiblex) — Paste `System A &gt; System B`
            </span>
            <button type="button" onClick={() => setJumpGateDrawerOpen(false)}>
              <X className="h-3.5 w-3.5 text-eve-muted" />
            </button>
          </div>
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={jumpGateInput}
              onChange={(e) => setJumpGateInput(e.target.value)}
              placeholder={`1DQ1-A > T5ZI-S\nMJ-5F9 > R1O-GN`}
              className="flex-1 resize-none border border-eve-border bg-eve-bg p-2 font-mono text-xs text-eve-text"
            />
            <button
              type="button"
              onClick={async () => {
                const list = await window.eveLens.nav.importJumpGatesText(jumpGateInput);
                setJumpGates(list);
                setJumpGateInput('');
              }}
              className="border border-eve-accent/60 bg-eve-accent-muted px-3 text-xs font-semibold text-eve-accent"
            >
              Add Gates
            </button>
          </div>
          {jumpGates.length > 0 && (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {jumpGates.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 border border-eve-border bg-eve-bg px-2 py-0.5 text-[11px]"
                >
                  <span>
                    {g.fromSystemName} ↔ {g.toSystemName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ kind: 'gate', id: g.id })}
                    className="text-eve-muted hover:text-eve-danger"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saved Routes Drawer */}
      {savedDrawerOpen && (
        <div className="photon-panel max-h-40 overflow-y-auto p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-eve-muted">
            Saved Routes
          </div>
          {savedRoutes.length === 0 ? (
            <div className="text-xs text-eve-muted">No saved routes yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {savedRoutes.map((sr) => (
                <div
                  key={sr.id}
                  className="flex items-center justify-between border border-eve-border bg-eve-bg/60 px-2.5 py-1.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await window.eveLens.nav.resolveRouteShareCode({
                        shareCode: sr.shareCode
                      });
                      setRoute(res);
                      setWaypointIds(
                        res.majorWaypoints.length >= 2
                          ? res.majorWaypoints.map((w) => w.solarSystemId)
                          : sr.waypoints
                      );
                      setSelectedSavedId(sr.id);
                      setRouteName(sr.name);
                      setRouteDesc(sr.description);
                      setSecurityMode(res.meta?.securityMode ?? sr.securityMode);
                      if (res.meta?.useTheraTurnur !== undefined) setUseTheraTurnur(res.meta.useTheraTurnur);
                      if (res.meta?.useJumpGates !== undefined) setUseJumpGates(res.meta.useJumpGates);
                      if (res.meta?.pushEveryJump !== undefined) setPushEveryJump(res.meta.pushEveryJump);
                      if (res.jumps.length >= 2) {
                        setOriginQuery(res.jumps[0].solarSystemName);
                        setDestQuery(res.jumps[res.jumps.length - 1].solarSystemName);
                      }
                      setStatusMsg(`Loaded saved route "${sr.name}" (${res.totalJumps} jumps).`);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate font-semibold text-eve-text">{sr.name}</div>
                    {sr.description && (
                      <div className="truncate text-[10px] text-eve-muted">{sr.description}</div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ kind: 'route', id: sr.id })}
                    className="ml-2 text-eve-muted hover:text-eve-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full Route Table (Waypoints + In-Between Systems) */}
      <div className="photon-panel flex min-h-0 flex-1 flex-col">
        <div className="photon-header flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider">
            {route
              ? `Route: ${route.totalJumps} Jumps (${route.majorWaypoints.length} waypoints)`
              : 'Route Waypoints & Jumps'}
          </span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-eve-muted hover:text-eve-text">
            <input
              type="checkbox"
              checked={showTruesec}
              onChange={(e) => setShowTruesec(e.target.checked)}
              className="accent-[var(--eve-accent)]"
            />
            Show Truesec
          </label>
        </div>

        <div className="flex-1 overflow-auto">
          {displayedList.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
              Select Origin &amp; Destination, or paste an EVE route / list of systems above.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                <tr className="border-b border-eve-border">
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">System</th>
                  <th className="px-3 py-2">Sec</th>
                  <th className="px-3 py-2">Region</th>
                  <th className="px-3 py-2 text-right">Ship Kills</th>
                  <th className="px-3 py-2 text-right">Pod Kills</th>
                  <th className="px-3 py-2 text-right">PvE (NPC)</th>
                  <th className="px-3 py-2">Intel / Warning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eve-border/50">
                {displayedList.map((node, idx) => (
                  <tr
                    key={`${node.solarSystemId}-${idx}`}
                    className={node.isWaypoint ? 'bg-eve-accent-muted/20 hover:bg-eve-accent-muted/35' : 'hover:bg-eve-elevated/60'}
                  >
                    <td className="num-mono px-3 py-2">
                      {node.isWaypoint ? (
                        <span className="border border-eve-accent/60 bg-eve-accent-muted px-1.5 py-0.2 text-[10px] font-bold text-eve-accent">
                          {node.waypointIndex === 0 ? 'START' : `WP ${node.waypointIndex ?? idx}`}
                        </span>
                      ) : (
                        <span className="text-eve-muted">• {idx}</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 ${node.isWaypoint ? 'font-bold text-eve-text' : 'text-eve-text'}`}>
                      {node.solarSystemName}
                    </td>
                    <td className={`num-mono px-3 py-2 font-semibold ${getSecurityColorClass(node.security)}`}>
                      {showTruesec ? node.security.toFixed(2) : Math.max(-1, node.security).toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-eve-muted">{node.regionName}</td>
                    <td className={`num-mono px-3 py-2 text-right ${node.shipKills > 0 ? 'text-eve-danger font-semibold' : 'text-eve-muted'}`}>
                      {node.shipKills}
                    </td>
                    <td className={`num-mono px-3 py-2 text-right ${node.podKills > 0 ? 'text-eve-warning' : 'text-eve-muted'}`}>
                      {node.podKills}
                    </td>
                    <td className="num-mono px-3 py-2 text-right text-eve-muted">
                      {node.npcKills.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {node.viaJumpGate ? (
                        <span className="border border-sky-500/50 bg-sky-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-sky-300">
                          ANSIBLEX JUMP GATE
                        </span>
                      ) : node.gankWarning ? (
                        <span className="inline-flex items-center gap-1 border border-eve-danger/50 bg-eve-danger/10 px-1.5 py-0.2 text-[10px] font-semibold text-eve-danger">
                          <AlertTriangle className="h-3 w-3" />
                          {node.gankWarning}
                        </span>
                      ) : node.viaWormhole ? (
                        <span className="text-[11px] text-eve-accent">WH: {node.wormholeSource}</span>
                      ) : (
                        <span className="text-eve-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* Save Route Popup Modal */}
      {savePopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-md space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Save Route
              </span>
              <button
                type="button"
                onClick={() => setSavePopupOpen(false)}
                className="text-eve-muted hover:text-eve-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Route Name</span>
                <input
                  type="text"
                  autoFocus
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="e.g. Amarr -> Iderion Loop"
                  className="w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-eve-muted">Description</span>
                <textarea
                  rows={3}
                  value={routeDesc}
                  onChange={(e) => setRouteDesc(e.target.value)}
                  placeholder="Notes, ship type, or gank warnings..."
                  className="w-full resize-none border border-eve-border bg-eve-bg p-2 text-xs text-eve-text"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-eve-border pt-2">
              <button
                type="button"
                onClick={() => setSavePopupOpen(false)}
                className="border border-eve-border bg-eve-panel px-3 py-1 text-xs text-eve-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleSaveRoute();
                  setSavePopupOpen(false);
                }}
                className="border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold text-eve-accent"
              >
                Save Route
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title={confirmDelete?.kind === 'gate' ? 'Delete Jump Gate' : 'Delete Saved Route'}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          if (confirmDelete.kind === 'gate') {
            setJumpGates(await window.eveLens.nav.deleteJumpGate(confirmDelete.id));
          } else {
            await handleDeleteSelected(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function SystemPicker({
  label,
  query,
  selected,
  hits,
  onQueryChange,
  onSelect
}: {
  label: string;
  query: string;
  selected: SolarSystemRow | null;
  hits: SolarSystemRow[];
  onQueryChange: (q: string) => void;
  onSelect: (s: SolarSystemRow) => void;
}) {
  return (
    <div className="relative space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-eve-muted">
        <span>{label}</span>
        {selected && (
          <span className={`num-mono ${getSecurityColorClass(selected.security)}`}>
            {selected.security.toFixed(1)}
          </span>
        )}
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
      />
      {hits.length > 0 && (
        <div className="photon-panel absolute left-0 right-0 top-full z-30 max-h-40 overflow-y-auto shadow-xl">
          {hits.map((s) => (
            <button
              key={s.solarSystemId}
              type="button"
              onClick={() => onSelect(s)}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
            >
              <span className="text-eve-text">{s.solarSystemName}</span>
              <span className={`num-mono ${getSecurityColorClass(s.security)}`}>
                {s.security.toFixed(1)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
