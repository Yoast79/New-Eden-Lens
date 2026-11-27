import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  LogOut,
  Plus,
  Send,
  Trash2
} from 'lucide-react';

export interface ReleaseEntry {
  id: string;
  version: string;
  title: string;
  date: string;
  downloadUrl: string;
  sha256?: string;
  fileSize?: string;
  virusTotalUrl?: string;
  notes: string;
}

export function AdminPage({ onBack }: { onBack: () => void }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [version, setVersion] = useState('v0.2.1');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [downloadUrl, setDownloadUrl] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [sha256, setSha256] = useState('');
  const [virusTotalUrl, setVirusTotalUrl] = useState('');
  const [notes, setNotes] = useState('+ Added \n* Improved \n! Fixed ');
  const [postToDiscord, setPostToDiscord] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadReleases = async () => {
    const res = await fetch('/api/releases');
    if (res.ok) {
      const data = (await res.json()) as { releases: ReleaseEntry[] };
      setReleases(data.releases ?? []);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/session');
        if (res.ok) {
          const data = (await res.json()) as { authenticated: boolean };
          setAuthenticated(data.authenticated);
          if (data.authenticated) await loadReleases();
        }
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setAuthError(err.error ?? 'Authentication failed.');
      return;
    }
    setPassword('');
    setAuthenticated(true);
    await loadReleases();
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthenticated(false);
  };

  const insertPrefix = (prefix: string) => {
    setNotes((prev) => `${prev}${prev.endsWith('\n') || prev === '' ? '' : '\n'}${prefix} `);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version,
          title,
          date,
          downloadUrl,
          fileSize,
          sha256,
          virusTotalUrl,
          notes,
          postToDiscord
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        releases?: ReleaseEntry[];
        discordPosted?: boolean;
      };
      if (!res.ok) {
        setStatusMsg(data.error ?? 'Failed to publish release.');
        return;
      }
      if (data.releases) setReleases(data.releases);
      setTitle('');
      setStatusMsg(
        `Published ${version}${data.discordPosted ? ' & posted announcement to Discord!' : '!'}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/releases?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const data = (await res.json()) as { releases?: ReleaseEntry[] };
      if (data.releases) setReleases(data.releases);
    }
  };

  if (checking) {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 text-sm text-slate-400">
        Verifying session...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <form onSubmit={(e) => void handleLogin(e)} className="photon-panel w-full max-w-sm space-y-4 p-6">
          <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-sky-300">
              <Lock className="h-4 w-4" />
              Restricted Access
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-sky-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Home
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Enter your Cloudflare admin password to publish releases and patch notes.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin Password"
            className="w-full border border-sky-500/30 bg-[#070B12] px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
            required
          />
          {authError && <div className="text-xs text-rose-400">{authError}</div>}
          <button
            type="submit"
            className="w-full border border-sky-400/60 bg-sky-500/20 py-2 text-xs font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-500/30"
          >
            Unlock Release Studio
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="photon-panel flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div>
          <h1 className="text-base font-bold uppercase tracking-wider text-sky-300">
            Release &amp; Patch Notes Studio
          </h1>
          <p className="text-xs text-slate-400">
            Publishing updates the live Download link, Patch Notes page, and posts to Discord.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:border-sky-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Site
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-1 border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      <form onSubmit={(e) => void handlePublish(e)} className="photon-panel space-y-4 p-5 text-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Version *</span>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v0.2.1"
              required
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Release Title *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. IntelTracker Multi-Setup & Static Structure Browser"
              required
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Installer Download URL (R2 or GitHub Release) *
            </span>
            <input
              type="url"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://github.com/Yoast79/New-Eden-Lens/releases/download/v0.2.1/New-Eden-Lens-Setup.exe"
              required
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Release Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">File Size</span>
            <input
              type="text"
              value={fileSize}
              onChange={(e) => setFileSize(e.target.value)}
              placeholder="118 MB"
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">SHA-256 Checksum</span>
            <input
              type="text"
              value={sha256}
              onChange={(e) => setSha256(e.target.value)}
              placeholder="Optional SHA-256 hash"
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 font-mono text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">VirusTotal URL</span>
            <input
              type="url"
              value={virusTotalUrl}
              onChange={(e) => setVirusTotalUrl(e.target.value)}
              placeholder="https://www.virustotal.com/..."
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
        </div>

        {/* Rich Patch Notes Editor + Live Preview */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Patch Notes *</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => insertPrefix('+ Added')}
                className="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"
              >
                <Plus className="h-2.5 w-2.5" /> Added
              </button>
              <button
                type="button"
                onClick={() => insertPrefix('* Improved')}
                className="border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300"
              >
                * Improved
              </button>
              <button
                type="button"
                onClick={() => insertPrefix('! Fixed')}
                className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"
              >
                ! Fixed
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <textarea
              rows={8}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              className="w-full border border-slate-700 bg-[#070B12] p-3 font-mono text-xs text-slate-100 outline-none focus:border-sky-400"
            />
            <div className="border border-slate-800 bg-[#070B12]/70 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">Live Preview</div>
              <ul className="space-y-1.5 text-xs">
                {notes
                  .split(/\r?\n/)
                  .filter((l) => l.trim())
                  .map((line, i) => (
                    <li key={i} className="text-slate-200">
                      {line}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={postToDiscord}
              onChange={(e) => setPostToDiscord(e.target.checked)}
              className="accent-sky-400"
            />
            Automatically post embedded patch notes + download link to Discord
          </label>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 border border-sky-400/60 bg-sky-500/20 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {saving ? 'Publishing...' : 'Publish Release'}
          </button>
        </div>

        {statusMsg && (
          <div className="flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {statusMsg}
          </div>
        )}
      </form>

      {/* Existing Releases */}
      <div className="photon-panel p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-300">
          Published Releases ({releases.length})
        </h2>
        <div className="space-y-2">
          {releases.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border border-slate-800 bg-[#070B12]/70 px-3 py-2 text-xs"
            >
              <div>
                <span className="font-bold text-sky-300">{r.version}</span>
                <span className="mx-2 text-slate-500">•</span>
                <span className="font-semibold text-slate-100">{r.title}</span>
                <span className="ml-2 text-slate-400">({r.date})</span>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(r.id)}
                className="text-slate-500 hover:text-rose-400"
                title="Delete release"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

