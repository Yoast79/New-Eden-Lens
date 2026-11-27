import fs from 'fs';
import path from 'path';
import { app, net } from 'electron';
import {
  calculate,
  initSync,
  load_eft,
  load_sde,
  type Fit,
  type FitItem,
  type ItemResult,
  type Slot
} from '@eveshipfit/dogma-engine';
import type {
  FittingShipTraits,
  FittingSlotItem,
  FittingStatsDto,
  SavedFittingRow
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { CharacterRepository } from '../db/repositories/characterRepo';
import type { EsiClient } from './esi-client';

let dogmaInitialized = false;
let dogmaInitFailed = false;
let dogmaUpdateChecked = false;

function resolveAssetPath(candidates: string[]): string | null {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function ensureDogmaEngineLoaded(): boolean {
  if (dogmaInitialized) return true;
  if (dogmaInitFailed) return false;
  try {
    const appPath = app.getAppPath();
    let resolvedWasm = '';
    let resolvedSde = '';
    try {
      resolvedWasm = require.resolve('@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm');
      resolvedSde = require.resolve('@eveshipfit/sde/dist/sde.dat');
    } catch {
      // fallback to path candidates
    }
    const wasmPath = resolveAssetPath([
      resolvedWasm,
      path.join(appPath, 'node_modules/@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm'),
      path.join(process.cwd(), 'node_modules/@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm'),
      path.join(__dirname, '../../node_modules/@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm')
    ]);
    const userSdePath = path.join(app.getPath('userData'), 'dogma-sde.dat');
    const sdePath = resolveAssetPath([
      userSdePath,
      resolvedSde,
      path.join(appPath, 'node_modules/@eveshipfit/sde/dist/sde.dat'),
      path.join(process.cwd(), 'node_modules/@eveshipfit/sde/dist/sde.dat'),
      path.join(__dirname, '../../node_modules/@eveshipfit/sde/dist/sde.dat')
    ]);

    if (!wasmPath || !sdePath) {
      console.error('[FittingService] Missing dogma-engine assets:', { wasmPath, sdePath, appPath });
      dogmaInitFailed = true;
      return false;
    }

    initSync({ module: fs.readFileSync(wasmPath) });
    load_sde(fs.readFileSync(sdePath));
    dogmaInitialized = true;
    void checkDogmaSdeUpdate(userSdePath);
    return true;
  } catch (err) {
    console.error('[FittingService] Failed to init dogma-engine:', err);
    dogmaInitFailed = true;
    return false;
  }
}

async function checkDogmaSdeUpdate(userSdePath: string): Promise<void> {
  if (dogmaUpdateChecked) return;
  dogmaUpdateChecked = true;
  const metaPath = `${userSdePath}.json`;
  try {
    const now = Date.now();
    let currentVersion = '';
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { version?: string; checkedAt?: number };
      currentVersion = meta.version ?? '';
      if (meta.checkedAt && now - meta.checkedAt < 24 * 60 * 60 * 1000) return;
    }
    const res = await fetch('https://registry.npmjs.org/@eveshipfit/sde/latest');
    if (!res.ok) return;
    const pkg = (await res.json()) as { version?: string };
    const latest = pkg.version;
    if (!latest || latest === currentVersion) {
      fs.writeFileSync(metaPath, JSON.stringify({ version: currentVersion || latest, checkedAt: now }));
      return;
    }
    const datRes = await fetch(`https://cdn.jsdelivr.net/npm/@eveshipfit/sde@${latest}/dist/sde.dat`);
    if (!datRes.ok) return;
    const buf = Buffer.from(await datRes.arrayBuffer());
    fs.writeFileSync(userSdePath, buf);
    fs.writeFileSync(metaPath, JSON.stringify({ version: latest, checkedAt: now }));
  } catch {
    // non-fatal offline check
  }
}

function mapRigSubCategory(groupName: string): string {
  const g = groupName.toLowerCase();
  if (g.startsWith('structure ')) return 'Structure Rigs';
  if (g.includes('armor')) return 'Armor Rigs';
  if (g.includes('navigation')) return 'Astronautic Rigs';
  if (g.includes('drone')) return 'Drone Rigs';
  if (g.includes('electronic')) return 'Electronics Superiority Rigs';
  if (g.includes('energy weapon')) return 'Energy Weapon Rigs';
  if (g.includes('core')) return 'Engineering Rigs';
  if (g.includes('hybrid')) return 'Hybrid Weapon Rigs';
  if (g.includes('launcher')) return 'Missile Launcher Rigs';
  if (g.includes('projectile')) return 'Projectile Weapon Rigs';
  if (g.includes('resource')) return 'Resource Processing Rigs';
  if (g.includes('scanning')) return 'Scanning Rigs';
  if (g.includes('shield')) return 'Shield Rigs';
  if (g.includes('synchronizer')) return 'Synchronizer Rigs';
  if (g.includes('targeting')) return 'Targeting Rigs';
  return groupName;
}

function mapDroneSubCategory(groupName: string): string {
  const g = groupName.toLowerCase();
  if (g.includes('combat drone')) return 'Combat Drones';
  if (g.includes('hybrid')) return 'Hybrid Drones';
  if (g.includes('neutralizer') || g.includes('webifying')) return 'Combat Utility Drones';
  if (g.includes('electronic warfare')) return 'Electronic Warfare Drones';
  if (g.includes('logistic')) return 'Logistic Drones';
  if (g.includes('mining')) return 'Mining Drones';
  if (g.includes('salvage')) return 'Salvage Drones';
  return groupName;
}

function mapMetaTier(metaGroupId: number | null, techLevel: number | null, metaLevel: number | null): string {
  if (metaGroupId === 2 || techLevel === 2) return 'Tech II';
  if (metaGroupId === 3) return 'Storyline';
  if (metaGroupId === 4) return 'Faction';
  if (metaGroupId === 5) return 'Officer';
  if (metaGroupId === 6) return 'Deadspace';
  if (metaGroupId === 14) return 'Tech III';
  if (metaGroupId === 15) return 'Abyssal';
  if (metaLevel !== null && metaLevel > 0 && metaLevel < 5) return 'Meta';
  return 'Tech I';
}

function mapGroupToEveCategory(
  groupName: string,
  slotKind: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge'
): string {
  if (slotKind === 'rig') return 'Rigs';
  if (slotKind === 'subsystem') return 'Subsystems';
  if (slotKind === 'drone') return 'Drones';
  if (slotKind === 'charge') return groupName;
  const g = groupName.toLowerCase();
  if (g.includes('smart bomb') || g.includes('smartbomb')) return 'Smartbombs';
  if (g.includes('compressor')) return 'Compressors';
  if (g.includes('drone')) return 'Drone Upgrades';
  if (
    g.includes('command') ||
    g.includes('remote') ||
    g.includes('gang') ||
    g.includes('tractor beam')
  ) {
    return 'Fleet Assistance Modules';
  }
  if (
    g.includes('turret') ||
    g.includes('launcher') ||
    g.includes('weapon upgrade') ||
    g.includes('gyrostabilizer') ||
    g.includes('heat sink') ||
    g.includes('magnetic field') ||
    g.includes('ballistic control') ||
    g.includes('tracking') ||
    g.includes('guidance') ||
    g.includes('vorton') ||
    g.includes('entropic')
  ) {
    return 'Turrets & Launchers';
  }
  if (g.includes('shield')) return 'Shield';
  if (
    g.includes('armor') ||
    g.includes('hull') ||
    g.includes('damage control') ||
    g.includes('layered') ||
    g.includes('energetic') ||
    g.includes('reinforced bulkhead')
  ) {
    return 'Hull & Armor';
  }
  if (
    g.includes('propulsion') ||
    g.includes('afterburner') ||
    g.includes('microwarp') ||
    g.includes('micro jump') ||
    g.includes('inertia') ||
    g.includes('overdrive') ||
    g.includes('nanofiber') ||
    g.includes('warp core')
  ) {
    return 'Propulsion';
  }
  if (
    g.includes('warp') ||
    g.includes('stasis') ||
    g.includes('ecm') ||
    g.includes('dampener') ||
    g.includes('disruptor') ||
    g.includes('neutralizer') ||
    g.includes('nosferatu') ||
    g.includes('target painter') ||
    g.includes('burst jammer') ||
    g.includes('interdiction')
  ) {
    return 'Electronic Warfare';
  }
  if (
    g.includes('scan') ||
    g.includes('probe') ||
    g.includes('analyzer') ||
    g.includes('cargo scanner') ||
    g.includes('ship scanner')
  ) {
    return 'Scanning Equipment';
  }
  if (g.includes('mining') || g.includes('harvester') || g.includes('salvager') || g.includes('ice')) {
    return 'Harvest Equipment';
  }
  if (
    g.includes('sensor') ||
    g.includes('cpu') ||
    g.includes('co-processor') ||
    g.includes('signal') ||
    g.includes('automated targeting')
  ) {
    return 'Electronics and Sensor Upgrades';
  }
  if (
    g.includes('capacitor') ||
    g.includes('power') ||
    g.includes('reactor') ||
    g.includes('aux') ||
    g.includes('cloak') ||
    g.includes('cyno')
  ) {
    return 'Engineering Equipment';
  }
  return 'Engineering Equipment';
}

function applyStackingMultiplier(bonuses: number[]): number {
  if (bonuses.length === 0) return 1;
  // EVE stacking penalty: sort by largest magnitude first, factor = exp(-(i / 2.67)^2)
  const sorted = [...bonuses].sort((a, b) => Math.abs(b - 1) - Math.abs(a - 1));
  let mult = 1;
  for (let i = 0; i < sorted.length; i++) {
    const penalty = Math.exp(-Math.pow(i / 2.67, 2));
    mult *= 1 + (sorted[i] - 1) * penalty;
  }
  return mult;
}

function applyStackingResonance(baseResonance: number, mults: number[]): number {
  if (mults.length === 0) return baseResonance;
  // Each mult is e.g. 0.675 for a 32.5% hardener
  const sorted = [...mults].sort((a, b) => Math.abs(1 - b) - Math.abs(1 - a));
  let res = baseResonance;
  for (let i = 0; i < sorted.length; i++) {
    const penalty = Math.exp(-Math.pow(i / 2.67, 2));
    const effective = 1 - (1 - sorted[i]) * penalty;
    res *= effective;
  }
  return Math.max(0.01, Math.min(1, res));
}

export class FittingService {
  private cachedSkillIds: number[] | null = null;
  private readonly livePriceCache = new Map<string, { price: number; fetchedAt: number }>();

  constructor(
    private readonly db: LocalDatabase,
    private readonly characterRepo: CharacterRepository,
    private readonly esiClient: EsiClient
  ) {}

  private getAllSkillIds(): number[] {
    if (this.cachedSkillIds) return this.cachedSkillIds;
    const rows = this.db.all<{ type_id: number }>(
      'SELECT type_id FROM sde_inv_types WHERE category_id = 16 AND published = 1'
    );
    this.cachedSkillIds = rows.map((r) => r.type_id);
    return this.cachedSkillIds;
  }

  private simulateWithDogmaEngine(
    shipTypeId: number,
    shipName: string,
    shipDescription: string | undefined,
    items: FittingSlotItem[],
    skillMap: Record<number, number>,
    implantTypeIds: number[],
    priceRegionId = 10000002
  ): FittingStatsDto | null {
    if (!ensureDogmaEngineLoaded()) return null;

    const slotCounters: Record<'high' | 'medium' | 'low' | 'rig' | 'subsystem', number> = {
      high: 0,
      medium: 0,
      low: 0,
      rig: 0,
      subsystem: 0
    };

    const fitItems: FitItem[] = [];
    const itemKinds: Array<FittingSlotItem['slot'] | 'implant'> = [];
    const sourceItemIndices: number[] = [];

    items.forEach((it, srcIdx) => {
      if (it.slot === 'drone') {
        const totalQty = Math.max(1, it.quantity);
        const activeQty = Math.min(totalQty, Math.max(0, it.activeCount ?? 0));
        if (activeQty > 0) {
          fitItems.push({
            type_id: it.typeId,
            slot: { type: 'drone_bay' },
            quantity: activeQty,
            state: 'active'
          });
          itemKinds.push('drone');
          sourceItemIndices.push(srcIdx);
        }
        const inactiveQty = totalQty - activeQty;
        if (inactiveQty > 0) {
          fitItems.push({
            type_id: it.typeId,
            slot: { type: 'drone_bay' },
            quantity: inactiveQty,
            state: 'offline'
          });
          itemKinds.push('drone');
          sourceItemIndices.push(srcIdx);
        }
        return;
      }

      let slot: Slot;
      if (it.slot === 'high' || it.slot === 'low' || it.slot === 'rig') {
        slot = { type: it.slot, index: slotCounters[it.slot]++ };
      } else if (it.slot === 'mid') {
        slot = { type: 'medium', index: slotCounters.medium++ };
      } else if (it.slot === 'subsystem') {
        slot = { type: 'subsystem', index: slotCounters.subsystem++ };
      } else {
        slot = { type: 'cargo' };
      }

      fitItems.push({
        type_id: it.typeId,
        slot,
        quantity: it.slot === 'cargo' ? Math.max(1, it.quantity) : 1,
        state: it.offline ? 'offline' : it.overheated ? 'overload' : it.inactive ? 'online' : 'active',
        charge: it.chargeTypeId ? { type_id: it.chargeTypeId } : undefined
      });
      itemKinds.push(it.slot);
      sourceItemIndices.push(srcIdx);
    });

    implantTypeIds.forEach((impId, idx) => {
      fitItems.push({
        type_id: impId,
        slot: { type: 'implant', index: idx },
        state: 'online'
      });
      itemKinds.push('implant');
      sourceItemIndices.push(-1);
    });

    const fit: Fit = {
      ship: { type_id: shipTypeId },
      items: fitItems,
      character: { skills: skillMap }
    };

    const res = calculate(fit, { validate: true });
    const s = res.ship.attributes;
    const val = (attrs: ItemResult['attributes'], id: number, fallback = 0) =>
      attrs.get(id)?.value ?? fallback;

    const shieldHp = val(s, 263, 500);
    const armorHp = val(s, 265, 500);
    const hullHp = val(s, 9, 500);

    // EM, Thermal, Kinetic, Explosive resonances
    const sRes = [val(s, 271, 1), val(s, 274, 0.6), val(s, 273, 0.8), val(s, 272, 1)];
    const aRes = [val(s, 267, 0.5), val(s, 270, 0.55), val(s, 269, 0.75), val(s, 268, 0.9)];
    const hRes = [val(s, 974, 0.67), val(s, 977, 0.67), val(s, 976, 0.67), val(s, 975, 0.67)];

    const avgShieldRes = (sRes[0] + sRes[1] + sRes[2] + sRes[3]) / 4;
    const avgArmorRes = (aRes[0] + aRes[1] + aRes[2] + aRes[3]) / 4;
    const avgHullRes = (hRes[0] + hRes[1] + hRes[2] + hRes[3]) / 4;

    const shieldEhp = Math.round(shieldHp / Math.max(0.01, avgShieldRes));
    const armorEhp = Math.round(armorHp / Math.max(0.01, avgArmorRes));
    const hullEhp = Math.round(hullHp / Math.max(0.01, avgHullRes));

    let weaponDps = 0;
    let droneDps = 0;
    let totalVolley = 0;
    let capDrainPerSec = 0;
    let capBoostPerSec = 0;
    let droneBayUsed = 0;

    const moduleDetails: FittingStatsDto['moduleDetails'] = items.map(() => ({
      cpu: 0,
      pg: 0,
      dps: 0,
      optimalKm: 0,
      falloffKm: 0,
      capPerSec: 0,
      cycleSec: 0,
      maxState: 'offline'
    }));

    res.items.forEach((ir, idx) => {
      const kind = itemKinds[idx];
      const srcIdx = sourceItemIndices[idx] ?? -1;
      const a = ir.attributes;
      const qty = Math.max(1, fitItems[idx]?.quantity ?? 1);

      if (kind === 'drone') {
        droneBayUsed += val(a, 161, 0) * qty;
      }

      if (ir.state === 'offline' || ir.state === 'online' || kind === 'cargo' || kind === 'implant') {
        if (srcIdx >= 0 && moduleDetails[srcIdx]) {
          moduleDetails[srcIdx].cpu = Number(val(a, 50, 0).toFixed(1));
          moduleDetails[srcIdx].pg = Number(val(a, 30, 0).toFixed(1));
          moduleDetails[srcIdx].maxState = ir.max_state;
          if (kind === 'drone') moduleDetails[srcIdx].bandwidth = val(a, 1272, 0);
        }
        return;
      }

      let itemDps = 0;
      if (kind === 'high') {
        const rofMs = val(a, 51, 0);
        if (rofMs > 0 && ir.charge) {
          const ca = ir.charge.attributes;
          const chargeDmg = val(ca, 114) + val(ca, 116) + val(ca, 117) + val(ca, 118);
          const dmgMult = val(a, 64, 1);
          const volley = chargeDmg * dmgMult;
          totalVolley += volley;
          itemDps = volley / (rofMs / 1000);
          weaponDps += itemDps;
        } else if (rofMs > 0 && (a.has(114) || a.has(116) || a.has(117) || a.has(118))) {
          const bombDmg = val(a, 114) + val(a, 116) + val(a, 117) + val(a, 118);
          totalVolley += bombDmg;
          itemDps = bombDmg / (rofMs / 1000);
          weaponDps += itemDps;
        }
      } else if (kind === 'drone') {
        const rofMs = val(a, 51, 4000);
        const baseDmg = val(a, 114) + val(a, 116) + val(a, 117) + val(a, 118);
        const dmgMult = val(a, 64, 1);
        const volley = baseDmg * dmgMult * qty;
        totalVolley += volley;
        if (rofMs > 0) {
          itemDps = volley / (rofMs / 1000);
          droneDps += itemDps;
        }
      }

      let itemCapPerSec = 0;
      const cycleMs = val(a, 51, val(a, 73, 0));
      if (ir.state === 'active' || ir.state === 'overload') {
        const capCost = val(a, 6, 0);
        if (capCost > 0 && cycleMs > 0) {
          itemCapPerSec = capCost / (cycleMs / 1000);
          capDrainPerSec += itemCapPerSec;
        }
        // Capacitor Booster charge bonus (attribute 67 = capacitorBonus on loaded cap booster charge)
        if (ir.charge && cycleMs > 0) {
          const capBoost = val(ir.charge.attributes, 67, 0);
          if (capBoost > 0) {
            const reloadSec = val(a, 1795, 10_000) / 1000;
            const effectiveCycle = cycleMs / 1000 + reloadSec / 8;
            capBoostPerSec += capBoost / Math.max(1, effectiveCycle);
          }
        }
      }

      if (srcIdx >= 0 && moduleDetails[srcIdx]) {
        moduleDetails[srcIdx] = {
          cpu: Number(val(a, 50, 0).toFixed(1)),
          pg: Number(val(a, 30, 0).toFixed(1)),
          dps: Number(itemDps.toFixed(1)),
          optimalKm: Number((val(a, 54, 0) / 1000).toFixed(1)),
          falloffKm: Number((val(a, 158, 0) / 1000).toFixed(1)),
          capPerSec: Number(itemCapPerSec.toFixed(1)),
          cycleSec: Number((cycleMs / 1000).toFixed(2)),
          maxState: ir.max_state,
          bandwidth: kind === 'drone' ? val(a, 1272, 0) : undefined
        };
      }
    });

    const capCapacity = val(s, 482, 800);
    const capRechargeSec = Math.max(1, val(s, 55, 240_000) / 1000);
    const peakCapRecharge = (2.5 * capCapacity) / capRechargeSec;
    const netDrain = capDrainPerSec - capBoostPerSec;
    const capDeltaPerSec = Number((peakCapRecharge - netDrain).toFixed(1));
    const capStablePct =
      netDrain <= peakCapRecharge
        ? Math.round(Math.max(25, 100 - (Math.max(0, netDrain) / Math.max(1, peakCapRecharge)) * 65))
        : Math.max(0, Math.round((peakCapRecharge / Math.max(0.01, netDrain)) * 35));

    // Simulate cap depletion time when unstable
    let capDepletesSec: number | null = null;
    if (netDrain > peakCapRecharge && capCapacity > 0) {
      let c = capCapacity;
      let t = 0;
      const tau = capRechargeSec / 5;
      while (c > 0 && t < 7200) {
        const ratio = Math.max(0, c / capCapacity);
        const regen = (2 * capCapacity / tau) * (Math.sqrt(ratio) - ratio);
        c += regen - netDrain;
        t += 1;
      }
      capDepletesSec = t;
    }

    // Extract missing skill violations
    const missingMap = new Map<number, { requiredLevel: number; currentLevel: number }>();
    for (const v of res.violations ?? []) {
      if (v.rule.type === 'skill') {
        const prev = missingMap.get(v.rule.type_id);
        if (!prev || v.rule.required > prev.requiredLevel) {
          missingMap.set(v.rule.type_id, {
            requiredLevel: v.rule.required,
            currentLevel: v.rule.level
          });
        }
      }
    }
    const missingIds = Array.from(missingMap.keys());
    const skillNameMap = new Map<number, string>();
    if (missingIds.length > 0) {
      const ph = missingIds.map(() => '?').join(',');
      for (const row of this.db.all<{ type_id: number; type_name: string }>(
        `SELECT type_id, type_name FROM sde_inv_types WHERE type_id IN (${ph})`,
        missingIds
      )) {
        skillNameMap.set(row.type_id, row.type_name);
      }
    }
    const missingSkills = missingIds
      .map((id) => ({
        skillId: id,
        skillName: skillNameMap.get(id) ?? `Skill #${id}`,
        requiredLevel: missingMap.get(id)!.requiredLevel,
        currentLevel: missingMap.get(id)!.currentLevel
      }))
      .sort((a, b) => a.skillName.localeCompare(b.skillName));

    const mass = val(s, 4, 1_500_000);
    const agility = val(s, 70, 3.0);

    return {
      shipTypeId,
      shipName,
      shipDescription,
      highSlots: Math.max(0, Math.round(val(s, 14, 4))),
      midSlots: Math.max(0, Math.round(val(s, 13, 4))),
      lowSlots: Math.max(0, Math.round(val(s, 12, 4))),
      rigSlots: Math.max(0, Math.round(val(s, 1137, 3))),
      subsystemSlots: Math.max(0, Math.round(val(s, 1367, 0))),
      dps: Math.round(weaponDps + droneDps),
      weaponDps: Math.round(weaponDps),
      droneDps: Math.round(droneDps),
      volley: Math.round(totalVolley),
      ehp: shieldEhp + armorEhp + hullEhp,
      shieldHp: shieldEhp,
      armorHp: armorEhp,
      hullHp: hullEhp,
      resists: {
        shield: [
          Math.round((1 - sRes[0]) * 100),
          Math.round((1 - sRes[1]) * 100),
          Math.round((1 - sRes[2]) * 100),
          Math.round((1 - sRes[3]) * 100)
        ],
        armor: [
          Math.round((1 - aRes[0]) * 100),
          Math.round((1 - aRes[1]) * 100),
          Math.round((1 - aRes[2]) * 100),
          Math.round((1 - aRes[3]) * 100)
        ],
        hull: [
          Math.round((1 - hRes[0]) * 100),
          Math.round((1 - hRes[1]) * 100),
          Math.round((1 - hRes[2]) * 100),
          Math.round((1 - hRes[3]) * 100)
        ]
      },
      cpuUsed: Number(val(s, 49, 0).toFixed(1)),
      cpuMax: Number(val(s, 48, 200).toFixed(1)),
      pgUsed: Number(val(s, 15, 0).toFixed(1)),
      pgMax: Number(val(s, 11, 50).toFixed(1)),
      calibrationUsed: Math.round(val(s, 1152, 0)),
      calibrationMax: Math.round(val(s, 1132, 400)),
      droneBandwidthUsed: Number(val(s, 1271, 0).toFixed(0)),
      droneBandwidthMax: Number(val(s, 1271, 0) > 0 || val(s, 1271, 0) === 0 ? val(s, 1271, 0) : 0),
      droneBayUsed: Math.round(droneBayUsed),
      droneBayMax: Math.round(val(s, 283, 0)),
      estimatedValue: 0,
      capCapacity: Math.round(capCapacity),
      capDeltaPerSec,
      capStablePct,
      capDepletesSec,
      alignTimeSec: Number(((-Math.log(0.25) * agility * mass) / 1_000_000).toFixed(2)),
      targetingRangeKm: Number((val(s, 76, 40_000) / 1000).toFixed(1)),
      maxVelocity: Math.round(val(s, 37, 250)),
      moduleDetails,
      missingSkills
    };
  }

  private async fetchTypeTraits(typeId: number): Promise<FittingShipTraits | undefined> {
    const cacheKey = `ship_traits_${typeId}`;
    const cached = this.db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [cacheKey]);
    if (cached?.value) {
      try {
        const parsed = JSON.parse(cached.value) as FittingShipTraits;
        if (parsed.skillBonuses.length > 0 || parsed.roleBonuses.length > 0) {
          return parsed;
        }
      } catch {
        // ignore stale cache
      }
    }
    try {
      const res = await net.fetch(`https://ref-data.everef.net/types/${typeId}`, {
        headers: { 'User-Agent': 'NewEdenLens/0.2', Accept: 'application/json' },
        redirect: 'follow'
      });
      if (!res.ok) {
        console.warn(`[FittingService] Traits fetch ${typeId} HTTP ${res.status}`);
        return undefined;
      }
      const data = (await res.json()) as {
        traits?: {
          role_bonuses?: Record<string, { bonus?: number; bonus_text?: { en?: string }; unit_id?: number; importance?: number }>;
          types?: Record<string, Record<string, { bonus?: number; bonus_text?: { en?: string }; unit_id?: number; importance?: number }>>;
        };
      };
      if (!data.traits) return undefined;

      const formatBonus = (b: { bonus?: number; bonus_text?: { en?: string }; unit_id?: number }) => {
        const cleanText = (b.bonus_text?.en ?? '').replace(/<[^>]+>/g, '').trim();
        if (b.bonus === undefined) return cleanText;
        const unit = b.unit_id === 105 ? '%' : b.unit_id === 104 ? 'x' : b.unit_id === 1 ? 'm' : '';
        return `${b.bonus}${unit} ${cleanText}`;
      };

      const skillIds = Object.keys(data.traits.types ?? {}).map(Number).filter((n) => n > 0);
      const skillNames = new Map<number, string>();
      if (skillIds.length > 0) {
        const ph = skillIds.map(() => '?').join(',');
        for (const r of this.db.all<{ type_id: number; type_name: string }>(
          `SELECT type_id, type_name FROM sde_inv_types WHERE type_id IN (${ph})`,
          skillIds
        )) {
          skillNames.set(r.type_id, r.type_name);
        }
      }

      const skillBonuses = skillIds.map((sid) => {
        const entries = Object.values(data.traits?.types?.[String(sid)] ?? {}).sort(
          (a, b) => (a.importance ?? 99) - (b.importance ?? 99)
        );
        return {
          skillName: skillNames.get(sid) ?? `Skill #${sid}`,
          lines: entries.map(formatBonus)
        };
      });

      const roleBonuses = Object.values(data.traits.role_bonuses ?? {})
        .sort((a, b) => (a.importance ?? 99) - (b.importance ?? 99))
        .map(formatBonus);

      const traits: FittingShipTraits = { skillBonuses, roleBonuses };
      if (skillBonuses.length > 0 || roleBonuses.length > 0) {
        try {
          this.db.run('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)', [
            cacheKey,
            JSON.stringify(traits),
            Date.now()
          ]);
        } catch (dbErr) {
          console.warn('[FittingService] Failed to cache traits:', dbErr);
        }
      }
      return traits;
    } catch (err) {
      console.error(`[FittingService] fetchTypeTraits(${typeId}) failed:`, err);
      return undefined;
    }
  }

  private async getShipTraits(
    shipTypeId: number,
    subsystemTypeIds: number[] = []
  ): Promise<FittingShipTraits | undefined> {
    const allIds = [shipTypeId, ...subsystemTypeIds];
    const results = await Promise.all(allIds.map((id) => this.fetchTypeTraits(id)));
    const skillMap = new Map<string, string[]>();
    const roleBonuses: string[] = [];
    for (const tr of results) {
      if (!tr) continue;
      for (const sb of tr.skillBonuses) {
        const existing = skillMap.get(sb.skillName) ?? [];
        existing.push(...sb.lines);
        skillMap.set(sb.skillName, existing);
      }
      roleBonuses.push(...tr.roleBonuses);
    }
    if (skillMap.size === 0 && roleBonuses.length === 0) return undefined;
    return {
      skillBonuses: Array.from(skillMap.entries()).map(([skillName, lines]) => ({ skillName, lines })),
      roleBonuses
    };
  }

  async simulateFit(
    shipTypeId: number,
    items: FittingSlotItem[],
    characterId: number | null,
    options?: { skillOverrideLevel?: number | null; implantTypeIds?: number[]; priceRegionId?: number }
  ): Promise<FittingStatsDto> {
    const shipType = this.db.get<{ type_name: string; mass: number | null; group_id: number; description: string | null }>(
      'SELECT type_name, mass, group_id, description FROM sde_inv_types WHERE type_id = ?',
      [shipTypeId]
    );
    const shipDogma = this.getDogmaMap(shipTypeId);
    const shipDescription = shipType?.description
      ? shipType.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : undefined;

    const skillLevels = new Map<number, number>();
    const override = options?.skillOverrideLevel;
    let hasSyncedSkills = false;
    if (override === undefined || override === null) {
      if (characterId !== null) {
        const charSkills = this.characterRepo.getCharacterSkills(characterId);
        if (charSkills.skills.length > 0) {
          hasSyncedSkills = true;
          for (const s of charSkills.skills) {
            skillLevels.set(s.skillId, s.activeSkillLevel);
          }
        }
      }
    }

    const skillMap: Record<number, number> = {};
    if (override !== undefined && override !== null) {
      for (const id of this.getAllSkillIds()) skillMap[id] = override;
    } else if (hasSyncedSkills) {
      for (const [id, lvl] of skillLevels.entries()) skillMap[id] = lvl;
    } else {
      for (const id of this.getAllSkillIds()) skillMap[id] = 5;
    }

    const dogmaResult = this.simulateWithDogmaEngine(
      shipTypeId,
      shipType?.type_name ?? `Ship #${shipTypeId}`,
      shipDescription,
      items,
      skillMap,
      options?.implantTypeIds ?? [],
      options?.priceRegionId ?? 10000002
    );
    if (dogmaResult) {
      let bwUsed = 0;
      for (const it of items) {
        if (it.slot === 'drone' && (it.activeCount ?? 0) > 0) {
          bwUsed += (this.getDogmaMap(it.typeId).get(1272) ?? 0) * (it.activeCount ?? 0);
        }
      }
      dogmaResult.droneBandwidthUsed = Math.round(bwUsed);
      const subEntries = items
        .map((it, idx) => ({ it, idx }))
        .filter((x) => x.it.slot === 'subsystem');
      const subIds = subEntries.map((x) => x.it.typeId);
      const [traits, estVal, ...subTraitsList] = await Promise.all([
        this.getShipTraits(shipTypeId, subIds),
        this.estimateFitValue(shipTypeId, items, options?.priceRegionId ?? 10000002),
        ...subIds.map((id) => this.fetchTypeTraits(id))
      ]);
      subEntries.forEach((entry, sIdx) => {
        const tr = subTraitsList[sIdx];
        const detail = dogmaResult.moduleDetails[entry.idx];
        if (!tr || !detail) return;
        const lines: string[] = [];
        for (const sb of tr.skillBonuses) {
          lines.push(`${sb.skillName} (per lvl): ${sb.lines.join('; ')}`);
        }
        for (const rb of tr.roleBonuses) {
          if (!/^additional base stats$/i.test(rb)) lines.push(rb);
        }
        detail.subsystemBonuses = lines;
      });
      dogmaResult.shipTraits = traits;
      dogmaResult.estimatedValue = estVal;
      return dogmaResult;
    }

    // Default to All Level V when no pilot is selected or no skills are synced yet (matches EveWorkbench/Pyfa)
    const getSkill = (id: number) =>
      override !== undefined && override !== null
        ? override
        : hasSyncedSkills
          ? (skillLevels.get(id) ?? 0)
          : 5;

    const cpuSkill = getSkill(3426); // CPU Management (+5% CPU/lvl)
    const pgSkill = getSkill(3413); // Power Grid Management (+5% PG/lvl)
    const weaponUpgrades = getSkill(3318); // Weapon Upgrades (-5% weapon CPU/lvl)
    const advWeaponUpgrades = getSkill(11207); // Advanced Weapon Upgrades (-2% weapon PG/lvl)
    const shieldUpgrades = getSkill(3425); // Shield Upgrades (-5% shield module PG/lvl)
    const navSkill = getSkill(3449); // Navigation (+5% velocity/lvl)
    const evasiveSkill = getSkill(3453); // Evasive Maneuvering (-5% inertia/lvl)
    const shieldMgmt = getSkill(3419); // Shield Management (+5% shield HP/lvl)
    const mechanics = getSkill(3392); // Mechanics (+5% hull HP/lvl)
    const hullUpgrades = getSkill(3394); // Hull Upgrades (+5% armor HP/lvl)
    const targetingSkill = getSkill(3428); // Long Range Targeting (+5% range/lvl)
    const gunnerySkill = getSkill(3300); // Gunnery (+2% turret ROF/lvl)
    const rapidFiringSkill = getSkill(3310); // Rapid Firing (+4% turret ROF/lvl)
    const missileOpSkill = getSkill(3319); // Missile Launcher Operation (+2% missile ROF/lvl)
    const rapidLaunchSkill = getSkill(21071); // Rapid Launch (+3% missile ROF/lvl)
    const warheadSkill = getSkill(3324); // Warhead Upgrades (+2% missile dmg/lvl)
    const droneInterfacing = getSkill(3442); // Drone Interfacing (+10% drone dmg/lvl)

    let cpuMax = (shipDogma.get(48) ?? 200) * (1 + 0.05 * cpuSkill);
    let pgMax = (shipDogma.get(11) ?? 50) * (1 + 0.05 * pgSkill);
    let cpuMult = 1;
    let pgMult = 1;
    let cpuUsed = 0;
    let pgUsed = 0;
    const calibrationMax = Math.round(shipDogma.get(1132) ?? 400);
    let calibrationUsed = 0;

    let shieldHp = (shipDogma.get(263) ?? 500) * (1 + 0.05 * shieldMgmt);
    let armorHp = (shipDogma.get(265) ?? 500) * (1 + 0.05 * hullUpgrades);
    let hullHp = (shipDogma.get(9) ?? 500) * (1 + 0.05 * mechanics);

    // Base ship resonances (default 1.0 = 0% resist if missing)
    const baseShieldRes = [
      shipDogma.get(271) ?? 1,
      shipDogma.get(272) ?? 1,
      shipDogma.get(273) ?? 0.8,
      shipDogma.get(274) ?? 0.6
    ];
    const baseArmorRes = [
      shipDogma.get(267) ?? 0.5,
      shipDogma.get(268) ?? 0.9,
      shipDogma.get(269) ?? 0.75,
      shipDogma.get(270) ?? 0.55
    ];
    const baseHullRes = [
      shipDogma.get(974) ?? 0.67,
      shipDogma.get(975) ?? 0.67,
      shipDogma.get(976) ?? 0.67,
      shipDogma.get(977) ?? 0.67
    ];
    const shieldResMults: [number[], number[], number[], number[]] = [[], [], [], []];
    const armorResMults: [number[], number[], number[], number[]] = [[], [], [], []];
    const hullResMults: [number[], number[], number[], number[]] = [[], [], [], []];

    let maxVelocity = (shipDogma.get(37) ?? 250) * (1 + 0.05 * navSkill);
    const mass = shipType?.mass ?? 1_500_000;
    let agility = (shipDogma.get(70) ?? 3.0) * Math.pow(0.95, evasiveSkill);
    let targetingRangeM = (shipDogma.get(76) ?? 40_000) * (1 + 0.05 * targetingSkill);
    let capCapacity = shipDogma.get(482) ?? 800;
    const capRechargeMs = shipDogma.get(55) ?? 240_000;
    let capDrainPerSec = 0;

    // Collect stacking-penalized weapon & drone upgrade bonuses across fitted modules
    const turretDmgBonuses: number[] = [];
    const turretRofBonuses: number[] = [];
    const missileDmgBonuses: number[] = [];
    const missileRofBonuses: number[] = [];
    const droneDmgBonuses: number[] = [];

    const fittedWeapons: Array<{
      kind: 'turret' | 'missile' | 'smartbomb';
      d: Map<number, number>;
      chargeTypeId?: number;
      qty: number;
    }> = [];
    const fittedDrones: Array<{ d: Map<number, number>; qty: number }> = [];

    for (const item of items) {
      if (item.offline || item.slot === 'cargo') continue;
      const d = this.getDogmaMap(item.typeId);
      const qty = Math.max(1, item.quantity);

      if (item.slot !== 'drone') {
        let itemCpu = (d.get(50) ?? 0) * qty;
        let itemPg = (d.get(30) ?? 0) * qty;
        if (item.slot === 'high' && (d.has(64) || d.has(604))) {
          itemCpu *= 1 - 0.05 * weaponUpgrades;
          itemPg *= 1 - 0.02 * advWeaponUpgrades;
        }
        if (item.slot === 'mid' && (d.has(72) || d.has(68))) {
          itemPg *= 1 - 0.05 * shieldUpgrades;
        }
        cpuUsed += itemCpu;
        pgUsed += itemPg;
      }

      if (item.slot === 'rig') {
        calibrationUsed += (d.get(1153) ?? 0) * qty;
      }

      shieldHp += (d.get(72) ?? 0) * qty;
      armorHp += (d.get(1159) ?? 0) * qty;
      cpuMax += (d.get(1075) ?? 0) * qty;
      pgMax += ((d.get(1079) ?? 0) + (d.get(549) ?? 0)) * qty;

      if (d.has(202)) {
        const v = d.get(202)!;
        cpuMult *= Math.pow(v > 1 && v < 2 ? v : 1 + v / 100, qty);
      }
      if (d.has(424)) {
        cpuMult *= Math.pow(1 + d.get(424)! / 100, qty);
      }
      if (d.has(145)) {
        const v = d.get(145)!;
        pgMult *= Math.pow(v > 1 && v < 2 ? v : 1 + v / 100, qty);
      }
      if (d.has(313)) {
        pgMult *= Math.pow(1 + d.get(313)! / 100, qty);
      }
      if (d.has(151)) agility *= 1 + d.get(151)! / 100;
      if (d.has(20)) maxVelocity *= 1 + d.get(20)! / 100;
      if (d.has(237)) targetingRangeM *= 1 + d.get(237)! / 100;

      // Shield/Armor/Hull resist modules (Damage Control, Hardeners, Resistance Amps, Rigs)
      if (item.slot === 'mid' || item.slot === 'low' || item.slot === 'rig') {
        if (d.has(271)) shieldResMults[0].push(d.get(271)!);
        if (d.has(272)) shieldResMults[1].push(d.get(272)!);
        if (d.has(273)) shieldResMults[2].push(d.get(273)!);
        if (d.has(274)) shieldResMults[3].push(d.get(274)!);
        if (d.has(984)) shieldResMults[0].push(1 + d.get(984)! / 100);
        if (d.has(985)) shieldResMults[1].push(1 + d.get(985)! / 100);
        if (d.has(986)) shieldResMults[2].push(1 + d.get(986)! / 100);
        if (d.has(987)) shieldResMults[3].push(1 + d.get(987)! / 100);

        if (d.has(267)) armorResMults[0].push(d.get(267)!);
        if (d.has(268)) armorResMults[1].push(d.get(268)!);
        if (d.has(269)) armorResMults[2].push(d.get(269)!);
        if (d.has(270)) armorResMults[3].push(d.get(270)!);

        if (d.has(974)) hullResMults[0].push(d.get(974)!);
        if (d.has(975)) hullResMults[1].push(d.get(975)!);
        if (d.has(976)) hullResMults[2].push(d.get(976)!);
        if (d.has(977)) hullResMults[3].push(d.get(977)!);
      }

      // Low-slot / rig weapon & drone damage upgrades
      if (item.slot === 'low' || item.slot === 'rig') {
        if (d.has(64) && d.get(64)! > 1 && !d.has(51)) turretDmgBonuses.push(d.get(64)!);
        if (d.has(213) && d.get(213)! > 1) missileDmgBonuses.push(d.get(213)!);
        if (d.has(204) && d.get(204)! < 1 && d.get(204)! > 0) {
          if (d.has(213)) missileRofBonuses.push(d.get(204)!);
          else turretRofBonuses.push(d.get(204)!);
        }
        if (d.has(1255) && d.get(1255)! > 0) {
          droneDmgBonuses.push(1 + d.get(1255)! / 100);
        }
      }

      // High-slot weapons ONLY (Turrets have 64 + 51 + 604; Missile Launchers have 51 + 604 without 64)
      if (item.slot === 'high' && (d.get(51) ?? 0) > 0) {
        if (d.has(64) && d.has(604)) {
          fittedWeapons.push({ kind: 'turret', d, chargeTypeId: item.chargeTypeId, qty });
        } else if (d.has(604)) {
          fittedWeapons.push({ kind: 'missile', d, chargeTypeId: item.chargeTypeId, qty });
        } else if (d.has(114) || d.has(116) || d.has(117) || d.has(118)) {
          fittedWeapons.push({ kind: 'smartbomb', d, qty });
        }
      }

      if (item.slot === 'drone') {
        fittedDrones.push({ d, qty });
      }

      const capCost = d.get(6) ?? 0;
      const cycleMs = d.get(51) ?? d.get(73) ?? 0;
      if (capCost > 0 && cycleMs > 0) {
        capDrainPerSec += (capCost / (cycleMs / 1000)) * qty;
      }
    }

    // Calculate Weapon & Drone DPS using Pyfa-style stacking penalties & loaded charge dogma
    const turretDmgStack = applyStackingMultiplier(turretDmgBonuses);
    const turretRofStack = applyStackingMultiplier(turretRofBonuses);
    const missileDmgStack = applyStackingMultiplier(missileDmgBonuses);
    const missileRofStack = applyStackingMultiplier(missileRofBonuses);
    const droneDmgStack = applyStackingMultiplier(droneDmgBonuses);

    let totalDps = 0;
    let totalVolley = 0;

    for (const w of fittedWeapons) {
      const rofMs = w.d.get(51) ?? 0;
      if (rofMs <= 0) continue;

      if (w.kind === 'turret') {
        if (!w.chargeTypeId) continue; // Unloaded turret = 0 DPS
        const cd = this.getDogmaMap(w.chargeTypeId);
        const chargeDmg = (cd.get(114) ?? 0) + (cd.get(116) ?? 0) + (cd.get(117) ?? 0) + (cd.get(118) ?? 0);
        const dmgMult = (w.d.get(64) ?? 1) * (1 + 0.05 * gunnerySkill) * turretDmgStack;
        const effectiveRofSec = (rofMs / 1000) * (1 - 0.02 * gunnerySkill) * (1 - 0.04 * rapidFiringSkill) * turretRofStack;
        const volley = chargeDmg * dmgMult * w.qty;
        totalVolley += volley;
        if (effectiveRofSec > 0) totalDps += volley / effectiveRofSec;
      } else if (w.kind === 'missile') {
        if (!w.chargeTypeId) continue; // Unloaded launcher = 0 DPS
        const cd = this.getDogmaMap(w.chargeTypeId);
        const chargeDmg = (cd.get(114) ?? 0) + (cd.get(116) ?? 0) + (cd.get(117) ?? 0) + (cd.get(118) ?? 0);
        const dmgMult = (1 + 0.02 * warheadSkill) * missileDmgStack;
        const effectiveRofSec =
          (rofMs / 1000) * (1 - 0.02 * missileOpSkill) * (1 - 0.03 * rapidLaunchSkill) * missileRofStack;
        const volley = chargeDmg * dmgMult * w.qty;
        totalVolley += volley;
        if (effectiveRofSec > 0) totalDps += volley / effectiveRofSec;
      } else if (w.kind === 'smartbomb') {
        const bombDmg =
          (w.d.get(114) ?? 0) + (w.d.get(116) ?? 0) + (w.d.get(117) ?? 0) + (w.d.get(118) ?? 0);
        const volley = bombDmg * w.qty;
        totalVolley += volley;
        totalDps += volley / (rofMs / 1000);
      }
    }

    for (const dr of fittedDrones) {
      const rofMs = dr.d.get(51) ?? 4000;
      const baseDmg =
        (dr.d.get(114) ?? 0) + (dr.d.get(116) ?? 0) + (dr.d.get(117) ?? 0) + (dr.d.get(118) ?? 0);
      const dmgMult = (dr.d.get(64) ?? 1) * (1 + 0.1 * droneInterfacing) * droneDmgStack;
      const volley = baseDmg * dmgMult * dr.qty;
      totalVolley += volley;
      if (rofMs > 0) totalDps += volley / (rofMs / 1000);
    }

    // Apply simulated implant bonuses
    for (const impId of options?.implantTypeIds ?? []) {
      const impDogma = this.getDogmaMap(impId);
      if (impDogma.has(1159)) armorHp *= 1 + impDogma.get(1159)! / 100;
      if (impDogma.has(72)) shieldHp *= 1 + impDogma.get(72)! / 100;
      if (impDogma.has(482)) capCapacity *= 1 + impDogma.get(482)! / 100;
      if (impDogma.has(20)) maxVelocity *= 1 + impDogma.get(20)! / 100;
      if (impDogma.has(424)) cpuMult *= 1 + impDogma.get(424)! / 100;
      if (impDogma.has(202)) {
        const v = impDogma.get(202)!;
        cpuMult *= v > 1 && v < 2 ? v : 1 + v / 100;
      }
      if (impDogma.has(145)) {
        const v = impDogma.get(145)!;
        pgMult *= v > 1 && v < 2 ? v : 1 + v / 100;
      }
      if (impDogma.has(1079)) pgMult *= 1 + impDogma.get(1079)! / 100;
    }

    cpuMax *= cpuMult;
    pgMax *= pgMult;

    const avgShieldRes =
      (applyStackingResonance(baseShieldRes[0], shieldResMults[0]) +
        applyStackingResonance(baseShieldRes[1], shieldResMults[1]) +
        applyStackingResonance(baseShieldRes[2], shieldResMults[2]) +
        applyStackingResonance(baseShieldRes[3], shieldResMults[3])) /
      4;
    const avgArmorRes =
      (applyStackingResonance(baseArmorRes[0], armorResMults[0]) +
        applyStackingResonance(baseArmorRes[1], armorResMults[1]) +
        applyStackingResonance(baseArmorRes[2], armorResMults[2]) +
        applyStackingResonance(baseArmorRes[3], armorResMults[3])) /
      4;
    const avgHullRes =
      (applyStackingResonance(baseHullRes[0], hullResMults[0]) +
        applyStackingResonance(baseHullRes[1], hullResMults[1]) +
        applyStackingResonance(baseHullRes[2], hullResMults[2]) +
        applyStackingResonance(baseHullRes[3], hullResMults[3])) /
      4;

    const shieldEhp = Math.round(shieldHp / avgShieldRes);
    const armorEhp = Math.round(armorHp / avgArmorRes);
    const hullEhp = Math.round(hullHp / avgHullRes);
    const ehp = shieldEhp + armorEhp + hullEhp;

    const alignTimeSec = Number(((-Math.log(0.25) * agility * mass) / 1_000_000).toFixed(2));
    const peakCapRecharge = (2.5 * capCapacity) / (capRechargeMs / 1000);
    const capDeltaPerSec = Number((peakCapRecharge - capDrainPerSec).toFixed(1));
    const capStablePct =
      capDrainPerSec <= peakCapRecharge
        ? Math.round(Math.max(25, 100 - (capDrainPerSec / Math.max(1, peakCapRecharge)) * 65))
        : Math.max(0, Math.round((peakCapRecharge / capDrainPerSec) * 35));

    const subIds = items.filter((i) => i.slot === 'subsystem').map((i) => i.typeId);
    const [fallbackTraits, fallbackEstVal] = await Promise.all([
      this.getShipTraits(shipTypeId, subIds),
      this.estimateFitValue(shipTypeId, items, options?.priceRegionId ?? 10000002)
    ]);

    return {
      shipTypeId,
      shipName: shipType?.type_name ?? `Ship #${shipTypeId}`,
      shipDescription,
      shipTraits: fallbackTraits,
      highSlots: Math.max(0, Math.round(shipDogma.get(14) ?? 4)),
      midSlots: Math.max(0, Math.round(shipDogma.get(13) ?? 4)),
      lowSlots: Math.max(0, Math.round(shipDogma.get(12) ?? 4)),
      rigSlots: Math.max(0, Math.round(shipDogma.get(1137) ?? 3)),
      subsystemSlots: Math.max(0, Math.round(shipDogma.get(1367) ?? 0)),
      dps: Math.round(totalDps),
      weaponDps: Math.round(totalDps),
      droneDps: 0,
      volley: Math.round(totalVolley),
      ehp,
      shieldHp: shieldEhp,
      armorHp: armorEhp,
      hullHp: hullEhp,
      resists: {
        shield: [0, 40, 20, 0],
        armor: [50, 45, 25, 10],
        hull: [33, 33, 33, 33]
      },
      cpuUsed: Number(cpuUsed.toFixed(1)),
      cpuMax: Number(cpuMax.toFixed(1)),
      pgUsed: Number(pgUsed.toFixed(1)),
      pgMax: Number(pgMax.toFixed(1)),
      calibrationUsed: Math.round(calibrationUsed),
      calibrationMax,
      droneBandwidthUsed: 0,
      droneBandwidthMax: Math.round(shipDogma.get(1271) ?? 0),
      droneBayUsed: 0,
      droneBayMax: Math.round(shipDogma.get(283) ?? 0),
      estimatedValue: fallbackEstVal,
      capCapacity: Math.round(capCapacity),
      capDeltaPerSec,
      capStablePct,
      capDepletesSec: null,
      alignTimeSec,
      targetingRangeKm: Number((targetingRangeM / 1000).toFixed(1)),
      maxVelocity: Math.round(maxVelocity),
      moduleDetails: [],
      missingSkills: []
    };
  }

  private async estimateFitValue(shipTypeId: number, items: FittingSlotItem[], regionId = 10000002): Promise<number> {
    const typeCounts = new Map<number, number>();
    typeCounts.set(shipTypeId, 1);
    for (const it of items) {
      typeCounts.set(it.typeId, (typeCounts.get(it.typeId) ?? 0) + Math.max(1, it.quantity));
    }
    const ids = Array.from(typeCounts.keys());
    if (ids.length === 0) return 0;

    const now = Date.now();
    const ttlMs = 15 * 60 * 1000;
    const missingForRegion = ids.filter((id) => {
      const hit = this.livePriceCache.get(`${regionId}:${id}`);
      return !hit || now - hit.fetchedAt > ttlMs;
    });

    if (missingForRegion.length > 0) {
      await Promise.all(
        missingForRegion.map(async (id) => {
          try {
            const res = await fetch(
              `https://esi.evetech.net/latest/markets/${regionId}/orders/?datasource=tranquility&order_type=sell&type_id=${id}`,
              { headers: { 'User-Agent': 'NewEdenLens/0.2' } }
            );
            if (!res.ok) return;
            const orders = (await res.json()) as Array<{ price?: number }>;
            let minPrice = 0;
            for (const o of orders) {
              if (typeof o.price === 'number' && o.price > 0 && (minPrice === 0 || o.price < minPrice)) {
                minPrice = o.price;
              }
            }
            if (minPrice > 0) {
              this.livePriceCache.set(`${regionId}:${id}`, { price: minPrice, fetchedAt: now });
            }
          } catch {
            // fallback to local cache / global price
          }
        })
      );
    }

    const placeholders = ids.map(() => '?').join(',');
    const priceRows = this.db.all<{ type_id: number; price: number }>(
      `SELECT t.type_id,
              COALESCE(
                (SELECT MIN(m.price) FROM market_orders_cache m
                 WHERE m.region_id = ? AND m.type_id = t.type_id AND m.is_buy_order = 0),
                NULLIF(gp.average_price, 0),
                NULLIF(gp.adjusted_price, 0),
                0
              ) AS price
       FROM sde_inv_types t
       LEFT JOIN market_global_prices gp ON gp.type_id = t.type_id
       WHERE t.type_id IN (${placeholders})`,
      [regionId, ...ids]
    );
    let total = 0;
    for (const pr of priceRows) {
      const live = this.livePriceCache.get(`${regionId}:${pr.type_id}`)?.price;
      const unitPrice = live && live > 0 ? live : (pr.price ?? 0);
      total += unitPrice * (typeCounts.get(pr.type_id) ?? 0);
    }
    return Math.round(total);
  }

  parseEft(rawText: string): {
    shipTypeId: number;
    shipName: string;
    fitName: string;
    items: FittingSlotItem[];
  } | null {
    if (!ensureDogmaEngineLoaded()) return null;
    try {
      const parsed = load_eft(rawText);
      const ids = new Set<number>([parsed.ship.type_id]);
      for (const it of parsed.items) {
        ids.add(it.type_id);
        if (it.charge?.type_id) ids.add(it.charge.type_id);
      }
      const idList = Array.from(ids);
      const nameMap = new Map<number, string>();
      if (idList.length > 0) {
        const ph = idList.map(() => '?').join(',');
        for (const r of this.db.all<{ type_id: number; type_name: string }>(
          `SELECT type_id, type_name FROM sde_inv_types WHERE type_id IN (${ph})`,
          idList
        )) {
          nameMap.set(r.type_id, r.type_name);
        }
      }

      const items: FittingSlotItem[] = [];
      for (const it of parsed.items) {
        const st = it.slot.type;
        const slot: FittingSlotItem['slot'] =
          st === 'high'
            ? 'high'
            : st === 'medium'
              ? 'mid'
              : st === 'low'
                ? 'low'
                : st === 'rig'
                  ? 'rig'
                  : st === 'subsystem'
                    ? 'subsystem'
                    : st === 'drone_bay'
                      ? 'drone'
                      : 'cargo';
        items.push({
          typeId: it.type_id,
          typeName: nameMap.get(it.type_id) ?? `Type #${it.type_id}`,
          slot,
          quantity: Math.max(1, it.quantity ?? 1),
          offline: it.state === 'offline',
          activeCount: slot === 'drone' ? 0 : undefined,
          chargeTypeId: it.charge?.type_id,
          chargeName: it.charge?.type_id ? nameMap.get(it.charge.type_id) : undefined
        });
      }

      return {
        shipTypeId: parsed.ship.type_id,
        shipName: nameMap.get(parsed.ship.type_id) ?? `Ship #${parsed.ship.type_id}`,
        fitName: parsed.name || 'Imported Fit',
        items
      };
    } catch (err) {
      console.error('[FittingService] parseEft failed:', err);
      return null;
    }
  }

  browseModules(
    tab: 'all' | 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge',
    query: string,
    shipTypeId?: number,
    hullRestricted = false,
    fittedTypeIds?: number[]
  ): Array<{
    typeId: number;
    groupId: number;
    typeName: string;
    groupName: string;
    eveCategory: string;
    subCategory: string;
    slotKind: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge';
    categoryId: number;
    marketGroupId: number | null;
  }> {
    const trimmed = query.trim();
    const params: Array<string | number> = [];
    let sql = '';
    const metaSelect = `,
      (SELECT value FROM sde_type_dogma_attributes da WHERE da.type_id = t.type_id AND da.attribute_id = 1692 LIMIT 1) AS meta_group_id,
      (SELECT value FROM sde_type_dogma_attributes da WHERE da.type_id = t.type_id AND da.attribute_id = 422 LIMIT 1) AS tech_level,
      (SELECT value FROM sde_type_dogma_attributes da WHERE da.type_id = t.type_id AND da.attribute_id = 633 LIMIT 1) AS meta_level`;

    if (tab === 'drone' || tab === 'charge') {
      const catId = tab === 'drone' ? 18 : 8;
      sql = `SELECT t.type_id, t.group_id, t.type_name, COALESCE(g.group_name, 'Other') AS group_name,
                    COALESCE(g.category_id, ${catId}) AS category_id, t.market_group_id,
                    0 AS effect_id${metaSelect}
             FROM sde_inv_types t
             LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
             WHERE t.published = 1 AND g.category_id = ?`;
      params.push(catId);

      // Filter charges to match chargeGroup1..5 + chargeSize of modules fitted on the current ship
      if (tab === 'charge' && hullRestricted && fittedTypeIds && fittedTypeIds.length > 0) {
        const compatClauses: string[] = [];
        for (const modId of Array.from(new Set(fittedTypeIds))) {
          const md = this.getDogmaMap(modId);
          const groups = [604, 605, 606, 609, 610]
            .map((a) => md.get(a))
            .filter((v): v is number => v !== undefined && v > 0)
            .map((v) => Math.round(v));
          if (groups.length === 0) continue;
          const size = md.get(128);
          const grpList = groups.map(() => '?').join(',');
          if (size !== undefined && size > 0) {
            compatClauses.push(
              `(t.group_id IN (${grpList}) AND EXISTS (SELECT 1 FROM sde_type_dogma_attributes da WHERE da.type_id = t.type_id AND da.attribute_id = 128 AND da.value = ?))`
            );
            params.push(...groups, size);
          } else {
            compatClauses.push(`t.group_id IN (${grpList})`);
            params.push(...groups);
          }
        }
        if (compatClauses.length > 0) {
          sql += ` AND (${compatClauses.join(' OR ')})`;
        } else {
          return [];
        }
      }
    } else if (tab === 'all') {
      sql = `SELECT t.type_id, t.group_id, t.type_name, COALESCE(g.group_name, 'Other') AS group_name,
                    COALESCE(g.category_id, 7) AS category_id, t.market_group_id,
                    e.effect_id AS effect_id${metaSelect}
             FROM sde_inv_types t
             INNER JOIN sde_type_dogma_effects e ON e.type_id = t.type_id AND e.effect_id IN (11, 12, 13, 2663, 3772)
             LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
             WHERE t.published = 1`;
      if (hullRestricted && shipTypeId) {
        const shipDogma = this.getDogmaMap(shipTypeId);
        const shipRigSize = shipDogma.get(1547);
        const maxSubs = shipDogma.get(1367) ?? 0;
        const shipNameRow = this.db.get<{ type_name: string }>(
          'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
          [shipTypeId]
        );
        if (shipRigSize) {
          sql += ` AND (e.effect_id != 2663 OR EXISTS (
            SELECT 1 FROM sde_type_dogma_attributes da
            WHERE da.type_id = t.type_id AND da.attribute_id = 1547 AND da.value = ?
          ))`;
          params.push(shipRigSize);
        }
        if (maxSubs <= 0) {
          sql += ' AND e.effect_id != 3772';
        } else if (shipNameRow?.type_name) {
          sql += ' AND (e.effect_id != 3772 OR t.type_name LIKE ?)';
          params.push(`${shipNameRow.type_name} %`);
        }
      }
    } else {
      const effectId =
        tab === 'high' ? 12 : tab === 'mid' ? 13 : tab === 'low' ? 11 : tab === 'subsystem' ? 3772 : 2663;
      sql = `SELECT t.type_id, t.group_id, t.type_name, COALESCE(g.group_name, 'Other') AS group_name,
                    COALESCE(g.category_id, 7) AS category_id, t.market_group_id,
                    e.effect_id AS effect_id${metaSelect}
             FROM sde_inv_types t
             INNER JOIN sde_type_dogma_effects e ON e.type_id = t.type_id AND e.effect_id = ?
             LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
             WHERE t.published = 1`;
      params.push(effectId);

      if (hullRestricted && tab === 'rig' && shipTypeId) {
        const shipRigSize = this.getDogmaMap(shipTypeId).get(1547);
        if (shipRigSize) {
          sql += ` AND EXISTS (
            SELECT 1 FROM sde_type_dogma_attributes da
            WHERE da.type_id = t.type_id AND da.attribute_id = 1547 AND da.value = ?
          )`;
          params.push(shipRigSize);
        }
        sql += " AND COALESCE(g.group_name, '') NOT LIKE 'Structure %'";
      }
      if (hullRestricted && tab === 'subsystem' && shipTypeId) {
        const shipNameRow = this.db.get<{ type_name: string }>(
          'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
          [shipTypeId]
        );
        if (shipNameRow?.type_name) {
          sql += ' AND t.type_name LIKE ?';
          params.push(`${shipNameRow.type_name} %`);
        }
      }
    }

    if (trimmed) {
      sql += ' AND t.type_name LIKE ?';
      params.push(`%${trimmed}%`);
    }

    sql += ' ORDER BY g.group_name ASC, t.type_name ASC LIMIT 3000';

    return this.db
      .all<{
        type_id: number;
        group_id: number;
        type_name: string;
        group_name: string;
        category_id: number;
        market_group_id: number | null;
        effect_id: number;
        meta_group_id: number | null;
        tech_level: number | null;
        meta_level: number | null;
      }>(sql, params)
      .map((r) => {
        const slotKind: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge' =
          tab === 'drone'
            ? 'drone'
            : tab === 'charge'
              ? 'charge'
              : r.effect_id === 12
                ? 'high'
                : r.effect_id === 13
                  ? 'mid'
                  : r.effect_id === 11
                    ? 'low'
                    : r.effect_id === 3772
                      ? 'subsystem'
                      : 'rig';
        const subCategory =
          slotKind === 'rig'
            ? mapRigSubCategory(r.group_name)
            : slotKind === 'drone'
              ? mapDroneSubCategory(r.group_name)
              : slotKind === 'subsystem' || slotKind === 'charge'
                ? r.group_name
                : `${r.group_name} · ${mapMetaTier(r.meta_group_id, r.tech_level, r.meta_level)}`;
        return {
          typeId: r.type_id,
          groupId: r.group_id,
          typeName: r.type_name,
          groupName: r.group_name,
          eveCategory: mapGroupToEveCategory(r.group_name, slotKind),
          subCategory,
          slotKind,
          categoryId: r.category_id,
          marketGroupId: r.market_group_id
        };
      });
  }

  listFittings(characterId: number | null): SavedFittingRow[] {
    const where = characterId !== null ? 'WHERE f.character_id = ? OR f.character_id IS NULL' : '';
    const rows = this.db.all<{
      id: number;
      character_id: number | null;
      esi_fitting_id: number | null;
      name: string;
      ship_type_id: number;
      ship_name: string | null;
      description: string | null;
      eft_text: string;
      items_json: string;
      updated_at: number;
    }>(
      `SELECT f.*, t.type_name AS ship_name
       FROM character_fittings f
       LEFT JOIN sde_inv_types t ON t.type_id = f.ship_type_id
       ${where}
       ORDER BY f.updated_at DESC`,
      characterId !== null ? [characterId] : undefined
    );

    return rows.map((r) => ({
      id: r.id,
      characterId: r.character_id,
      esiFittingId: r.esi_fitting_id,
      name: r.name,
      shipTypeId: r.ship_type_id,
      shipName: r.ship_name ?? `Ship #${r.ship_type_id}`,
      description: r.description ?? '',
      eftText: r.eft_text,
      items: JSON.parse(r.items_json) as FittingSlotItem[],
      updatedAt: r.updated_at
    }));
  }

  saveFitting(input: {
    characterId: number | null;
    name: string;
    shipTypeId: number;
    description?: string;
    eftText: string;
    items: FittingSlotItem[];
  }): SavedFittingRow[] {
    this.db.run(
      `INSERT INTO character_fittings (
         character_id, name, ship_type_id, description, eft_text, items_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.characterId,
        input.name,
        input.shipTypeId,
        input.description ?? '',
        input.eftText,
        JSON.stringify(input.items),
        Date.now()
      ]
    );
    return this.listFittings(input.characterId);
  }

  async syncFromEsi(characterId: number): Promise<SavedFittingRow[]> {
    const remote = await this.esiClient.request<
      Array<{
        fitting_id: number;
        name: string;
        ship_type_id: number;
        description: string;
        items: Array<{ type_id: number; flag: string; quantity: number }>;
      }>
    >(`/characters/${characterId}/fittings`, { characterId });

    const now = Date.now();
    this.db.transaction((raw) => {
      raw.run('DELETE FROM character_fittings WHERE character_id = ? AND esi_fitting_id IS NOT NULL', [
        characterId
      ]);
      const stmt = raw.prepare(
        `INSERT INTO character_fittings (
           character_id, esi_fitting_id, name, ship_type_id, description, eft_text, items_json, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      try {
        for (const f of remote) {
          const items: FittingSlotItem[] = f.items.map((it) => {
            const typeRow = this.db.get<{ type_name: string }>(
              'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
              [it.type_id]
            );
            return {
              typeId: it.type_id,
              typeName: typeRow?.type_name ?? `Type #${it.type_id}`,
              slot: mapEsiFlagToSlot(it.flag),
              quantity: it.quantity
            };
          });
          stmt.run([
            characterId,
            f.fitting_id,
            f.name,
            f.ship_type_id,
            f.description ?? '',
            '',
            JSON.stringify(items),
            now
          ]);
        }
      } finally {
        stmt.free();
      }
    });

    return this.listFittings(characterId);
  }

  async pushToEsi(
    characterId: number,
    fit: { name: string; shipTypeId: number; description: string; items: FittingSlotItem[] }
  ): Promise<{ fitting_id: number }> {
    const flagCounters = { high: 0, mid: 0, low: 0, rig: 0, subsystem: 0 };
    const esiItems = fit.items.map((item) => {
      let flag = 'Cargo';
      if (item.slot === 'high') flag = `HiSlot${flagCounters.high++}`;
      else if (item.slot === 'mid') flag = `MedSlot${flagCounters.mid++}`;
      else if (item.slot === 'low') flag = `LoSlot${flagCounters.low++}`;
      else if (item.slot === 'rig') flag = `RigSlot${flagCounters.rig++}`;
      else if (item.slot === 'subsystem') flag = `SubSystemSlot${flagCounters.subsystem++}`;
      else if (item.slot === 'drone') flag = 'DroneBay';
      return { type_id: item.typeId, flag, quantity: item.quantity };
    });

    return this.esiClient.request<{ fitting_id: number }>(`/characters/${characterId}/fittings`, {
      characterId,
      method: 'POST',
      body: {
        name: fit.name.slice(0, 50),
        description: fit.description.slice(0, 500),
        ship_type_id: fit.shipTypeId,
        items: esiItems
      }
    });
  }

  private getDogmaMap(typeId: number): Map<number, number> {
    const rows = this.db.all<{ attribute_id: number; value: number }>(
      'SELECT attribute_id, value FROM sde_type_dogma_attributes WHERE type_id = ?',
      [typeId]
    );
    return new Map(rows.map((r) => [r.attribute_id, r.value]));
  }
}

function mapEsiFlagToSlot(flag: string): FittingSlotItem['slot'] {
  if (flag.startsWith('HiSlot')) return 'high';
  if (flag.startsWith('MedSlot')) return 'mid';
  if (flag.startsWith('LoSlot')) return 'low';
  if (flag.startsWith('RigSlot')) return 'rig';
  if (flag.startsWith('SubSystem')) return 'subsystem';
  if (flag === 'DroneBay') return 'drone';
  return 'cargo';
}
