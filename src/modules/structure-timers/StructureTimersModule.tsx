import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Clock,
  Fuel,
  Navigation,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2
} from 'lucide-react';
import type { SolarSystemRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type { StructureTimerRow } from '@shared/types/modules-data';
import { ConfirmModal } from '@/core/components/ConfirmModal';

type StructuresTab = 'my-structures' | 'custom-timers';

function formatCountdown(targetMs: number | null, nowMs: number): string {
  if (!targetMs) return '—';
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'EXPIRED';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

export function StructureTimersModule({ activeCharacterId }: ModuleProps) {
  const [activeTab, setActiveTab] = useState<StructuresTab>('my-structures');
  const [structures, setStructures] = useState<StructureTimerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const notifiedAttacksRef = useRef(new Set<string>());

  // Manual war-target / custom timer form
  const [name, setName] = useState('');
  const [structureType, setStructureType] = useState('Astrahus');
  const [sysQuery, setSysQuery] = useState('');
  const [sysHits, setSysHits] = useState<SolarSystemRow[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<SolarSystemRow | null>(null);
  const [timerKind, setTimerKind] = useState('Armor');
  const [expiresInput, setExpiresInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.eveLens.structures.list(activeCharacterId);
      setStructures(list);
      for (const st of list) {
        if (st.source === 'esi' && st.isUnderAttack && !notifiedAttacksRef.current.has(st.id)) {
          notifiedAttacksRef.current.add(st.id);
          void window.eveLens.app.notify(
            `Structure Alert: ${st.name}`,
            `${st.structureType} in ${st.solarSystemName} is ${st.state.replace(/_/g, ' ')}!`
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, [activeCharacterId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedSystem || !expiresInput) return;
    const expiresAt = Date.parse(expiresInput);
    if (!Number.isFinite(expiresAt)) return;

    await window.eveLens.structures.addManual({
      name: name.trim(),
      structureType,
      solarSystemId: selectedSystem.solarSystemId,
      timerKind,
      expiresAt
    });
    setName('');
    setExpiresInput('');
    await load();
  };

  const handleSetDest = async (solarSystemId: number, systemName: string) => {
    if (activeCharacterId === null) {
      setStatusMsg('Select a single character in the top bar to set destination.');
      return;
    }
    try {
      await window.eveLens.nav.setAutopilotWaypoint(activeCharacterId, solarSystemId, true, false);
      setStatusMsg(`Destination set to ${systemName}.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to set destination');
    }
  };

  const myStructures = structures.filter((s) => s.source === 'esi');
  const customTimers = structures.filter((s) => s.source === 'manual');
  const attackedStructures = myStructures.filter((s) => s.isUnderAttack);
  const lowFuelStructures = myStructures.filter((s) => s.isLowFuel);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {/* Header + Tabs */}
      <div className="photon-panel flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <Building2 className="h-4 w-4 text-eve-accent" />
            Structures
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('my-structures')}
              className={`border px-2.5 py-1 text-xs font-semibold ${
                activeTab === 'my-structures'
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              My Structures ({myStructures.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom-timers')}
              className={`inline-flex items-center gap-1 border px-2.5 py-1 text-xs font-semibold ${
                activeTab === 'custom-timers'
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              <Clock className="h-3 w-3" />
              Custom Timers ({customTimers.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {statusMsg && <span className="text-xs text-eve-accent">{statusMsg}</span>}
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold text-eve-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync ESI Structures
          </button>
        </div>
      </div>

      {/* Attack & Low Fuel Warnings */}
      {(attackedStructures.length > 0 || lowFuelStructures.length > 0) && (
        <div className="space-y-1.5">
          {attackedStructures.length > 0 && (
            <div className="flex items-center gap-2 border border-eve-danger/60 bg-eve-danger/15 px-3 py-2 text-xs text-eve-danger">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span className="font-semibold">
                STRUCTURE UNDER ATTACK / REINFORCED ({attackedStructures.length}):
              </span>
              <span className="truncate">
                {attackedStructures
                  .map((s) => `${s.name} (${s.solarSystemName} — ${s.state.replace(/_/g, ' ')})`)
                  .join(', ')}
              </span>
            </div>
          )}
          {lowFuelStructures.length > 0 && (
            <div className="flex items-center gap-2 border border-eve-warning/60 bg-eve-warning/10 px-3 py-2 text-xs text-eve-warning">
              <Fuel className="h-4 w-4 shrink-0" />
              <span className="font-semibold">
                LOW FUEL WARNING (&lt;7 days) ({lowFuelStructures.length}):
              </span>
              <span className="truncate">
                {lowFuelStructures
                  .map((s) => `${s.name} (${formatCountdown(s.fuelExpiresAt, nowMs)})`)
                  .join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {activeTab === 'my-structures' ? (
        <div className="photon-panel flex min-h-0 flex-1 flex-col">
          <div className="photon-header flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            <span>Corporation Owned Structures ({myStructures.length})</span>
            <span className="text-[10px] font-normal normal-case text-eve-muted">
              Requires Station Manager / Director role for ESI corp structure access
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {myStructures.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
                No corporation structures found for the active character. Ensure your character has corp structure permissions and click Sync ESI Structures.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                  <tr className="border-b border-eve-border">
                    <th className="px-3 py-2">Structure</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">System</th>
                    <th className="px-3 py-2">State &amp; Reinforce</th>
                    <th className="px-3 py-2">Timer</th>
                    <th className="px-3 py-2">Fuel Monitor</th>
                    <th className="px-3 py-2">Services</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eve-border/50">
                  {myStructures.map((s) => (
                    <tr
                      key={s.id}
                      className={`hover:bg-eve-elevated/50 ${s.isUnderAttack ? 'bg-eve-danger/5' : ''}`}
                    >
                      <td className="px-3 py-2 font-semibold text-eve-text">
                        <div className="flex items-center gap-2">
                          {s.isUnderAttack && (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-eve-danger" />
                          )}
                          <span>{s.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-eve-muted">{s.corporationName ?? 'My Corp'}</td>
                      <td className="px-3 py-2 text-eve-muted">{s.structureType}</td>
                      <td className="px-3 py-2 text-eve-text">{s.solarSystemName}</td>
                      <td className="px-3 py-2">
                        <div
                          className={`text-[11px] font-semibold uppercase ${
                            s.isUnderAttack ? 'text-eve-danger' : 'text-eve-accent'
                          }`}
                        >
                          {s.state.replace(/_/g, ' ')}
                        </div>
                        {s.reinforceHour !== undefined && (
                          <div className="text-[10px] text-eve-muted">
                            RF: {String(s.reinforceHour).padStart(2, '0')}:00 EVE
                          </div>
                        )}
                      </td>
                      <td className="num-mono px-3 py-2 font-semibold text-eve-text">
                        {formatCountdown(s.expiresAt, nowMs)}
                      </td>
                      <td className="num-mono px-3 py-2">
                        {s.fuelExpiresAt ? (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              s.isLowFuel ? 'font-semibold text-eve-warning' : 'text-eve-success'
                            }`}
                          >
                            <Fuel className="h-3 w-3" />
                            {formatCountdown(s.fuelExpiresAt, nowMs)}
                          </span>
                        ) : (
                          <span className="text-eve-muted">Low Power / No Fuel</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {(s.services ?? []).length === 0 ? (
                            <span className="text-[10px] text-eve-muted">None</span>
                          ) : (
                            (s.services ?? []).map((svc) => (
                              <span
                                key={svc.name}
                                className={`border px-1 py-0 text-[9px] ${
                                  svc.state === 'online'
                                    ? 'border-eve-accent/40 bg-eve-bg text-eve-accent'
                                    : 'border-eve-border bg-eve-bg text-eve-muted line-through'
                                }`}
                              >
                                {svc.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void handleSetDest(s.solarSystemId, s.solarSystemName)}
                          className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2 py-0.5 text-[11px] text-eve-accent"
                        >
                          <Navigation className="h-3 w-3" />
                          Set Dest
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Add Manual War / Custom Timer */}
          <form
            onSubmit={(e) => void handleAddManual(e)}
            className="photon-panel relative z-30 flex flex-wrap items-end gap-2 p-3 text-xs"
          >
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Structure / Target Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hostile Fortizar"
                className="w-44 border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Hull Type</span>
              <select
                value={structureType}
                onChange={(e) => setStructureType(e.target.value)}
                className="border border-eve-border bg-eve-bg px-2 py-1.5 text-xs text-eve-text"
              >
                {[
                  'Astrahus',
                  'Fortizar',
                  'Keepstar',
                  'Athanor',
                  'Tatara',
                  'Raitaru',
                  'Azbel',
                  'Sotiyo',
                  'Metenox Moon Drill',
                  'Ansiblex Jump Gate',
                  'Orbital Skyhook',
                  'Mobile Depot',
                  'Customs Office (POCO)',
                  'Control Tower (POS)',
                  'Sovereignty Hub',
                  'War HQ'
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">System</span>
              <input
                type="text"
                value={sysQuery}
                onChange={async (e) => {
                  const q = e.target.value;
                  setSysQuery(q);
                  setSysHits(q.length >= 2 ? await window.eveLens.sde.searchSystems(q, 8) : []);
                }}
                placeholder="System name..."
                className="w-36 border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
              />
              {sysHits.length > 0 && (
                <div className="photon-panel absolute left-0 right-0 top-full z-30 max-h-40 overflow-y-auto shadow-xl">
                  {sysHits.map((s) => (
                    <button
                      key={s.solarSystemId}
                      type="button"
                      onClick={() => {
                        setSelectedSystem(s);
                        setSysQuery(s.solarSystemName);
                        setSysHits([]);
                      }}
                      className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                    >
                      {s.solarSystemName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Timer Type</span>
              <select
                value={timerKind}
                onChange={(e) => setTimerKind(e.target.value)}
                className="border border-eve-border bg-eve-bg px-2 py-1.5 text-xs text-eve-text"
              >
                <option value="Shield">Shield</option>
                <option value="Armor">Armor</option>
                <option value="Hull">Hull</option>
                <option value="Anchoring">Anchoring</option>
                <option value="War">War / Mutual</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase text-eve-muted">Timer Exit (Local)</span>
              <input
                type="datetime-local"
                value={expiresInput}
                onChange={(e) => setExpiresInput(e.target.value)}
                className="border border-eve-border bg-eve-bg px-2 py-1.5 text-xs text-eve-text"
              />
            </label>

            <button
              type="submit"
              disabled={!name.trim() || !selectedSystem || !expiresInput}
              className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 font-semibold text-eve-accent disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Custom Timer
            </button>
          </form>

          {/* Custom Timers Table */}
          <div className="photon-panel flex min-h-0 flex-1 flex-col">
            <div className="photon-header px-3 py-2 text-xs font-semibold uppercase tracking-wider">
              Custom &amp; War Timers ({customTimers.length})
            </div>
            <div className="flex-1 overflow-auto">
              {customTimers.length === 0 ? (
                <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
                  No custom timers added yet. Add a war or structure timer above.
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                    <tr className="border-b border-eve-border">
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Timer Type</th>
                      <th className="px-3 py-2">Countdown</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-eve-border/50">
                    {customTimers.map((s) => (
                      <tr key={s.id} className="hover:bg-eve-elevated/50">
                        <td className="px-3 py-2 font-semibold text-eve-text">{s.name}</td>
                        <td className="px-3 py-2 text-eve-muted">{s.structureType}</td>
                        <td className="px-3 py-2 text-eve-text">{s.solarSystemName}</td>
                        <td className="px-3 py-2 font-semibold uppercase text-[11px] text-eve-accent">
                          {s.timerKind}
                        </td>
                        <td className="num-mono px-3 py-2 font-semibold text-eve-text">
                          {formatCountdown(s.expiresAt, nowMs)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleSetDest(s.solarSystemId, s.solarSystemName)}
                              className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2 py-0.5 text-[11px] text-eve-accent"
                            >
                              <Navigation className="h-3 w-3" />
                              Set Dest
                            </button>
                            {s.manualId && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(s.manualId!)}
                                className="border border-eve-border p-1 text-eve-muted hover:text-eve-danger"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Delete Custom Timer"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (confirmDeleteId !== null) {
            await window.eveLens.structures.deleteManual(confirmDeleteId);
            await load();
          }
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
