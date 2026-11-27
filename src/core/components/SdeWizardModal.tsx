import { useEffect, useState } from 'react';
import { Database, Download, FolderOpen, X } from 'lucide-react';
import type { SdeImportProgress, SdeStatusSnapshot } from '@shared/types/esi';

interface SdeWizardModalProps {
  sdeStatus: SdeStatusSnapshot | null;
  onUpdated: (status: SdeStatusSnapshot) => void;
  onClose: () => void;
}

export function SdeWizardModal({ sdeStatus, onUpdated, onClose }: SdeWizardModalProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SdeImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.eveLens.sde.onImportProgress((p) => {
      setProgress(p);
      if (p.stage === 'error') {
        setError(p.message);
      }
    });
  }, []);

  const handleFuzzworkDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await window.eveLens.sde.importFuzzwork();
      onUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fuzzwork import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleLocalSqlite = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await window.eveLens.sde.importLocalSqlite();
      onUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Local SQLite import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="photon-panel w-full max-w-lg shadow-2xl">
        <div className="photon-header flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Local EVE Static Data Export (SDE)
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-eve-muted hover:text-eve-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <p className="text-xs leading-relaxed text-eve-muted">
            Index Fuzzwork&apos;s EVE Static Data Export into local SQLite for instant offline item
            lookups, stargate graphs, Dogma attributes, and market group metadata.
          </p>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatBox label="InvTypes" value={sdeStatus?.counts.types ?? 0} />
            <StatBox label="Systems" value={sdeStatus?.counts.systems ?? 0} />
            <StatBox label="Stargates" value={sdeStatus?.counts.stargates ?? 0} />
            <StatBox label="Dogma Attrs" value={sdeStatus?.counts.dogmaAttributes ?? 0} />
          </div>

          {progress && (
            <div className="space-y-1.5 border border-eve-border bg-eve-bg/70 p-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="uppercase tracking-wider text-eve-accent">{progress.stage}</span>
                <span className="num-mono text-eve-text">{progress.progressPct}%</span>
              </div>
              <div className="h-1.5 w-full bg-eve-elevated">
                <div
                  className="h-full bg-eve-accent transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, progress.progressPct))}%` }}
                />
              </div>
              <div className="truncate text-[11px] text-eve-muted">{progress.message}</div>
            </div>
          )}

          {error && (
            <div className="border border-eve-danger/50 bg-eve-danger/10 p-2.5 text-xs text-eve-danger">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleFuzzworkDownload()}
              className="flex flex-1 items-center justify-center gap-2 border border-eve-accent/60 bg-eve-accent-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider text-eve-accent hover:bg-eve-accent/25 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {busy ? 'Importing...' : 'Download Fuzzwork SDE'}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLocalSqlite()}
              className="flex flex-1 items-center justify-center gap-2 border border-eve-border-strong bg-eve-elevated px-3 py-2 text-xs font-medium text-eve-text hover:border-eve-accent disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Import Local SQLite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-eve-border bg-eve-bg/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-eve-muted">{label}</div>
      <div className="num-mono mt-1 text-sm font-semibold text-eve-text">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

