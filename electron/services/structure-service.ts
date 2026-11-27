import type { StructureTimerRow } from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { EsiClient } from './esi-client';

interface EsiCorpStructure {
  structure_id: number;
  name?: string;
  type_id: number;
  system_id: number;
  state: string;
  state_timer_end?: string;
  fuel_expires?: string;
  reinforce_hour?: number;
  next_reinforce_hour?: number;
  unanchors_at?: string;
  services?: Array<{ name: string; state: string }>;
}

export class StructureService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly esiClient: EsiClient
  ) {}

  async listStructures(characterId: number | null): Promise<StructureTimerRow[]> {
    const results: StructureTimerRow[] = [];
    const now = Date.now();

    // 1. Owned Corporation Structures via ESI
    if (characterId !== null) {
      const charInfo = await this.esiClient
        .request<{ corporation_id: number }>(`/characters/${characterId}`)
        .catch(() => null);

      if (charInfo?.corporation_id) {
        const corpInfo = await this.esiClient
          .request<{ name?: string }>(`/corporations/${charInfo.corporation_id}`)
          .catch(() => null);
        const esiStructures = await this.esiClient
          .request<EsiCorpStructure[]>(
            `/corporations/${charInfo.corporation_id}/structures`,
            { characterId }
          )
          .catch(() => [] as EsiCorpStructure[]);

        for (const s of esiStructures) {
          const sysRow = this.db.get<{ solar_system_name: string }>(
            'SELECT solar_system_name FROM sde_solar_systems WHERE solar_system_id = ?',
            [s.system_id]
          );
          const typeRow = this.db.get<{ type_name: string }>(
            'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
            [s.type_id]
          );

          const fuelExpiresAt = s.fuel_expires ? Date.parse(s.fuel_expires) : null;
          const stateExpiresAt = s.state_timer_end ? Date.parse(s.state_timer_end) : null;
          const unanchorsAt = s.unanchors_at ? Date.parse(s.unanchors_at) : null;
          const isLowFuel =
            fuelExpiresAt !== null && fuelExpiresAt - now < 7 * 24 * 3600 * 1000;
          const isUnderAttack =
            s.state.includes('reinforce') || s.state.includes('vulnerable');

          results.push({
            id: `esi-${s.structure_id}`,
            source: 'esi',
            name: s.name ?? `Structure #${s.structure_id}`,
            structureType: typeRow?.type_name ?? `Type #${s.type_id}`,
            solarSystemId: s.system_id,
            solarSystemName: sysRow?.solar_system_name ?? `System #${s.system_id}`,
            state: s.state,
            timerKind: s.state,
            expiresAt: stateExpiresAt,
            fuelExpiresAt,
            isLowFuel,
            isUnderAttack,
            reinforceHour: s.reinforce_hour,
            nextReinforceHour: s.next_reinforce_hour,
            unanchorsAt,
            corporationName: corpInfo?.name ?? 'My Corporation',
            services: s.services ?? [],
            notes: ''
          });
        }
      }
    }

    // 2. Manual War / Target Structures from SQLite
    const manualRows = this.db.all<{
      id: number;
      name: string;
      structure_type: string;
      solar_system_id: number;
      solar_system_name: string | null;
      timer_kind: string;
      expires_at: number;
      notes: string | null;
    }>(
      `SELECT m.*, s.solar_system_name
       FROM manual_structures m
       LEFT JOIN sde_solar_systems s ON s.solar_system_id = m.solar_system_id
       ORDER BY m.expires_at ASC`
    );

    for (const m of manualRows) {
      results.push({
        id: `manual-${m.id}`,
        source: 'manual',
        manualId: m.id,
        name: m.name,
        structureType: m.structure_type,
        solarSystemId: m.solar_system_id,
        solarSystemName: m.solar_system_name ?? `System #${m.solar_system_id}`,
        state: m.timer_kind,
        timerKind: m.timer_kind,
        expiresAt: m.expires_at,
        fuelExpiresAt: null,
        isLowFuel: false,
        isUnderAttack: true,
        notes: m.notes ?? ''
      });
    }

    return results.sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
  }

  addManualStructure(input: {
    name: string;
    structureType: string;
    solarSystemId: number;
    timerKind: string;
    expiresAt: number;
    notes?: string;
  }): void {
    this.db.run(
      `INSERT INTO manual_structures (name, structure_type, solar_system_id, timer_kind, expires_at, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim(),
        input.structureType.trim(),
        input.solarSystemId,
        input.timerKind,
        input.expiresAt,
        input.notes ?? '',
        Date.now()
      ]
    );
  }

  deleteManualStructure(id: number): void {
    this.db.run('DELETE FROM manual_structures WHERE id = ?', [id]);
  }
}

