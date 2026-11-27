import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronDown, ChevronRight, CornerDownRight, Navigation, RefreshCw, Search } from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type { AssetItemDto } from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { SortableHeader, type SortDirection } from '@/core/components/SortableHeader';
import { formatIsk } from '@/core/utils/format';

type AssetSortField = 'typeName' | 'characterName' | 'locationName' | 'quantity' | 'totalValue';

export function AssetsBrowserModule({ activeCharacterId }: ModuleProps) {
  const [assets, setAssets] = useState<AssetItemDto[]>([]);
  const [allCharactersMode, setAllCharactersMode] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<AssetSortField>('totalValue');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [treeMode, setTreeMode] = useState(true);
  const [expandedContainers, setExpandedContainers] = useState<Set<number>>(new Set());
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSetDestination = async (destId: number, label: string) => {
    if (activeCharacterId === null) {
      setStatusMsg('Select a single character in the top bar to set an in-game destination.');
      return;
    }
    try {
      await window.eveLens.nav.setAutopilotWaypoint(activeCharacterId, destId, true, false);
      setStatusMsg(`Autopilot destination set to ${label}.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to set destination');
    }
  };

  const targetCharId = allCharactersMode ? null : activeCharacterId;

  const loadAssets = useCallback(async () => {
    const list = await window.eveLens.assets.list(targetCharId);
    setAssets(list);
  }, [targetCharId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const handleSync = async () => {
    setLoading(true);
    try {
      const list = await window.eveLens.assets.sync(targetCharId);
      setAssets(list);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: AssetSortField) => {
    if (sortBy === field) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(field);
      setSortDir(field === 'typeName' || field === 'characterName' || field === 'locationName' ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? assets.filter(
          (a) =>
            a.typeName.toLowerCase().includes(q) ||
            a.locationName.toLowerCase().includes(q) ||
            a.characterName.toLowerCase().includes(q) ||
            a.groupName.toLowerCase().includes(q)
        )
      : [...assets];

    const mult = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === 'typeName' || sortBy === 'characterName' || sortBy === 'locationName') {
        return a[sortBy].localeCompare(b[sortBy]) * mult;
      }
      return (a[sortBy] - b[sortBy]) * mult;
    });
    return list;
  }, [assets, search, sortBy, sortDir]);

  const totalIsk = useMemo(() => filtered.reduce((s, a) => s + a.totalValue, 0), [filtered]);

  // Build parent -> children map for indented ship/container hierarchy
  const treeRows = useMemo(() => {
    if (!treeMode) {
      return filtered.slice(0, 2000).map((item) => ({ item, depth: 0, childCount: 0 }));
    }
    const qActive = search.trim().length > 0;
    const allById = new Map<number, AssetItemDto>();
    for (const a of assets) allById.set(a.itemId, a);

    // When searching, include matching items plus their ancestor ships/containers so hierarchy stays intact
    const visibleSet = new Set<number>();
    for (const a of filtered) {
      visibleSet.add(a.itemId);
      if (qActive) {
        let curr: AssetItemDto | undefined = a;
        for (let hop = 0; hop < 6 && curr?.parentItemId !== null && curr?.parentItemId !== undefined; hop++) {
          const p = allById.get(curr.parentItemId);
          if (!p) break;
          visibleSet.add(p.itemId);
          curr = p;
        }
      }
    }

    const visibleItems = qActive ? assets.filter((a) => visibleSet.has(a.itemId)) : filtered;
    const childrenByParent = new Map<number, AssetItemDto[]>();
    const roots: AssetItemDto[] = [];
    for (const a of visibleItems) {
      if (a.parentItemId !== null && visibleSet.has(a.parentItemId)) {
        const arr = childrenByParent.get(a.parentItemId) ?? [];
        arr.push(a);
        childrenByParent.set(a.parentItemId, arr);
      } else {
        roots.push(a);
      }
    }

    const out: Array<{ item: AssetItemDto; depth: number; childCount: number }> = [];
    const walk = (node: AssetItemDto, depth: number) => {
      if (out.length >= 2000) return;
      const kids = childrenByParent.get(node.itemId) ?? [];
      out.push({ item: node, depth, childCount: kids.length });
      if (kids.length > 0 && (qActive || expandedContainers.has(node.itemId))) {
        for (const k of kids) walk(k, depth + 1);
      }
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [assets, filtered, treeMode, search, expandedContainers]);

  const expandAllContainers = () => {
    const parents = new Set<number>();
    for (const a of assets) {
      if (a.parentItemId !== null) parents.add(a.parentItemId);
    }
    setExpandedContainers(parents);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4 overflow-hidden">
      <div className="photon-panel flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Boxes className="h-4 w-4 text-eve-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Assets &amp; Valuation
          </span>

          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setAllCharactersMode(false)}
              className={`border px-2.5 py-1 ${
                !allCharactersMode
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted'
              }`}
            >
              Active Pilot
            </button>
            <button
              type="button"
              onClick={() => setAllCharactersMode(true)}
              className={`border px-2.5 py-1 ${
                allCharactersMode
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted'
              }`}
            >
              All Characters (Complete List)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTreeMode((m) => !m)}
            className={`border px-2.5 py-1 text-[11px] font-semibold ${
              treeMode
                ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
            }`}
          >
            {treeMode ? 'Tree View' : 'Flat List'}
          </button>
          {treeMode && (
            <button
              type="button"
              onClick={() =>
                expandedContainers.size > 0
                  ? setExpandedContainers(new Set())
                  : expandAllContainers()
              }
              className="border border-eve-border bg-eve-bg px-2 py-1 text-[11px] text-eve-muted hover:text-eve-text"
            >
              {expandedContainers.size > 0 ? 'Collapse All' : 'Expand All'}
            </button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-eve-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item, location, or pilot..."
              className="w-60 border border-eve-border bg-eve-bg py-1 pl-8 pr-3 text-xs text-eve-text"
            />
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSync()}
            className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold text-eve-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync ESI Assets
          </button>
        </div>
      </div>

      <div className="photon-panel flex min-h-0 flex-1 flex-col">
        <div className="photon-header flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider">
          <span>
            Items ({filtered.length.toLocaleString()})
            {statusMsg && (
              <span className="ml-3 font-normal normal-case text-eve-accent">{statusMsg}</span>
            )}
          </span>
          <span className="num-mono text-eve-accent">Total Value: {formatIsk(totalIsk, true)}</span>
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-xs text-eve-muted">
              Click Sync ESI Assets to load your characters&apos; hangars and items.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-eve-panel text-[10px] uppercase tracking-wider text-eve-muted">
                <tr className="border-b border-eve-border">
                  <SortableHeader label="Item" field="typeName" activeField={sortBy} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Owner" field="characterName" activeField={sortBy} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Location" field="locationName" activeField={sortBy} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Qty" field="quantity" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Est. Value" field="totalValue" activeField={sortBy} direction={sortDir} onSort={handleSort} align="right" />
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eve-border/50">
                {treeRows.map(({ item: a, depth, childCount }) => {
                  const isExpanded = expandedContainers.has(a.itemId);
                  return (
                    <tr
                      key={`${a.characterId}-${a.itemId}`}
                      className={`hover:bg-eve-elevated/50 ${depth > 0 ? 'bg-eve-bg/40' : ''}`}
                    >
                      <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 22}px` }}>
                        <div className="flex items-center gap-1.5">
                          {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-eve-muted" />}
                          {childCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedContainers((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(a.itemId)) next.delete(a.itemId);
                                  else next.add(a.itemId);
                                  return next;
                                });
                              }}
                              className="rounded p-0.5 text-eve-accent hover:bg-eve-elevated"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <EveIcon path={`types/${a.typeId}/icon?size=64`} size={22} alt={a.typeName} />
                          <div>
                            <div className="font-medium text-eve-text">
                              {a.typeName}
                              {childCount > 0 && (
                                <span className="ml-1.5 rounded bg-eve-accent-muted/40 px-1.5 py-0.2 text-[10px] text-eve-accent">
                                  {childCount} inside
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-eve-muted">{a.groupName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-eve-text">{a.characterName}</td>
                      <td className="px-3 py-2 text-eve-muted">
                        {a.locationName} <span className="text-[10px] text-eve-text/70">[{a.locationFlag}]</span>
                      </td>
                      <td className="num-mono px-3 py-2 text-right">{a.quantity.toLocaleString()}</td>
                      <td className="num-mono px-3 py-2 text-right font-semibold text-eve-accent">
                        {a.totalValue > 0 ? formatIsk(a.totalValue) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {a.destinationId !== null && (
                          <button
                            type="button"
                            onClick={() => void handleSetDestination(a.destinationId!, a.locationName)}
                            className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2 py-0.5 text-[10px] text-eve-accent hover:bg-eve-accent/25"
                          >
                            <Navigation className="h-2.5 w-2.5" />
                            Set Dest
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

