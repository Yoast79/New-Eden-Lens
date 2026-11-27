import {
  ChevronRight,
  Heart,
  HelpCircle,
  Layers,
  PictureInPicture2,
  Settings,
  Users
} from 'lucide-react';
import { useAccounts } from '@/core/contexts/AccountContext';
import { useModules } from '@/core/contexts/ModuleContext';
import { useTheme } from '@/core/contexts/ThemeContext';
import { EveIcon } from './EveIcon';
import { NewEdenLensLogo } from './NewEdenLensLogo';

export interface NeocomUtilityItemMeta {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  canHide: boolean;
}

export const NEOCOM_UTILITY_ITEMS: NeocomUtilityItemMeta[] = [
  { id: 'overlay', label: 'In-Game Overlay', icon: PictureInPicture2, canHide: true },
  { id: 'accounts', label: 'Accounts & Pilots', icon: Users, canHide: true },
  { id: 'modules', label: 'Sidebar & Modules', icon: Layers, canHide: false },
  { id: 'help', label: 'Help & Tutorials', icon: HelpCircle, canHide: true },
  { id: 'donate', label: 'Thank You', icon: Heart, canHide: true },
  { id: 'settings', label: 'Settings', icon: Settings, canHide: true }
];

interface NeocomSidebarProps {
  onOpenAccountManager: () => void;
  onOpenModuleManager: () => void;
  onOpenHelp: () => void;
  onOpenDonate: () => void;
  onOpenSettings: () => void;
}

export function NeocomSidebar({
  onOpenAccountManager,
  onOpenModuleManager,
  onOpenHelp,
  onOpenDonate,
  onOpenSettings
}: NeocomSidebarProps) {
  const { enabledModules, activeModuleId, setActiveModuleId } = useModules();
  const { activeCharacter } = useAccounts();
  const { settings, updateSettings } = useTheme();

  const expanded = settings?.neocomExpanded ?? false;
  const hiddenIds = new Set(settings?.neocomHiddenIds ?? []);
  const order = settings?.neocomUtilityOrder ?? NEOCOM_UTILITY_ITEMS.map((i) => i.id);

  const orderedUtilities = order
    .map((id) => NEOCOM_UTILITY_ITEMS.find((u) => u.id === id))
    .filter((u): u is NeocomUtilityItemMeta => Boolean(u))
    .concat(NEOCOM_UTILITY_ITEMS.filter((u) => !order.includes(u.id)))
    .filter((u) => !u.canHide || !hiddenIds.has(u.id));

  const handleUtilityClick = (id: string) => {
    if (id === 'overlay') void window.eveLens.app.openPopout();
    else if (id === 'accounts') onOpenAccountManager();
    else if (id === 'modules') onOpenModuleManager();
    else if (id === 'help') onOpenHelp();
    else if (id === 'donate') onOpenDonate();
    else if (id === 'settings') onOpenSettings();
  };

  return (
    <aside
      className={`relative z-30 flex h-full shrink-0 flex-col border-r border-eve-border bg-eve-panel/95 select-none transition-all duration-150 ${
        expanded ? 'w-52' : 'w-[52px]'
      }`}
    >
      {/* Top Sidebar Emblem / Active Pilot Portrait */}
      <button
        type="button"
        onClick={() => void updateSettings({ neocomExpanded: !expanded })}
        title={
          activeCharacter
            ? `${activeCharacter.characterName}${activeCharacter.description ? ` — ${activeCharacter.description}` : ''}`
            : expanded
              ? 'Collapse Sidebar'
              : 'Expand Sidebar'
        }
        className="flex h-11 w-full items-center justify-between border-b border-eve-border px-2.5 hover:bg-eve-elevated"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          {activeCharacter ? (
            <EveIcon
              path={`characters/${activeCharacter.characterId}/portrait?size=64`}
              size={30}
              alt={activeCharacter.characterName}
              className="border border-eve-accent/60"
            />
          ) : (
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center">
              <NewEdenLensLogo size={26} />
            </div>
          )}
          {expanded && (
            <span className="truncate text-xs font-bold uppercase tracking-[0.16em] text-eve-text">
              {activeCharacter ? activeCharacter.characterName : 'MODULES'}
            </span>
          )}
        </div>
        {expanded && <ChevronRight className="h-3.5 w-3.5 rotate-180 text-eve-muted" />}
      </button>

      {/* Module Navigation Icons */}
      <nav className="flex-1 overflow-y-auto py-1.5">
        {enabledModules.map(({ definition }) => {
          const Icon = definition.icon;
          const active = definition.id === activeModuleId;
          const displayName = settings?.moduleCustomNames?.[definition.id]?.trim() || definition.name;
          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => setActiveModuleId(definition.id)}
              title={!expanded ? `${displayName} — ${definition.description}` : undefined}
              className={`group relative flex h-10 w-full items-center gap-3 px-3.5 text-left transition-colors ${
                active
                  ? 'bg-eve-accent-muted text-eve-accent'
                  : 'text-eve-muted hover:bg-eve-elevated hover:text-eve-text'
              }`}
            >
              <span
                className={`absolute left-0 top-1 bottom-1 w-[3px] transition-opacity ${
                  active
                    ? 'bg-eve-accent opacity-100 shadow-[0_0_8px_var(--eve-accent)]'
                    : 'opacity-0 group-hover:bg-eve-border-strong group-hover:opacity-100'
                }`}
              />
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {expanded && (
                <span className="truncate text-xs font-medium tracking-wide">{displayName}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Utility Rail (Hideable & Reorderable) */}
      <div className="border-t border-eve-border py-1.5">
        {orderedUtilities.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleUtilityClick(item.id)}
              title={!expanded ? item.label : undefined}
              className="relative flex h-9 w-full items-center gap-3 px-3.5 text-left text-eve-muted transition-colors hover:bg-eve-elevated hover:text-eve-text"
            >
              <div className="relative shrink-0">
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
              </div>
              {expanded && <span className="truncate text-xs">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
