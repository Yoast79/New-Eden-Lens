import type {
  FleetMemberLocationDto,
  JumpGateRow,
  MapDataDto,
  MapSystemDto,
  RouteFindRequest,
  RouteJumpNode,
  RouteResultDto,
  RouteSecurityMode,
  SavedRouteRow,
  StationServiceInfoDto
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { EsiClient } from './esi-client';
import npcStationsJson from '../data/npc-stations.json';

interface StaticNpcStation {
  id: number;
  name: string;
  solarSystemId: number;
  regionId: number;
  ownerName?: string;
  services: string[];
}

const STATIC_NPC_STATIONS = npcStationsJson as StaticNpcStation[];

interface EsiSystemKills {
  system_id: number;
  ship_kills: number;
  pod_kills: number;
  npc_kills: number;
}

interface EsiSystemJumps {
  system_id: number;
  ship_jumps: number;
}

interface EsiSovMap {
  system_id: number;
  alliance_id?: number;
}

export class NavigationService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly esiClient: EsiClient
  ) {}

  listRegions(): Array<{ regionId: number; regionName: string }> {
    return this.db.all<{ regionId: number; regionName: string }>(
      `SELECT region_id AS regionId, region_name AS regionName
       FROM sde_regions
       WHERE region_id < 11000000
       ORDER BY region_name ASC`
    );
  }

  getMapData(regionId: number | null): MapDataDto {
    type SysRow = {
      solarSystemId: number;
      solarSystemName: string;
      regionId: number;
      regionName: string | null;
      constellationId: number;
      constellationName: string | null;
      security: number;
      x: number;
      y: number;
      z: number;
      shipKills: number | null;
      podKills: number | null;
      npcKills: number | null;
      shipJumps: number | null;
      sovAllianceId: number | null;
      hasIceBelt: number | null;
      timerLabel: string | null;
      timerExpiresAt: number | null;
      note: string | null;
    };
    const baseSelect = `SELECT s.solar_system_id AS solarSystemId,
              s.solar_system_name AS solarSystemName,
              s.region_id AS regionId,
              r.region_name AS regionName,
              s.constellation_id AS constellationId,
              c.constellation_name AS constellationName,
              s.security AS security,
              s.x AS x, s.y AS y, s.z AS z,
              a.ship_kills AS shipKills,
              a.pod_kills AS podKills,
              a.npc_kills AS npcKills,
              a.ship_jumps AS shipJumps,
              a.sov_alliance_id AS sovAllianceId,
              n.has_ice_belt AS hasIceBelt,
              n.timer_label AS timerLabel,
              n.timer_expires_at AS timerExpiresAt,
              n.note AS note
       FROM sde_solar_systems s
       LEFT JOIN sde_regions r ON r.region_id = s.region_id
       LEFT JOIN sde_constellations c ON c.constellation_id = s.constellation_id
       LEFT JOIN system_activity_cache a ON a.solar_system_id = s.solar_system_id
       LEFT JOIN system_notes n ON n.solar_system_id = s.solar_system_id`;

    const systems = this.db.all<SysRow>(
      `${baseSelect} WHERE ${regionId !== null ? 's.region_id = ?' : 's.region_id < 11000000'}`,
      regionId !== null ? [regionId] : undefined
    );

    const sysSet = new Set(systems.map((s) => s.solarSystemId));
    const edgeRows = this.db.all<{ fromId: number; toId: number }>(
      'SELECT from_solar_system_id AS fromId, to_solar_system_id AS toId FROM sde_stargates'
    );

    // When viewing a single region, include 1-hop out-of-region gateway systems
    const externalIds = new Set<number>();
    if (regionId !== null) {
      for (const e of edgeRows) {
        if (sysSet.has(e.fromId) && !sysSet.has(e.toId)) externalIds.add(e.toId);
        else if (sysSet.has(e.toId) && !sysSet.has(e.fromId)) externalIds.add(e.fromId);
      }
    }

    const externalSystems: SysRow[] = [];
    if (externalIds.size > 0) {
      const extArr = Array.from(externalIds);
      const ph = extArr.map(() => '?').join(',');
      const rows = this.db.all<SysRow>(`${baseSelect} WHERE s.solar_system_id IN (${ph})`, extArr);
      externalSystems.push(...rows);
      for (const r of rows) sysSet.add(r.solarSystemId);
    }

    const seen = new Set<string>();
    const edges: Array<[number, number]> = [];
    for (const e of edgeRows) {
      if (!sysSet.has(e.fromId) || !sysSet.has(e.toId)) continue;
      if (externalIds.has(e.fromId) && externalIds.has(e.toId)) continue;
      const key = e.fromId < e.toId ? `${e.fromId}:${e.toId}` : `${e.toId}:${e.fromId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([e.fromId, e.toId]);
    }

    const mapRow = (s: SysRow, isExternalGateway: boolean): MapSystemDto => ({
      solarSystemId: s.solarSystemId,
      solarSystemName: s.solarSystemName,
      regionId: s.regionId,
      regionName: s.regionName ?? `Region ${s.regionId}`,
      constellationId: s.constellationId,
      constellationName: s.constellationName ?? undefined,
      isExternalGateway,
      security: s.security,
      x: s.x,
      y: s.y,
      z: s.z,
      shipKills: s.shipKills ?? 0,
      podKills: s.podKills ?? 0,
      npcKills: s.npcKills ?? 0,
      shipJumps: s.shipJumps ?? 0,
      sovAllianceId: s.sovAllianceId ?? null,
      hasIceBelt: s.hasIceBelt === 1,
      timerLabel: s.timerLabel ?? null,
      timerExpiresAt: s.timerExpiresAt ?? null,
      note: s.note ?? null
    });

    const mappedSystems: MapSystemDto[] = [
      ...systems.map((s) => mapRow(s, false)),
      ...externalSystems.map((s) => mapRow(s, true))
    ];

    // Arrange Pochven (regionId 10000070) along its actual 27-system gate ring so no lines cross
    const pochvenRaw = mappedSystems.filter((s) => s.regionId === 10000070);
    if (pochvenRaw.length > 0) {
      const pochvenById = new Map(pochvenRaw.map((s) => [s.solarSystemId, s]));
      const pAdj = new Map<number, number[]>();
      for (const s of pochvenRaw) pAdj.set(s.solarSystemId, []);
      for (const [a, b] of edges) {
        if (pochvenById.has(a) && pochvenById.has(b)) {
          pAdj.get(a)!.push(b);
          pAdj.get(b)!.push(a);
        }
      }

      // A Home corner system has degree 2 and its two neighbors are connected by the corner shortcut
      const startNode =
        pochvenRaw.find((s) => {
          const nb = pAdj.get(s.solarSystemId) ?? [];
          if (nb.length !== 2) return false;
          return pAdj.get(nb[0])?.includes(nb[1]) ?? false;
        }) ?? pochvenRaw[0];

      const ordered: MapSystemDto[] = [];
      const visited = new Set<number>();
      let curr: number | undefined = startNode.solarSystemId;
      while (curr !== undefined && !visited.has(curr)) {
        visited.add(curr);
        const sysObj = pochvenById.get(curr);
        if (sysObj) ordered.push(sysObj);

        const neighbors: number[] = (pAdj.get(curr) ?? []).filter((n) => !visited.has(n));
        if (neighbors.length === 0) break;
        // Prefer degree-2 corner/home nodes so we never skip a corner via its shortcut edge
        neighbors.sort((a, b) => (pAdj.get(a)?.length ?? 9) - (pAdj.get(b)?.length ?? 9));
        curr = neighbors[0];
      }
      for (const s of pochvenRaw) {
        if (!visited.has(s.solarSystemId)) ordered.push(s);
      }

      let cx = 0;
      let cz = 0;
      let triRadius = 1e16;
      const kSpace = mappedSystems.filter((s) => s.regionId !== 10000070);
      if (kSpace.length > 0) {
        let maxX = -Infinity;
        let minZ = Infinity;
        let minX = Infinity;
        let maxZ = -Infinity;
        for (const ks of kSpace) {
          if (ks.x > maxX) maxX = ks.x;
          if (ks.x < minX) minX = ks.x;
          if (ks.z > maxZ) maxZ = ks.z;
          if (ks.z < minZ) minZ = ks.z;
        }
        const span = Math.max(maxX - minX, maxZ - minZ, 1e16);
        triRadius = span * 0.11;
        cx = maxX - span * 0.14;
        cz = maxZ - span * 0.14;
      }

      const vertices = [
        { x: cx, z: cz + triRadius },
        { x: cx + triRadius * 0.866, z: cz - triRadius * 0.5 },
        { x: cx - triRadius * 0.866, z: cz - triRadius * 0.5 }
      ];

      const n = ordered.length;
      for (let i = 0; i < n; i++) {
        const tTotal = (i / n) * 3;
        const side = Math.floor(tTotal) % 3;
        const frac = tTotal - Math.floor(tTotal);
        const vA = vertices[side];
        const vB = vertices[(side + 1) % 3];
        ordered[i].x = vA.x + (vB.x - vA.x) * frac;
        ordered[i].z = vA.z + (vB.z - vA.z) * frac;
      }
    }

    return { systems: mappedSystems, edges };
  }

  async syncSystemActivity(): Promise<{ updatedSystems: number; syncedAt: number }> {
    const [kills, jumps, sov] = await Promise.all([
      this.esiClient.request<EsiSystemKills[]>('/universe/system_kills').catch(() => [] as EsiSystemKills[]),
      this.esiClient.request<EsiSystemJumps[]>('/universe/system_jumps').catch(() => [] as EsiSystemJumps[]),
      this.esiClient.request<EsiSovMap[]>('/sovereignty/map').catch(() => [] as EsiSovMap[])
    ]);

    const merged = new Map<
      number,
      { shipKills: number; podKills: number; npcKills: number; shipJumps: number; sovAllianceId: number | null }
    >();

    const ensure = (id: number) => {
      let row = merged.get(id);
      if (!row) {
        row = { shipKills: 0, podKills: 0, npcKills: 0, shipJumps: 0, sovAllianceId: null };
        merged.set(id, row);
      }
      return row;
    };

    for (const k of kills) {
      const r = ensure(k.system_id);
      r.shipKills = k.ship_kills;
      r.podKills = k.pod_kills;
      r.npcKills = k.npc_kills;
    }
    for (const j of jumps) {
      ensure(j.system_id).shipJumps = j.ship_jumps;
    }
    for (const s of sov) {
      if (s.alliance_id) {
        ensure(s.system_id).sovAllianceId = s.alliance_id;
      }
    }

    const now = Date.now();
    this.db.transaction((raw) => {
      raw.run('DELETE FROM system_activity_cache');
      const stmt = raw.prepare(
        `INSERT INTO system_activity_cache (
           solar_system_id, ship_kills, pod_kills, npc_kills, ship_jumps, sov_alliance_id, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      try {
        for (const [sysId, val] of merged.entries()) {
          stmt.run([
            sysId,
            val.shipKills,
            val.podKills,
            val.npcKills,
            val.shipJumps,
            val.sovAllianceId,
            now
          ]);
        }
      } finally {
        stmt.free();
      }
    });

    return { updatedSystems: merged.size, syncedAt: now };
  }

  saveSystemNote(input: {
    solarSystemId: number;
    hasIceBelt: boolean;
    timerLabel?: string | null;
    timerExpiresAt?: number | null;
    note?: string | null;
  }): void {
    this.db.run(
      `INSERT INTO system_notes (solar_system_id, has_ice_belt, timer_label, timer_expires_at, note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(solar_system_id) DO UPDATE SET
         has_ice_belt = excluded.has_ice_belt,
         timer_label = excluded.timer_label,
         timer_expires_at = excluded.timer_expires_at,
         note = excluded.note`,
      [
        input.solarSystemId,
        input.hasIceBelt ? 1 : 0,
        input.timerLabel ?? null,
        input.timerExpiresAt ?? null,
        input.note ?? null
      ]
    );
  }

  async setAutopilotWaypoint(
    characterId: number,
    destinationId: number,
    clearOtherWaypoints: boolean,
    addToBeginning = false
  ): Promise<void> {
    await this.esiClient.request<void>('/ui/autopilot/waypoint', {
      characterId,
      method: 'POST',
      query: {
        destination_id: destinationId,
        clear_other_waypoints: clearOtherWaypoints,
        add_to_beginning: addToBeginning
      }
    });
  }

  async findRoute(req: RouteFindRequest): Promise<RouteResultDto> {
    const systems = this.db.all<{
      solarSystemId: number;
      solarSystemName: string;
      regionId: number;
      regionName: string | null;
      security: number;
      shipKills: number | null;
      podKills: number | null;
      npcKills: number | null;
    }>(
      `SELECT s.solar_system_id AS solarSystemId, s.solar_system_name AS solarSystemName,
              s.region_id AS regionId, r.region_name AS regionName, s.security AS security,
              a.ship_kills AS shipKills, a.pod_kills AS podKills, a.npc_kills AS npcKills
       FROM sde_solar_systems s
       LEFT JOIN sde_regions r ON r.region_id = s.region_id
       LEFT JOIN system_activity_cache a ON a.solar_system_id = s.solar_system_id`
    );

    const sysMap = new Map(systems.map((s) => [s.solarSystemId, s]));
    const avoidSys = new Set(req.avoidSystemIds ?? []);
    const avoidReg = new Set(req.avoidRegionIds ?? []);

    const adj = new Map<number, Array<{ to: number; viaWh?: string; viaJumpGate?: boolean }>>();
    const addEdge = (a: number, b: number, viaWh?: string, viaJumpGate = false) => {
      let list = adj.get(a);
      if (!list) {
        list = [];
        adj.set(a, list);
      }
      list.push({ to: b, viaWh, viaJumpGate });
    };

    const stargates = this.db.all<{ fromId: number; toId: number }>(
      'SELECT from_solar_system_id AS fromId, to_solar_system_id AS toId FROM sde_stargates'
    );
    for (const sg of stargates) {
      addEdge(sg.fromId, sg.toId);
    }

    if (req.useJumpGates) {
      const gates = this.db.all<{ from_system_id: number; to_system_id: number; bidirectional: number }>(
        'SELECT from_system_id, to_system_id, bidirectional FROM jump_gates'
      );
      for (const g of gates) {
        addEdge(g.from_system_id, g.to_system_id, undefined, true);
        if (g.bidirectional === 1) {
          addEdge(g.to_system_id, g.from_system_id, undefined, true);
        }
      }
    }

    if (req.useTheraTurnur) {
      const whLinks = await fetchEveScoutShortcuts();
      for (const link of whLinks) {
        addEdge(link.fromId, link.toId, link.label);
        addEdge(link.toId, link.fromId, link.label);
      }
    }

    const solveLeg = (startId: number, endId: number): RouteJumpNode[] | null => {
      if (startId === endId) {
        const s = sysMap.get(startId);
        if (!s) return [];
        const shipKills = s.shipKills ?? 0;
        const podKills = s.podKills ?? 0;
        return [
          {
            solarSystemId: s.solarSystemId,
            solarSystemName: s.solarSystemName,
            regionId: s.regionId,
            regionName: s.regionName ?? `Region ${s.regionId}`,
            security: s.security,
            shipKills,
            podKills,
            npcKills: s.npcKills ?? 0,
            gankWarning: computeGankWarning(s.security, shipKills, podKills)
          }
        ];
      }

      const dist = new Map<number, number>();
      const prev = new Map<number, { parent: number; viaWh?: string; viaJumpGate?: boolean }>();
      const visited = new Set<number>();
      const pq: Array<{ id: number; cost: number }> = [{ id: startId, cost: 0 }];
      dist.set(startId, 0);

      while (pq.length > 0) {
        let bestIdx = 0;
        for (let i = 1; i < pq.length; i++) {
          if (pq[i].cost < pq[bestIdx].cost) bestIdx = i;
        }
        const current = pq.splice(bestIdx, 1)[0];
        if (visited.has(current.id)) continue;
        visited.add(current.id);
        if (current.id === endId) break;

        for (const edge of adj.get(current.id) ?? []) {
          if (visited.has(edge.to)) continue;
          const nextSys = sysMap.get(edge.to);
          if (!nextSys) continue;

          if (edge.to !== endId && edge.to !== startId) {
            if (avoidSys.has(edge.to) || avoidReg.has(nextSys.regionId)) continue;
            if (req.securityMode === 'highsec_only' && nextSys.security < 0.45) continue;
          }

          let stepCost = edge.viaJumpGate ? 0.7 : 1;
          if (req.securityMode === 'avoid_low_null' && nextSys.security < 0.45) {
            stepCost = 50 + (nextSys.shipKills ?? 0) * 5;
          } else if (req.securityMode === 'most_dangerous') {
            const pvpActivity = (nextSys.shipKills ?? 0) + (nextSys.podKills ?? 0);
            stepCost = Math.max(0.1, 10 - Math.min(9.5, pvpActivity * 0.5));
          }

          const nextCost = current.cost + stepCost;
          const known = dist.get(edge.to) ?? Number.POSITIVE_INFINITY;
          if (nextCost < known) {
            dist.set(edge.to, nextCost);
            prev.set(edge.to, { parent: current.id, viaWh: edge.viaWh, viaJumpGate: edge.viaJumpGate });
            pq.push({ id: edge.to, cost: nextCost });
          }
        }
      }

      if (!prev.has(endId)) return null;

      const legJumps: RouteJumpNode[] = [];
      let cursor: number | undefined = endId;
      while (cursor !== undefined) {
        const s = sysMap.get(cursor);
        const step = prev.get(cursor);
        if (s) {
          const shipKills = s.shipKills ?? 0;
          const podKills = s.podKills ?? 0;
          legJumps.unshift({
            solarSystemId: s.solarSystemId,
            solarSystemName: s.solarSystemName,
            regionId: s.regionId,
            regionName: s.regionName ?? `Region ${s.regionId}`,
            security: s.security,
            shipKills,
            podKills,
            npcKills: s.npcKills ?? 0,
            gankWarning: computeGankWarning(s.security, shipKills, podKills),
            viaWormhole: Boolean(step?.viaWh),
            wormholeSource: step?.viaWh,
            viaJumpGate: Boolean(step?.viaJumpGate)
          });
        }
        cursor = step?.parent;
      }
      return legJumps;
    };

    const waypointIds =
      req.waypointSystemIds && req.waypointSystemIds.length >= 2
        ? req.waypointSystemIds
        : [req.originSystemId, req.destinationSystemId];

    const jumps: RouteJumpNode[] = [];
    for (let i = 0; i < waypointIds.length - 1; i++) {
      const leg = solveLeg(waypointIds[i], waypointIds[i + 1]);
      if (!leg || leg.length === 0) {
        return { jumps: [], majorWaypoints: [], totalJumps: 0, shareCode: '' };
      }
      if (i === 0) {
        leg[0].isWaypoint = true;
        leg[0].waypointIndex = 0;
        leg[leg.length - 1].isWaypoint = true;
        leg[leg.length - 1].waypointIndex = 1;
        jumps.push(...leg);
      } else {
        leg[leg.length - 1].isWaypoint = true;
        leg[leg.length - 1].waypointIndex = i + 1;
        jumps.push(...leg.slice(1));
      }
    }

    const explicitWaypoints = jumps.filter((j) => j.isWaypoint);
    const majorWaypoints = explicitWaypoints.length >= 2 ? explicitWaypoints : extractMajorWaypoints(jumps);
    const sharePayload = {
      v: 2,
      mode: req.securityMode,
      useTheraTurnur: Boolean(req.useTheraTurnur),
      useJumpGates: Boolean(req.useJumpGates),
      waypointIds: majorWaypoints.map((w) => w.solarSystemId),
      ids: jumps.map((j) => j.solarSystemId)
    };
    const shareCode =
      'NEL-R1:' +
      Buffer.from(JSON.stringify(sharePayload), 'utf8').toString('base64url');

    return {
      jumps,
      majorWaypoints,
      totalJumps: Math.max(0, jumps.length - 1),
      shareCode,
      meta: {
        securityMode: req.securityMode,
        useTheraTurnur: Boolean(req.useTheraTurnur),
        useJumpGates: Boolean(req.useJumpGates)
      }
    };
  }

  resolveRouteShareCode(codeOrNames: {
    shareCode?: string;
    systemNames?: string[];
    entries?: Array<{ name: string; isWaypoint: boolean; waypointIndex?: number }>;
  }): RouteResultDto {
    const resolvedEntries: Array<{ id: number; isWaypoint: boolean; waypointIndex?: number }> = [];
    let decodedMeta: RouteResultDto['meta'] | undefined;

    if (codeOrNames.shareCode?.startsWith('NEL-R1:')) {
      const b64 = codeOrNames.shareCode.slice('NEL-R1:'.length).trim();
      const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as {
        ids?: number[];
        waypointIds?: number[];
        mode?: RouteSecurityMode;
        useTheraTurnur?: boolean;
        useJumpGates?: boolean;
        pushEveryJump?: boolean;
      };
      decodedMeta = {
        securityMode: parsed.mode,
        useTheraTurnur: parsed.useTheraTurnur,
        useJumpGates: parsed.useJumpGates,
        pushEveryJump: parsed.pushEveryJump
      };
      const wpQueue = Array.isArray(parsed.waypointIds) ? [...parsed.waypointIds] : [];
      let wpIdx = 0;
      for (const id of Array.isArray(parsed.ids) ? parsed.ids : []) {
        const isWp = wpQueue.length > 0 && wpQueue[0] === id;
        if (isWp) {
          wpQueue.shift();
          resolvedEntries.push({ id, isWaypoint: true, waypointIndex: wpIdx++ });
        } else {
          resolvedEntries.push({ id, isWaypoint: false });
        }
      }
    } else if (codeOrNames.entries?.length) {
      for (const entry of codeOrNames.entries) {
        const row = this.db.get<{ solar_system_id: number }>(
          'SELECT solar_system_id FROM sde_solar_systems WHERE LOWER(solar_system_name) = LOWER(?)',
          [entry.name.trim()]
        );
        if (row) {
          resolvedEntries.push({
            id: row.solar_system_id,
            isWaypoint: entry.isWaypoint,
            waypointIndex: entry.waypointIndex
          });
        }
      }
    } else if (codeOrNames.systemNames?.length) {
      for (let i = 0; i < codeOrNames.systemNames.length; i++) {
        const row = this.db.get<{ solar_system_id: number }>(
          'SELECT solar_system_id FROM sde_solar_systems WHERE LOWER(solar_system_name) = LOWER(?)',
          [codeOrNames.systemNames[i].trim()]
        );
        if (row) resolvedEntries.push({ id: row.solar_system_id, isWaypoint: true, waypointIndex: i + 1 });
      }
    }

    const jumps: RouteJumpNode[] = [];
    for (const item of resolvedEntries) {
      const s = this.db.get<{
        solarSystemId: number;
        solarSystemName: string;
        regionId: number;
        regionName: string | null;
        security: number;
        shipKills: number | null;
        podKills: number | null;
        npcKills: number | null;
      }>(
        `SELECT s.solar_system_id AS solarSystemId, s.solar_system_name AS solarSystemName,
                s.region_id AS regionId, r.region_name AS regionName, s.security AS security,
                a.ship_kills AS shipKills, a.pod_kills AS podKills, a.npc_kills AS npcKills
         FROM sde_solar_systems s
         LEFT JOIN sde_regions r ON r.region_id = s.region_id
         LEFT JOIN system_activity_cache a ON a.solar_system_id = s.solar_system_id
         WHERE s.solar_system_id = ?`,
        [item.id]
      );
      if (s) {
        const shipKills = s.shipKills ?? 0;
        const podKills = s.podKills ?? 0;
        jumps.push({
          solarSystemId: s.solarSystemId,
          solarSystemName: s.solarSystemName,
          regionId: s.regionId,
          regionName: s.regionName ?? `Region ${s.regionId}`,
          security: s.security,
          shipKills,
          podKills,
          npcKills: s.npcKills ?? 0,
          gankWarning: computeGankWarning(s.security, shipKills, podKills),
          isWaypoint: item.isWaypoint,
          waypointIndex: item.waypointIndex
        });
      }
    }

    const explicitWps = jumps.filter((j) => j.isWaypoint);
    const majorWaypoints = explicitWps.length >= 2 ? explicitWps : extractMajorWaypoints(jumps);
    const shareCode =
      codeOrNames.shareCode?.startsWith('NEL-R1:')
        ? codeOrNames.shareCode
        : jumps.length > 0
          ? 'NEL-R1:' +
            Buffer.from(
              JSON.stringify({
                v: 2,
                ids: jumps.map((j) => j.solarSystemId),
                waypointIds: majorWaypoints.map((w) => w.solarSystemId)
              }),
              'utf8'
            ).toString('base64url')
          : '';

    return {
      jumps,
      majorWaypoints,
      totalJumps: Math.max(0, jumps.length - 1),
      shareCode,
      meta: decodedMeta
    };
  }

  listJumpGates(): JumpGateRow[] {
    const rows = this.db.all<{
      id: number;
      from_system_id: number;
      from_name: string | null;
      to_system_id: number;
      to_name: string | null;
      bidirectional: number;
      label: string | null;
    }>(
      `SELECT j.*, s1.solar_system_name AS from_name, s2.solar_system_name AS to_name
       FROM jump_gates j
       LEFT JOIN sde_solar_systems s1 ON s1.solar_system_id = j.from_system_id
       LEFT JOIN sde_solar_systems s2 ON s2.solar_system_id = j.to_system_id
       ORDER BY j.id DESC`
    );
    return rows.map((r) => ({
      id: r.id,
      fromSystemId: r.from_system_id,
      fromSystemName: r.from_name ?? `System #${r.from_system_id}`,
      toSystemId: r.to_system_id,
      toSystemName: r.to_name ?? `System #${r.to_system_id}`,
      bidirectional: r.bidirectional === 1,
      label: r.label ?? ''
    }));
  }

  importJumpGatesText(rawText: string): JumpGateRow[] {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const now = Date.now();
    this.db.transaction((raw) => {
      for (const line of lines) {
        const bi = line.includes('<->') || line.includes('<>');
        const parts = line.split(/<->|<>|->|>/).map((p) => p.trim()).filter(Boolean);
        if (parts.length < 2) continue;
        const fromRow = this.db.get<{ solar_system_id: number }>(
          'SELECT solar_system_id FROM sde_solar_systems WHERE LOWER(solar_system_name) = LOWER(?)',
          [parts[0]]
        );
        const toRow = this.db.get<{ solar_system_id: number }>(
          'SELECT solar_system_id FROM sde_solar_systems WHERE LOWER(solar_system_name) = LOWER(?)',
          [parts[1]]
        );
        if (!fromRow || !toRow) continue;
        raw.run(
          `INSERT OR REPLACE INTO jump_gates (from_system_id, to_system_id, bidirectional, label, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [fromRow.solar_system_id, toRow.solar_system_id, bi ? 1 : 1, `${parts[0]} > ${parts[1]}`, now]
        );
      }
    });
    return this.listJumpGates();
  }

  deleteJumpGate(id: number): JumpGateRow[] {
    this.db.run('DELETE FROM jump_gates WHERE id = ?', [id]);
    return this.listJumpGates();
  }

  listSavedRoutes(): SavedRouteRow[] {
    const rows = this.db.all<{
      id: number;
      name: string;
      description: string | null;
      security_mode: RouteSecurityMode;
      share_code: string;
      waypoints_json: string;
      created_at: number;
    }>('SELECT * FROM saved_routes ORDER BY created_at DESC');

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      securityMode: r.security_mode,
      shareCode: r.share_code,
      waypoints: JSON.parse(r.waypoints_json) as number[],
      createdAt: r.created_at
    }));
  }

  saveRoute(input: {
    name: string;
    description: string;
    waypoints: number[];
    securityMode: RouteSecurityMode;
    shareCode: string;
  }): SavedRouteRow[] {
    this.db.run(
      `INSERT INTO saved_routes (name, description, waypoints_json, security_mode, share_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim() || 'Saved Route',
        input.description ?? '',
        JSON.stringify(input.waypoints),
        input.securityMode,
        input.shareCode,
        Date.now()
      ]
    );
    return this.listSavedRoutes();
  }

  renameRoute(id: number, name: string, description: string): SavedRouteRow[] {
    this.db.run('UPDATE saved_routes SET name = ?, description = ? WHERE id = ?', [
      name.trim() || 'Saved Route',
      description ?? '',
      id
    ]);
    return this.listSavedRoutes();
  }

  deleteRoute(id: number): SavedRouteRow[] {
    this.db.run('DELETE FROM saved_routes WHERE id = ?', [id]);
    return this.listSavedRoutes();
  }

  async getFleetLocations(
    characterId: number
  ): Promise<{ members: FleetMemberLocationDto[]; error?: string }> {
    try {
      const fleetInfo = await this.esiClient.request<{ fleet_id: number; role: string }>(
        `/characters/${characterId}/fleet/`,
        { characterId }
      );
      if (!fleetInfo?.fleet_id) {
        return { members: [], error: 'Character is not in a fleet.' };
      }

      const rawMembers = await this.esiClient.request<
        Array<{
          character_id: number;
          solar_system_id: number;
          ship_type_id: number;
          role: string;
        }>
      >(`/fleets/${fleetInfo.fleet_id}/members/`, { characterId });

      const charIds = Array.from(new Set(rawMembers.map((m) => m.character_id)));
      const shipIds = Array.from(new Set(rawMembers.map((m) => m.ship_type_id).filter((id) => id > 0)));

      const nameMap = new Map<number, string>();
      if (charIds.length > 0) {
        const resolved = await this.esiClient
          .request<Array<{ id: number; name: string }>>('/universe/names', {
            method: 'POST',
            body: charIds.slice(0, 500)
          })
          .catch(() => []);
        for (const r of resolved) nameMap.set(r.id, r.name);
      }

      const shipMap = new Map<number, string>();
      if (shipIds.length > 0) {
        const ph = shipIds.map(() => '?').join(',');
        const rows = this.db.all<{ type_id: number; type_name: string }>(
          `SELECT type_id, type_name FROM sde_inv_types WHERE type_id IN (${ph})`,
          shipIds
        );
        for (const r of rows) shipMap.set(r.type_id, r.type_name);
      }

      return {
        members: rawMembers.map((m) => ({
          characterId: m.character_id,
          characterName: nameMap.get(m.character_id) ?? `Pilot #${m.character_id}`,
          solarSystemId: m.solar_system_id,
          shipTypeId: m.ship_type_id,
          shipName: shipMap.get(m.ship_type_id) ?? `Ship #${m.ship_type_id}`,
          role: m.role
        }))
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) return { members: [], error: 'Character is not currently in a fleet.' };
      if (msg.includes('403') || msg.toLowerCase().includes('boss')) {
        return {
          members: [],
          error: 'Fleet member locations require Fleet Boss role (or esi-fleets.read_fleet.v1 scope).'
        };
      }
      return { members: [], error: msg };
    }
  }

  async getSystemStations(
    solarSystemId: number,
    _characterId: number | null = null
  ): Promise<StationServiceInfoDto[]> {
    const sysRow = this.db.get<{
      solar_system_name: string;
      region_id: number;
      region_name: string | null;
      security: number;
    }>(
      `SELECT s.solar_system_name, s.region_id, r.region_name, s.security
       FROM sde_solar_systems s
       LEFT JOIN sde_regions r ON r.region_id = s.region_id
       WHERE s.solar_system_id = ?`,
      [solarSystemId]
    );

    return STATIC_NPC_STATIONS.filter((st) => st.solarSystemId === solarSystemId).map((st) => ({
      id: st.id,
      kind: 'station',
      name: st.name,
      solarSystemId: st.solarSystemId,
      solarSystemName: sysRow?.solar_system_name ?? `System ${st.solarSystemId}`,
      regionId: sysRow?.region_id ?? st.regionId,
      regionName: sysRow?.region_name ?? `Region ${st.regionId}`,
      security: sysRow?.security ?? 0,
      services: st.services,
      ownerName: st.ownerName
    }));
  }

  async scanRegionStations(
    regionId: number,
    _characterId: number | null = null
  ): Promise<StationServiceInfoDto[]> {
    const sysRows = this.db.all<{
      solar_system_id: number;
      solar_system_name: string;
      region_id: number;
      region_name: string | null;
      security: number;
    }>(
      `SELECT s.solar_system_id, s.solar_system_name, s.region_id, r.region_name, s.security
       FROM sde_solar_systems s
       LEFT JOIN sde_regions r ON r.region_id = s.region_id
       WHERE s.region_id = ?`,
      [regionId]
    );
    const sysMap = new Map(sysRows.map((s) => [s.solar_system_id, s]));

    return STATIC_NPC_STATIONS.filter((st) => st.regionId === regionId)
      .map((st) => {
        const sys = sysMap.get(st.solarSystemId);
        return {
          id: st.id,
          kind: 'station' as const,
          name: st.name,
          solarSystemId: st.solarSystemId,
          solarSystemName: sys?.solar_system_name ?? `System ${st.solarSystemId}`,
          regionId,
          regionName: sys?.region_name ?? `Region ${regionId}`,
          security: sys?.security ?? 0,
          services: st.services,
          ownerName: st.ownerName
        };
      })
      .sort((a, b) => b.security - a.security || a.solarSystemName.localeCompare(b.solarSystemName));
  }
}

function computeGankWarning(sec: number, shipKills: number, podKills: number): string | null {
  const total = shipKills + podKills;
  if (total >= 12) return 'ACTIVE GATE CAMP';
  if (sec < 0.45 && total >= 3) return 'LOW/NULL PVP';
  if (sec >= 0.45 && sec <= 0.65 && total >= 4) return 'HIGHSEC GANK RISK';
  return null;
}

function extractMajorWaypoints(jumps: RouteJumpNode[]): RouteJumpNode[] {
  if (jumps.length <= 2) return [...jumps];
  const majors: RouteJumpNode[] = [jumps[0]];
  for (let i = 1; i < jumps.length - 1; i++) {
    const prev = jumps[i - 1];
    const curr = jumps[i];
    const next = jumps[i + 1];
    const regionChanged = curr.regionId !== prev.regionId || curr.regionId !== next.regionId;
    const secChanged = (curr.security >= 0.45) !== (prev.security >= 0.45);
    if (regionChanged || secChanged || curr.viaWormhole) {
      majors.push(curr);
    }
  }
  majors.push(jumps[jumps.length - 1]);
  return majors;
}

async function fetchEveScoutShortcuts(): Promise<Array<{ fromId: number; toId: number; label: string }>> {
  try {
    const res = await fetch('https://api.eve-scout.com/v2/public/signatures', {
      headers: { 'User-Agent': 'NewEdenLens/0.1.0' }
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      in_system_id?: number;
      out_system_id?: number;
      in_system_name?: string;
      out_system_name?: string;
    }>;
    const links: Array<{ fromId: number; toId: number; label: string }> = [];
    for (const sig of data) {
      if (sig.in_system_id && sig.out_system_id) {
        links.push({
          fromId: sig.in_system_id,
          toId: sig.out_system_id,
          label: `${sig.in_system_name ?? 'WH'}↔${sig.out_system_name ?? 'WH'}`
        });
      }
    }
    return links;
  } catch {
    return [];
  }
}

