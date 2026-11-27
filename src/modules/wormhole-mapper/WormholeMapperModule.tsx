import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ClipboardPaste, GitBranch, Plus, Trash2 } from 'lucide-react';
import type { SolarSystemRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type { WhEdgeDto, WhNodeDto, WhSignatureDto } from '@shared/types/modules-data';
import { ConfirmModal } from '@/core/components/ConfirmModal';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';

export function WormholeMapperModule({ activeCharacterId, incomingClipboard }: ModuleProps) {
  const [mapId, setMapId] = useState<number>(1);
  const [whNodes, setWhNodes] = useState<WhNodeDto[]>([]);
  const [whEdges, setWhEdges] = useState<WhEdgeDto[]>([]);
  const [signatures, setSignatures] = useState<WhSignatureDto[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<WhEdgeDto | null>(null);
  const [autoTrack, setAutoTrack] = useState(true);
  const [trackedLocations, setTrackedLocations] = useState<Array<{ characterId: number; solarSystemId: number }>>([]);

  // Eveeye-style node display options
  const [showClass, setShowClass] = useState(true);
  const [showEffect, setShowEffect] = useState(true);
  const [showStatics, setShowStatics] = useState(true);
  const [showSigs, setShowSigs] = useState(true);
  const [showPilots, setShowPilots] = useState(true);

  const [addSysQuery, setAddSysQuery] = useState('');
  const [addSysHits, setAddSysHits] = useState<SolarSystemRow[]>([]);
  const [sigText, setSigText] = useState('');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const refreshMap = useCallback(async (id: number) => {
    const state = await window.eveLens.wh.getMapState(id);
    setWhNodes(state.nodes);
    setWhEdges(state.edges);
    setSignatures(state.signatures);
    if (state.nodes.length > 0) {
      setSelectedSystemId((prev) => prev ?? state.nodes[0].solarSystemId);
    }
  }, []);

  useEffect(() => {
    void window.eveLens.wh.listMaps().then((maps) => {
      if (maps[0]) {
        setMapId(maps[0].id);
        void refreshMap(maps[0].id);
      }
    });
  }, [refreshMap]);

  // 5-second auto-location polling for active character only
  useEffect(() => {
    if (!autoTrack || activeCharacterId === null) return;
    const poll = async () => {
      const res = await window.eveLens.wh.pollLocations(mapId, activeCharacterId);
      setTrackedLocations(res.trackedLocations);
      await refreshMap(mapId);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(timer);
  }, [autoTrack, mapId, activeCharacterId, refreshMap]);

  const handleSaveSignatures = useCallback(
    async (raw: string, sysId: number | null) => {
      if (!sysId) return;
      const parsed = parseEveClipboard(raw);
      if (parsed.format !== 'signatures') return;
      await window.eveLens.wh.saveSignatures(mapId, sysId, parsed.entries);
      await refreshMap(mapId);
    },
    [mapId, refreshMap]
  );

  useEffect(() => {
    if (incomingClipboard && incomingClipboard.format === 'signatures' && selectedSystemId) {
      setSigText(incomingClipboard.raw);
      void handleSaveSignatures(incomingClipboard.raw, selectedSystemId);
    }
  }, [incomingClipboard, selectedSystemId, handleSaveSignatures]);

  const rfNodes = useMemo<Node[]>(() => {
    return whNodes.map((n) => {
        const isJ = /^J\d{6}$/i.test(n.solarSystemName);
        const sigCount = signatures.filter((s) => s.solarSystemId === n.solarSystemId).length;
        const pilotCount = trackedLocations.filter((t) => t.solarSystemId === n.solarSystemId).length;
        return {
          id: String(n.solarSystemId),
          position: { x: n.posX, y: n.posY },
          data: {
            label: (
              <div className="w-[156px] space-y-0.5 overflow-hidden text-left">
                <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-eve-text">
                  <span className="truncate">{n.solarSystemName}</span>
                  {showClass && (
                    <span className="shrink-0 border border-eve-accent/40 bg-eve-accent-muted px-1 text-[10px] text-eve-accent">
                      {isJ ? (n.wormholeClass ? `C${n.wormholeClass}` : 'WH') : n.security.toFixed(1)}
                    </span>
                  )}
                </div>
                {showEffect && n.wormholeEffect && (
                  <div className="truncate text-[10px] text-eve-warning">{n.wormholeEffect}</div>
                )}
                {showStatics && n.statics && (
                  <div className="num-mono truncate text-[10px] text-sky-300">{n.statics}</div>
                )}
                {(showSigs || showPilots) && (
                  <div className="flex items-center justify-between text-[9px] text-eve-muted">
                    {showSigs ? <span>{sigCount} sigs</span> : <span />}
                    {showPilots && pilotCount > 0 && (
                      <span className="font-semibold text-eve-success">{pilotCount} here</span>
                    )}
                  </div>
                )}
              </div>
            )
          },
          style: {
            background: '#131822',
            border:
              selectedSystemId === n.solarSystemId
                ? '1px solid var(--eve-accent)'
                : '1px solid #232D3F',
            borderRadius: 2,
            padding: 8
          }
        };
      });
  }, [whNodes, signatures, trackedLocations, selectedSystemId, showClass, showEffect, showStatics, showSigs, showPilots]);

  const rfEdges = useMemo<Edge[]>(() => {
    return whEdges.map((e) => {
      const stroke =
        e.massStatus === 'critical'
          ? '#EF4444'
          : e.massStatus === 'reduced'
            ? '#F59E0B'
            : '#00F0FF';
      return {
        id: String(e.id),
        source: String(e.sourceSystemId),
        target: String(e.targetSystemId),
        label: `${e.whType} (${e.massStatus}${e.timeStatus === 'eol' ? ' · EOL' : ''})`,
        animated: e.timeStatus === 'eol',
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        style: { stroke }
      };
    });
  }, [whEdges]);

  const activeSigs = signatures.filter((s) => s.solarSystemId === selectedSystemId);
  const activeNode = whNodes.find((n) => n.solarSystemId === selectedSystemId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel px-4 py-2">
        <div className="flex items-center gap-3">
          <GitBranch className="h-4 w-4 text-eve-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Wormhole Chain Mapper
          </span>
          <div className="relative">
            <input
              type="text"
              value={addSysQuery}
              onChange={async (e) => {
                const q = e.target.value;
                setAddSysQuery(q);
                if (q.length >= 2) {
                  const hits = await window.eveLens.sde.searchSystems(q, 20);
                  setAddSysHits(hits.filter((s) => /^J\d{6}$/i.test(s.solarSystemName)).slice(0, 8));
                } else {
                  setAddSysHits([]);
                }
              }}
              placeholder="Add system node..."
              className="w-44 border border-eve-border bg-eve-bg px-2.5 py-1 text-xs text-eve-text"
            />
            {addSysHits.length > 0 && (
              <div className="photon-panel absolute left-0 right-0 top-full z-30 max-h-44 overflow-y-auto shadow-xl">
                {addSysHits.map((s) => (
                  <button
                    key={s.solarSystemId}
                    type="button"
                    onClick={async () => {
                      await window.eveLens.wh.addNode(
                        mapId,
                        s.solarSystemId,
                        120 + whNodes.length * 40,
                        120 + (whNodes.length % 3) * 80
                      );
                      setAddSysQuery('');
                      setAddSysHits([]);
                      setSelectedSystemId(s.solarSystemId);
                      await refreshMap(mapId);
                    }}
                    className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                  >
                    <Plus className="h-3 w-3 text-eve-accent" />
                    {s.solarSystemName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 border border-eve-border bg-eve-bg px-2 py-1 text-[10px] text-eve-muted">
            <span className="uppercase">Node:</span>
            {(
              [
                ['Class', showClass, setShowClass],
                ['Effect', showEffect, setShowEffect],
                ['Statics', showStatics, setShowStatics],
                ['Sigs', showSigs, setShowSigs],
                ['Pilots', showPilots, setShowPilots]
              ] as Array<[string, boolean, (v: boolean) => void]>
            ).map(([label, val, setter]) => (
              <label key={label} className="inline-flex cursor-pointer items-center gap-1 text-eve-text">
                <input
                  type="checkbox"
                  checked={val}
                  onChange={(e) => setter(e.target.checked)}
                  className="accent-[var(--eve-accent)]"
                />
                {label}
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAutoTrack((v) => !v)}
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
              autoTrack
                ? 'border-eve-success/60 bg-eve-success/10 text-eve-success'
                : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${autoTrack ? 'bg-eve-success' : 'bg-eve-muted'}`} />
            {autoTrack ? 'Auto-Track ON' : 'Auto-Track OFF'}
          </button>

          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2.5 py-1 text-xs text-eve-muted hover:border-eve-danger/60 hover:text-eve-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Chain
          </button>
        </div>
      </div>

      {/* React Flow Graph + Signatures Sidebar */}
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 bg-eve-bg">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodeClick={(_e, node) => {
              setSelectedSystemId(Number(node.id));
              setSelectedEdge(null);
            }}
            onEdgeClick={(_e, edge) => {
              const found = whEdges.find((x) => String(x.id) === edge.id) ?? null;
              setSelectedEdge(found);
            }}
            onNodeDragStop={(_e, node) => {
              void window.eveLens.wh.updateNodePosition(
                mapId,
                Number(node.id),
                node.position.x,
                node.position.y
              );
            }}
            fitView
          >
            <Background color="#232D3F" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-eve-border bg-eve-panel p-3 text-xs">
          {selectedEdge && (
            <div className="space-y-2 border border-eve-border bg-eve-bg p-2.5">
              <div className="font-semibold uppercase text-eve-accent">Connection Status</div>
              <div className="flex gap-1.5">
                {(['stable', 'reduced', 'critical'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={async () => {
                      await window.eveLens.wh.updateEdgeStatus(selectedEdge.id, { massStatus: m });
                      await refreshMap(mapId);
                    }}
                    className={`flex-1 border py-1 text-[10px] uppercase ${
                      selectedEdge.massStatus === m
                        ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                        : 'border-eve-border text-eve-muted'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={async () => {
                  const next = selectedEdge.timeStatus === 'eol' ? 'normal' : 'eol';
                  await window.eveLens.wh.updateEdgeStatus(selectedEdge.id, { timeStatus: next });
                  await refreshMap(mapId);
                }}
                className="w-full border border-eve-warning/50 py-1 text-[11px] text-eve-warning"
              >
                Toggle EOL ({selectedEdge.timeStatus.toUpperCase()})
              </button>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-eve-border pb-2">
            <span className="font-semibold uppercase tracking-wider">
              {activeNode ? `${activeNode.solarSystemName} Sigs` : 'Cosmic Signatures'}
            </span>
            <button
              type="button"
              onClick={async () => {
                const txt = await window.eveLens.clipboard.readText();
                setSigText(txt);
                void handleSaveSignatures(txt, selectedSystemId);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
            >
              <ClipboardPaste className="h-3 w-3" />
              Paste Sigs
            </button>
          </div>

          <textarea
            rows={3}
            value={sigText}
            onChange={(e) => setSigText(e.target.value)}
            placeholder="ABC-123	Cosmic Signature	Wormhole..."
            className="w-full resize-none border border-eve-border bg-eve-bg p-2 font-mono text-[11px] text-eve-text"
          />
          <button
            type="button"
            disabled={!selectedSystemId || !sigText.trim()}
            onClick={() => void handleSaveSignatures(sigText, selectedSystemId)}
            className="border border-eve-accent/60 bg-eve-accent-muted py-1 text-[11px] font-semibold uppercase text-eve-accent disabled:opacity-40"
          >
            Save Signatures
          </button>

          <div className="flex-1 divide-y divide-eve-border/50 overflow-y-auto">
            {activeSigs.map((s) => (
              <div key={s.sigId} className="min-w-0 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="num-mono shrink-0 font-bold text-eve-accent">{s.sigId}</span>
                  <span className="truncate text-[10px] text-eve-muted">{s.sigType || s.sigGroup}</span>
                </div>
                {s.name && <div className="truncate text-[11px] text-eve-text">{s.name}</div>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={confirmClearOpen}
        title="Clear Wormhole Chain"
        message="Are you sure? This will clear all mapped wormholes, connections, and signatures in this chain!"
        confirmLabel="Clear Chain"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          await window.eveLens.wh.clearMap(mapId);
          setSelectedSystemId(null);
          setSelectedEdge(null);
          await refreshMap(mapId);
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}
