import type { FleetCompositionDto, FleetMemberDto } from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';

export class FleetService {
  constructor(private readonly db: LocalDatabase) {}

  listFleets(): FleetCompositionDto[] {
    const fleets = this.db.all<{
      id: number;
      name: string;
      description: string;
      created_at: number;
    }>('SELECT * FROM fleet_compositions ORDER BY created_at DESC');

    return fleets.map((f) => {
      const members = this.db.all<{
        id: number;
        fleet_id: number;
        fitting_id: number | null;
        ship_type_id: number;
        ship_name: string | null;
        fit_name: string;
        role_label: string;
        quantity: number;
        notes: string;
      }>(
        `SELECT m.*, t.type_name AS ship_name
         FROM fleet_members m
         LEFT JOIN sde_inv_types t ON t.type_id = m.ship_type_id
         WHERE m.fleet_id = ?
         ORDER BY m.id ASC`,
        [f.id]
      );

      const mappedMembers: FleetMemberDto[] = members.map((m) => ({
        id: m.id,
        fleetId: m.fleet_id,
        fittingId: m.fitting_id,
        shipTypeId: m.ship_type_id,
        shipName: m.ship_name ?? `Ship #${m.ship_type_id}`,
        fitName: m.fit_name,
        roleLabel: m.role_label,
        quantity: m.quantity,
        notes: m.notes
      }));

      return {
        id: f.id,
        name: f.name,
        description: f.description,
        createdAt: f.created_at,
        members: mappedMembers
      };
    });
  }

  createFleet(name: string, description: string): FleetCompositionDto[] {
    this.db.run('INSERT INTO fleet_compositions (name, description, created_at) VALUES (?, ?, ?)', [
      name.trim() || 'New Fleet Doctrine',
      description.trim(),
      Date.now()
    ]);
    return this.listFleets();
  }

  deleteFleet(id: number): FleetCompositionDto[] {
    this.db.run('DELETE FROM fleet_compositions WHERE id = ?', [id]);
    return this.listFleets();
  }

  addMember(input: {
    fleetId: number;
    fittingId?: number | null;
    shipTypeId: number;
    fitName: string;
    roleLabel: string;
    quantity: number;
    notes?: string;
  }): FleetCompositionDto[] {
    this.db.run(
      `INSERT INTO fleet_members (fleet_id, fitting_id, ship_type_id, fit_name, role_label, quantity, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.fleetId,
        input.fittingId ?? null,
        input.shipTypeId,
        input.fitName.trim(),
        input.roleLabel,
        Math.max(1, input.quantity),
        input.notes ?? ''
      ]
    );
    return this.listFleets();
  }

  removeMember(memberId: number): FleetCompositionDto[] {
    this.db.run('DELETE FROM fleet_members WHERE id = ?', [memberId]);
    return this.listFleets();
  }
}

