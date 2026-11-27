import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type { FleetCompositionDto, SavedFittingRow } from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { ConfirmModal } from '@/core/components/ConfirmModal';

const FLEET_ROLES = [
  'FC',
  'DPS',
  'Logi',
  'Tackle',
  'Miner',
  'Salvager',
  'Booster',
  'Scout',
  'Cyno',
  'Hauler'
] as const;

export function FleetPlannerModule({ activeCharacterId }: ModuleProps) {
  const [fleets, setFleets] = useState<FleetCompositionDto[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState<number | null>(null);
  const [savedFits, setSavedFits] = useState<SavedFittingRow[]>([]);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Add member form
  const [selectedFitId, setSelectedFitId] = useState<string>('');
  const [roleLabel, setRoleLabel] = useState<string>('DPS');
  const [quantity, setQuantity] = useState('5');
  const [notes, setNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'fleet' | 'member'; id: number } | null>(null);

  const refresh = useCallback(async () => {
    const [fleetList, fitsList] = await Promise.all([
      window.eveLens.fleets.list(),
      window.eveLens.fitting.list(activeCharacterId)
    ]);
    setFleets(fleetList);
    setSavedFits(fitsList);
    if (fleetList.length > 0 && selectedFleetId === null) {
      setSelectedFleetId(fleetList[0].id);
    }
    if (fitsList.length > 0 && !selectedFitId) {
      setSelectedFitId(String(fitsList[0].id));
    }
  }, [activeCharacterId, selectedFleetId, selectedFitId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeFleet = fleets.find((f) => f.id === selectedFleetId) ?? null;

  const handleCreateFleet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const updated = await window.eveLens.fleets.create(newName.trim(), newDesc.trim());
    setFleets(updated);
    if (updated[0]) setSelectedFleetId(updated[0].id);
    setNewName('');
    setNewDesc('');
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFleet) return;
    const fit = savedFits.find((f) => String(f.id) === selectedFitId);
    if (!fit) return;
    const updated = await window.eveLens.fleets.addMember({
      fleetId: activeFleet.id,
      fittingId: fit.id,
      shipTypeId: fit.shipTypeId,
      fitName: fit.name,
      roleLabel,
      quantity: Number(quantity) || 1,
      notes: notes.trim()
    });
    setFleets(updated);
    setNotes('');
  };

  const totalPilots = activeFleet?.members.reduce((s, m) => s + m.quantity, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      {/* Create Fleet Bar */}
      <form
        onSubmit={(e) => void handleCreateFleet(e)}
        className="photon-panel flex flex-wrap items-center gap-2 p-3 text-xs"
      >
        <Users className="h-4 w-4 text-eve-accent" />
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New Fleet Name (e.g. Shield Fleet, Moon Mining)..."
          className="w-60 border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
        />
        <input
          type="text"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="Description / Doctrine notes..."
          className="flex-1 border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 font-semibold text-eve-accent disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Fleet
        </button>
      </form>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: Fleet List */}
        <div className="photon-panel flex min-h-0 flex-col lg:col-span-4">
          <div className="photon-header px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            Fleet Compositions ({fleets.length})
          </div>
          <div className="flex-1 divide-y divide-eve-border/50 overflow-y-auto p-2">
            {fleets.length === 0 ? (
              <div className="p-6 text-center text-xs text-eve-muted">
                Create a fleet composition above to start assigning saved ship fits and roles.
              </div>
            ) : (
              fleets.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center justify-between px-2.5 py-2 text-xs ${
                    f.id === selectedFleetId ? 'bg-eve-accent-muted' : 'hover:bg-eve-elevated'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFleetId(f.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate font-semibold text-eve-text">{f.name}</div>
                    {f.description && (
                      <div className="truncate text-[10px] text-eve-muted">{f.description}</div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ kind: 'fleet', id: f.id })}
                    className="ml-2 text-eve-muted hover:text-eve-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Active Fleet Members */}
        <div className="photon-panel flex min-h-0 flex-col lg:col-span-8">
          <div className="photon-header flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            <span>
              {activeFleet ? `${activeFleet.name} — ${totalPilots} Pilots` : 'Select a Fleet'}
            </span>
          </div>

          {activeFleet && (
            <form
              onSubmit={(e) => void handleAddMember(e)}
              className="flex flex-wrap items-center gap-2 border-b border-eve-border bg-eve-bg/50 p-2.5 text-xs"
            >
              <select
                value={selectedFitId}
                onChange={(e) => setSelectedFitId(e.target.value)}
                className="min-w-[180px] flex-1 border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
              >
                {savedFits.length === 0 ? (
                  <option value="">Save a fit in Ship Fitter first</option>
                ) : (
                  savedFits.map((fit) => (
                    <option key={fit.id} value={fit.id}>
                      {fit.name} ({fit.shipName})
                    </option>
                  ))
                )}
              </select>

              <select
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                className="border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-accent"
              >
                {FLEET_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="num-mono w-16 border border-eve-border bg-eve-panel px-2 py-1 text-center text-xs text-eve-text"
                title="Target ship count"
              />

              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Role notes..."
                className="w-36 border border-eve-border bg-eve-panel px-2 py-1 text-xs text-eve-text"
              />

              <button
                type="submit"
                disabled={savedFits.length === 0}
                className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 font-semibold text-eve-accent disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Fit
              </button>
            </form>
          )}

          <div className="flex-1 overflow-auto">
            {!activeFleet || activeFleet.members.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
                Add saved ship fittings above and assign fleet roles (FC, DPS, Logi, Miner, Salvager, Tackle, etc.).
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                  <tr className="border-b border-eve-border">
                    <th className="px-3 py-2">Ship / Fit</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2 text-right">Count</th>
                    <th className="px-3 py-2">Notes</th>
                    <th className="px-3 py-2 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/50">
                  {activeFleet.members.map((m) => (
                    <tr key={m.id} className="hover:bg-eve-elevated/50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <EveIcon path={`types/${m.shipTypeId}/icon?size=64`} size={24} alt={m.shipName} />
                          <div>
                            <div className="font-semibold text-eve-text">{m.fitName}</div>
                            <div className="text-[10px] text-eve-muted">{m.shipName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="border border-eve-accent/50 bg-eve-accent-muted px-2 py-0.5 text-[10px] font-bold uppercase text-eve-accent">
                          {m.roleLabel}
                        </span>
                      </td>
                      <td className="num-mono px-3 py-2 text-right font-bold text-eve-text">
                        x{m.quantity}
                      </td>
                      <td className="px-3 py-2 text-eve-muted">{m.notes || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({ kind: 'member', id: m.id })}
                          className="text-eve-muted hover:text-eve-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        title={confirmDelete?.kind === 'fleet' ? 'Delete Fleet Composition' : 'Remove Ship from Fleet'}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          if (confirmDelete.kind === 'fleet') {
            const updated = await window.eveLens.fleets.delete(confirmDelete.id);
            setFleets(updated);
            if (selectedFleetId === confirmDelete.id) setSelectedFleetId(updated[0]?.id ?? null);
          } else {
            setFleets(await window.eveLens.fleets.removeMember(confirmDelete.id));
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

