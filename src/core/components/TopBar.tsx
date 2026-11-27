import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Crown,
  LogIn,
  Settings2,
  Users
} from 'lucide-react';
import type { EsiStatusSnapshot } from '@shared/types/esi';
import { useAccounts } from '@/core/contexts/AccountContext';
import { useModules } from '@/core/contexts/ModuleContext';
import { useTheme } from '@/core/contexts/ThemeContext';
import { EveIcon } from './EveIcon';
import { EveLoginButton } from './EveLoginButton';
import { APP_VERSION } from './HelpModal';
import { NewEdenLensLogo } from './NewEdenLensLogo';

interface TopBarProps {
  esiStatus: EsiStatusSnapshot | null;
  onOpenAccountManager: () => void;
}

export function TopBar({ esiStatus, onOpenAccountManager }: TopBarProps) {
  const { activeModule } = useModules();
  const { settings } = useTheme();
  const {
    characters,
    activeCharacterId,
    activeCharacter,
    isAuthenticating,
    authError,
    selectCharacter,
    loginCharacter,
    setMainCharacter,
    clearAuthError
  } = useAccounts();

  const [charMenuOpen, setCharMenuOpen] = useState(false);
  const charMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!charMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (charMenuRef.current && !charMenuRef.current.contains(e.target as Node)) {
        setCharMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [charMenuOpen]);

  const handleQuickLogin = () => {
    if (!settings?.esiClientId?.trim()) {
      setCharMenuOpen(false);
      onOpenAccountManager();
      return;
    }
    void loginCharacter();
  };

  const hasEsiError =
    Boolean(esiStatus?.lastError) ||
    (esiStatus?.rateLimitedUntil !== null &&
      esiStatus?.rateLimitedUntil !== undefined &&
      esiStatus.rateLimitedUntil > Date.now());

  return (
    <header className="relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-eve-border bg-eve-panel px-4 select-none">
      {/* Left: Brand Logo + Active Module Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <NewEdenLensLogo size={18} />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-eve-accent">
            NEW EDEN LENS
          </span>
          <span className="num-mono text-[10px] text-eve-muted">{APP_VERSION}</span>
        </div>
        <span className="h-3.5 w-[1px] bg-eve-border-strong" />
        {activeModule && (
          <div className="flex items-center gap-2">
            <activeModule.definition.icon className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
              {activeModule.definition.name}
            </span>
          </div>
        )}
      </div>

      {/* Right: ESI Warning/Status + Character Switcher */}
      <div className="flex items-center gap-2.5">
        {hasEsiError ? (
          <div
            className="inline-flex items-center gap-1.5 border border-eve-danger/60 bg-eve-danger/15 px-2.5 py-1 text-[11px] font-medium text-eve-danger"
            title={esiStatus?.lastError ?? 'ESI is rate-limited or unreachable'}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[240px] truncate">
              ESI Warning: {esiStatus?.lastError ?? 'Rate Limited'}
            </span>
          </div>
        ) : (
          <div
            className="hidden items-center gap-1.5 border border-eve-border bg-eve-bg/60 px-2.5 py-1 text-[11px] text-eve-muted lg:inline-flex"
            title="EVE Stable Infrastructure (ESI) Status"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-eve-success" />
            <span className="num-mono">ESI {esiStatus?.compatibilityDate ?? '2026-08-18'}</span>
            {esiStatus?.errorLimitRemain !== null && esiStatus?.errorLimitRemain !== undefined && (
              <span className="num-mono text-eve-text">({esiStatus.errorLimitRemain})</span>
            )}
          </div>
        )}

        {/* Multi-Character Switcher */}
        <div ref={charMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setCharMenuOpen((v) => !v)}
            className="inline-flex items-center gap-2 border border-eve-border-strong bg-eve-elevated px-2.5 py-1 text-xs text-eve-text hover:border-eve-accent"
          >
            {activeCharacter ? (
              <>
                <EveIcon
                  path={`characters/${activeCharacter.characterId}/portrait?size=64`}
                  size={20}
                  alt={activeCharacter.characterName}
                />
                <span className="max-w-[130px] truncate font-medium">
                  {activeCharacter.characterName}
                </span>
              </>
            ) : characters.length > 0 ? (
              <>
                <Users className="h-3.5 w-3.5 text-eve-accent" />
                <span className="font-medium text-eve-accent">
                  All Characters ({characters.length})
                </span>
              </>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5 text-eve-accent" />
                <span>Link Capsuleer</span>
              </>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-eve-muted" />
          </button>

          {charMenuOpen && (
            <div className="photon-panel absolute right-0 top-full mt-1.5 w-80 shadow-2xl">
              <div className="photon-header flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  Capsuleer Roster
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCharMenuOpen(false);
                    onOpenAccountManager();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-eve-accent hover:underline"
                >
                  <Settings2 className="h-3 w-3" />
                  Manage Accounts
                </button>
              </div>

              {authError && (
                <div className="border-b border-eve-danger/40 bg-eve-danger/10 px-3 py-2 text-[11px] text-eve-danger">
                  <div>{authError}</div>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="mt-1 underline hover:no-underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto p-1.5">
                {characters.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      selectCharacter(null);
                      setCharMenuOpen(false);
                    }}
                    className={`mb-1 flex w-full items-center justify-between border px-2.5 py-2 text-left text-xs ${
                      activeCharacterId === null
                        ? 'border-eve-accent/60 bg-eve-accent-muted text-eve-accent'
                        : 'border-transparent text-eve-text hover:bg-eve-elevated'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <div>
                        <div className="font-medium">All Characters</div>
                        <div className="text-[10px] text-eve-muted">Aggregate roster view</div>
                      </div>
                    </div>
                    {activeCharacterId === null && <Check className="h-3.5 w-3.5" />}
                  </button>
                )}

                {characters.length === 0 ? (
                  <div className="space-y-2.5 px-3 py-3 text-center text-xs text-eve-muted">
                    <div>No pilots linked yet.</div>
                    <div className="flex justify-center">
                      <EveLoginButton
                        compact
                        loading={isAuthenticating}
                        onClick={handleQuickLogin}
                      />
                    </div>
                  </div>
                ) : (
                  characters.map((char) => {
                    const selected = char.characterId === activeCharacterId;
                    return (
                      <div
                        key={char.characterId}
                        title={char.description || undefined}
                        className={`flex items-center justify-between px-2 py-1.5 ${
                          selected ? 'bg-eve-accent-muted' : 'hover:bg-eve-elevated'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            selectCharacter(char.characterId);
                            setCharMenuOpen(false);
                          }}
                          className="flex flex-1 items-center gap-2.5 text-left"
                        >
                          <EveIcon
                            path={`characters/${char.characterId}/portrait?size=64`}
                            size={28}
                            alt={char.characterName}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {char.accentColor && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: char.accentColor }}
                                />
                              )}
                              <span className="truncate text-xs font-medium text-eve-text">
                                {char.characterName}
                              </span>
                              {char.isMain && (
                                <Crown className="h-3 w-3 shrink-0 text-eve-accent" />
                              )}
                            </div>
                            {char.description && (
                              <div className="truncate text-[10px] text-eve-muted">
                                {char.description}
                              </div>
                            )}
                          </div>
                        </button>
                        {!char.isMain && (
                          <button
                            type="button"
                            onClick={() => void setMainCharacter(char.characterId)}
                            title="Set as Main Character"
                            className="p-1 text-eve-muted hover:text-eve-accent"
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {characters.length > 0 && (
                <div className="flex justify-center border-t border-eve-border bg-eve-bg/50 p-2">
                  <EveLoginButton
                    compact
                    loading={isAuthenticating}
                    onClick={handleQuickLogin}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
