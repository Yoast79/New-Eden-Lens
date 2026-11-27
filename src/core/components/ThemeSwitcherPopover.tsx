import { Check, Palette } from 'lucide-react';
import { FACTION_THEMES } from '@shared/constants/eve';
import { useTheme } from '@/core/contexts/ThemeContext';

export function ThemeSwitcherPopover({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="photon-panel w-72 shadow-2xl">
      <div className="photon-header flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-eve-text">
          <Palette className="h-3.5 w-3.5 text-eve-accent" />
          Faction Color Theme
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] uppercase tracking-wider text-eve-muted hover:text-eve-text"
        >
          ESC
        </button>
      </div>

      <div className="divide-y divide-eve-border/60 p-1.5">
        {FACTION_THEMES.map((item) => {
          const active = item.id === theme;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void setTheme(item.id);
              }}
              className={`flex w-full items-center justify-between px-2.5 py-2 text-left transition-colors ${
                active
                  ? 'bg-eve-accent-muted text-eve-text'
                  : 'text-eve-muted hover:bg-eve-elevated hover:text-eve-text'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-5 w-5 items-center justify-center border border-white/20"
                  style={{ backgroundColor: item.secondarySwatch }}
                >
                  <span className="h-2.5 w-2.5" style={{ backgroundColor: item.swatch }} />
                </div>
                <div>
                  <div className="text-xs font-medium text-eve-text">{item.name}</div>
                  <div className="text-[10px] text-eve-muted">{item.subtitle}</div>
                </div>
              </div>
              {active && <Check className="h-3.5 w-3.5 text-eve-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

