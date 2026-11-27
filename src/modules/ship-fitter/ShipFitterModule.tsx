import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Cpu,
  Download,
  Flame,
  GitCompareArrows,
  Info,
  Plus,
  Power,
  Save,
  Search,
  Shield,
  ShoppingCart,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type { InvTypeRow } from '@shared/types/esi';
import type { ModuleProps } from '@shared/types/module';
import type {
  FittingModuleDetail,
  FittingSlotItem,
  FittingStatsDto,
  SavedFittingRow
} from '@shared/types/modules-data';
import { EveIcon } from '@/core/components/EveIcon';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';
import { formatIsk } from '@/core/utils/format';

type TopBrowserTab = 'hulls' | 'modules' | 'charges';
type SlotFilterTab = 'all' | 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone';
type SlotKind = 'high' | 'mid' | 'low' | 'rig' | 'subsystem';

interface BrowseModuleItem {
  typeId: number;
  groupId: number;
  typeName: string;
  groupName: string;
  eveCategory: string;
  subCategory: string;
  slotKind: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge';
  categoryId: number;
  marketGroupId: number | null;
}

const FIT_LABELS = ['DPS', 'Tank', 'Miner', 'PvP', 'PvE', 'Exploration', 'Logistics', 'Hauler', 'Other'] as const;

const TRADE_HUBS = [
  { id: 10000002, name: 'Jita' },
  { id: 10000043, name: 'Amarr' },
  { id: 10000042, name: 'Hek' },
  { id: 10000030, name: 'Rens' },
  { id: 10000032, name: 'Dodixie' }
] as const;

const VB_MIN = 24;
const VB_SIZE = 464;
const CX = 256;
const CY = 256;
const SLOT_R = 182;
const GAUGE_R = 224;

function polarTopDeg(cx: number, cy: number, r: number, clockDeg: number) {
  const rad = ((clockDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeClockArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarTopDeg(cx, cy, r, startDeg);
  const end = polarTopDeg(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg >= startDeg ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function rangeAngles(count: number, startDeg: number, endDeg: number) {
  if (count <= 1) return [(startDeg + endDeg) / 2];
  return Array.from({ length: count }, (_, i) => startDeg + ((endDeg - startDeg) * i) / (count - 1));
}

const HIGH_ANGLES = rangeAngles(8, -36.5, 33.5);
const MID_ANGLES = rangeAngles(8, 53, 123);
const LOW_ANGLES = rangeAngles(8, 142, 214);
const RIG_ANGLES = [-74, -63.5, -53];
const SUB_ANGLES = rangeAngles(4, -128, -90);

function getResourceState(used: number, max: number) {
  const rawPct = max > 0 ? (used / max) * 100 : used > 0 ? 101 : 0;
  const over = used > max;
  const pct = Math.min(100, Math.max(0, rawPct));
  if (over) {
    return { over: true, pct: 100, stroke: '#ef4444', textClass: 'text-red-400', barClass: 'bg-red-500' };
  }
  if (rawPct >= 90) {
    return { over: false, pct, stroke: '#f97316', textClass: 'text-orange-400', barClass: 'bg-orange-500' };
  }
  if (rawPct >= 75) {
    return { over: false, pct, stroke: '#eab308', textClass: 'text-yellow-300', barClass: 'bg-yellow-400' };
  }
  return { over: false, pct, stroke: '#22c55e', textClass: 'text-emerald-400', barClass: 'bg-emerald-400' };
}

function formatDurationSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const ACTIVE_FIT_STORAGE_KEY = 'new-eden-lens:active-fit:v1';
const FIT_TABS_STORAGE_KEY = 'new-eden-lens:fit-tabs:v1';
const MAX_FIT_TABS = 3;

interface FitTabState {
  id: string;
  fitName: string;
  shipTypeId: number;
  items: FittingSlotItem[];
  skillMode: 'character' | '0' | '1' | '2' | '3' | '4' | '5';
  priceRegionId: number;
}

function loadInitialTabs(): { tabs: FitTabState[]; activeId: string } {
  try {
    const rawTabs = localStorage.getItem(FIT_TABS_STORAGE_KEY);
    if (rawTabs) {
      const parsed = JSON.parse(rawTabs) as { tabs?: FitTabState[]; activeId?: string };
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        const tabs = parsed.tabs.slice(0, MAX_FIT_TABS);
        const activeId = tabs.some((t) => t.id === parsed.activeId) ? parsed.activeId! : tabs[0].id;
        return { tabs, activeId };
      }
    }
    const rawSingle = localStorage.getItem(ACTIVE_FIT_STORAGE_KEY);
    const single = rawSingle ? (JSON.parse(rawSingle) as Partial<FitTabState>) : {};
    const tab: FitTabState = {
      id: 'tab-1',
      fitName: single.fitName ?? 'New Fit',
      shipTypeId: single.shipTypeId ?? 17715,
      items: single.items ?? [],
      skillMode: single.skillMode ?? 'character',
      priceRegionId: single.priceRegionId ?? 10000002
    };
    return { tabs: [tab], activeId: tab.id };
  } catch {
    const fallback: FitTabState = {
      id: 'tab-1',
      fitName: 'New Fit',
      shipTypeId: 17715,
      items: [],
      skillMode: 'character',
      priceRegionId: 10000002
    };
    return { tabs: [fallback], activeId: fallback.id };
  }
}

export function ShipFitterModule({ activeCharacterId, incomingClipboard }: ModuleProps) {
  const initialWorkspace = useMemo(() => loadInitialTabs(), []);
  const [fitTabs, setFitTabs] = useState<FitTabState[]>(initialWorkspace.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(initialWorkspace.activeId);
  const activeTab = useMemo(
    () => fitTabs.find((t) => t.id === activeTabId) ?? fitTabs[0],
    [fitTabs, activeTabId]
  );

  const [fitName, setFitName] = useState(activeTab.fitName);
  const [shipTypeId, setShipTypeId] = useState<number>(activeTab.shipTypeId);
  const [items, setItems] = useState<FittingSlotItem[]>(activeTab.items);
  const [stats, setStats] = useState<FittingStatsDto | null>(null);
  const [savedFits, setSavedFits] = useState<SavedFittingRow[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [skillMode, setSkillMode] = useState<'character' | '0' | '1' | '2' | '3' | '4' | '5'>(
    activeTab.skillMode
  );
  const [priceRegionId, setPriceRegionId] = useState<number>(activeTab.priceRegionId);
  const [simImplants, setSimImplants] = useState<InvTypeRow[]>([]);
  const [implantModalOpen, setImplantModalOpen] = useState(false);
  const [implantQuery, setImplantQuery] = useState('');
  const [implantHits, setImplantHits] = useState<InvTypeRow[]>([]);

  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [buyAllOpen, setBuyAllOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState<string>('DPS');
  const [saveDescription, setSaveDescription] = useState('');
  const [pendingEftRaw, setPendingEftRaw] = useState<string | null>(null);
  const [pendingShipSelect, setPendingShipSelect] = useState<{
    shipTypeId: number;
    fitName: string;
    items: FittingSlotItem[];
    label: string;
  } | null>(null);
  const [stripConfirmOpen, setStripConfirmOpen] = useState(false);
  const [hullSubTab, setHullSubTab] = useState<'new' | 'saved'>('new');
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareTarget, setCompareTarget] = useState<string>('');
  const [compareStats, setCompareStats] = useState<FittingStatsDto | null>(null);
  const [bonusOpen, setBonusOpen] = useState(false);

  // Keep active tab synced in fitTabs & localStorage
  useEffect(() => {
    setFitTabs((prev) => {
      const next = prev.map((t) =>
        t.id === activeTabId
          ? { ...t, fitName, shipTypeId, items, skillMode, priceRegionId }
          : t
      );
      try {
        localStorage.setItem(FIT_TABS_STORAGE_KEY, JSON.stringify({ tabs: next, activeId: activeTabId }));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, [activeTabId, fitName, shipTypeId, items, skillMode, priceRegionId]);

  const switchFitTab = (tabId: string) => {
    if (tabId === activeTabId) return;
    const nextTab = fitTabs.find((t) => t.id === tabId);
    if (!nextTab) return;
    setActiveTabId(nextTab.id);
    setFitName(nextTab.fitName);
    setShipTypeId(nextTab.shipTypeId);
    setItems(nextTab.items);
    setSkillMode(nextTab.skillMode);
    setPriceRegionId(nextTab.priceRegionId);
  };

  const addNewFitTab = () => {
    if (fitTabs.length >= MAX_FIT_TABS) return;
    const newId = `tab-${Date.now()}`;
    const newTab: FitTabState = {
      id: newId,
      fitName: `New Fit ${fitTabs.length + 1}`,
      shipTypeId,
      items: [],
      skillMode,
      priceRegionId
    };
    setFitTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setFitName(newTab.fitName);
    setShipTypeId(newTab.shipTypeId);
    setItems([]);
  };

  const closeFitTab = (tabId: string) => {
    if (fitTabs.length <= 1) return;
    const remaining = fitTabs.filter((t) => t.id !== tabId);
    setFitTabs(remaining);
    if (tabId === activeTabId) {
      const fallback = remaining[0];
      setActiveTabId(fallback.id);
      setFitName(fallback.fitName);
      setShipTypeId(fallback.shipTypeId);
      setItems(fallback.items);
      setSkillMode(fallback.skillMode);
      setPriceRegionId(fallback.priceRegionId);
    }
  };

  useEffect(() => {
    if (!compareOpen || !compareTarget) {
      setCompareStats(null);
      return;
    }
    let shipId: number | null = null;
    let cmpItems: FittingSlotItem[] = [];
    if (compareTarget.startsWith('tab:')) {
      const tid = compareTarget.slice(4);
      const t = fitTabs.find((x) => x.id === tid);
      if (t) {
        shipId = t.shipTypeId;
        cmpItems = t.items;
      }
    } else if (compareTarget.startsWith('saved:')) {
      const sid = Number(compareTarget.slice(6));
      const f = savedFits.find((x) => x.id === sid);
      if (f) {
        shipId = f.shipTypeId;
        cmpItems = f.items;
      }
    }
    if (!shipId) return;
    let cancelled = false;
    const override = skillMode === 'character' ? null : Number(skillMode);
    void window.eveLens.fitting
      .simulate(shipId, cmpItems, activeCharacterId, {
        skillOverrideLevel: override,
        implantTypeIds: simImplants.map((i) => i.typeId),
        priceRegionId
      })
      .then((res) => {
        if (!cancelled) setCompareStats(res);
      });
    return () => {
      cancelled = true;
    };
  }, [compareOpen, compareTarget, fitTabs, savedFits, activeCharacterId, skillMode, simImplants, priceRegionId]);
  const [chargePickerTarget, setChargePickerTarget] = useState<{
    slot: FittingSlotItem['slot'];
    indexInSlot: number;
    moduleItem: FittingSlotItem;
    charges: BrowseModuleItem[];
  } | null>(null);

  const [topTab, setTopTab] = useState<TopBrowserTab>('modules');
  const [slotFilter, setSlotFilter] = useState<SlotFilterTab>('all');
  const [hullRestricted, setHullRestricted] = useState(true);
  const [browserQuery, setBrowserQuery] = useState('');
  const [browserItems, setBrowserItems] = useState<BrowseModuleItem[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [highlightedTypeId, setHighlightedTypeId] = useState<number | null>(null);
  const highlightRowRef = useRef<HTMLDivElement | null>(null);

  const [hullQuery, setHullQuery] = useState('');
  const [hullHits, setHullHits] = useState<InvTypeRow[]>([]);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    const list = await window.eveLens.fitting.list(activeCharacterId);
    setSavedFits(list);
  }, [activeCharacterId]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const recalc = useCallback(async () => {
    const override = skillMode === 'character' ? null : Number(skillMode);
    const s = await window.eveLens.fitting.simulate(shipTypeId, items, activeCharacterId, {
      skillOverrideLevel: override,
      implantTypeIds: simImplants.map((i) => i.typeId),
      priceRegionId
    });
    setStats(s);
  }, [shipTypeId, items, activeCharacterId, skillMode, simImplants, priceRegionId]);

  useEffect(() => {
    void recalc();
  }, [recalc]);

  const fittedTypeIds = useMemo(
    () => items.filter((i) => i.slot !== 'cargo' && i.slot !== 'drone').map((i) => i.typeId),
    [items]
  );

  useEffect(() => {
    if (topTab === 'hulls') return;
    let cancelled = false;
    const queryTab = topTab === 'charges' ? 'charge' : slotFilter;
    void window.eveLens.fitting
      .browseModules(queryTab, browserQuery, shipTypeId, hullRestricted, fittedTypeIds)
      .then((list) => {
        if (cancelled) return;
        setBrowserItems(list);
        if (browserQuery.trim().length >= 2) {
          setExpandedGroups(new Set(list.map((i) => i.eveCategory)));
          setExpandedSubs(new Set(list.map((i) => `${i.eveCategory}::${i.subCategory}`)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [topTab, slotFilter, browserQuery, shipTypeId, hullRestricted, fittedTypeIds]);

  // Expand & scroll to highlighted module when "Find in Browser" is clicked
  useEffect(() => {
    if (!highlightedTypeId) return;
    const match = browserItems.find((i) => i.typeId === highlightedTypeId);
    if (!match) return;
    setExpandedGroups((prev) => new Set([...prev, match.eveCategory]));
    setExpandedSubs((prev) => new Set([...prev, `${match.eveCategory}::${match.subCategory}`]));
    requestAnimationFrame(() => {
      highlightRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [highlightedTypeId, browserItems]);

  // 2-level tree: Category -> Subcategory -> Items
  const groupedBrowser = useMemo(() => {
    const catMap = new Map<string, Map<string, BrowseModuleItem[]>>();
    for (const it of browserItems) {
      const cat = it.eveCategory || it.groupName;
      const sub = it.subCategory || it.groupName;
      let subMap = catMap.get(cat);
      if (!subMap) {
        subMap = new Map();
        catMap.set(cat, subMap);
      }
      const arr = subMap.get(sub) ?? [];
      arr.push(it);
      subMap.set(sub, arr);
    }
    return Array.from(catMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, subMap]) => ({
        cat,
        totalCount: Array.from(subMap.values()).reduce((s, a) => s + a.length, 0),
        subs: Array.from(subMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      }));
  }, [browserItems]);

  const executeImportEft = useCallback(async (raw: string) => {
    const engineParsed = await window.eveLens.fitting.parseEft(raw);
    if (engineParsed) {
      setFitName(engineParsed.fitName);
      setShipTypeId(engineParsed.shipTypeId);
      setItems(engineParsed.items);
      setStatusMsg(`Imported ${engineParsed.shipName} (${engineParsed.fitName}).`);
      return;
    }

    const parsed = parseEveClipboard(raw);
    if (parsed.format !== 'eft') return;

    const allNames = [
      parsed.shipName,
      ...parsed.lines.map((l) => l.name),
      ...parsed.lines.map((l) => l.charge).filter((c): c is string => Boolean(c))
    ];
    const lookup = await window.eveLens.sde.lookupTypesByNames(allNames);
    const ship = lookup[parsed.shipName.toLowerCase()];
    if (!ship) {
      setStatusMsg(`Ship "${parsed.shipName}" not found in local SDE.`);
      return;
    }

    const resolvedItems: FittingSlotItem[] = [];
    for (const line of parsed.lines) {
      const mod = lookup[line.name.toLowerCase()];
      if (!mod) continue;
      const chargeType = line.charge ? lookup[line.charge.toLowerCase()] : undefined;
      const g = mod.groupName?.toLowerCase() ?? '';
      const slot: FittingSlotItem['slot'] = line.quantity
        ? mod.categoryId === 18
          ? 'drone'
          : 'cargo'
        : g.includes('rig')
          ? 'rig'
          : g.includes('subsystem')
            ? 'subsystem'
            : g.includes('shield') ||
                g.includes('propulsion') ||
                g.includes('afterburner') ||
                g.includes('microwarp') ||
                g.includes('sensor') ||
                g.includes('cap')
              ? 'mid'
              : g.includes('armor') ||
                  g.includes('damage control') ||
                  g.includes('ballistic') ||
                  g.includes('gyrostabilizer') ||
                  g.includes('heat sink') ||
                  g.includes('drone damage')
                ? 'low'
                : 'high';
      resolvedItems.push({
        typeId: mod.typeId,
        typeName: mod.typeName,
        slot,
        quantity: line.quantity ?? 1,
        offline: line.offline,
        activeCount: slot === 'drone' ? 0 : undefined,
        chargeTypeId: chargeType?.typeId,
        chargeName: chargeType?.typeName
      });
    }

    setFitName(parsed.fitName);
    setShipTypeId(ship.typeId);
    setItems(resolvedItems);
    setStatusMsg(`Imported ${parsed.shipName} (${parsed.fitName}).`);
  }, []);

  const importEft = useCallback(
    async (raw: string) => {
      const parsed = parseEveClipboard(raw);
      if (parsed.format !== 'eft') {
        setStatusMsg('Clipboard does not contain a valid EFT fitting.');
        return;
      }
      if (items.length > 0) {
        setPendingEftRaw(raw);
        return;
      }
      await executeImportEft(raw);
    },
    [items.length, executeImportEft]
  );

  useEffect(() => {
    if (incomingClipboard && incomingClipboard.format === 'eft') {
      void importEft(incomingClipboard.raw);
    }
  }, [incomingClipboard, importEft]);

  const exportEftText = () => {
    const shipTitle = stats?.shipName ?? 'Ship';
    const lines = [`[${shipTitle}, ${fitName}]`];
    for (const slot of ['low', 'mid', 'high', 'rig', 'subsystem'] as const) {
      for (const it of items.filter((i) => i.slot === slot)) {
        const chargePart = it.chargeName ? `, ${it.chargeName}` : '';
        lines.push(`${it.typeName}${chargePart}${it.offline ? ' /OFFLINE' : ''}`);
      }
      lines.push('');
    }
    for (const dr of items.filter((i) => i.slot === 'drone')) {
      lines.push(`${dr.typeName} x${dr.quantity}`);
    }
    if (items.some((i) => i.slot === 'cargo')) {
      lines.push('');
      for (const cg of items.filter((i) => i.slot === 'cargo')) {
        lines.push(`${cg.typeName} x${cg.quantity}`);
      }
    }
    return lines.join('\n').trim();
  };

  const handleCopyEft = async () => {
    await window.eveLens.clipboard.writeText(exportEftText());
    setStatusMsg('Copied EFT fitting to clipboard.');
  };

  const handleSaveLocal = async () => {
    const desc = saveDescription.trim() ? `[${saveLabel}] ${saveDescription.trim()}` : `[${saveLabel}]`;
    const list = await window.eveLens.fitting.save({
      characterId: activeCharacterId,
      name: fitName,
      shipTypeId,
      description: desc,
      eftText: exportEftText(),
      items
    });
    setSavedFits(list);
    setSaveModalOpen(false);
    setStatusMsg(`Saved "${fitName}" [${saveLabel}] to local SQLite.`);
  };

  const fitItemToSlot = (
    mod: { typeId: number; typeName: string },
    targetSlot: FittingSlotItem['slot'],
    replaceIndex?: number
  ) => {
    const maxMap: Record<'high' | 'mid' | 'low' | 'rig', number> = {
      high: stats?.highSlots ?? 4,
      mid: stats?.midSlots ?? 4,
      low: stats?.lowSlots ?? 4,
      rig: stats?.rigSlots ?? 3
    };

    if (targetSlot === 'drone' || targetSlot === 'cargo') {
      setItems((prev) => {
        const existing = prev.find((i) => i.slot === targetSlot && i.typeId === mod.typeId);
        if (existing) {
          return prev.map((i) =>
            i === existing ? { ...i, quantity: i.quantity + (targetSlot === 'drone' ? 1 : 100) } : i
          );
        }
        return [
          ...prev,
          {
            typeId: mod.typeId,
            typeName: mod.typeName,
            slot: targetSlot,
            quantity: targetSlot === 'drone' ? 1 : 100,
            activeCount: targetSlot === 'drone' ? 0 : undefined
          }
        ];
      });
      return;
    }

    const currentInSlot = items.filter((i) => i.slot === targetSlot);
    const maxForSlot = targetSlot in maxMap ? maxMap[targetSlot as keyof typeof maxMap] : 8;

    if (replaceIndex !== undefined && currentInSlot[replaceIndex]) {
      const targetItem = currentInSlot[replaceIndex];
      setItems((prev) =>
        prev.map((i) =>
          i === targetItem
            ? { ...i, typeId: mod.typeId, typeName: mod.typeName, chargeTypeId: undefined, chargeName: undefined }
            : i
        )
      );
      return;
    }

    if (currentInSlot.length >= maxForSlot) {
      setStatusMsg(`No free ${targetSlot.toUpperCase()} slots remaining (${maxForSlot}/${maxForSlot}).`);
      return;
    }

    setItems((prev) => [
      ...prev,
      { typeId: mod.typeId, typeName: mod.typeName, slot: targetSlot, quantity: 1 }
    ]);
  };

  const loadChargeIntoSlot = (
    charge: { typeId: number; typeName: string },
    targetSlot: FittingSlotItem['slot'],
    indexInSlot?: number
  ) => {
    if (indexInSlot === undefined) return;
    const currentInSlot = items.filter((i) => i.slot === targetSlot);
    const targetItem = currentInSlot[indexInSlot];
    if (!targetItem) {
      setStatusMsg('Fit a module in that slot before loading ammo/charges.');
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i === targetItem ? { ...i, chargeTypeId: charge.typeId, chargeName: charge.typeName } : i
      )
    );
    setStatusMsg(`Loaded ${charge.typeName} into ${targetItem.typeName}.`);
  };

  const loadChargeIntoRack = async (charge: { typeId: number; typeName: string }) => {
    const fittedMods = items.filter((i) => i.slot === 'high' || i.slot === 'mid' || i.slot === 'low');
    const compatibleTypeIds = new Set<number>();
    for (const m of fittedMods) {
      const compat = await window.eveLens.fitting.browseModules('charge', '', shipTypeId, true, [m.typeId]);
      if (compat.some((c) => c.typeId === charge.typeId)) {
        compatibleTypeIds.add(m.typeId);
      }
    }
    if (compatibleTypeIds.size === 0) {
      setStatusMsg(`No fitted module on this ship accepts ${charge.typeName}.`);
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        compatibleTypeIds.has(i.typeId)
          ? { ...i, chargeTypeId: charge.typeId, chargeName: charge.typeName }
          : i
      )
    );
    setStatusMsg(`Loaded ${charge.typeName} into all compatible modules.`);
  };

  const openChargePicker = async (slot: FittingSlotItem['slot'], indexInSlot: number, mod: FittingSlotItem) => {
    const charges = await window.eveLens.fitting.browseModules('charge', '', shipTypeId, true, [mod.typeId]);
    if (charges.length === 0) {
      setStatusMsg(`${mod.typeName} does not use charges.`);
      return;
    }
    setChargePickerTarget({ slot, indexInSlot, moduleItem: mod, charges });
  };

  // Turning off a module puts it in online/inactive state (still uses CPU/PG, just not cycling)
  const toggleSlotOffline = (slot: FittingSlotItem['slot'], indexInSlot: number) => {
    const currentInSlot = items.filter((i) => i.slot === slot);
    const targetItem = currentInSlot[indexInSlot];
    if (!targetItem) return;
    setItems((prev) =>
      prev.map((i) =>
        i === targetItem
          ? { ...i, offline: false, inactive: !i.inactive, overheated: !i.inactive ? false : i.overheated }
          : i
      )
    );
  };

  const toggleSlotOverheat = (slot: FittingSlotItem['slot'], indexInSlot: number) => {
    const currentInSlot = items.filter((i) => i.slot === slot);
    const targetItem = currentInSlot[indexInSlot];
    if (!targetItem) return;
    setItems((prev) =>
      prev.map((i) =>
        i === targetItem ? { ...i, offline: false, inactive: false, overheated: !i.overheated } : i
      )
    );
  };

  // Cycle module state on click: active -> overheated -> inactive (online) -> active
  const cycleSlotState = (
    slot: FittingSlotItem['slot'],
    indexInSlot: number,
    maxState?: 'offline' | 'online' | 'active' | 'overload'
  ) => {
    if (slot === 'rig') return;
    const currentInSlot = items.filter((i) => i.slot === slot);
    const targetItem = currentInSlot[indexInSlot];
    if (!targetItem) return;
    const canOverload = maxState === 'overload';
    setItems((prev) =>
      prev.map((i) => {
        if (i !== targetItem) return i;
        if (i.inactive || i.offline) return { ...i, offline: false, inactive: false, overheated: false };
        if (canOverload && !i.overheated) return { ...i, offline: false, inactive: false, overheated: true };
        return { ...i, offline: false, inactive: true, overheated: false };
      })
    );
  };

  const findModuleInBrowser = (slot: FittingSlotItem['slot'], mod: FittingSlotItem) => {
    setTopTab('modules');
    if (slot === 'high' || slot === 'mid' || slot === 'low' || slot === 'rig' || slot === 'subsystem') {
      setSlotFilter(slot);
    } else {
      setSlotFilter('all');
    }
    setBrowserQuery('');
    setHighlightedTypeId(mod.typeId);
  };

  const removeSlotItem = (slot: FittingSlotItem['slot'], indexInSlot: number) => {
    let seen = -1;
    setItems((prev) =>
      prev.filter((i) => {
        if (i.slot !== slot) return true;
        seen += 1;
        return seen !== indexInSlot;
      })
    );
  };

  // Allow mixed drone flights (e.g. 1 Vespa + 1 Infiltrator) within max 5 drones & ship bandwidth
  const setDroneActiveCount = (indexInDrones: number, requested: number, perDroneBw: number) => {
    const targetEntry = droneEntries[indexInDrones];
    if (!targetEntry) return;
    const target = targetEntry.item;
    const bwMax = stats?.droneBandwidthMax ?? 0;

    let otherActive = 0;
    let otherBw = 0;
    droneEntries.forEach(({ item: d, globalIdx }, idx) => {
      if (idx === indexInDrones) return;
      const cnt = d.activeCount ?? 0;
      otherActive += cnt;
      otherBw += cnt * (stats?.moduleDetails[globalIdx]?.bandwidth ?? 10);
    });

    const remSlots = Math.max(0, 5 - otherActive);
    const remBwSlots = bwMax > 0 && perDroneBw > 0 ? Math.floor(Math.max(0, bwMax - otherBw) / perDroneBw) : 5;
    const clamped = Math.min(target.quantity, remSlots, remBwSlots, Math.max(0, requested));

    setItems((prev) =>
      prev.map((i) => (i === target ? { ...i, activeCount: clamped } : i))
    );
  };

  const handleSlotDrop = (e: React.DragEvent, targetSlot: FittingSlotItem['slot'], indexInSlot?: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const payload = JSON.parse(raw) as {
        typeId: number;
        typeName: string;
        slotKind: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'drone' | 'charge';
      };

      if (payload.slotKind === 'charge') {
        if (targetSlot === 'cargo') {
          fitItemToSlot({ typeId: payload.typeId, typeName: payload.typeName }, 'cargo');
        } else if (targetSlot === 'high' || targetSlot === 'mid' || targetSlot === 'low') {
          loadChargeIntoSlot({ typeId: payload.typeId, typeName: payload.typeName }, targetSlot, indexInSlot);
        } else {
          setStatusMsg('Charges can only be loaded into High, Mid, Low modules or Cargo.');
        }
        return;
      }

      if (payload.slotKind === 'drone' && targetSlot !== 'drone' && targetSlot !== 'cargo') {
        setStatusMsg(`${payload.typeName} belongs in the Drone Bay.`);
        return;
      }

      if (
        (payload.slotKind === 'high' ||
          payload.slotKind === 'mid' ||
          payload.slotKind === 'low' ||
          payload.slotKind === 'rig' ||
          payload.slotKind === 'subsystem') &&
        payload.slotKind !== targetSlot &&
        targetSlot !== 'cargo'
      ) {
        setStatusMsg(`${payload.typeName} belongs in a ${payload.slotKind.toUpperCase()} slot.`);
        return;
      }

      fitItemToSlot({ typeId: payload.typeId, typeName: payload.typeName }, targetSlot, indexInSlot);
    } catch {
      // ignore invalid drag data
    }
  };

  const handleRackAmmoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSlot(null);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const payload = JSON.parse(raw) as { typeId: number; typeName: string; slotKind: string };
      if (payload.slotKind !== 'charge') {
        setStatusMsg('Drop ammo/charges here to load all compatible modules.');
        return;
      }
      void loadChargeIntoRack({ typeId: payload.typeId, typeName: payload.typeName });
    } catch {
      // ignore
    }
  };

  const copySkillPlan = async () => {
    if (!stats?.missingSkills.length) return;
    const roman = ['', 'I', 'II', 'III', 'IV', 'V'];
    const lines = stats.missingSkills.map((s) => `${s.skillName} ${roman[s.requiredLevel] ?? s.requiredLevel}`);
    await window.eveLens.clipboard.writeText(lines.join('\n'));
    setStatusMsg('Copied Skill Plan to clipboard (ready to paste in EVE Skill Plans).');
  };

  const highCount = stats?.highSlots ?? 4;
  const midCount = stats?.midSlots ?? 4;
  const lowCount = stats?.lowSlots ?? 4;
  const rigCount = stats?.rigSlots ?? 3;
  const subsystemCount = stats?.subsystemSlots ?? 0;

  const indexedItems = items.map((item, globalIdx) => ({ item, globalIdx }));
  const highEntries = indexedItems.filter((x) => x.item.slot === 'high');
  const midEntries = indexedItems.filter((x) => x.item.slot === 'mid');
  const lowEntries = indexedItems.filter((x) => x.item.slot === 'low');
  const rigEntries = indexedItems.filter((x) => x.item.slot === 'rig');
  const subEntries = indexedItems.filter((x) => x.item.slot === 'subsystem');
  const droneEntries = indexedItems.filter((x) => x.item.slot === 'drone');
  const cargoItems = items.filter((i) => i.slot === 'cargo');

  const cpuState = getResourceState(stats?.cpuUsed ?? 0, stats?.cpuMax ?? 0);
  const pgState = getResourceState(stats?.pgUsed ?? 0, stats?.pgMax ?? 0);
  const calState = getResourceState(stats?.calibrationUsed ?? 0, stats?.calibrationMax ?? 400);

  return (
    <div className="flex h-full flex-col gap-2 p-2.5 overflow-hidden">
      {/* Multi-Fit Workspace Tabs (up to 3 simultaneous fittings) */}
      <div className="flex items-center gap-1.5 px-0.5 text-[11px]">
        {fitTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => switchFitTab(tab.id)}
              className={`group flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 transition-colors ${
                isActive
                  ? 'border-eve-accent bg-eve-accent-muted/40 font-semibold text-eve-accent'
                  : 'border-eve-border bg-eve-panel/70 text-eve-muted hover:text-eve-text'
              }`}
            >
              <EveIcon path={`types/${tab.shipTypeId}/render?size=32`} size={16} alt={tab.fitName} />
              <span className="max-w-[140px] truncate">{isActive ? fitName : tab.fitName}</span>
              {fitTabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFitTab(tab.id);
                  }}
                  title="Close fitting tab"
                  className="ml-0.5 rounded p-0.5 text-eve-muted hover:bg-eve-danger hover:text-white"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        })}
        {fitTabs.length < MAX_FIT_TABS && (
          <button
            type="button"
            onClick={addNewFitTab}
            title="Open another fitting tab (max 3)"
            className="inline-flex items-center gap-1 border border-dashed border-eve-border px-2 py-1 text-eve-muted hover:border-eve-accent hover:text-eve-accent"
          >
            <Plus className="h-3 w-3" />
            New Tab ({fitTabs.length}/{MAX_FIT_TABS})
          </button>
        )}
      </div>

      {/* Top Toolbar */}
      <div className="photon-panel relative z-30 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Cpu className="h-4 w-4 text-eve-accent" />
          <input
            type="text"
            value={fitName}
            onChange={(e) => setFitName(e.target.value)}
            className="w-40 border border-eve-border bg-eve-bg px-2 py-1 pr-6 text-xs font-semibold text-eve-text focus:border-eve-accent focus:outline-none"
          />

          <select
            value={skillMode}
            onChange={(e) => setSkillMode(e.target.value as typeof skillMode)}
            className="border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
          >
            <option value="character">
              {activeCharacterId ? 'Skills: Selected Pilot' : 'Skills: All Level 5 (Default)'}
            </option>
            <option value="5">Skills: All Level 5</option>
            <option value="4">Skills: All Level 4</option>
            <option value="3">Skills: All Level 3</option>
            <option value="2">Skills: All Level 2</option>
            <option value="1">Skills: All Level 1</option>
            <option value="0">Skills: All Level 0</option>
          </select>

          <button
            type="button"
            onClick={() => setImplantModalOpen(true)}
            className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent"
          >
            Implants ({simImplants.length})
          </button>

          <button
            type="button"
            onClick={() => setSkillsModalOpen(true)}
            className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-semibold ${
              (stats?.missingSkills.length ?? 0) > 0
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
            }`}
          >
            {(stats?.missingSkills.length ?? 0) > 0 ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <BookOpen className="h-3 w-3" />
            )}
            Missing Skills ({stats?.missingSkills.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent"
          >
            <GitCompareArrows className="h-3 w-3 text-eve-accent" />
            Compare
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              if (items.length > 0) setStripConfirmOpen(true);
            }}
            className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-eve-muted hover:text-eve-text"
          >
            <Plus className="h-3 w-3" />
            Strip
          </button>
          <button
            type="button"
            onClick={async () => void importEft(await window.eveLens.clipboard.readText())}
            className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-eve-accent hover:border-eve-accent"
          >
            <ClipboardPaste className="h-3 w-3" />
            Paste EFT
          </button>
          <button
            type="button"
            onClick={() => void handleCopyEft()}
            className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-eve-text hover:border-eve-accent"
          >
            <ClipboardCopy className="h-3 w-3" />
            Copy EFT
          </button>
          <button
            type="button"
            onClick={() => setBuyAllOpen(true)}
            className="inline-flex items-center gap-1 border border-emerald-500/50 bg-emerald-500/15 px-2 py-1 font-semibold text-emerald-300 hover:border-emerald-400"
          >
            <ShoppingCart className="h-3 w-3" />
            Buy All
          </button>
          <button
            type="button"
            onClick={() => setSaveModalOpen(true)}
            className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2 py-1 font-semibold text-eve-accent"
          >
            <Save className="h-3 w-3" />
            Save
          </button>
          {activeCharacterId && (
            <>
              <button
                type="button"
                onClick={async () => {
                  const list = await window.eveLens.fitting.syncFromEsi(activeCharacterId);
                  setSavedFits(list);
                  setStatusMsg(`Synced ${list.length} fittings from ESI.`);
                }}
                className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-eve-text"
              >
                <Download className="h-3 w-3" />
                ESI
              </button>
              <button
                type="button"
                onClick={async () => {
                  await window.eveLens.fitting.pushToEsi(activeCharacterId, {
                    name: fitName,
                    shipTypeId,
                    description: 'Created in New Eden Lens',
                    items
                  });
                  setStatusMsg('Pushed fitting to EVE client.');
                }}
                className="inline-flex items-center gap-1 border border-eve-border bg-eve-bg px-2 py-1 text-eve-text"
              >
                <Upload className="h-3 w-3" />
                Push
              </button>
            </>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="flex items-center justify-between border border-eve-accent/40 bg-eve-accent-muted/30 px-3 py-1 text-[11px] text-eve-accent">
          <span>{statusMsg}</span>
          <button type="button" onClick={() => setStatusMsg(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 3-Pane EveWorkbench-Style Layout (Wide Center Wheel) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[290px_1fr_300px]">
        {/* LEFT PANE: Hardware & Hull Browser */}
        <div className="photon-panel flex min-h-0 flex-col">
          <div className="grid grid-cols-3 border-b border-eve-border bg-eve-panel text-[11px] font-semibold">
            {(
              [
                ['hulls', 'Hulls & Fits'],
                ['modules', 'Modules'],
                ['charges', 'Charges']
              ] as Array<[TopBrowserTab, string]>
            ).map(([tId, label]) => (
              <button
                key={tId}
                type="button"
                onClick={() => setTopTab(tId)}
                className={`border-b-2 py-2 text-center transition-colors ${
                  topTab === tId
                    ? 'border-eve-accent bg-eve-accent-muted/25 text-eve-accent'
                    : 'border-transparent text-eve-muted hover:text-eve-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {topTab === 'hulls' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 text-xs">
              <div className="grid grid-cols-2 gap-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setHullSubTab('new')}
                  className={`border py-1.5 ${
                    hullSubTab === 'new'
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                  }`}
                >
                  New Ship
                </button>
                <button
                  type="button"
                  onClick={() => setHullSubTab('saved')}
                  className={`border py-1.5 ${
                    hullSubTab === 'saved'
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                  }`}
                >
                  Saved Fits ({savedFits.length})
                </button>
              </div>

              {hullSubTab === 'new' ? (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-eve-muted" />
                    <input
                      type="text"
                      value={hullQuery}
                      onChange={async (e) => {
                        const q = e.target.value;
                        setHullQuery(q);
                        if (q.length >= 2) {
                          const hits = await window.eveLens.sde.searchTypes(q, 24);
                          setHullHits(hits.filter((h) => h.categoryId === 6).slice(0, 15));
                        } else {
                          setHullHits([]);
                        }
                      }}
                      placeholder="Search ship hull (e.g. Thrasher, Gila)..."
                      className="w-full border border-eve-border bg-eve-bg py-1 pl-7 pr-7 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex-1 divide-y divide-eve-border/40 overflow-y-auto border border-eve-border bg-eve-bg/60">
                    {hullHits.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-eve-muted">
                        Type at least 2 characters to search EVE ship hulls.
                      </div>
                    ) : (
                      hullHits.map((h) => (
                        <button
                          key={h.typeId}
                          type="button"
                          onClick={() => {
                            if (items.length > 0) {
                              setPendingShipSelect({
                                shipTypeId: h.typeId,
                                fitName: `${h.typeName} Fit`,
                                items: [],
                                label: h.typeName
                              });
                            } else {
                              setShipTypeId(h.typeId);
                              setItems([]);
                              setFitName(`${h.typeName} Fit`);
                            }
                            setHullQuery('');
                            setHullHits([]);
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-eve-accent-muted"
                        >
                          <EveIcon path={`types/${h.typeId}/render?size=64`} size={26} alt={h.typeName} />
                          <span className="truncate text-xs text-eve-text">{h.typeName}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 space-y-1 overflow-y-auto">
                  {savedFits.length === 0 ? (
                    <div className="p-4 text-center text-[11px] text-eve-muted">
                      No saved fittings yet. Click Save to store a fit.
                    </div>
                  ) : (
                    savedFits.map((sf) => (
                      <button
                        key={sf.id}
                        type="button"
                        onClick={() => {
                          if (items.length > 0) {
                            setPendingShipSelect({
                              shipTypeId: sf.shipTypeId,
                              fitName: sf.name,
                              items: sf.items,
                              label: `${sf.name} (${sf.shipName})`
                            });
                          } else {
                            setFitName(sf.name);
                            setShipTypeId(sf.shipTypeId);
                            setItems(sf.items);
                          }
                        }}
                        className="flex w-full items-center gap-2 border border-eve-border bg-eve-bg/60 px-2 py-1.5 text-left hover:border-eve-accent"
                      >
                        <EveIcon path={`types/${sf.shipTypeId}/render?size=64`} size={26} alt={sf.shipName} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-eve-text">{sf.name}</div>
                          <div className="truncate text-[10px] text-eve-muted">
                            {sf.shipName}
                            {sf.description ? ` · ${sf.description}` : ''}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1.5 border-b border-eve-border p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-eve-muted" />
                  <input
                    type="text"
                    value={browserQuery}
                    onChange={(e) => {
                      setBrowserQuery(e.target.value);
                      setHighlightedTypeId(null);
                    }}
                    placeholder={
                      topTab === 'charges' ? 'Search ammo (drag onto module or rack)...' : 'Filter modules...'
                    }
                    className="w-full border border-eve-border bg-eve-bg py-1 pl-7 pr-7 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
                  />
                </div>

                {topTab === 'modules' && (
                  <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase">
                    {(
                      [
                        ['all', 'All'],
                        ['high', 'High'],
                        ['mid', 'Mid'],
                        ['low', 'Low'],
                        ['rig', 'Rigs'],
                        ['subsystem', 'Subs'],
                        ['drone', 'Drones']
                      ] as Array<[SlotFilterTab, string]>
                    ).map(([fId, label]) => (
                      <button
                        key={fId}
                        type="button"
                        onClick={() => setSlotFilter(fId)}
                        className={`border py-1 transition-colors ${
                          slotFilter === fId
                            ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                            : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <label className="flex cursor-pointer items-center justify-between text-[11px] text-eve-muted">
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3 w-3 text-eve-accent" />
                    {topTab === 'charges' ? 'Filter for Current Fit' : 'Hull Restrictions'}
                  </span>
                  <input
                    type="checkbox"
                    checked={hullRestricted}
                    onChange={(e) => setHullRestricted(e.target.checked)}
                    className="accent-[var(--eve-accent)]"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto p-1.5 text-xs">
                {groupedBrowser.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-eve-muted">No matching items found.</div>
                ) : (
                  groupedBrowser.map(({ cat, totalCount, subs }) => {
                    const isOpen = expandedGroups.has(cat);
                    return (
                      <div key={cat} className="mb-1">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(cat)) next.delete(cat);
                              else next.add(cat);
                              return next;
                            });
                          }}
                          className="flex w-full items-center justify-between border border-eve-border/50 bg-eve-panel/80 px-2 py-1 text-left text-[11px] font-semibold text-eve-text hover:bg-eve-elevated"
                        >
                          <span className="inline-flex items-center gap-1 truncate">
                            {isOpen ? (
                              <ChevronDown className="h-3 w-3 shrink-0 text-eve-accent" />
                            ) : (
                              <ChevronRight className="h-3 w-3 shrink-0 text-eve-muted" />
                            )}
                            <span className="truncate">{cat}</span>
                          </span>
                          <span className="rounded bg-eve-accent-muted/40 px-1.5 py-0.2 num-mono text-[10px] text-eve-accent">
                            {totalCount}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="border-x border-b border-eve-border/40 bg-eve-bg/40 pl-2">
                            {subs.map(([subName, subItems]) => {
                              const subKey = `${cat}::${subName}`;
                              const isSubOpen = expandedSubs.has(subKey);
                              return (
                                <div key={subKey} className="border-b border-eve-border/20 last:border-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedSubs((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(subKey)) next.delete(subKey);
                                        else next.add(subKey);
                                        return next;
                                      });
                                    }}
                                    className="flex w-full items-center justify-between px-1.5 py-1 text-left text-[11px] text-slate-300 hover:bg-eve-elevated/60"
                                  >
                                    <span className="inline-flex items-center gap-1 truncate">
                                      {isSubOpen ? (
                                        <ChevronDown className="h-2.5 w-2.5 shrink-0 text-eve-accent" />
                                      ) : (
                                        <ChevronRight className="h-2.5 w-2.5 shrink-0 text-eve-muted" />
                                      )}
                                      <span className="truncate">{subName}</span>
                                    </span>
                                    <span className="num-mono text-[10px] text-eve-muted">{subItems.length}</span>
                                  </button>

                                  {isSubOpen && (
                                    <div className="divide-y divide-eve-border/25 bg-eve-bg/60 pl-2">
                                      {subItems.map((m) => {
                                        const isHi = highlightedTypeId === m.typeId;
                                        return (
                                          <div
                                            key={m.typeId}
                                            ref={isHi ? highlightRowRef : null}
                                            draggable
                                            onDragStart={(e) => {
                                              e.dataTransfer.setData(
                                                'application/json',
                                                JSON.stringify({
                                                  typeId: m.typeId,
                                                  typeName: m.typeName,
                                                  slotKind: m.slotKind
                                                })
                                              );
                                            }}
                                            onDoubleClick={() =>
                                              fitItemToSlot(
                                                { typeId: m.typeId, typeName: m.typeName },
                                                m.slotKind === 'charge' ? 'cargo' : m.slotKind
                                              )
                                            }
                                            title={
                                              m.slotKind === 'charge'
                                                ? 'Drag onto a module or Load Rack circle, or + to add to Cargo'
                                                : 'Drag to slot or double-click to fit'
                                            }
                                            className={`flex cursor-grab items-center justify-between gap-1.5 px-2 py-1 active:cursor-grabbing ${
                                              isHi
                                                ? 'border-l-4 border-l-amber-300 bg-sky-500/40 font-semibold text-white ring-1 ring-inset ring-sky-300'
                                                : 'hover:bg-eve-accent-muted/30'
                                            }`}
                                          >
                                            <div className="flex min-w-0 items-center gap-2">
                                              <EveIcon path={`types/${m.typeId}/icon?size=64`} size={26} alt={m.typeName} />
                                              <span className="truncate text-xs text-eve-text">{m.typeName}</span>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                fitItemToSlot(
                                                  { typeId: m.typeId, typeName: m.typeName },
                                                  m.slotKind === 'charge' ? 'cargo' : m.slotKind
                                                )
                                              }
                                              className="shrink-0 px-1 text-[10px] text-eve-accent hover:underline"
                                            >
                                              +
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* CENTER PANE: EveWorkbench-Style 31-Slot Fitting Wheel */}
        <div className="photon-panel relative flex min-h-0 flex-col items-center justify-between overflow-hidden bg-[radial-gradient(circle_at_center,#101926_0%,#070b11_75%)] p-2">
          <div className="relative flex w-full items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-eve-text">
                {stats?.shipName ?? 'Ship Fitting'}
              </span>
              <span className="text-[10px] text-eve-muted">
                {highCount}H · {midCount}M · {lowCount}L · {rigCount}R
              </span>
              <button
                type="button"
                onClick={() => setBonusOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded border border-eve-border bg-eve-bg/80 px-1.5 py-0.5 text-[10px] text-eve-accent hover:border-eve-accent"
              >
                <Info className="h-3 w-3" />
                Bonuses
              </button>
            </div>
            <span className="text-[10px] text-eve-muted">Click slot: On/Heat/Off · Right-click: Ammo</span>
          </div>

          {/* In-Game Style Ship Traits & Bonuses Window (Screenshot 1) */}
          {bonusOpen && (
            <div className="z-40 mt-1 w-full rounded border border-eve-accent/40 bg-[#080f18]/95 p-2.5 text-[11px] shadow-2xl">
              <div className="mb-1.5 flex items-center justify-between border-b border-eve-border/50 pb-1">
                <span className="font-semibold text-eve-text">{stats?.shipName} — Ship Traits</span>
                <button type="button" onClick={() => setBonusOpen(false)}>
                  <X className="h-3.5 w-3.5 text-eve-muted hover:text-eve-text" />
                </button>
              </div>
              {stats?.shipTraits && (stats.shipTraits.skillBonuses.length > 0 || stats.shipTraits.roleBonuses.length > 0) ? (
                <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                  {stats.shipTraits.skillBonuses.map((sb) => (
                    <div key={sb.skillName}>
                      <div className="font-semibold text-sky-400">{sb.skillName} bonuses (per skill level):</div>
                      {sb.lines.map((ln, idx) => (
                        <div key={idx} className="pl-3 text-slate-200">
                          {ln}
                        </div>
                      ))}
                    </div>
                  ))}
                  {stats.shipTraits.roleBonuses.length > 0 && (
                    <div>
                      <div className="font-semibold text-sky-400">Role Bonus:</div>
                      {stats.shipTraits.roleBonuses.map((ln, idx) => (
                        <div key={idx} className="pl-3 text-slate-200">
                          {ln}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-2 text-[11px] text-slate-400">
                  Traits not loaded yet (restart Electron once after update, or fit T3C subsystems).
                </p>
              )}
            </div>
          )}

          {/* 464x464 Responsive Wheel (Larger & Easier to Read) */}
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center py-0.5">
            <div className="relative aspect-square h-full max-h-[680px] max-w-[680px]">
              <svg viewBox={`${VB_MIN} ${VB_MIN} ${VB_SIZE} ${VB_SIZE}`} className="h-full w-full select-none">
                <defs>
                  <radialGradient id="ewbRingBg" cx="50%" cy="50%" r="50%">
                    <stop offset="60%" stopColor="#090e16" />
                    <stop offset="74%" stopColor="#121d2b" />
                    <stop offset="93%" stopColor="#162232" />
                    <stop offset="100%" stopColor="#080c12" />
                  </radialGradient>
                  <radialGradient id="ewbHullBg" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#162c44" stopOpacity="0.8" />
                    <stop offset="65%" stopColor="#0b1623" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#060b12" stopOpacity="0.98" />
                  </radialGradient>
                </defs>

                <circle cx={CX} cy={CY} r={228} fill="url(#ewbRingBg)" stroke="#243447" strokeWidth={1.5} />
                <circle cx={CX} cy={CY} r={146} fill="url(#ewbHullBg)" stroke="#2c445e" strokeWidth={1.5} />
                <circle cx={CX} cy={CY} r={138} fill="none" stroke="rgba(56,189,248,0.12)" strokeWidth={1} />

                <path d={describeClockArc(CX, CY, GAUGE_R, -82, -42)} fill="none" stroke="#1c2735" strokeWidth={8} strokeDasharray="3 2.5" />
                <path d={describeClockArc(CX, CY, GAUGE_R, -82, -82 + (40 * calState.pct) / 100)} fill="none" stroke={calState.stroke} strokeWidth={8} strokeDasharray="3 2.5" />

                <path d={describeClockArc(CX, CY, GAUGE_R, 38, 88)} fill="none" stroke="#1c2735" strokeWidth={8} strokeDasharray="3 2.5" />
                <path d={describeClockArc(CX, CY, GAUGE_R, 38, 38 + (50 * cpuState.pct) / 100)} fill="none" stroke={cpuState.stroke} strokeWidth={8} strokeDasharray="3 2.5" />

                <path d={describeClockArc(CX, CY, GAUGE_R, 94, 144)} fill="none" stroke="#1c2735" strokeWidth={8} strokeDasharray="3 2.5" />
                <path d={describeClockArc(CX, CY, GAUGE_R, 144 - (50 * pgState.pct) / 100, 144)} fill="none" stroke={pgState.stroke} strokeWidth={8} strokeDasharray="3 2.5" />
              </svg>

              {/* Center Ship Render (clipped cleanly inside inner ring) */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-[48%] w-[48%] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full">
                <EveIcon
                  path={`types/${shipTypeId}/render?size=256`}
                  size={256}
                  alt={stats?.shipName ?? 'Ship'}
                  className="!h-full !w-full rounded-full object-contain opacity-95 drop-shadow-[0_0_24px_rgba(56,189,248,0.28)]"
                />
              </div>

              {/* Calibration readout near Rig slots (top-left) */}
              <div className="pointer-events-none absolute left-1 top-1 text-left text-[10px] leading-tight">
                <div className="uppercase tracking-wider text-eve-muted">Calibration</div>
                <div className={`num-mono font-bold ${calState.textClass}`}>
                  {stats?.calibrationUsed ?? 0} / {stats?.calibrationMax ?? 400}
                </div>
              </div>

              {/* Small Circular Rack-Ammo Drop Target (top-right) */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverSlot('rack-ammo');
                }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={handleRackAmmoDrop}
                onClick={() => setTopTab('charges')}
                title="Drop Ammo/Charge here to load the entire weapon rack"
                className={`absolute right-1 top-1 flex h-12 w-12 cursor-pointer flex-col items-center justify-center rounded-full border text-center text-[9px] font-semibold leading-tight transition-all ${
                  dragOverSlot === 'rack-ammo'
                    ? 'scale-110 border-eve-accent bg-eve-accent-muted text-eve-accent'
                    : 'border-eve-border-strong bg-eve-bg/90 text-eve-muted hover:border-eve-accent hover:text-eve-accent'
                }`}
              >
                <span>Load</span>
                <span>Rack</span>
              </div>

              {HIGH_ANGLES.map((deg, idx) => (
                <TrapezoidSlot
                  key={`high-${idx}`}
                  angleDeg={deg}
                  slotType="high"
                  available={idx < highCount}
                  item={highEntries[idx]?.item}
                  detail={highEntries[idx] ? stats?.moduleDetails[highEntries[idx].globalIdx] : undefined}
                  isDragOver={dragOverSlot === `high-${idx}`}
                  onDragOver={(e) => {
                    if (idx >= highCount) return;
                    e.preventDefault();
                    setDragOverSlot(`high-${idx}`);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => idx < highCount && handleSlotDrop(e, 'high', idx)}
                  onCycleState={() =>
                    cycleSlotState('high', idx, highEntries[idx] ? stats?.moduleDetails[highEntries[idx].globalIdx]?.maxState : undefined)
                  }
                  onRemove={() => removeSlotItem('high', idx)}
                  onToggleOffline={() => toggleSlotOffline('high', idx)}
                  onToggleOverheat={() => toggleSlotOverheat('high', idx)}
                  onFindInBrowser={() => highEntries[idx] && findModuleInBrowser('high', highEntries[idx].item)}
                  onOpenChargePicker={() => highEntries[idx] && void openChargePicker('high', idx, highEntries[idx].item)}
                  onClickEmpty={() => {
                    setTopTab('modules');
                    setSlotFilter('high');
                  }}
                />
              ))}

              {MID_ANGLES.map((deg, idx) => (
                <TrapezoidSlot
                  key={`mid-${idx}`}
                  angleDeg={deg}
                  slotType="mid"
                  available={idx < midCount}
                  item={midEntries[idx]?.item}
                  detail={midEntries[idx] ? stats?.moduleDetails[midEntries[idx].globalIdx] : undefined}
                  isDragOver={dragOverSlot === `mid-${idx}`}
                  onDragOver={(e) => {
                    if (idx >= midCount) return;
                    e.preventDefault();
                    setDragOverSlot(`mid-${idx}`);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => idx < midCount && handleSlotDrop(e, 'mid', idx)}
                  onCycleState={() =>
                    cycleSlotState('mid', idx, midEntries[idx] ? stats?.moduleDetails[midEntries[idx].globalIdx]?.maxState : undefined)
                  }
                  onRemove={() => removeSlotItem('mid', idx)}
                  onToggleOffline={() => toggleSlotOffline('mid', idx)}
                  onToggleOverheat={() => toggleSlotOverheat('mid', idx)}
                  onFindInBrowser={() => midEntries[idx] && findModuleInBrowser('mid', midEntries[idx].item)}
                  onOpenChargePicker={() => midEntries[idx] && void openChargePicker('mid', idx, midEntries[idx].item)}
                  onClickEmpty={() => {
                    setTopTab('modules');
                    setSlotFilter('mid');
                  }}
                />
              ))}

              {LOW_ANGLES.map((deg, idx) => (
                <TrapezoidSlot
                  key={`low-${idx}`}
                  angleDeg={deg}
                  slotType="low"
                  available={idx < lowCount}
                  item={lowEntries[idx]?.item}
                  detail={lowEntries[idx] ? stats?.moduleDetails[lowEntries[idx].globalIdx] : undefined}
                  isDragOver={dragOverSlot === `low-${idx}`}
                  onDragOver={(e) => {
                    if (idx >= lowCount) return;
                    e.preventDefault();
                    setDragOverSlot(`low-${idx}`);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => idx < lowCount && handleSlotDrop(e, 'low', idx)}
                  onCycleState={() =>
                    cycleSlotState('low', idx, lowEntries[idx] ? stats?.moduleDetails[lowEntries[idx].globalIdx]?.maxState : undefined)
                  }
                  onRemove={() => removeSlotItem('low', idx)}
                  onToggleOffline={() => toggleSlotOffline('low', idx)}
                  onToggleOverheat={() => toggleSlotOverheat('low', idx)}
                  onFindInBrowser={() => lowEntries[idx] && findModuleInBrowser('low', lowEntries[idx].item)}
                  onOpenChargePicker={() => lowEntries[idx] && void openChargePicker('low', idx, lowEntries[idx].item)}
                  onClickEmpty={() => {
                    setTopTab('modules');
                    setSlotFilter('low');
                  }}
                />
              ))}

              {RIG_ANGLES.map((deg, idx) => (
                <TrapezoidSlot
                  key={`rig-${idx}`}
                  angleDeg={deg}
                  slotType="rig"
                  available={idx < rigCount}
                  item={rigEntries[idx]?.item}
                  detail={rigEntries[idx] ? stats?.moduleDetails[rigEntries[idx].globalIdx] : undefined}
                  isDragOver={dragOverSlot === `rig-${idx}`}
                  onDragOver={(e) => {
                    if (idx >= rigCount) return;
                    e.preventDefault();
                    setDragOverSlot(`rig-${idx}`);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => idx < rigCount && handleSlotDrop(e, 'rig', idx)}
                  onCycleState={() => undefined}
                  onRemove={() => removeSlotItem('rig', idx)}
                  onToggleOffline={() => undefined}
                  onToggleOverheat={() => undefined}
                  onFindInBrowser={() => rigEntries[idx] && findModuleInBrowser('rig', rigEntries[idx].item)}
                  onOpenChargePicker={() => undefined}
                  onClickEmpty={() => {
                    setTopTab('modules');
                    setSlotFilter('rig');
                  }}
                />
              ))}

              {SUB_ANGLES.map((deg, idx) => (
                <TrapezoidSlot
                  key={`sub-${idx}`}
                  angleDeg={deg}
                  slotType="subsystem"
                  available={idx < subsystemCount}
                  item={subEntries[idx]?.item}
                  detail={subEntries[idx] ? stats?.moduleDetails[subEntries[idx].globalIdx] : undefined}
                  isDragOver={dragOverSlot === `subsystem-${idx}`}
                  onDragOver={(e) => {
                    if (idx >= subsystemCount) return;
                    e.preventDefault();
                    setDragOverSlot(`subsystem-${idx}`);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => idx < subsystemCount && handleSlotDrop(e, 'subsystem', idx)}
                  onCycleState={() => undefined}
                  onRemove={() => removeSlotItem('subsystem', idx)}
                  onToggleOffline={() => undefined}
                  onToggleOverheat={() => undefined}
                  onFindInBrowser={() => subEntries[idx] && findModuleInBrowser('subsystem', subEntries[idx].item)}
                  onOpenChargePicker={() => undefined}
                  onClickEmpty={() => {
                    setTopTab('modules');
                    setSlotFilter('subsystem');
                  }}
                />
              ))}

              <div className="pointer-events-none absolute bottom-1 right-1 text-right text-[11px] leading-tight">
                <div className="text-[10px] uppercase tracking-wider text-eve-muted">CPU</div>
                <div className={`num-mono font-bold ${cpuState.textClass}`}>
                  {stats?.cpuUsed ?? 0} / {stats?.cpuMax ?? 0} tf
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-eve-muted">Power Grid</div>
                <div className={`num-mono font-bold ${pgState.textClass}`}>
                  {stats?.pgUsed ?? 0} / {stats?.pgMax ?? 0} MW
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Strip: Drone Bay Selector & Charges/Cargo */}
          <div className="grid w-full grid-cols-2 gap-2 text-[11px]">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSlot('drone');
              }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={(e) => handleSlotDrop(e, 'drone')}
              className={`border p-2 ${
                dragOverSlot === 'drone' ? 'border-eve-accent bg-eve-accent-muted/20' : 'border-eve-border bg-eve-bg/80'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between text-[10px]">
                <span className="font-bold uppercase tracking-wider text-eve-text">Drone Bay</span>
                <div className="flex items-center gap-2 num-mono text-eve-muted">
                  <span className={(stats?.droneBandwidthUsed ?? 0) > (stats?.droneBandwidthMax ?? 0) ? 'text-red-400' : ''}>
                    {stats?.droneBandwidthUsed ?? 0} / {stats?.droneBandwidthMax ?? 0} mbit/s
                  </span>
                  <span>
                    {stats?.droneBayUsed ?? 0} / {stats?.droneBayMax ?? 0} m³
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTopTab('modules');
                      setSlotFilter('drone');
                    }}
                    className="text-eve-accent hover:underline"
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div className="max-h-24 space-y-1.5 overflow-y-auto">
                {droneEntries.map(({ item: d, globalIdx }, idx) => {
                  const active = d.activeCount ?? 0;
                  const perDroneBw = stats?.moduleDetails[globalIdx]?.bandwidth ?? 10;
                  const bwMax = stats?.droneBandwidthMax ?? 0;
                  let otherActive = 0;
                  let otherBw = 0;
                  droneEntries.forEach(({ item: od, globalIdx: og }, oIdx) => {
                    if (oIdx === idx) return;
                    const cnt = od.activeCount ?? 0;
                    otherActive += cnt;
                    otherBw += cnt * (stats?.moduleDetails[og]?.bandwidth ?? 10);
                  });
                  const remSlots = Math.max(0, 5 - otherActive);
                  const remBwSlots =
                    bwMax > 0 && perDroneBw > 0 ? Math.floor(Math.max(0, bwMax - otherBw) / perDroneBw) : 5;
                  const maxSelectable = Math.min(d.quantity, remSlots, remBwSlots);
                  return (
                    <div key={`${d.typeId}-${idx}`} className="flex items-center justify-between gap-2 border-b border-eve-border/30 pb-1 last:border-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="num-mono text-[10px] text-eve-muted">{d.quantity}x</span>
                        <EveIcon path={`types/${d.typeId}/icon?size=64`} size={22} alt={d.typeName} />
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold text-eve-text">{d.typeName}</div>
                          <div className="flex items-center gap-1 text-[10px] text-eve-muted">
                            <span>Selected:</span>
                            {[0, 1, 2, 3, 4].map((boxIdx) => {
                              const checked = boxIdx < active;
                              const disabled = boxIdx >= maxSelectable;
                              return (
                                <button
                                  key={boxIdx}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => setDroneActiveCount(idx, checked ? boxIdx : boxIdx + 1, perDroneBw)}
                                  className={`flex h-3.5 w-3.5 items-center justify-center border text-[9px] font-bold ${
                                    disabled
                                      ? 'cursor-not-allowed border-eve-border/30 opacity-25'
                                      : checked
                                        ? 'border-emerald-400 bg-emerald-500/30 text-emerald-300'
                                        : 'border-eve-border bg-eve-bg text-transparent hover:border-eve-accent'
                                  }`}
                                >
                                  ×
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeSlotItem('drone', idx)} title="Remove drones">
                        <X className="h-3 w-3 text-eve-muted hover:text-eve-danger" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSlot('cargo');
              }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={(e) => handleSlotDrop(e, 'cargo')}
              className={`border p-2 ${
                dragOverSlot === 'cargo' ? 'border-eve-accent bg-eve-accent-muted/20' : 'border-eve-border bg-eve-bg/80'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between text-[10px]">
                <span className="font-bold uppercase tracking-wider text-eve-text">
                  Cargo & Charges ({cargoItems.length})
                </span>
                <button
                  type="button"
                  onClick={() => setTopTab('charges')}
                  className="text-eve-accent hover:underline"
                >
                  + Add
                </button>
              </div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {cargoItems.map((c, idx) => (
                  <span
                    key={`${c.typeId}-${idx}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/json',
                        JSON.stringify({
                          typeId: c.typeId,
                          typeName: c.typeName,
                          slotKind: 'charge'
                        })
                      );
                    }}
                    title="Drag onto a fitted module or Load Rack to load charge"
                    className="inline-flex cursor-grab items-center gap-1 border border-eve-border bg-eve-panel px-1.5 py-0.5 text-[10px] hover:border-eve-accent active:cursor-grabbing"
                  >
                    <EveIcon path={`types/${c.typeId}/icon?size=32`} size={16} alt={c.typeName} />
                    <span>
                      {c.typeName} x{c.quantity}
                    </span>
                    <button type="button" onClick={() => removeSlotItem('cargo', idx)}>
                      <X className="h-2.5 w-2.5 text-eve-muted hover:text-eve-danger" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Ship Statistics & Estimated Value */}
        <div className="photon-panel flex min-h-0 flex-col justify-between overflow-y-auto p-3 text-xs">
          <div className="space-y-2.5">
            <StatSection title="Capacitor">
              <div className="space-y-1 text-[11px]">
                <div
                  className={`text-center font-bold ${
                    stats?.capDepletesSec === null ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {stats?.capDepletesSec === null || stats?.capDepletesSec === undefined
                    ? `STABLE AT ${stats?.capStablePct ?? 100}%`
                    : `DEPLETES IN ${formatDurationSec(stats.capDepletesSec)}`}
                </div>
                <StatRow label="Capacity" value={`${(stats?.capCapacity ?? 0).toLocaleString()} GJ`} />
                <StatRow label="Delta" value={`${stats?.capDeltaPerSec ?? 0} GJ/s`} />
              </div>
            </StatSection>

            <StatSection title="Offense">
              <div className="flex items-baseline justify-between">
                <span className="num-mono text-xl font-bold text-eve-text">
                  {stats?.dps ?? 0} <span className="text-[11px] font-normal text-eve-muted">dps</span>
                </span>
                <span className="num-mono text-eve-muted">
                  Volley: <strong className="text-eve-text">{stats?.volley ?? 0}</strong>
                </span>
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-eve-muted">
                <span>Weapons: {stats?.weaponDps ?? 0} dps</span>
                <span>Drones: {stats?.droneDps ?? 0} dps</span>
              </div>
            </StatSection>

            <StatSection title="Resistance & Defense">
              <div className="space-y-1.5 text-[10px]">
                <div className="grid grid-cols-[20px_1fr_54px] items-center gap-1 text-center font-semibold text-eve-muted">
                  <span />
                  <div className="grid grid-cols-4 gap-1">
                    <span className="text-sky-400">EM</span>
                    <span className="text-red-400">TH</span>
                    <span className="text-slate-300">KI</span>
                    <span className="text-amber-400">EX</span>
                  </div>
                  <span className="text-right">EHP</span>
                </div>

                <ResistRow label="SH" resists={stats?.resists.shield ?? [0, 40, 20, 0]} ehp={stats?.shieldHp ?? 0} />
                <ResistRow label="AR" resists={stats?.resists.armor ?? [50, 45, 25, 10]} ehp={stats?.armorHp ?? 0} />
                <ResistRow label="HU" resists={stats?.resists.hull ?? [33, 33, 33, 33]} ehp={stats?.hullHp ?? 0} />

                <div className="flex justify-between border-t border-eve-border pt-1 text-[11px] font-bold text-eve-accent">
                  <span>Total EHP</span>
                  <span className="num-mono">{((stats?.ehp ?? 0) / 1000).toFixed(2)}k ehp</span>
                </div>
              </div>
            </StatSection>

            <StatSection title="Resource Usage">
              <div className="space-y-2">
                <ResourceBar label="CPU" used={stats?.cpuUsed ?? 0} max={stats?.cpuMax ?? 0} unit="tf" />
                <ResourceBar label="Powergrid" used={stats?.pgUsed ?? 0} max={stats?.pgMax ?? 0} unit="MW" />
                <ResourceBar label="Calibration" used={stats?.calibrationUsed ?? 0} max={stats?.calibrationMax ?? 400} unit="pts" />
              </div>
            </StatSection>

            <StatSection title="Targeting & Navigation">
              <div className="space-y-1 text-[11px]">
                <StatRow label="Targeting" value={`${stats?.targetingRangeKm ?? 0} km`} />
                <StatRow label="Max Velocity" value={`${stats?.maxVelocity ?? 0} m/s`} />
                <StatRow label="Align Time" value={`${stats?.alignTimeSec ?? 0} s`} />
              </div>
            </StatSection>
          </div>

          <div className="mt-2 space-y-1.5 border border-eve-accent/40 bg-eve-accent-muted/15 p-2.5">
            <div className="flex items-center justify-between gap-1">
              {TRADE_HUBS.map((hub) => (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => setPriceRegionId(hub.id)}
                  className={`flex-1 border py-0.5 text-[10px] font-semibold transition-colors ${
                    priceRegionId === hub.id
                      ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                      : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                  }`}
                >
                  {hub.name}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-eve-muted">
                Estimated Value
              </span>
              <span className="num-mono text-sm font-bold text-eve-accent">
                {stats?.estimatedValue ? formatIsk(stats.estimatedValue, true) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Ship / Saved Fit Switch Modal */}
      {pendingShipSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-sm space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Switch Fitting?
              </span>
              <button type="button" onClick={() => setPendingShipSelect(null)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to load <strong className="text-eve-text">{pendingShipSelect.label}</strong>? Your current fitted modules will be replaced.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingShipSelect(null)}
                className="border border-eve-border bg-eve-bg px-3 py-1.5 text-xs text-eve-muted hover:text-eve-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShipTypeId(pendingShipSelect.shipTypeId);
                  setFitName(pendingShipSelect.fitName);
                  setItems(pendingShipSelect.items);
                  setPendingShipSelect(null);
                }}
                className="border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 text-xs font-semibold text-eve-accent"
              >
                Yes, Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Fittings Modal */}
      {compareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-2xl space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Compare Fittings
              </span>
              <button type="button" onClick={() => setCompareOpen(false)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-eve-muted">Compare against:</span>
              <select
                value={compareTarget}
                onChange={(e) => setCompareTarget(e.target.value)}
                className="flex-1 border border-eve-border bg-eve-bg px-2 py-1 text-xs text-eve-text"
              >
                <option value="">-- Select an open tab or saved fitting --</option>
                {fitTabs.filter((t) => t.id !== activeTabId).length > 0 && (
                  <optgroup label="Open Fitting Tabs">
                    {fitTabs
                      .filter((t) => t.id !== activeTabId)
                      .map((t) => (
                        <option key={t.id} value={`tab:${t.id}`}>
                          Tab: {t.fitName}
                        </option>
                      ))}
                  </optgroup>
                )}
                {savedFits.length > 0 && (
                  <optgroup label="Saved Fittings">
                    {savedFits.map((sf) => (
                      <option key={sf.id} value={`saved:${sf.id}`}>
                        {sf.name} ({sf.shipName})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {stats && compareStats ? (
              <div className="max-h-96 overflow-y-auto border border-eve-border bg-eve-bg/50 text-xs">
                <div className="grid grid-cols-4 border-b border-eve-border bg-eve-panel px-3 py-2 font-semibold text-eve-text">
                  <span>Stat</span>
                  <span className="text-right text-sky-300">{fitName}</span>
                  <span className="text-right text-amber-300">
                    {compareTarget.startsWith('tab:')
                      ? fitTabs.find((t) => t.id === compareTarget.slice(4))?.fitName ?? compareStats.shipName
                      : savedFits.find((f) => f.id === Number(compareTarget.slice(6)))?.name ?? compareStats.shipName}
                  </span>
                  <span className="text-right text-eve-muted">Delta</span>
                </div>
                {(
                  [
                    ['Total DPS', stats.dps, compareStats.dps, 'dps', true],
                    ['Weapon DPS', stats.weaponDps, compareStats.weaponDps, 'dps', true],
                    ['Drone DPS', stats.droneDps, compareStats.droneDps, 'dps', true],
                    ['Volley', stats.volley, compareStats.volley, 'dmg', true],
                    ['Total EHP', stats.ehp, compareStats.ehp, 'ehp', true],
                    ['Shield EHP', stats.shieldHp, compareStats.shieldHp, 'ehp', true],
                    ['Armor EHP', stats.armorHp, compareStats.armorHp, 'ehp', true],
                    ['CPU Used', stats.cpuUsed, compareStats.cpuUsed, 'tf', false],
                    ['PG Used', stats.pgUsed, compareStats.pgUsed, 'MW', false],
                    ['Cap Capacity', stats.capCapacity, compareStats.capCapacity, 'GJ', true],
                    ['Max Velocity', stats.maxVelocity, compareStats.maxVelocity, 'm/s', true],
                    ['Align Time', stats.alignTimeSec, compareStats.alignTimeSec, 's', false],
                    ['Est. Value', stats.estimatedValue, compareStats.estimatedValue, 'ISK', false]
                  ] as Array<[string, number, number, string, boolean]>
                ).map(([label, a, b, unit, higherBetter]) => {
                  const diff = Number((a - b).toFixed(1));
                  const good = diff === 0 ? null : higherBetter ? diff > 0 : diff < 0;
                  const fmtVal = (v: number) => (unit === 'ISK' ? formatIsk(v, true) : `${v.toLocaleString()} ${unit}`);
                  return (
                    <div key={label} className="grid grid-cols-4 border-b border-eve-border/30 px-3 py-1.5">
                      <span className="text-eve-muted">{label}</span>
                      <span className="num-mono text-right text-eve-text">{fmtVal(a)}</span>
                      <span className="num-mono text-right text-eve-text">{fmtVal(b)}</span>
                      <span
                        className={`num-mono text-right font-semibold ${
                          good === null ? 'text-eve-muted' : good ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {diff > 0 ? `+${fmtVal(diff)}` : fmtVal(diff)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-eve-muted">
                Select a saved fitting above to compare stats side-by-side.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Strip Fit Modal */}
      {stripConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-sm space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Strip Current Fitting?
              </span>
              <button type="button" onClick={() => setStripConfirmOpen(false)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to remove all modules, drones, and cargo from this ship?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStripConfirmOpen(false)}
                className="border border-eve-border bg-eve-bg px-3 py-1.5 text-xs text-eve-muted hover:text-eve-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setItems([]);
                  setFitName('New Fit');
                  setStripConfirmOpen(false);
                }}
                className="border border-eve-danger/60 bg-eve-danger/15 px-3 py-1.5 text-xs font-semibold text-eve-danger"
              >
                Yes, Strip Fit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Load EFT Modal */}
      {pendingEftRaw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-sm space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Replace Current Fitting?
              </span>
              <button type="button" onClick={() => setPendingEftRaw(null)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to load this EFT fitting? Your current fitted modules will be replaced.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingEftRaw(null)}
                className="border border-eve-border bg-eve-bg px-3 py-1.5 text-xs text-eve-muted hover:text-eve-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const raw = pendingEftRaw;
                  setPendingEftRaw(null);
                  await executeImportEft(raw);
                }}
                className="border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 text-xs font-semibold text-eve-accent"
              >
                Yes, Load Fit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Fitting Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-md space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Save Fitting
              </span>
              <button type="button" onClick={() => setSaveModalOpen(false)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-eve-muted">
                  Fitting Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={fitName}
                  onChange={(e) => setFitName(e.target.value)}
                  className="w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 pr-7 text-xs text-eve-text"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-eve-muted">
                  Label / Role
                </label>
                <div className="flex flex-wrap gap-1">
                  {FIT_LABELS.map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setSaveLabel(lbl)}
                      className={`border px-2 py-0.5 text-[11px] font-semibold ${
                        saveLabel === lbl
                          ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                          : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-eve-muted">
                  Description
                </label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional notes, abyssal weather, target range, etc..."
                  className="w-full border border-eve-border bg-eve-bg p-2 text-xs text-eve-text"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="border border-eve-border bg-eve-bg px-3 py-1.5 text-xs text-eve-muted hover:text-eve-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveLocal()}
                className="border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 text-xs font-semibold text-eve-accent"
              >
                Save Fitting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy All (Multibuy) Modal */}
      {buyAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-md space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Buy All — EVE Multibuy List
              </span>
              <button type="button" onClick={() => setBuyAllOpen(false)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            {(() => {
              const counts = new Map<string, number>();
              if (stats?.shipName) counts.set(stats.shipName, 1);
              for (const it of items) {
                const qty = it.slot === 'drone' || it.slot === 'cargo' ? Math.max(1, it.quantity) : 1;
                counts.set(it.typeName, (counts.get(it.typeName) ?? 0) + qty);
              }
              const lines = Array.from(counts.entries()).map(([name, qty]) => `${name} ${qty}`);
              return (
                <>
                  <textarea
                    readOnly
                    value={lines.join('\n')}
                    rows={12}
                    className="w-full border border-eve-border bg-eve-bg p-2.5 font-mono text-[11px] text-eve-text"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await window.eveLens.clipboard.writeText(lines.join('\n'));
                      setStatusMsg('Copied Multibuy list to clipboard (paste into EVE Multibuy).');
                      setBuyAllOpen(false);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 border border-emerald-500/60 bg-emerald-500/15 py-1.5 text-xs font-semibold text-emerald-300"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Copy for EVE Multibuy
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Right-Click Charge Picker Modal */}
      {chargePickerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-md space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Load Charge — {chargePickerTarget.moduleItem.typeName}
              </span>
              <button type="button" onClick={() => setChargePickerTarget(null)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 divide-y divide-eve-border/40 overflow-y-auto border border-eve-border bg-eve-bg/50">
              {chargePickerTarget.charges.map((ch) => (
                <div key={ch.typeId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-eve-accent-muted/30">
                  <button
                    type="button"
                    onClick={() => {
                      loadChargeIntoSlot(
                        { typeId: ch.typeId, typeName: ch.typeName },
                        chargePickerTarget.slot,
                        chargePickerTarget.indexInSlot
                      );
                      setChargePickerTarget(null);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <EveIcon path={`types/${ch.typeId}/icon?size=64`} size={22} alt={ch.typeName} />
                    <span className="truncate text-eve-text">{ch.typeName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void loadChargeIntoRack({ typeId: ch.typeId, typeName: ch.typeName });
                      setChargePickerTarget(null);
                    }}
                    className="shrink-0 border border-eve-border px-1.5 py-0.5 text-[10px] text-eve-accent hover:border-eve-accent"
                  >
                    Load Rack
                  </button>
                </div>
              ))}
            </div>
            {chargePickerTarget.moduleItem.chargeTypeId && (
              <button
                type="button"
                onClick={() => {
                  const target = chargePickerTarget.moduleItem;
                  setItems((prev) =>
                    prev.map((i) =>
                      i === target ? { ...i, chargeTypeId: undefined, chargeName: undefined } : i
                    )
                  );
                  setChargePickerTarget(null);
                }}
                className="w-full border border-eve-danger/50 bg-eve-danger/10 py-1.5 text-xs font-semibold text-eve-danger"
              >
                Unload Current Charge
              </button>
            )}
          </div>
        </div>
      )}

      {/* Missing Skills & Skill Plan Modal */}
      {skillsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-md space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Missing Skills ({stats?.missingSkills.length ?? 0})
              </span>
              <button type="button" onClick={() => setSkillsModalOpen(false)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            {!stats?.missingSkills.length ? (
              <div className="py-4 text-center text-xs text-emerald-400">
                All required skills for this fitting are met!
              </div>
            ) : (
              <>
                <div className="max-h-64 divide-y divide-eve-border/40 overflow-y-auto border border-eve-border bg-eve-bg/50 text-xs">
                  {stats.missingSkills.map((sk) => (
                    <div key={sk.skillId} className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-eve-text">{sk.skillName}</span>
                      <span className="num-mono text-amber-300">
                        Lvl {sk.currentLevel} → {sk.requiredLevel}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void copySkillPlan()}
                  className="inline-flex w-full items-center justify-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted py-1.5 text-xs font-semibold text-eve-accent"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copy Skill Plan (Paste into EVE Skill Plans)
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Simulated Implants Modal */}
      {implantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="photon-panel w-full max-w-md space-y-3 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eve-border pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Simulated Implants
              </span>
              <button type="button" onClick={() => setImplantModalOpen(false)} className="text-eve-muted hover:text-eve-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={implantQuery}
              onChange={async (e) => {
                const q = e.target.value;
                setImplantQuery(q);
                setImplantHits(q.length >= 2 ? await window.eveLens.sde.searchTypes(q, 20) : []);
              }}
              placeholder="Search implant (e.g. High-grade Amulet, Gnome, Squire)..."
              className="w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 pr-7 text-xs text-eve-text"
            />
            <div className="max-h-44 divide-y divide-eve-border/40 overflow-y-auto border border-eve-border bg-eve-bg/50">
              {implantHits.map((t) => (
                <button
                  key={t.typeId}
                  type="button"
                  onClick={() => {
                    if (!simImplants.some((i) => i.typeId === t.typeId)) {
                      setSimImplants((prev) => [...prev, t]);
                    }
                    setImplantQuery('');
                    setImplantHits([]);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-eve-accent-muted"
                >
                  <EveIcon path={`types/${t.typeId}/icon?size=64`} size={20} alt={t.typeName} />
                  <span className="truncate text-eve-text">{t.typeName}</span>
                </button>
              ))}
            </div>
            {simImplants.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {simImplants.map((imp) => (
                  <span
                    key={imp.typeId}
                    className="inline-flex items-center gap-1 border border-eve-border bg-eve-panel px-2 py-0.5 text-[10px]"
                  >
                    {imp.typeName}
                    <button
                      type="button"
                      onClick={() => setSimImplants((p) => p.filter((x) => x.typeId !== imp.typeId))}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SlotGlyph({ slotType }: { slotType: SlotKind }) {
  if (slotType === 'high') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400/70">
        <path fill="currentColor" d="M3 10h2v3H3zm4-3h2v6H7zm4-4h2v10h-2z" />
      </svg>
    );
  }
  if (slotType === 'mid') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400/70">
        <path fill="currentColor" d="M4 6h8v2H4zm0 4h8v2H4z" />
      </svg>
    );
  }
  if (slotType === 'low') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400/70">
        <path fill="currentColor" d="M3 7h10v2.5H3z" />
      </svg>
    );
  }
  if (slotType === 'rig') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400/70">
        <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M8 3l4.5 8h-9z" />
      </svg>
    );
  }
  return null;
}

function TrapezoidSlot({
  angleDeg,
  slotType,
  available,
  item,
  detail,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onCycleState,
  onRemove,
  onToggleOffline,
  onToggleOverheat,
  onFindInBrowser,
  onOpenChargePicker,
  onClickEmpty
}: {
  angleDeg: number;
  slotType: SlotKind;
  available: boolean;
  item?: FittingSlotItem;
  detail?: FittingModuleDetail;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onCycleState: () => void;
  onRemove: () => void;
  onToggleOffline: () => void;
  onToggleOverheat: () => void;
  onFindInBrowser: () => void;
  onOpenChargePicker: () => void;
  onClickEmpty: () => void;
}) {
  const pos = polarTopDeg(CX, CY, SLOT_R, angleDeg);
  const leftPct = ((pos.x - VB_MIN) / VB_SIZE) * 100;
  const topPct = ((pos.y - VB_MIN) / VB_SIZE) * 100;

  const overflow = !available && Boolean(item);
  const canOffline = available && slotType !== 'rig' && slotType !== 'subsystem';
  const canOverheat = canOffline && detail?.maxState === 'overload';

  const frameStroke = overflow
    ? '#ef4444'
    : !available
      ? '#1a2433'
      : isDragOver
        ? '#38bdf8'
        : item
          ? item.offline
            ? '#475569'
            : item.inactive
              ? '#64748b'
              : item.overheated
                ? '#f97316'
                : '#22c55e'
          : '#33475e';

  const frameFill = overflow
    ? 'rgba(127,29,29,0.55)'
    : !available
      ? 'rgba(10,14,20,0.45)'
      : item
        ? item.offline || item.inactive
          ? 'rgba(15,23,36,0.9)'
          : item.overheated
            ? 'rgba(67,20,7,0.92)'
            : 'rgba(16,40,34,0.9)'
        : 'rgba(10,16,24,0.92)';

  const tooltipLines: string[] = [];
  if (item) {
    tooltipLines.push(
      item.typeName +
        (overflow
          ? ' [OVERFLOW — SLOT REMOVED BY SUBSYSTEM]'
          : item.offline
            ? ' [OFFLINE]'
            : item.inactive
              ? ' [INACTIVE · ONLINE]'
              : item.overheated
                ? ' [OVERHEATED]'
                : '')
    );
    if (item.chargeName) tooltipLines.push(`Charge: ${item.chargeName}`);
    if (detail) {
      if (slotType !== 'subsystem' && slotType !== 'rig') {
        tooltipLines.push(`CPU: ${detail.cpu} tf · PG: ${detail.pg} MW`);
      }
      if (detail.dps > 0) tooltipLines.push(`DPS: ${detail.dps}`);
      if (detail.optimalKm > 0 || detail.falloffKm > 0) {
        tooltipLines.push(`Range: ${detail.optimalKm} km + ${detail.falloffKm} km`);
      }
      if (detail.capPerSec > 0) tooltipLines.push(`Cap: -${detail.capPerSec} GJ/s (${detail.cycleSec}s)`);
      if (detail.subsystemBonuses && detail.subsystemBonuses.length > 0) {
        tooltipLines.push(...detail.subsystemBonuses);
      }
    }
    tooltipLines.push(
      overflow
        ? 'Hover Unfit (trash) to remove overflow module'
        : canOverheat
          ? 'Click: Cycle On / Heat / Off · Right-click: Ammo'
          : canOffline
            ? 'Click: Turn On / Off · Right-click: Ammo'
            : 'Rig / Subsystem slot'
    );
  }

  return (
    <div
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onContextMenu={(e) => {
        if (!item) return;
        e.preventDefault();
        onOpenChargePicker();
      }}
      className={`group absolute h-[10.4%] w-[9.8%] hover:z-30 ${
        available || overflow ? '' : 'pointer-events-none opacity-45'
      }`}
    >
      <svg viewBox="0 0 46 48" className="h-full w-full overflow-visible">
        <polygon
          points="5,4 41,4 37,44 9,44"
          fill={frameFill}
          stroke={frameStroke}
          strokeWidth={isDragOver ? 2.4 : 1.7}
          strokeLinejoin="round"
        />
      </svg>

      <div
        style={{ transform: `rotate(${-angleDeg}deg)` }}
        className="absolute inset-0 flex items-center justify-center"
      >
        {item ? (
          <div
            onClick={canOffline ? onCycleState : undefined}
            title={tooltipLines.join('\n')}
            className={`relative flex h-full w-full items-center justify-center ${
              canOffline ? 'cursor-pointer' : ''
            }`}
          >
            <EveIcon
              path={`types/${item.typeId}/icon?size=64`}
              size={40}
              alt={item.typeName}
              className={`!h-[76%] !w-[76%] ${item.offline ? 'opacity-35 grayscale' : item.inactive ? 'opacity-65' : ''}`}
            />
            {item.chargeTypeId && (
              <div className="absolute bottom-[6%] right-[6%] h-[38%] w-[38%] rounded-full border border-sky-400/80 bg-eve-bg p-[1px]">
                <EveIcon
                  path={`types/${item.chargeTypeId}/icon?size=32`}
                  size={16}
                  alt={item.chargeName ?? 'Charge'}
                  className="!h-full !w-full rounded-full"
                />
              </div>
            )}

            {/* Hover Action Bar */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute -top-6 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-1 rounded border border-eve-border-strong bg-[#0b131e]/95 px-1.5 py-1 shadow-xl group-hover:flex"
            >
              {canOffline && (
                <button
                  type="button"
                  onClick={onToggleOffline}
                  title={item.inactive || item.offline ? 'Turn On' : 'Turn Off (Keep Online)'}
                  className={`rounded p-1 hover:bg-eve-elevated ${
                    item.inactive || item.offline ? 'text-slate-400' : 'text-emerald-400'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
              )}
              {canOverheat && (
                <button
                  type="button"
                  onClick={onToggleOverheat}
                  title={item.overheated ? 'Stop Overheat' : 'Overheat'}
                  className={`rounded p-1 hover:bg-eve-elevated ${
                    item.overheated ? 'text-orange-400' : 'text-slate-300 hover:text-orange-300'
                  }`}
                >
                  <Flame className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onFindInBrowser}
                title="Find in Browser"
                className="rounded p-1 text-slate-300 hover:bg-eve-elevated hover:text-eve-accent"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                title="Unfit Module"
                className="rounded p-1 text-slate-300 hover:bg-eve-danger hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          available && (
            <button
              type="button"
              onClick={onClickEmpty}
              title={`Empty ${slotType.toUpperCase()} slot — drag module here or click to filter`}
              className="flex h-full w-full items-center justify-center"
            >
              <SlotGlyph slotType={slotType} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ResistRow({ label, resists, ehp }: { label: string; resists: [number, number, number, number]; ehp: number }) {
  const colors = ['bg-sky-500', 'bg-red-500', 'bg-slate-400', 'bg-amber-500'];
  const bgColors = ['bg-sky-950/60', 'bg-red-950/60', 'bg-slate-800/60', 'bg-amber-950/60'];
  return (
    <div className="grid grid-cols-[20px_1fr_54px] items-center gap-1">
      <span className="font-bold text-eve-muted">{label}</span>
      <div className="grid grid-cols-4 gap-1">
        {resists.map((pct, i) => (
          <div key={i} className={`relative h-4 overflow-hidden ${bgColors[i]}`}>
            <div className={`h-full ${colors[i]} opacity-75`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            <span className="num-mono absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
              {pct}%
            </span>
          </div>
        ))}
      </div>
      <span className="num-mono text-right text-[10px] text-eve-text">{(ehp / 1000).toFixed(2)}k</span>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-eve-border bg-eve-bg/60 p-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-eve-muted">{title}</div>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-eve-muted">{label}</span>
      <span className="num-mono text-eve-text">{value}</span>
    </div>
  );
}

function ResourceBar({ label, used, max, unit }: { label: string; used: number; max: number; unit: string }) {
  const state = getResourceState(used, max);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-eve-muted">{label}</span>
        <span className={`num-mono font-semibold ${state.textClass}`}>
          {used} / {max} {unit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden bg-eve-bg">
        <div className={`h-full transition-all ${state.barClass}`} style={{ width: `${state.pct}%` }} />
      </div>
    </div>
  );
}
