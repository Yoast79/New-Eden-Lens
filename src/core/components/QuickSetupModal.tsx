import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  Rocket,
  X
} from 'lucide-react';
import type { SdeImportProgress, SdeStatusSnapshot } from '@shared/types/esi';
import { useAccounts } from '@/core/contexts/AccountContext';
import { useTheme } from '@/core/contexts/ThemeContext';
import { EveIcon } from './EveIcon';
import { EveLoginButton } from './EveLoginButton';

interface QuickSetupModalProps {
  sdeStatus: SdeStatusSnapshot | null;
  onSdeUpdated: (status: SdeStatusSnapshot) => void;
  onClose: () => void;
}

export function QuickSetupModal({ sdeStatus, onSdeUpdated, onClose }: QuickSetupModalProps) {
  const { updateSettings } = useTheme();
  const { characters, isAuthenticating, authError, loginCharacter, clearAuthError } = useAccounts();

  const [sdeBusy, setSdeBusy] = useState(false);
  const [sdeProgress, setSdeProgress] = useState<SdeImportProgress | null>(null);
  const [sdeError, setSdeError] = useState<string | null>(null);
  const [chatLogDir, setChatLogDir] = useState('');

  useEffect(() => {
    void window.eveLens.intelTracker.getLogDir().then(setChatLogDir);
    return window.eveLens.sde.onImportProgress((p) => {
      setSdeProgress(p);
      if (p.stage === 'error') setSdeError(p.message);
    });
  }, []);

  const handleSelectChatLogDir = async () => {
    const chosen = await window.eveLens.intelTracker.selectLogDir();
    if (chosen) setChatLogDir(chosen);
  };

  const handleDownloadSde = async () => {
    setSdeBusy(true);
    setSdeError(null);
    try {
      const next = await window.eveLens.sde.importFuzzwork();
      onSdeUpdated(next);
    } catch (err) {
      setSdeError(err instanceof Error ? err.message : 'SDE download failed');
    } finally {
      setSdeBusy(false);
    }
  };

  const handleLocalSqlite = async () => {
    setSdeBusy(true);
    setSdeError(null);
    try {
      const next = await window.eveLens.sde.importLocalSqlite();
      onSdeUpdated(next);
    } catch (err) {
      setSdeError(err instanceof Error ? err.message : 'Local SQLite import failed');
    } finally {
      setSdeBusy(false);
    }
  };

  const handleFinish = async () => {
    await updateSettings({ quickSetupCompleted: true });
    onClose();
  };

  const sdeReady = Boolean(sdeStatus?.installed);
  const charReady = characters.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="photon-panel flex max-h-[90vh] w-full max-w-2xl flex-col shadow-2xl">
        <div className="photon-header flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              New Eden Lens — Quick Setup
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleFinish()}
            className="text-eve-muted hover:text-eve-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          {/* Step 1: Local SDE */}
          <section className="space-y-2.5 border border-eve-border bg-eve-bg/60 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-eve-text">
                <Database className="h-4 w-4 text-eve-accent" />
                Step 1: Static Data Export (SDE)
              </div>
              {sdeReady ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-eve-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Installed ({sdeStatus?.counts.types.toLocaleString()} types)
                </span>
              ) : (
                <span className="text-[11px] text-eve-warning">Required for items, maps &amp; skills</span>
              )}
            </div>

            <div className="space-y-1.5 border border-eve-border/70 bg-eve-panel/60 p-2.5 text-[11px] text-eve-muted">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-eve-accent" />
                <div>
                  <strong className="text-eve-text">Why do you need this?</strong> The SDE is EVE Online&apos;s offline game catalog (all ships, modules, items, solar systems, stargate connections, and skill trees). Installing it locally lets New Eden Lens calculate routes, ship fittings, appraisals, and market lookups instantly without waiting on external servers.
                </div>
              </div>
              <ul className="ml-5 list-disc space-y-1">
                <li>
                  <strong className="text-eve-text">Download Fuzzwork SDE:</strong> Automatically downloads the latest community-packaged EVE static data tables from Fuzzwork and imports them into your local database.
                </li>
                <li>
                  <strong className="text-eve-text">Import Local SQLite:</strong> Lets you pick a pre-downloaded Fuzzwork <code className="text-eve-text">sqlite-latest.sqlite</code> file from your computer if you already have one or want to import offline.
                </li>
              </ul>
              <div className="flex items-center gap-1.5 pt-0.5 text-[10px] text-eve-text/80">
                <HardDrive className="h-3 w-3 text-eve-accent" />
                <span>
                  Disk space required: approximately <strong>180–250 MB</strong> in your local app data folder.
                </span>
              </div>
            </div>

            {sdeProgress && (
              <div className="space-y-1 border border-eve-border bg-eve-panel p-2">
                <div className="flex justify-between text-[11px]">
                  <span className="uppercase text-eve-accent">{sdeProgress.stage}</span>
                  <span className="num-mono">{sdeProgress.progressPct}%</span>
                </div>
                <div className="h-1.5 w-full bg-eve-elevated">
                  <div
                    className="h-full bg-eve-accent transition-all"
                    style={{ width: `${Math.min(100, sdeProgress.progressPct)}%` }}
                  />
                </div>
                <div className="truncate text-[10px] text-eve-muted">{sdeProgress.message}</div>
              </div>
            )}
            {sdeError && <div className="text-eve-danger">{sdeError}</div>}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sdeBusy}
                onClick={() => void handleDownloadSde()}
                className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 font-semibold text-eve-accent hover:bg-eve-accent/25 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {sdeBusy ? 'Downloading...' : sdeReady ? 'Re-Download SDE' : 'Download Fuzzwork SDE'}
              </button>
              <button
                type="button"
                disabled={sdeBusy}
                onClick={() => void handleLocalSqlite()}
                className="inline-flex items-center gap-1.5 border border-eve-border-strong bg-eve-elevated px-3 py-1.5 text-eve-text hover:border-eve-accent disabled:opacity-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Import Local SQLite
              </button>
            </div>
          </section>

          {/* Step 2: Link Your First Character */}
          <section className="space-y-3 border border-eve-border bg-eve-bg/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-eve-text">
                Step 2: Link Your First Character
              </span>
              {charReady && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-eve-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {characters.length} Linked
                </span>
              )}
            </div>

            <p className="text-[11px] text-eve-muted">
              Sign in with EVE Online SSO to sync your character&apos;s wallet, assets, skills, fittings, standings, and autopilot waypoints. You can add more characters or accounts later from the top bar.
            </p>

            {authError && (
              <div className="flex items-center justify-between border border-eve-danger/50 bg-eve-danger/10 px-2.5 py-1.5 text-eve-danger">
                <span>{authError}</span>
                <button type="button" onClick={clearAuthError} className="underline">
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <EveLoginButton
                compact
                loading={isAuthenticating}
                onClick={() => void loginCharacter()}
              />

              {characters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {characters.slice(0, 4).map((c) => (
                    <div
                      key={c.characterId}
                      className="flex items-center gap-1.5 border border-eve-border bg-eve-panel px-2 py-1"
                    >
                      <EveIcon
                        path={`characters/${c.characterId}/portrait?size=64`}
                        size={20}
                        alt={c.characterName}
                      />
                      <span className="text-[11px] text-eve-text">{c.characterName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Step 3: Optional EVE Chatlog Folder */}
          <section className="space-y-2.5 border border-eve-border bg-eve-bg/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-eve-text">
                Step 3 (Optional): Select EVE Chatlogs Folder
              </span>
              <span className="text-[11px] text-eve-muted">For Live Chatlog Intel</span>
            </div>

            <div className="flex items-start gap-2 border border-eve-border/70 bg-eve-panel/60 p-2.5 text-[11px] text-eve-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-eve-accent" />
              <div>
                <strong className="text-eve-text">Why is this useful?</strong> EVE Online writes real-time intel &amp; chat messages to your local <code className="text-eve-text">Documents\EVE\logs\Chatlogs</code> folder. Selecting it lets Live Chatlog Intel watch your intel channels for nearby hostiles and keywords automatically. If your EVE logs are in the default Documents folder, you can skip this step.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="max-w-md truncate font-mono text-[11px] text-eve-muted">
                {chatLogDir || 'Default EVE Chatlogs Folder'}
              </span>
              <button
                type="button"
                onClick={() => void handleSelectChatLogDir()}
                className="inline-flex items-center gap-1.5 border border-eve-border-strong bg-eve-elevated px-3 py-1.5 text-eve-text hover:border-eve-accent"
              >
                <FolderOpen className="h-3.5 w-3.5 text-eve-accent" />
                Select Chatlog Folder
              </button>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-eve-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => void handleFinish()}
            className="border border-eve-accent/60 bg-eve-accent-muted px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25"
          >
            Finish Quick Setup
          </button>
        </div>
      </div>
    </div>
  );
}
