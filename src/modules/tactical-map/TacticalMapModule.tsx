import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  RotateCcw,
  Search,
  Snowflake,
  Users
} from 'lucide-react';
import { KNOWN_ICE_SYSTEMS } from '@shared/constants/ice-systems';
import type { ModuleProps } from '@shared/types/module';
import type {
  FleetMemberLocationDto,
  MapDataDto,
  MapSystemDto,
  IntelTrackerAlertEvent
} from '@shared/types/modules-data';
import { getSecurityColorClass } from '@/core/utils/format';

type OverlayMode = 'security' | 'shipKills' | 'podKills' | 'npcKills' | 'shipJumps' | 'sov';
type MapStyle = 'cluster' | 'schematic';

function secHex(sec: number): string {
  if (sec >= 0.9) return '#2FEFEF';
  if (sec >= 0.7) return '#48F078';
  if (sec >= 0.5) return '#E3F545';
  if (sec > 0.0) return '#F58E26';
  return '#EF4444';
}

function heatHex(val: number, maxVal: number): string {
  if (val <= 0 || maxVal <= 0) return '#334155';
  const ratio = Math.min(1, Math.log10(val + 1) / Math.log10(maxVal + 1));
  if (ratio > 0.75) return '#EF4444';
  if (ratio > 0.45) return '#F59E0B';
  if (ratio > 0.2) return '#00F0FF';
  return '#38BDF8';
}

function sovHex(allianceId: number | null): string {
  if (!allianceId) return '#334155';
  const hue = (allianceId * 137) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Array<{ x: number; y: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function clampViewOffsets(
  offsetX: number,
  offsetY: number,
  zoom: number,
  w: number,
  h: number
): { offsetX: number; offsetY: number } {
  const pad = 48;
  const size = Math.max(100, Math.min(w, h) - pad * 2);
  const maxPanX = (size * zoom) / 2 + w * 0.38;
  const maxPanY = (size * zoom) / 2 + h * 0.38;
  return {
    offsetX: Math.max(-maxPanX, Math.min(maxPanX, offsetX)),
    offsetY: Math.max(-maxPanY, Math.min(maxPanY, offsetY))
  };
}

export function TacticalMapModule({ activeCharacterId }: ModuleProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [regions, setRegions] = useState<Array<{ regionId: number; regionName: string }>>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('eveLens:mapRegionId');
      return saved && saved !== 'null' ? Number(saved) : null;
    } catch {
      return null;
    }
  });
  const [mapData, setMapData] = useState<MapDataDto>({ systems: [], edges: [] });
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => {
    try {
      return localStorage.getItem('eveLens:mapStyle') === 'schematic' ? 'schematic' : 'cluster';
    } catch {
      return 'cluster';
    }
  });
  const [overlay, setOverlay] = useState<OverlayMode>('security');

  // Security band filters
  const [showHighsec, setShowHighsec] = useState(true);
  const [showLowsec, setShowLowsec] = useState(true);
  const [showNullsec, setShowNullsec] = useState(true);

  const [showIceBelts, setShowIceBelts] = useState(true);
  const [showChatlogAlerts, setShowChatlogAlerts] = useState(true);
  const [showFleetMembers, setShowFleetMembers] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<MapSystemDto | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    system: MapSystemDto;
  } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [iceBeltInput, setIceBeltInput] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [currentSystemId, setCurrentSystemId] = useState<number | null>(null);
  const [gpsFollow, setGpsFollow] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [hoveredSystem, setHoveredSystem] = useState<{
    sys: MapSystemDto;
    x: number;
    y: number;
  } | null>(null);
  const [chatAlerts, setChatAlerts] = useState<IntelTrackerAlertEvent[]>([]);
  const [fleetMembers, setFleetMembers] = useState<FleetMemberLocationDto[]>([]);
  const [sysStations, setSysStations] = useState<
    Array<{ id: number; name: string; services: string[]; ownerName?: string }>
  >([]);
  const [stationsLoading, setStationsLoading] = useState(false);

  // Pan & Zoom state
  const [view, setView] = useState({ offsetX: 0, offsetY: 0, zoom: 1 });
  const dragRef = useRef<{ active: boolean; moved: boolean; lastX: number; lastY: number }>({
    active: false,
    moved: false,
    lastX: 0,
    lastY: 0
  });

  const settingsHydratedRef = useRef(false);
  const pendingCenterSystemIdRef = useRef<number | null>(null);

  useEffect(() => {
    void window.eveLens.nav.listRegions().then(setRegions);
    void window.eveLens.app.getSettings().then((s) => {
      if (s.tacticalMapStyle === 'schematic' || s.tacticalMapStyle === 'cluster') {
        setMapStyle(s.tacticalMapStyle);
      }
      if (s.tacticalMapRegionId !== undefined) {
        setSelectedRegionId(s.tacticalMapRegionId);
      }
      settingsHydratedRef.current = true;
    });
  }, []);

  const loadMap = useCallback(async (regionId: number | null) => {
    const data = await window.eveLens.nav.getMapData(regionId);
    setMapData(data);
    setView({ offsetX: 0, offsetY: 0, zoom: 1 });
  }, []);

  useEffect(() => {
    void loadMap(selectedRegionId);
  }, [selectedRegionId, loadMap]);

  // Poll active character location
  const refreshMyLocation = useCallback(async (): Promise<number | null> => {
    if (!activeCharacterId) {
      setCurrentSystemId(null);
      return null;
    }
    try {
      const loc = await window.eveLens.esi.request<{ solar_system_id: number }>(
        `/characters/${activeCharacterId}/location`,
        { characterId: activeCharacterId }
      );
      if (loc?.solar_system_id) {
        setCurrentSystemId(loc.solar_system_id);
        return loc.solar_system_id;
      }
    } catch {
      // ignore transient location errors
    }
    return null;
  }, [activeCharacterId]);

  useEffect(() => {
    try {
      localStorage.setItem('eveLens:mapStyle', mapStyle);
    } catch {
      // ignore storage errors
    }
    if (settingsHydratedRef.current) {
      void window.eveLens.app.updateSettings({ tacticalMapStyle: mapStyle });
    }
  }, [mapStyle]);

  useEffect(() => {
    try {
      localStorage.setItem('eveLens:mapRegionId', selectedRegionId === null ? 'null' : String(selectedRegionId));
    } catch {
      // ignore storage errors
    }
    if (settingsHydratedRef.current) {
      void window.eveLens.app.updateSettings({ tacticalMapRegionId: selectedRegionId });
    }
  }, [selectedRegionId]);

  useEffect(() => {
    void refreshMyLocation();
    if (!activeCharacterId) return;
    const t = window.setInterval(() => void refreshMyLocation(), gpsFollow ? 8_000 : 20_000);
    return () => window.clearInterval(t);
  }, [activeCharacterId, gpsFollow, refreshMyLocation]);

  // Pulse animation for glowing current location background
  useEffect(() => {
    if (!currentSystemId) return;
    let rafId = 0;
    const tick = () => {
      setPulsePhase((Math.sin(Date.now() / 360) + 1) / 2);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [currentSystemId]);

  // Subscribe to Live Chatlog Intel alerts
  useEffect(() => {
    void window.eveLens.intelTracker.getRecentEvents().then(setChatAlerts).catch(() => {});
    const unsub = window.eveLens.intelTracker.onEvent((ev) => {
      setChatAlerts((prev) => [ev, ...prev].slice(0, 60));
    });
    return unsub;
  }, []);

  // Poll fleet members when toggled on
  const refreshFleet = useCallback(async () => {
    if (!activeCharacterId || !showFleetMembers) {
      setFleetMembers([]);
      return;
    }
    const res = await window.eveLens.nav.getFleetLocations(activeCharacterId);
    setFleetMembers(res.members);
    if (res.error) setStatusMsg(res.error);
  }, [activeCharacterId, showFleetMembers]);

  useEffect(() => {
    void refreshFleet();
    if (!showFleetMembers || !activeCharacterId) return;
    const t = window.setInterval(() => void refreshFleet(), 15_000);
    return () => window.clearInterval(t);
  }, [showFleetMembers, activeCharacterId, refreshFleet]);

  const alertBySystem = useMemo(() => {
    const map = new Map<number, IntelTrackerAlertEvent>();
    if (!showChatlogAlerts) return map;
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const ev of chatAlerts) {
      if (ev.solarSystemId && ev.timestamp >= cutoff && !map.has(ev.solarSystemId)) {
        map.set(ev.solarSystemId, ev);
      }
    }
    return map;
  }, [chatAlerts, showChatlogAlerts]);

  const fleetBySystem = useMemo(() => {
    const map = new Map<number, FleetMemberLocationDto[]>();
    if (!showFleetMembers) return map;
    for (const m of fleetMembers) {
      const arr = map.get(m.solarSystemId) ?? [];
      arr.push(m);
      map.set(m.solarSystemId, arr);
    }
    return map;
  }, [fleetMembers, showFleetMembers]);

  const visibleSystems = useMemo(() => {
    return mapData.systems.filter((s) => {
      if (s.security >= 0.45) return showHighsec;
      if (s.security > 0.0) return showLowsec;
      return showNullsec;
    });
  }, [mapData.systems, showHighsec, showLowsec, showNullsec]);

  const visibleIdSet = useMemo(
    () => new Set(visibleSystems.map((s) => s.solarSystemId)),
    [visibleSystems]
  );

  // Project coordinates into normalized 0..1 space (Cluster 2.5D or 2D Schematic)
  const projected = useMemo(() => {
    if (mapData.systems.length === 0) {
      return {
        coords: new Map<number, { nx: number; ny: number }>(),
        maxHeat: 1
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let maxHeat = 1;

    // Normalize using internal region systems first (so external gateways don't distort bounds)
    const internalSystems = mapData.systems.filter((s) => !s.isExternalGateway);
    const boundPool = internalSystems.length > 0 ? internalSystems : mapData.systems;

    for (const s of boundPool) {
      const px = s.x;
      const py = -s.z;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    for (const s of mapData.systems) {
      if (overlay === 'shipKills') maxHeat = Math.max(maxHeat, s.shipKills);
      else if (overlay === 'podKills') maxHeat = Math.max(maxHeat, s.podKills);
      else if (overlay === 'npcKills') maxHeat = Math.max(maxHeat, s.npcKills);
      else if (overlay === 'shipJumps') maxHeat = Math.max(maxHeat, s.shipJumps);
    }

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const span = Math.max(spanX, spanY);
    const padX = (span - spanX) / 2;
    const padY = (span - spanY) / 2;

    const coords = new Map<number, { nx: number; ny: number }>();
    for (const s of mapData.systems) {
      coords.set(s.solarSystemId, {
        nx: (s.x - minX + padX) / span,
        ny: (-s.z - minY + padY) / span
      });
    }

    // In Flat Map mode for a single region: planar force-directed layout + crossing minimization + exact box non-overlap
    if (mapStyle === 'schematic' && selectedRegionId !== null && mapData.systems.length <= 280) {
      const idxById = new Map<number, number>();
      const pts = mapData.systems.map((s, idx) => {
        idxById.set(s.solarSystemId, idx);
        const subText = s.isExternalGateway ? s.regionName : (s.constellationName ?? '');
        const topW = s.solarSystemName.length * 5.9 + 24 + 22;
        const boxW = Math.max(84, Math.max(topW, subText.length * 5.4 + 18));
        return {
          id: s.solarSystemId,
          constId: s.constellationId ?? 0,
          isExt: Boolean(s.isExternalGateway),
          halfW: (boxW + 18) / 2 / 1450,
          halfH: (27 + 16) / 2 / 1450,
          ...coords.get(s.solarSystemId)!
        };
      });

      const adj = new Map<number, number[]>();
      const localEdges: Array<[number, number]> = [];
      for (const [a, b] of mapData.edges) {
        const ia = idxById.get(a);
        const ib = idxById.get(b);
        if (ia === undefined || ib === undefined) continue;
        adj.set(ia, [...(adj.get(ia) ?? []), ib]);
        adj.set(ib, [...(adj.get(ib) ?? []), ia]);
        if (!pts[ia].isExt && !pts[ib].isExt) {
          localEdges.push([ia, ib]);
        }
      }

      // 1) Balanced Fruchterman-Reingold spring layout (topology-first, untangles clusters)
      const internalIdx = pts.map((_, idx) => idx).filter((idx) => !pts[idx].isExt);
      const idealLen = 0.085;
      for (let iter = 0; iter < 95; iter++) {
        const fx = new Float64Array(pts.length);
        const fy = new Float64Array(pts.length);
        const temp = 0.035 * (1 - iter / 105);

        for (let a = 0; a < internalIdx.length; a++) {
          const i = internalIdx[a];
          for (let b = a + 1; b < internalIdx.length; b++) {
            const j = internalIdx[b];
            const dx = pts[j].nx - pts[i].nx;
            const dy = pts[j].ny - pts[i].ny;
            const d2 = dx * dx + dy * dy + 0.00015;
            const d = Math.sqrt(d2);
            const rep = 0.00018 / d2;
            const rx = (dx / d) * rep;
            const ry = (dy / d) * rep;
            fx[i] -= rx;
            fy[i] -= ry;
            fx[j] += rx;
            fy[j] += ry;
          }
        }

        for (const [ia, ib] of localEdges) {
          const dx = pts[ib].nx - pts[ia].nx;
          const dy = pts[ib].ny - pts[ia].ny;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const sameConst = pts[ia].constId === pts[ib].constId;
          const pull = ((d - idealLen) * (sameConst ? 0.35 : 0.16));
          const ax = (dx / d) * pull;
          const ay = (dy / d) * pull;
          fx[ia] += ax;
          fy[ia] += ay;
          fx[ib] -= ax;
          fy[ib] -= ay;
        }

        for (const i of internalIdx) {
          // Slight gentle gravity toward center to prevent drifting
          fx[i] += (0.5 - pts[i].nx) * 0.012;
          fy[i] += (0.5 - pts[i].ny) * 0.012;
          const mag = Math.hypot(fx[i], fy[i]) || 1;
          const step = Math.min(temp, mag);
          pts[i].nx = Math.max(0.05, Math.min(0.95, pts[i].nx + (fx[i] / mag) * step));
          pts[i].ny = Math.max(0.05, Math.min(0.95, pts[i].ny + (fy[i] / mag) * step));
        }
      }

      // 2) Edge-crossing minimization: swap nearby nodes if doing so strictly reduces crossings
      const segsCross = (
        ax: number, ay: number, bx: number, by: number,
        cx: number, cy: number, dx: number, dy: number
      ): boolean => {
        const ccw = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number) =>
          (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
        return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
          ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
      };

      const countNodeCrossings = (nodeIdx: number): number => {
        const nbs = (adj.get(nodeIdx) ?? []).filter((n) => !pts[n].isExt);
        let c = 0;
        for (const nb of nbs) {
          for (const [ea, eb] of localEdges) {
            if (ea === nodeIdx || eb === nodeIdx || ea === nb || eb === nb) continue;
            if (
              segsCross(
                pts[nodeIdx].nx, pts[nodeIdx].ny, pts[nb].nx, pts[nb].ny,
                pts[ea].nx, pts[ea].ny, pts[eb].nx, pts[eb].ny
              )
            ) {
              c++;
            }
          }
        }
        return c;
      };

      for (let pass = 0; pass < 4; pass++) {
        for (let a = 0; a < internalIdx.length; a++) {
          const i = internalIdx[a];
          if (countNodeCrossings(i) === 0) continue;
          // Try swapping with nearest 8 neighbors if it reduces crossings
          const nearest = internalIdx
            .filter((j) => j !== i)
            .sort(
              (j1, j2) =>
                Math.hypot(pts[j1].nx - pts[i].nx, pts[j1].ny - pts[i].ny) -
                Math.hypot(pts[j2].nx - pts[i].nx, pts[j2].ny - pts[i].ny)
            )
            .slice(0, 6);
          for (const j of nearest) {
            const before = countNodeCrossings(i) + countNodeCrossings(j);
            const tx = pts[i].nx;
            const ty = pts[i].ny;
            pts[i].nx = pts[j].nx;
            pts[i].ny = pts[j].ny;
            pts[j].nx = tx;
            pts[j].ny = ty;
            const after = countNodeCrossings(i) + countNodeCrossings(j);
            if (after >= before) {
              // Revert
              pts[j].nx = pts[i].nx;
              pts[j].ny = pts[i].ny;
              pts[i].nx = tx;
              pts[i].ny = ty;
            }
          }
        }
      }

      // 3) Place external gateway pills directly beside their connected border gate (outward from centroid)
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i].isExt) continue;
        const nbs = (adj.get(i) ?? []).filter((ni) => !pts[ni].isExt);
        if (nbs.length === 0) continue;
        const anchor = pts[nbs[0]];
        const dx = anchor.nx - 0.5;
        const dy = anchor.ny - 0.5;
        const len = Math.hypot(dx, dy) || 1;
        pts[i].nx = Math.max(0.03, Math.min(0.97, anchor.nx + (dx / len) * 0.08));
        pts[i].ny = Math.max(0.03, Math.min(0.97, anchor.ny + (dy / len) * 0.05));
      }

      // 4) Exact box-size AABB non-overlapping pass (guarantees zero overlap)
      for (let iter = 0; iter < 65; iter++) {
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const minDx = pts[i].halfW + pts[j].halfW;
            const minDy = pts[i].halfH + pts[j].halfH;
            const dx = pts[j].nx - pts[i].nx;
            const dy = pts[j].ny - pts[i].ny;
            if (Math.abs(dx) < minDx && Math.abs(dy) < minDy) {
              const overlapX = minDx - Math.abs(dx);
              const overlapY = minDy - Math.abs(dy);
              if (overlapX < overlapY) {
                const push = overlapX * 0.52 * (dx >= 0 ? 1 : -1);
                pts[i].nx = Math.max(0.02, Math.min(0.98, pts[i].nx - push));
                pts[j].nx = Math.max(0.02, Math.min(0.98, pts[j].nx + push));
              } else {
                const push = overlapY * 0.52 * (dy >= 0 ? 1 : -1);
                pts[i].ny = Math.max(0.02, Math.min(0.98, pts[i].ny - push));
                pts[j].ny = Math.max(0.02, Math.min(0.98, pts[j].ny + push));
              }
            }
          }
        }
      }
      for (const p of pts) coords.set(p.id, { nx: p.nx, ny: p.ny });
    }

    return { coords, maxHeat };
  }, [mapData.systems, overlay, mapStyle, selectedRegionId]);

  const toScreen = useCallback(
    (nx: number, ny: number, w: number, h: number) => {
      const pad = 48;
      const baseSize = Math.min(w, h) - pad * 2;
      const size = mapStyle === 'schematic' && selectedRegionId !== null ? baseSize * 2.8 : baseSize;
      const baseX = (w - size) / 2 + nx * size;
      const baseY = (h - size) / 2 + ny * size;
      return {
        sx: (baseX - w / 2) * view.zoom + w / 2 + view.offsetX,
        sy: (baseY - h / 2) * view.zoom + h / 2 + view.offsetY
      };
    },
    [view, mapStyle, selectedRegionId]
  );

  // Draw Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Subtle schematic grid in 2D Schematic mode
    if (mapStyle === 'schematic') {
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let gx = 0; gx < w; gx += step) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += step) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }
    }

    // Draw Region Borders & Labels when viewing All New Eden
    if (selectedRegionId === null) {
      const byRegion = new Map<number, { name: string; pts: Array<{ x: number; y: number }> }>();
      for (const s of visibleSystems) {
        const c = projected.coords.get(s.solarSystemId);
        if (!c) continue;
        const sc = toScreen(c.nx, c.ny, w, h);
        let entry = byRegion.get(s.regionId);
        if (!entry) {
          entry = { name: s.regionName, pts: [] };
          byRegion.set(s.regionId, entry);
        }
        entry.pts.push({ x: sc.sx, y: sc.sy });
      }

      for (const [regId, reg] of byRegion.entries()) {
        if (reg.pts.length < 3) continue;
        const hull = convexHull(reg.pts);
        const isPochven = regId === 10000070;

        ctx.beginPath();
        ctx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
        ctx.closePath();

        ctx.fillStyle = isPochven ? 'rgba(255, 42, 75, 0.08)' : 'rgba(148, 163, 184, 0.03)';
        ctx.fill();
        ctx.strokeStyle = isPochven ? 'rgba(255, 42, 75, 0.55)' : 'rgba(51, 67, 92, 0.55)';
        ctx.lineWidth = isPochven ? 1.5 : 1;
        ctx.stroke();

        const cx = reg.pts.reduce((s, p) => s + p.x, 0) / reg.pts.length;
        const cy = reg.pts.reduce((s, p) => s + p.y, 0) / reg.pts.length;
        if (cx > -40 && cy > -40 && cx < w + 40 && cy < h + 40) {
          ctx.fillStyle = isPochven ? 'rgba(255, 90, 110, 0.9)' : 'rgba(148, 163, 184, 0.55)';
          ctx.font = isPochven ? 'bold 10px "Segoe UI", sans-serif' : '9px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(reg.name.toUpperCase(), cx, cy);
        }
      }
      ctx.textAlign = 'left';
    }

    // Draw Stargate Edges (color-coded in 2D Schematic: intra-constellation slate, inter-constellation red, inter-region purple)
    const sysLookup = new Map(mapData.systems.map((s) => [s.solarSystemId, s]));
    if (mapStyle === 'schematic' && selectedRegionId !== null) {
      ctx.lineWidth = 1.3;
      for (const [a, b] of mapData.edges) {
        if (!visibleIdSet.has(a) || !visibleIdSet.has(b)) continue;
        const ca = projected.coords.get(a);
        const cb = projected.coords.get(b);
        const saSys = sysLookup.get(a);
        const sbSys = sysLookup.get(b);
        if (!ca || !cb || !saSys || !sbSys) continue;
        const sa = toScreen(ca.nx, ca.ny, w, h);
        const sb = toScreen(cb.nx, cb.ny, w, h);
        const isInterRegion = saSys.regionId !== sbSys.regionId;
        const isInterConst = !isInterRegion && saSys.constellationId !== sbSys.constellationId;
        ctx.strokeStyle = isInterRegion
          ? 'rgba(168, 85, 247, 0.72)'
          : isInterConst
            ? 'rgba(239, 68, 68, 0.65)'
            : 'rgba(148, 163, 184, 0.55)';
        ctx.beginPath();
        ctx.moveTo(sa.sx, sa.sy);
        ctx.lineTo(sb.sx, sb.sy);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b] of mapData.edges) {
        if (!visibleIdSet.has(a) || !visibleIdSet.has(b)) continue;
        const ca = projected.coords.get(a);
        const cb = projected.coords.get(b);
        if (!ca || !cb) continue;
        const sa = toScreen(ca.nx, ca.ny, w, h);
        const sb = toScreen(cb.nx, cb.ny, w, h);
        ctx.moveTo(sa.sx, sa.sy);
        ctx.lineTo(sb.sx, sb.sy);
      }
      ctx.stroke();
    }

    const useBoxNodes =
      mapStyle === 'schematic' && (selectedRegionId !== null || view.zoom >= 2.8);
    const showLabels = selectedRegionId !== null || view.zoom >= 2.2;
    const nodeRadius = selectedRegionId !== null ? 4.2 : Math.min(4.5, 1.8 * view.zoom);

    for (const sys of visibleSystems) {
      const c = projected.coords.get(sys.solarSystemId);
      if (!c) continue;
      const { sx, sy } = toScreen(c.nx, c.ny, w, h);
      if (sx < -60 || sy < -40 || sx > w + 60 || sy > h + 40) continue;

      let color = secHex(sys.security);
      if (overlay === 'shipKills') color = heatHex(sys.shipKills, projected.maxHeat);
      else if (overlay === 'podKills') color = heatHex(sys.podKills, projected.maxHeat);
      else if (overlay === 'npcKills') color = heatHex(sys.npcKills, projected.maxHeat);
      else if (overlay === 'shipJumps') color = heatHex(sys.shipJumps, projected.maxHeat);
      else if (overlay === 'sov') color = sovHex(sys.sovAllianceId);

      const isSelected = selectedSystem?.solarSystemId === sys.solarSystemId;
      const isCurrent = currentSystemId === sys.solarSystemId;
      const hasIce = sys.hasIceBelt || KNOWN_ICE_SYSTEMS.has(sys.solarSystemName);
      const chatAlert = alertBySystem.get(sys.solarSystemId);
      const fleetInSys = fleetBySystem.get(sys.solarSystemId);

      if (useBoxNodes) {
        const isExt = Boolean(sys.isExternalGateway);
        const labelText = sys.solarSystemName;
        const secText = sys.security.toFixed(1);
        const subText = isExt ? sys.regionName : (sys.constellationName ?? '');
        const topWidth = labelText.length * 5.9 + secText.length * 5.5 + 22;
        const boxW = Math.max(84, Math.max(topWidth, subText.length * 5.4 + 18));
        const boxH = 27;
        const bx = sx - boxW / 2;
        const by = sy - boxH / 2;

        // Pulsating glowing background for current location
        if (isCurrent) {
          const glowAlpha = 0.28 + pulsePhase * 0.42;
          ctx.save();
          ctx.shadowColor = '#34D399';
          ctx.shadowBlur = 10 + pulsePhase * 12;
          ctx.fillStyle = `rgba(16, 185, 129, ${glowAlpha})`;
          ctx.beginPath();
          ctx.roundRect(bx - 5, by - 5, boxW + 10, boxH + 10, 14);
          ctx.fill();
          ctx.restore();
        }

        // Glowy ice-crystal border around ice belt nodes
        if (showIceBelts && hasIce && !isExt) {
          ctx.save();
          ctx.shadowColor = '#38BDF8';
          ctx.shadowBlur = 10;
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(bx - 2, by - 2, boxW + 4, boxH + 4, 12);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = isExt
          ? 'rgba(51, 65, 85, 0.9)'
          : isCurrent
            ? `rgba(6, 78, 59, ${0.85 + pulsePhase * 0.15})`
            : '#0f172a';
        ctx.strokeStyle = isSelected
          ? '#FFFFFF'
          : isCurrent
            ? '#34D399'
            : chatAlert
              ? '#F59E0B'
              : isExt
                ? '#A855F7'
                : color;
        ctx.lineWidth = isSelected || isCurrent ? 2 : 1.3;
        if (!isExt && sys.security < 0.45) ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, isExt ? 4 : 11);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Security strip on left
        ctx.fillStyle = color;
        ctx.fillRect(bx + 4, by + 5, 3, boxH - 10);

        // System Name (left) + Security Status (right)
        ctx.fillStyle = '#F1F5F9';
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.fillText(labelText, bx + 11, sy - 1);

        ctx.fillStyle = secHex(sys.security);
        ctx.font = 'bold 9px "Segoe UI", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(secText, bx + boxW - 6, sy - 1);
        ctx.textAlign = 'left';

        ctx.fillStyle = isExt ? '#C084FC' : '#94A3B8';
        ctx.font = '9px "Segoe UI", sans-serif';
        ctx.fillText(subText, bx + 11, sy + 9);
      } else {
        // Pulsating glowing background in 2.5D Cluster mode
        if (isCurrent) {
          ctx.save();
          ctx.shadowColor = '#34D399';
          ctx.shadowBlur = 10 + pulsePhase * 12;
          ctx.fillStyle = `rgba(16, 185, 129, ${0.28 + pulsePhase * 0.42})`;
          ctx.beginPath();
          ctx.arc(sx, sy, nodeRadius + 6 + pulsePhase * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Glowy ice-crystal border in 2.5D mode
        if (showIceBelts && hasIce) {
          ctx.save();
          ctx.shadowColor = '#38BDF8';
          ctx.shadowBlur = 8;
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(sx, sy, nodeRadius + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, isSelected ? nodeRadius + 2 : nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Live Chatlog Intel Alert marker
      if (chatAlert) {
        ctx.beginPath();
        ctx.arc(sx, sy, useBoxNodes ? 18 : nodeRadius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#F59E0B';
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.fillText('!', sx + (useBoxNodes ? 24 : nodeRadius + 5), sy - 4);
      }

      // Fleet Members marker
      if (fleetInSys && fleetInSys.length > 0) {
        ctx.fillStyle = '#A855F7';
        ctx.fillRect(sx + (useBoxNodes ? 18 : nodeRadius + 4), sy + 3, 22, 12);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px "Segoe UI", sans-serif';
        ctx.fillText(`F:${fleetInSys.length}`, sx + (useBoxNodes ? 20 : nodeRadius + 6), sy + 12);
      }

      if (!useBoxNodes && (showLabels || isSelected)) {
        ctx.fillStyle = '#CBD5E1';
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.fillText(sys.solarSystemName, sx + nodeRadius + 4, sy + 3);
      }
    }
  }, [
    mapData,
    visibleSystems,
    visibleIdSet,
    projected,
    view,
    overlay,
    mapStyle,
    showIceBelts,
    selectedSystem,
    selectedRegionId,
    currentSystemId,
    pulsePhase,
    alertBySystem,
    fleetBySystem,
    toScreen
  ]);

  // Keep map centered on current pilot location when GPS Follow is enabled
  useEffect(() => {
    if (!gpsFollow || !currentSystemId) return;
    const hit = mapData.systems.find((s) => s.solarSystemId === currentSystemId && !s.isExternalGateway);
    if (hit) {
      centerOnSystem(hit, Math.max(view.zoom, 1.5));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsFollow, currentSystemId, mapData.systems]);

  const findSystemAt = (clientX: number, clientY: number): MapSystemDto | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    let closest: MapSystemDto | null = null;
    let bestDist = mapStyle === 'schematic' ? 24 : 14;
    for (const sys of visibleSystems) {
      const c = projected.coords.get(sys.solarSystemId);
      if (!c) continue;
      const { sx, sy } = toScreen(c.nx, c.ny, w, h);
      const d = Math.hypot(mx - sx, my - sy);
      if (d < bestDist) {
        bestDist = d;
        closest = sys;
      }
    }
    return closest;
  };

  const selectSystemObj = (sys: MapSystemDto) => {
    setSelectedSystem(sys);
    setNoteInput(sys.note ?? '');
    setIceBeltInput(sys.hasIceBelt || KNOWN_ICE_SYSTEMS.has(sys.solarSystemName));
    setSysStations([]);
    setStationsLoading(true);
    void window.eveLens.nav
      .getSystemStations(sys.solarSystemId, activeCharacterId)
      .then((list) =>
        setSysStations(
          list.map((s) => ({
            id: s.id,
            name: s.name,
            services: s.services,
            ownerName: s.ownerName
          }))
        )
      )
      .finally(() => setStationsLoading(false));
  };

  const centerOnSystem = useCallback(
    (sys: MapSystemDto, minZoom = 2.6) => {
      const c = projected.coords.get(sys.solarSystemId);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!c || !rect) return;
      const pad = 48;
      const baseSize = Math.min(rect.width, rect.height) - pad * 2;
      const size = mapStyle === 'schematic' && selectedRegionId !== null ? baseSize * 2.8 : baseSize;
      const baseX = (rect.width - size) / 2 + c.nx * size;
      const baseY = (rect.height - size) / 2 + c.ny * size;
      const nextZoom = Math.max(view.zoom, minZoom);
      const clamped = clampViewOffsets(
        -(baseX - rect.width / 2) * nextZoom,
        -(baseY - rect.height / 2) * nextZoom,
        nextZoom,
        rect.width,
        rect.height
      );
      setView({ zoom: nextZoom, ...clamped });
    },
    [projected.coords, view.zoom]
  );

  const handleZoomToMyLocation = async () => {
    const sysId = (await refreshMyLocation()) ?? currentSystemId;
    if (!sysId) {
      setStatusMsg('Select an active pilot in the top bar to locate your ship.');
      return;
    }
    const hit = mapData.systems.find((s) => s.solarSystemId === sysId);
    if (hit) {
      selectSystemObj(hit);
      centerOnSystem(hit, 3.2);
      setStatusMsg(`Centered on ${hit.solarSystemName}`);
      return;
    }
    if (selectedRegionId !== null) {
      const allData = await window.eveLens.nav.getMapData(null);
      const sysInfo = allData.systems.find((s) => s.solarSystemId === sysId);
      if (sysInfo?.regionId) {
        pendingCenterSystemIdRef.current = sysId;
        setSelectedRegionId(sysInfo.regionId);
        setStatusMsg(`Switched region to ${sysInfo.solarSystemName} (${mapStyle === 'schematic' ? 'Flat Map' : '2.5D map'})`);
        return;
      }
    }
    setStatusMsg('Current system is outside K-space (e.g. J-space wormhole).');
  };

  useEffect(() => {
    const pendingId = pendingCenterSystemIdRef.current;
    if (!pendingId) return;
    const hit = mapData.systems.find((s) => s.solarSystemId === pendingId);
    if (hit) {
      pendingCenterSystemIdRef.current = null;
      selectSystemObj(hit);
      centerOnSystem(hit, 3.2);
    }
  }, [mapData.systems]);

  const handleSyncActivity = async () => {
    setSyncing(true);
    try {
      const res = await window.eveLens.nav.syncSystemActivity();
      await loadMap(selectedRegionId);
      setStatusMsg(`Synced ESI activity for ${res.updatedSystems.toLocaleString()} systems.`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAutopilot = async (sys: MapSystemDto, clearOthers: boolean) => {
    setContextMenu(null);
    if (activeCharacterId === null) {
      setStatusMsg('Select a single character in the top bar to set in-game autopilot.');
      return;
    }
    try {
      await window.eveLens.nav.setAutopilotWaypoint(
        activeCharacterId,
        sys.solarSystemId,
        clearOthers,
        false
      );
      setStatusMsg(`${clearOthers ? 'Destination set' : 'Waypoint added'}: ${sys.solarSystemName}`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Autopilot ESI call failed');
    }
  };

  const handleSaveNote = async () => {
    if (!selectedSystem) return;
    await window.eveLens.nav.saveSystemNote({
      solarSystemId: selectedSystem.solarSystemId,
      hasIceBelt: iceBeltInput,
      note: noteInput
    });
    await loadMap(selectedRegionId);
    setStatusMsg(`Saved notes for ${selectedSystem.solarSystemName}.`);
  };

  const handleSearchJump = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const hit = visibleSystems.find((s) => s.solarSystemName.toLowerCase().includes(q));
    if (hit) {
      selectSystemObj(hit);
      centerOnSystem(hit, 2.8);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={selectedRegionId ?? 'all'}
            onChange={(e) =>
              setSelectedRegionId(e.target.value === 'all' ? null : Number(e.target.value))
            }
            className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
          >
            <option value="all">All New Eden (Cluster)</option>
            {regions.map((r) => (
              <option key={r.regionId} value={r.regionId}>
                {r.regionName}
              </option>
            ))}
          </select>

          {/* 2.5D Map vs Flat Map toggle */}
          <div className="flex items-center border border-eve-border bg-eve-bg">
            <button
              type="button"
              onClick={() => setMapStyle('cluster')}
              className={`px-2 py-1 text-[11px] ${
                mapStyle === 'cluster'
                  ? 'bg-eve-accent-muted text-eve-accent font-semibold'
                  : 'text-eve-muted hover:text-eve-text'
              }`}
            >
              2.5D Map
            </button>
            <button
              type="button"
              onClick={() => {
                setMapStyle('schematic');
                if (selectedRegionId === null) {
                  const mySys = currentSystemId
                    ? mapData.systems.find((s) => s.solarSystemId === currentSystemId)
                    : null;
                  setSelectedRegionId(mySys?.regionId ?? 10000043); // Pilot region or Domain
                }
              }}
              className={`px-2 py-1 text-[11px] ${
                mapStyle === 'schematic'
                  ? 'bg-eve-accent-muted text-eve-accent font-semibold'
                  : 'text-eve-muted hover:text-eve-text'
              }`}
            >
              Flat Map
            </button>
          </div>

          <div className="flex items-center border border-eve-border bg-eve-bg">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchJump()}
              placeholder="Find system..."
              className="w-32 bg-transparent px-2 py-1 text-xs text-eve-text focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSearchJump}
              className="px-2 text-eve-muted hover:text-eve-accent"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Security Band Filter */}
          <div className="flex items-center gap-0.5 border border-eve-border bg-eve-bg p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setShowHighsec((v) => !v)}
              className={`px-1.5 py-0.5 font-semibold ${
                showHighsec ? 'bg-emerald-500/20 text-emerald-300' : 'text-eve-muted opacity-50'
              }`}
            >
              High
            </button>
            <button
              type="button"
              onClick={() => setShowLowsec((v) => !v)}
              className={`px-1.5 py-0.5 font-semibold ${
                showLowsec ? 'bg-amber-500/20 text-amber-300' : 'text-eve-muted opacity-50'
              }`}
            >
              Low
            </button>
            <button
              type="button"
              onClick={() => setShowNullsec((v) => !v)}
              className={`px-1.5 py-0.5 font-semibold ${
                showNullsec ? 'bg-rose-500/20 text-rose-300' : 'text-eve-muted opacity-50'
              }`}
            >
              Null
            </button>
          </div>

          {/* Overlays */}
          <div className="flex items-center gap-1">
            {(
              [
                ['security', 'Sec'],
                ['shipKills', 'Ship Kills'],
                ['podKills', 'Pods'],
                ['npcKills', 'NPCs'],
                ['shipJumps', 'Jumps'],
                ['sov', 'Sov']
              ] as Array<[OverlayMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOverlay(mode)}
                className={`border px-2 py-1 text-[11px] ${
                  overlay === mode
                    ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                    : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowIceBelts((v) => !v)}
            className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] ${
              showIceBelts
                ? 'border-sky-400/60 bg-sky-500/15 text-sky-300'
                : 'border-eve-border bg-eve-bg text-eve-muted'
            }`}
          >
            <Snowflake className="h-3 w-3" />
            Ice Belts
          </button>

          <button
            type="button"
            onClick={() => setShowChatlogAlerts((v) => !v)}
            className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] ${
              showChatlogAlerts
                ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                : 'border-eve-border bg-eve-bg text-eve-muted'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            Chatlog Alerts
          </button>

          <button
            type="button"
            onClick={() => setShowFleetMembers((v) => !v)}
            className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] ${
              showFleetMembers
                ? 'border-purple-400/60 bg-purple-500/15 text-purple-300'
                : 'border-eve-border bg-eve-bg text-eve-muted'
            }`}
          >
            <Users className="h-3 w-3" />
            Fleet Members
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setGpsFollow((v) => !v)}
            className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-medium ${
              gpsFollow
                ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
            }`}
            title="Live GPS Follow: keep map centered on your active pilot as you travel"
          >
            <Navigation className="h-3 w-3" />
            GPS {gpsFollow ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => void handleZoomToMyLocation()}
            className="inline-flex items-center gap-1 border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25"
            title="Zoom to active pilot's current system"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            My Location
          </button>
          <button
            type="button"
            onClick={() => setView({ offsetX: 0, offsetY: 0, zoom: 1 })}
            className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-[11px] text-eve-muted hover:text-eve-text"
            title="Reset zoom & pan"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSyncActivity()}
            className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-xs font-medium text-eve-accent hover:bg-eve-accent/25 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync ESI
          </button>
        </div>
      </div>

      {/* Main Map Canvas + Right System Inspector */}
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden bg-eve-bg"
          onMouseDown={(e) => {
            setContextMenu(null);
            if (e.button === 0) {
              dragRef.current = { active: true, moved: false, lastX: e.clientX, lastY: e.clientY };
            }
          }}
          onMouseMove={(e) => {
            if (!dragRef.current.active) {
              const hit = findSystemAt(e.clientX, e.clientY);
              const rect = containerRef.current?.getBoundingClientRect();
              if (hit && rect) {
                setHoveredSystem({
                  sys: hit,
                  x: e.clientX - rect.left + 14,
                  y: e.clientY - rect.top + 14
                });
              } else {
                setHoveredSystem(null);
              }
              return;
            }
            setHoveredSystem(null);
            const dx = e.clientX - dragRef.current.lastX;
            const dy = e.clientY - dragRef.current.lastY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
            dragRef.current.lastX = e.clientX;
            dragRef.current.lastY = e.clientY;
            const rect = containerRef.current?.getBoundingClientRect();
            setView((v) => {
              if (!rect) return { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy };
              const clamped = clampViewOffsets(
                v.offsetX + dx,
                v.offsetY + dy,
                v.zoom,
                rect.width,
                rect.height
              );
              return { ...v, ...clamped };
            });
          }}
          onMouseUp={(e) => {
            const wasDrag = dragRef.current.moved;
            dragRef.current.active = false;
            if (e.button === 0 && !wasDrag) {
              const hit = findSystemAt(e.clientX, e.clientY);
              if (hit) selectSystemObj(hit);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const hit = findSystemAt(e.clientX, e.clientY);
            if (hit) {
              selectSystemObj(hit);
              const rect = containerRef.current?.getBoundingClientRect();
              setContextMenu({
                x: e.clientX - (rect?.left ?? 0),
                y: e.clientY - (rect?.top ?? 0),
                system: hit
              });
            }
          }}
          onMouseLeave={() => {
            dragRef.current.active = false;
            setHoveredSystem(null);
          }}
          onWheel={(e) => {
            e.preventDefault();
            const rect = containerRef.current?.getBoundingClientRect();
            const factor = e.deltaY < 0 ? 1.18 : 0.85;
            setView((v) => {
              const nextZoom = Math.min(18, Math.max(0.65, v.zoom * factor));
              if (!rect) return { ...v, zoom: nextZoom };
              const mx = e.clientX - rect.left;
              const my = e.clientY - rect.top;
              const ratio = nextZoom / v.zoom;
              const rawOx = mx - rect.width / 2 - (mx - rect.width / 2 - v.offsetX) * ratio;
              const rawOy = my - rect.height / 2 - (my - rect.height / 2 - v.offsetY) * ratio;
              const clamped = clampViewOffsets(rawOx, rawOy, nextZoom, rect.width, rect.height);
              return { zoom: nextZoom, ...clamped };
            });
          }}
        >
          <canvas ref={canvasRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

          {mapData.systems.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-eve-muted">
              Import the local SDE first to render New Eden stargates and solar systems.
            </div>
          )}

          {hoveredSystem && !contextMenu && (
            <div
              className="pointer-events-none absolute z-30 w-60 border border-slate-700 bg-slate-950 p-2.5 text-[11px] shadow-2xl"
              style={{
                left: Math.min(hoveredSystem.x, (containerRef.current?.clientWidth ?? 600) - 250),
                top: Math.min(hoveredSystem.y, (containerRef.current?.clientHeight ?? 400) - 160)
              }}
            >
              <div className="flex items-center justify-between border-b border-eve-border pb-1">
                <span className="font-bold text-eve-text">{hoveredSystem.sys.solarSystemName}</span>
                <span className={`num-mono font-bold ${getSecurityColorClass(hoveredSystem.sys.security)}`}>
                  {hoveredSystem.sys.security.toFixed(2)}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-eve-muted">
                {hoveredSystem.sys.regionName}
                {hoveredSystem.sys.constellationName ? ` • ${hoveredSystem.sys.constellationName}` : ''}
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px]">
                <div>Ship Kills: <span className="num-mono text-eve-text">{hoveredSystem.sys.shipKills}</span></div>
                <div>Pod Kills: <span className="num-mono text-eve-text">{hoveredSystem.sys.podKills}</span></div>
                <div>NPC Kills: <span className="num-mono text-eve-text">{hoveredSystem.sys.npcKills}</span></div>
                <div>Jumps (1h): <span className="num-mono text-eve-text">{hoveredSystem.sys.shipJumps}</span></div>
              </div>
              {(hoveredSystem.sys.hasIceBelt || KNOWN_ICE_SYSTEMS.has(hoveredSystem.sys.solarSystemName)) && (
                <div className="mt-1 text-[10px] text-sky-300">❄ Known Ice Belt System</div>
              )}
              {alertBySystem.get(hoveredSystem.sys.solarSystemId) && (
                <div className="mt-1 truncate text-[10px] text-amber-300">
                  ! {alertBySystem.get(hoveredSystem.sys.solarSystemId)!.message}
                </div>
              )}
              {(fleetBySystem.get(hoveredSystem.sys.solarSystemId)?.length ?? 0) > 0 && (
                <div className="mt-1 text-[10px] text-purple-300">
                  Fleet: {fleetBySystem.get(hoveredSystem.sys.solarSystemId)!.map((m) => m.characterName).join(', ')}
                </div>
              )}
              {hoveredSystem.sys.note && (
                <div className="mt-1 truncate text-[10px] italic text-eve-muted">
                  Note: {hoveredSystem.sys.note}
                </div>
              )}
            </div>
          )}

          {mapStyle === 'schematic' && selectedRegionId !== null && (
            <div className="pointer-events-none absolute bottom-3 right-3 border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] text-eve-muted">
              <div className="mb-1 font-semibold uppercase tracking-wider text-eve-text">Legend</div>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-slate-400" /> Same Constellation
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-rose-500" /> Inter-Constellation
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-purple-500" /> Region Gate
                </span>
              </div>
            </div>
          )}

          {statusMsg && (
            <div className="absolute bottom-3 left-3 border border-eve-border bg-eve-panel/90 px-3 py-1.5 text-xs text-eve-accent">
              {statusMsg}
            </div>
          )}

          {contextMenu && (
            <div
              className="photon-panel absolute z-30 w-48 py-1 shadow-2xl"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div className="border-b border-eve-border px-3 py-1.5 text-[11px] font-semibold text-eve-text">
                {contextMenu.system.solarSystemName}
              </div>
              <button
                type="button"
                onClick={() => void handleAutopilot(contextMenu.system, true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-text hover:bg-eve-accent-muted hover:text-eve-accent"
              >
                <Navigation className="h-3.5 w-3.5" />
                Set Destination
              </button>
              <button
                type="button"
                onClick={() => void handleAutopilot(contextMenu.system, false)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-text hover:bg-eve-accent-muted hover:text-eve-accent"
              >
                <MapPin className="h-3.5 w-3.5" />
                Add Waypoint
              </button>
            </div>
          )}
        </div>

        {/* Right Inspector */}
        {selectedSystem && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-eve-border bg-eve-panel p-3 text-xs">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <div>
                <div className="text-sm font-bold text-eve-text">
                  {selectedSystem.solarSystemName}
                </div>
                <div className="text-[11px] text-eve-muted">{selectedSystem.regionName}</div>
              </div>
              <span className={`num-mono text-sm font-bold ${getSecurityColorClass(selectedSystem.security)}`}>
                {selectedSystem.security.toFixed(2)}
              </span>
            </div>

            {alertBySystem.get(selectedSystem.solarSystemId) && (
              <div className="mt-2 border border-amber-500/50 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                <div className="font-semibold text-amber-300">Chatlog Intel Alert</div>
                <div className="mt-0.5 break-words">
                  {alertBySystem.get(selectedSystem.solarSystemId)!.message}
                </div>
              </div>
            )}

            {(fleetBySystem.get(selectedSystem.solarSystemId)?.length ?? 0) > 0 && (
              <div className="mt-2 border border-purple-500/50 bg-purple-500/10 p-2 text-[11px]">
                <div className="font-semibold text-purple-300">
                  Fleet Members ({fleetBySystem.get(selectedSystem.solarSystemId)!.length})
                </div>
                <ul className="mt-1 space-y-0.5 text-eve-text">
                  {fleetBySystem.get(selectedSystem.solarSystemId)!.map((m) => (
                    <li key={m.characterId} className="truncate">
                      {m.characterName} — <span className="text-eve-muted">{m.shipName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="my-3 grid grid-cols-2 gap-2">
              <Stat label="Ship Kills (1h)" value={selectedSystem.shipKills} />
              <Stat label="Pod Kills (1h)" value={selectedSystem.podKills} />
              <Stat label="NPC Kills (1h)" value={selectedSystem.npcKills} />
              <Stat label="Jumps (1h)" value={selectedSystem.shipJumps} />
            </div>

            <div className="flex gap-2 border-b border-eve-border pb-3">
              <button
                type="button"
                onClick={() => void handleAutopilot(selectedSystem, true)}
                className="flex-1 border border-eve-accent/60 bg-eve-accent-muted py-1.5 text-[11px] font-semibold text-eve-accent hover:bg-eve-accent/25"
              >
                Set Dest
              </button>
              <button
                type="button"
                onClick={() => void handleAutopilot(selectedSystem, false)}
                className="flex-1 border border-eve-border bg-eve-bg py-1.5 text-[11px] text-eve-text hover:border-eve-accent"
              >
                + Waypoint
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              <textarea
                rows={4}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="System Notes"
                className="w-full resize-none border border-eve-border bg-eve-bg p-2 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleSaveNote()}
                className="inline-flex w-full items-center justify-center gap-1.5 border border-eve-border-strong bg-eve-elevated py-1.5 text-xs font-medium text-eve-text hover:border-eve-accent"
              >
                <Crosshair className="h-3.5 w-3.5 text-eve-accent" />
                Save System Note
              </button>
            </div>

            {/* Stations & Services in selected system */}
            <div className="mt-3 border-t border-eve-border pt-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-eve-accent">
                Stations &amp; Services ({sysStations.length})
              </div>
              {stationsLoading ? (
                <div className="text-[11px] text-eve-muted">Loading stations...</div>
              ) : sysStations.length === 0 ? (
                <div className="text-[11px] text-eve-muted">No NPC stations or accessible structures.</div>
              ) : (
                <div className="space-y-1.5">
                  {sysStations.map((st) => {
                    const svcLabels: Record<string, string> = {
                      cloning: 'clone bay',
                      'jump-clone-facility': 'jump clone',
                      'reprocessing-plant': 'reprocessing',
                      refinery: 'refinery',
                      labratory: 'research lab',
                      factory: 'factory',
                      'loyalty-point-store': 'loyalty point store',
                      market: 'market'
                    };
                    return (
                      <div key={st.id} className="border border-eve-border bg-eve-bg/60 p-1.5 text-[10px]">
                        <div className="font-semibold text-eve-text">{st.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(Array.isArray(st.services) ? st.services : [])
                            .filter((sv) => svcLabels[sv])
                            .map((sv) => (
                              <span
                                key={sv}
                                title={
                                  sv === 'loyalty-point-store'
                                    ? `NPC LP Store: ${st.ownerName ?? st.name.split(' - ').pop() ?? 'NPC Corp'}`
                                    : undefined
                                }
                                className="border border-eve-border bg-eve-panel px-1 py-0.2 text-[9px] text-sky-300"
                              >
                                {svcLabels[sv]}
                              </span>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-eve-border bg-eve-bg/60 p-2">
      <div className="text-[10px] text-eve-muted">{label}</div>
      <div className="num-mono mt-0.5 text-sm font-semibold text-eve-text">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
