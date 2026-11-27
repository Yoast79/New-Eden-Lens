import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bold,
  CheckCircle2,
  Code,
  Edit3,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  LogOut,
  RemoveFormatting,
  Send,
  Strikethrough,
  Trash2,
  Underline,
  Upload,
  X
} from 'lucide-react';

export interface ReleaseEntry {
  id: string;
  version: string;
  title: string;
  date: string;
  downloadUrl: string;
  r2Key?: string;
  fileSize?: string;
  virusTotalUrl?: string;
  notes: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function AdminPage({ onBack }: { onBack: () => void }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [version, setVersion] = useState('v0.2.1');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [downloadUrl, setDownloadUrl] = useState('/api/download');
  const [r2Key, setR2Key] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [virusTotalUrl, setVirusTotalUrl] = useState('');
  const [notesHtml, setNotesHtml] = useState(
    '<ul><li><strong>Added:</strong> </li><li><strong>Improved:</strong> </li><li><strong>Fixed:</strong> </li></ul>'
  );
  const [postToDiscord, setPostToDiscord] = useState(true);

  const [uploadingExe, setUploadingExe] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== notesHtml) {
      editorRef.current.innerHTML = notesHtml;
    }
  }, [editingId, authenticated]);

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

  const execFormat = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    if (editorRef.current) setNotesHtml(editorRef.current.innerHTML);
  };

  const handleInsertLink = () => {
    const url = window.prompt('Enter URL (https://...):');
    if (url && url.trim()) {
      execFormat('createLink', url.trim());
    }
  };

  const handleExeUpload = async (file: File) => {
    setUploadingExe(true);
    setUploadStatus(`Starting upload for ${file.name} (${formatBytes(file.size)})...`);
    try {
      const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks (well below Cloudflare's 100 MB request limit)

      if (file.size <= CHUNK_SIZE) {
        const res = await fetch(`/api/admin/upload?filename=${encodeURIComponent(file.name)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file
        });
        const data = (await res.json().catch(() => ({}))) as {
          r2Key?: string;
          downloadUrl?: string;
          error?: string;
        };
        if (!res.ok || !data.r2Key) {
          setUploadStatus(`Upload failed (HTTP ${res.status}): ${data.error ?? res.statusText}`);
          return;
        }
        setR2Key(data.r2Key);
        setDownloadUrl(data.downloadUrl || `/api/download?file=${encodeURIComponent(data.r2Key)}`);
        setFileSize(formatBytes(file.size));
        setUploadStatus(`Uploaded to R2: ${file.name} (${formatBytes(file.size)})`);
        return;
      }

      // Chunked Multipart Upload for large installers (>10 MB)
      const startRes = await fetch(
        `/api/admin/upload?action=start&filename=${encodeURIComponent(file.name)}`,
        { method: 'POST' }
      );
      const startData = (await startRes.json().catch(() => ({}))) as {
        r2Key?: string;
        uploadId?: string;
        error?: string;
      };
      if (!startRes.ok || !startData.r2Key || !startData.uploadId) {
        setUploadStatus(
          `Failed to start R2 upload (HTTP ${startRes.status}): ${startData.error ?? startRes.statusText}`
        );
        return;
      }

      const totalParts = Math.ceil(file.size / CHUNK_SIZE);
      const uploadedParts: Array<{ partNumber: number; etag: string }> = [];

      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1;
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);
        const pct = Math.round((i / totalParts) * 100);
        setUploadStatus(`Uploading ${file.name} to R2... ${pct}% (part ${partNumber}/${totalParts})`);

        const partRes = await fetch(
          `/api/admin/upload?action=part&r2Key=${encodeURIComponent(startData.r2Key)}&uploadId=${encodeURIComponent(startData.uploadId)}&partNumber=${partNumber}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk
          }
        );
        const partData = (await partRes.json().catch(() => ({}))) as {
          partNumber?: number;
          etag?: string;
          error?: string;
        };
        if (!partRes.ok || !partData.etag) {
          setUploadStatus(
            `Chunk ${partNumber}/${totalParts} failed (HTTP ${partRes.status}): ${partData.error ?? partRes.statusText}`
          );
          return;
        }
        uploadedParts.push({ partNumber, etag: partData.etag });
      }

      setUploadStatus(`Finalizing ${file.name} in R2...`);
      const completeRes = await fetch(
        `/api/admin/upload?action=complete&r2Key=${encodeURIComponent(startData.r2Key)}&uploadId=${encodeURIComponent(startData.uploadId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parts: uploadedParts })
        }
      );
      const completeData = (await completeRes.json().catch(() => ({}))) as {
        r2Key?: string;
        downloadUrl?: string;
        error?: string;
      };
      if (!completeRes.ok || !completeData.r2Key) {
        setUploadStatus(
          `Finalize failed (HTTP ${completeRes.status}): ${completeData.error ?? completeRes.statusText}`
        );
        return;
      }

      setR2Key(completeData.r2Key);
      setDownloadUrl(
        completeData.downloadUrl || `/api/download?file=${encodeURIComponent(completeData.r2Key)}`
      );
      setFileSize(formatBytes(file.size));
      setUploadStatus(`Uploaded to R2: ${file.name} (${formatBytes(file.size)})`);
    } catch (err) {
      setUploadStatus(
        `Network error uploading installer to R2: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setUploadingExe(false);
    }
  };

  const startEditRelease = (rel: ReleaseEntry) => {
    setEditingId(rel.id);
    setVersion(rel.version);
    setTitle(rel.title);
    setDate(rel.date);
    setDownloadUrl(rel.downloadUrl || '/api/download');
    setR2Key(rel.r2Key ?? '');
    setFileSize(rel.fileSize ?? '');
    setVirusTotalUrl(rel.virusTotalUrl ?? '');
    const html = rel.notes.trim().startsWith('<')
      ? rel.notes
      : `<ul>${rel.notes
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((l) => `<li>${l}</li>`)
          .join('')}</ul>`;
    setNotesHtml(html);
    if (editorRef.current) editorRef.current.innerHTML = html;
    setPostToDiscord(false);
    setStatusMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingId(null);
    setVersion('v0.2.1');
    setTitle('');
    setDate(new Date().toISOString().slice(0, 10));
    setDownloadUrl('/api/download');
    setR2Key('');
    setFileSize('');
    setVirusTotalUrl('');
    const def =
      '<ul><li><strong>Added:</strong> </li><li><strong>Improved:</strong> </li><li><strong>Fixed:</strong> </li></ul>';
    setNotesHtml(def);
    if (editorRef.current) editorRef.current.innerHTML = def;
    setPostToDiscord(true);
    setUploadStatus(null);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    const currentNotes = editorRef.current ? editorRef.current.innerHTML : notesHtml;
    try {
      const res = await fetch('/api/admin/releases', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId ?? undefined,
          version,
          title,
          date,
          downloadUrl,
          r2Key,
          fileSize,
          virusTotalUrl,
          notes: currentNotes,
          postToDiscord
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        releases?: ReleaseEntry[];
        discordPosted?: boolean;
        discordError?: string;
      };
      if (!res.ok) {
        setStatusMsg({ ok: false, text: data.error ?? 'Failed to save release.' });
        return;
      }
      if (data.releases) setReleases(data.releases);
      const action = editingId ? `Updated ${version}` : `Published ${version}`;
      if (postToDiscord) {
        if (data.discordPosted) {
          setStatusMsg({ ok: true, text: `${action} & posted announcement to Discord!` });
        } else {
          setStatusMsg({
            ok: false,
            text: `${action}, but Discord failed: ${data.discordError ?? 'Unknown Discord error'}`
          });
        }
      } else {
        setStatusMsg({ ok: true, text: `${action}!` });
      }
      resetForm();
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
      if (editingId === id) resetForm();
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
            Upload your installer to Cloudflare R2, edit rich patch notes, and post to Discord.
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
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="font-semibold uppercase tracking-wider text-sky-300">
            {editingId ? `Editing Release: ${version}` : 'New Release'}
          </span>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              Cancel Edit
            </button>
          )}
        </div>

        {/* R2 Installer Upload Box */}
        <div className="border border-dashed border-sky-500/40 bg-[#070B12]/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sky-200">Upload Installer (.exe) to Cloudflare R2</div>
              <div className="text-[11px] text-slate-400">
                Automatically stores the installer in your <code className="text-sky-300">LENS_R2</code> bucket and fills in the direct download link &amp; file size.
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".exe,.msi,.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleExeUpload(file);
                }}
              />
              <button
                type="button"
                disabled={uploadingExe}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 border border-sky-400/60 bg-sky-500/20 px-3 py-1.5 font-semibold text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploadingExe ? 'Uploading to R2...' : 'Choose Installer File'}
              </button>
            </div>
          </div>
          {uploadStatus && <div className="mt-2 text-[11px] text-emerald-300">{uploadStatus}</div>}
        </div>

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              R2 Download Endpoint (Auto-Populated)
            </span>
            <input
              type="text"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="/api/download?file=..."
              className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 font-mono text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">File Size</span>
            <input
              type="text"
              value={fileSize}
              onChange={(e) => setFileSize(e.target.value)}
              placeholder="118.4 MB"
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

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">VirusTotal Scan URL (Optional)</span>
          <input
            type="url"
            value={virusTotalUrl}
            onChange={(e) => setVirusTotalUrl(e.target.value)}
            placeholder="https://www.virustotal.com/..."
            className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
          />
        </label>

        {/* Rich Text WYSIWYG Editor */}
        <div className="space-y-2">
          <span className="block text-[10px] uppercase tracking-wider text-slate-400">
            Patch Notes (Rich Text Editor) *
          </span>
          <div className="flex flex-wrap items-center gap-1 border border-slate-700 bg-[#0D1520] p-1.5">
            <button
              type="button"
              onClick={() => execFormat('bold')}
              title="Bold"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execFormat('italic')}
              title="Italic"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execFormat('underline')}
              title="Underline"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <Underline className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execFormat('strikeThrough')}
              title="Strikethrough"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </button>
            <span className="mx-1 h-4 w-px bg-slate-700" />
            <button
              type="button"
              onClick={() => execFormat('formatBlock', 'h3')}
              title="Heading"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <Heading2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execFormat('insertUnorderedList')}
              title="Bullet List"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execFormat('insertOrderedList')}
              title="Numbered List"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </button>
            <span className="mx-1 h-4 w-px bg-slate-700" />
            <button
              type="button"
              onClick={handleInsertLink}
              title="Insert Link"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const sel = window.getSelection()?.toString();
                if (sel) execFormat('insertHTML', `<code>${sel}</code>`);
              }}
              title="Inline Code"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <Code className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execFormat('removeFormat')}
              title="Clear Formatting"
              className="border border-transparent p-1.5 text-slate-300 hover:border-sky-400/50 hover:text-sky-300"
            >
              <RemoveFormatting className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setNotesHtml(e.currentTarget.innerHTML)}
            className="min-h-[180px] border border-t-0 border-slate-700 bg-[#070B12] p-3 text-xs leading-relaxed text-slate-100 outline-none focus:border-sky-400 [&_code]:bg-slate-800 [&_code]:px-1 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-sky-300 [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc [&_a]:text-sky-400 [&_a]:underline"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={postToDiscord}
              onChange={(e) => setPostToDiscord(e.target.checked)}
              className="accent-sky-400"
            />
            Post embedded patch notes + direct download link to Discord
          </label>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 border border-sky-400/60 bg-sky-500/20 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Publish Release'}
          </button>
        </div>

        {statusMsg && (
          <div
            className={`flex items-center gap-2 border px-3 py-2 ${
              statusMsg.ok
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            }`}
          >
            {statusMsg.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
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
              <div className="min-w-0 flex-1 truncate">
                <span className="font-bold text-sky-300">{r.version}</span>
                <span className="mx-2 text-slate-500">•</span>
                <span className="font-semibold text-slate-100">{r.title}</span>
                <span className="ml-2 text-slate-400">({r.date})</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEditRelease(r)}
                  className="inline-flex items-center gap-1 border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-sky-300 hover:border-sky-400"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(r.id)}
                  className="border border-slate-700 bg-slate-900 p-1 text-slate-400 hover:border-rose-500/50 hover:text-rose-400"
                  title="Delete release"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
