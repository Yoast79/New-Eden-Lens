import { useCallback, useEffect, useState } from 'react';
import { LogIn, ShieldAlert, X } from 'lucide-react';
import type { EsiStatusSnapshot, SdeStatusSnapshot } from '@shared/types/esi';
import { AccountProvider, useAccounts } from './core/contexts/AccountContext';
import { ClipboardProvider, useEveClipboard } from './core/contexts/ClipboardContext';
import { ModuleProvider, useModules } from './core/contexts/ModuleContext';
import { ThemeProvider } from './core/contexts/ThemeContext';
import { ModuleErrorBoundary } from './core/components/ModuleErrorBoundary';
import { AccountManagerModal } from './core/components/AccountManagerModal';
import { DonationModal } from './core/components/DonationModal';
import { HelpModal } from './core/components/HelpModal';
import { ModuleManagerModal } from './core/components/ModuleManagerModal';
import { NeocomSidebar } from './core/components/NeocomSidebar';
import { NewEdenLensLogo } from './core/components/NewEdenLensLogo';
import { PopoutOverlay } from './core/components/PopoutOverlay';
import { QuickSetupModal } from './core/components/QuickSetupModal';
import { SettingsModal } from './core/components/SettingsModal';
import { TopBar } from './core/components/TopBar';
import { useTheme } from './core/contexts/ThemeContext';

function LensWorkspace() {
  const { enabledModules, activeModule, subscribeWorkerEvents } = useModules();
  const { activeCharacterId, activeCharacter, loginCharacter } = useAccounts();
  const { settings } = useTheme();
  const { lastParsed, clearClipboardBanner } = useEveClipboard();

  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [moduleManagerOpen, setModuleManagerOpen] = useState(false);
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);
  const [quickSetupAutoChecked, setQuickSetupAutoChecked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sdeStatus, setSdeStatus] = useState<SdeStatusSnapshot | null>(null);
  const [esiStatus, setEsiStatus] = useState<EsiStatusSnapshot | null>(null);
  const [bootReady, setBootReady] = useState(false);

  const refreshTelemetry = useCallback(async () => {
    const [sde, esi] = await Promise.all([
      window.eveLens.sde.getStatus(),
      window.eveLens.esi.getStatus()
    ]);
    setSdeStatus(sde);
    setEsiStatus(esi);
    setBootReady(true);
  }, []);

  useEffect(() => {
    void refreshTelemetry();
    const timer = window.setInterval(() => {
      void window.eveLens.esi.getStatus().then(setEsiStatus);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refreshTelemetry]);

  useEffect(() => {
    if (!quickSetupAutoChecked && settings && sdeStatus) {
      setQuickSetupAutoChecked(true);
      if (!settings.quickSetupCompleted && !sdeStatus.installed) {
        setQuickSetupOpen(true);
      }
    }
  }, [quickSetupAutoChecked, settings, sdeStatus]);

  const missingScopes =
    activeModule && activeCharacter && activeModule.definition.requiredEsiScopes.length > 0
      ? activeModule.definition.requiredEsiScopes.filter(
          (s) => !activeCharacter.scopes.includes(s)
        )
      : [];

  const ActiveComponent = activeModule?.definition.component;

  if (!bootReady || !settings) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-eve-bg text-eve-text select-none">
        <NewEdenLensLogo size={56} />
        <div className="text-sm font-bold uppercase tracking-[0.28em] text-eve-accent">
          NEW EDEN LENS
        </div>
        <div className="h-1 w-56 overflow-hidden bg-eve-elevated">
          <div className="h-full w-1/2 animate-pulse bg-eve-accent" />
        </div>
        <div className="font-mono text-[11px] text-eve-muted">
          Initializing local SQLite &amp; capsuleer systems...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-eve-bg text-eve-text">
      <NeocomSidebar
        onOpenAccountManager={() => setAccountManagerOpen(true)}
        onOpenModuleManager={() => setModuleManagerOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenDonate={() => setDonateOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          esiStatus={esiStatus}
          onOpenAccountManager={() => setAccountManagerOpen(true)}
        />

        {/* Scope guard banner if active character lacks required scopes */}
        {missingScopes.length > 0 && activeModule && (
          <div className="flex items-center justify-between border-b border-eve-warning/40 bg-eve-warning/10 px-4 py-1.5 text-xs text-eve-warning">
            <div className="flex items-center gap-2 truncate">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {activeCharacter?.characterName} is missing {missingScopes.length} ESI scope(s) for{' '}
                {activeModule.definition.name}.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loginCharacter()}
              className="inline-flex shrink-0 items-center gap-1 border border-eve-warning/60 px-2 py-0.5 text-[11px] font-medium hover:bg-eve-warning/20"
            >
              <LogIn className="h-3 w-3" />
              Re-Authorize
            </button>
          </div>
        )}

        {/* Clipboard detection notification bar */}
        {lastParsed && lastParsed.format !== 'unknown' && (
          <div className="flex items-center justify-between border-b border-eve-accent/30 bg-eve-accent-muted px-4 py-1 text-[11px] text-eve-accent">
            <span>
              Clipboard detected: <strong className="uppercase">{lastParsed.format}</strong>
            </span>
            <button
              type="button"
              onClick={clearClipboardBanner}
              className="text-eve-muted hover:text-eve-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Main Workspace Canvas (Keep-alive per enabled module so state persists across switches) */}
        <main className="relative min-h-0 flex-1 overflow-hidden bg-eve-bg">
          {enabledModules.length > 0 && activeModule ? (
            enabledModules.map(({ definition }) => {
              const ModComponent = definition.component;
              const isActive = definition.id === activeModule.definition.id;
              return (
                <div key={definition.id} className={isActive ? 'h-full w-full' : 'hidden'}>
                  <ModuleErrorBoundary moduleId={definition.id} moduleName={definition.name}>
                    <ModComponent
                      activeCharacterId={activeCharacterId}
                      incomingClipboard={isActive ? lastParsed : null}
                      onWorkerEvent={(handler) => subscribeWorkerEvents(definition.id, handler)}
                    />
                  </ModuleErrorBoundary>
                </div>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-eve-muted">
              All modules are disabled. Open Sidebar &amp; Modules to enable a module.
            </div>
          )}
        </main>
      </div>

      {accountManagerOpen && <AccountManagerModal onClose={() => setAccountManagerOpen(false)} />}
      {moduleManagerOpen && <ModuleManagerModal onClose={() => setModuleManagerOpen(false)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {donateOpen && <DonationModal onClose={() => setDonateOpen(false)} />}
      {quickSetupOpen && (
        <QuickSetupModal
          sdeStatus={sdeStatus}
          onSdeUpdated={(next) => setSdeStatus(next)}
          onClose={() => setQuickSetupOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onOpenQuickSetup={() => setQuickSetupOpen(true)}
        />
      )}
    </div>
  );
}

function GlobalInputClearOverlay() {
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; height: number } | null>(null);
  const [activeInput, setActiveInput] = useState<HTMLInputElement | null>(null);

  useEffect(() => {
    const update = () => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement &&
        (el.type === 'text' || el.type === 'search' || el.type === '') &&
        !el.readOnly &&
        !el.disabled &&
        el.value.length > 0
      ) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 40 && rect.height > 12) {
          setActiveInput(el);
          setTargetRect({ top: rect.top, left: rect.right - 20, height: rect.height });
          return;
        }
      }
      setActiveInput(null);
      setTargetRect(null);
    };

    document.addEventListener('focusin', update, true);
    document.addEventListener('focusout', update, true);
    document.addEventListener('input', update, true);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('focusin', update, true);
      document.removeEventListener('focusout', update, true);
      document.removeEventListener('input', update, true);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!targetRect || !activeInput) return null;

  return (
    <button
      type="button"
      tabIndex={-1}
      title="Clear"
      onMouseDown={(e) => {
        e.preventDefault();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(activeInput, '');
        } else {
          activeInput.value = '';
        }
        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        activeInput.focus();
      }}
      style={{
        position: 'fixed',
        top: targetRect.top + (targetRect.height - 16) / 2,
        left: targetRect.left,
        zIndex: 9999
      }}
      className="flex h-4 w-4 items-center justify-center rounded-full text-eve-muted hover:bg-eve-elevated hover:text-eve-text"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

export default function App() {
  const isPopout =
    typeof window !== 'undefined' && window.location.search.includes('popout=1');

  return (
    <ThemeProvider>
      <AccountProvider>
        {isPopout ? (
          <PopoutOverlay />
        ) : (
          <ModuleProvider>
            <ClipboardProvider>
              <LensWorkspace />
              <GlobalInputClearOverlay />
            </ClipboardProvider>
          </ModuleProvider>
        )}
      </AccountProvider>
    </ThemeProvider>
  );
}

