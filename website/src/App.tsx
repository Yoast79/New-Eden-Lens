import { useEffect, useState } from 'react';
import {
  Activity,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  Coins,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  Heart,
  HelpCircle,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
  X
} from 'lucide-react';
import { AdminPage, type ReleaseEntry, type ScreenshotEntry } from './components/AdminPage';
import { SpaceCanvas } from './components/SpaceCanvas';

const DISCORD_URL = 'https://discord.new-eden-lens.com';
const GITHUB_URL = 'https://github.com/Yoast79/New-Eden-Lens';
const RECRUIT_URL =
  'https://www.eveonline.com/signup?invc=1d722c89-d13f-4c71-928b-d2e0f05aa5a0';

const FEATURES = [
  {
    icon: MapIcon,
    title: 'Navigation & Maps Hub',
    desc: '2.5D Cluster & Flat Map with live GPS follow, Route Planner, Thera/Turnur wormholes, and an instant 5,211-station Structure Browser.',
    span: 'lg:col-span-2'
  },
  {
    icon: BellRing,
    title: 'Live Chatlog Intel',
    desc: 'Multi-tracker split screen, custom WebAudio alerts, per-tracker jump ranges, and Popout Overlay badges.',
    span: ''
  },
  {
    icon: Crosshair,
    title: 'Live Killboard & Lookup',
    desc: 'Real-time zKillboard stream filtered by your tracker groups plus instant entity lookup.',
    span: ''
  },
  {
    icon: TrendingUp,
    title: 'Market, Appraisal & LP Store',
    desc: 'Paste cargo or contracts for instant hub appraisals, 60-day history, and ISK/LP offers.',
    span: ''
  },
  {
    icon: Wrench,
    title: 'Ship Fitter & Fleet Planner',
    desc: 'Import EFT fits or sync from ESI, simulate implants/skills, and organize fleet doctrines.',
    span: ''
  },
  {
    icon: Building2,
    title: 'Structures & Fuel Monitor',
    desc: 'Corporation structure fuel countdowns, low-fuel alerts, attack warnings, and custom war timers.',
    span: 'lg:col-span-2'
  },
  {
    icon: Radar,
    title: 'In-Game Popout Overlay',
    desc: 'Always-on-top compact overlay with Local/D-Scan, Live Kills, Live Alerts, and Wormhole tracking.',
    span: 'lg:col-span-2'
  },
  {
    icon: Activity,
    title: 'Local-First EVE SSO (PKCE)',
    desc: 'Multi-character OAuth via official EVE SSO PKCE. Tokens stay encrypted locally with Windows DPAPI.',
    span: 'lg:col-span-2'
  }
];

const FALLBACK_PREVIEWS = [
  {
    id: 'maps',
    title: '2.5D & Flat Tactical Maps',
    description: 'Anti-overlap schematic layout, live GPS follow, ice belts, and instant Structure Browser.',
    accent: 'from-sky-500/25 via-cyan-500/10 to-transparent',
    badge: 'Navigation & Maps'
  },
  {
    id: 'intel',
    title: 'Multi-Tracker Live Chatlog Intel',
    description: 'Auto-splitting tracker panes, custom WebAudio alerts, and Popout Overlay routing.',
    accent: 'from-emerald-500/25 via-sky-500/10 to-transparent',
    badge: 'IntelTracker'
  },
  {
    id: 'structures',
    title: 'Corporation Structures & Timers',
    description: 'Real-time fuel monitor, reinforce/attack alerts, and custom war timers.',
    accent: 'from-amber-500/25 via-rose-500/10 to-transparent',
    badge: 'Structures'
  },
  {
    id: 'overlay',
    title: 'In-Game Popout Overlay',
    description: 'Compact always-on-top D-Scan, Kills, Alerts, and Wormhole companion.',
    accent: 'from-purple-500/25 via-sky-500/10 to-transparent',
    badge: 'Overlay'
  }
];

const FAQS = [
  {
    q: 'Is New Eden Lens safe to use with my EVE Online account?',
    a: 'Yes. New Eden Lens uses official EVE Online SSO with OAuth 2.0 PKCE. Your refresh tokens are encrypted locally via Windows DPAPI inside your AppData folder and never leave your PC. The entire source code is open on GitHub for full inspection.'
  },
  {
    q: 'Why does Windows SmartScreen warn about an unsigned .exe?',
    a: 'Windows SmartScreen shows a warning for newly released executables without an expensive EV code-signing certificate. You can inspect and build the app directly from our public GitHub repository or check the VirusTotal scan link when provided.'
  },
  {
    q: 'Does Live Chatlog Intel read EVE game memory?',
    a: 'No. It only reads the standard UTF-16LE chatlog text files that EVE Online writes to your Documents\\EVE\\logs\\Chatlogs folder, in full compliance with EVE Online third-party tool guidelines.'
  },
  {
    q: 'Where does the Static Data Export (SDE) come from?',
    a: 'During Quick Setup, you can download the latest community Fuzzwork SDE directly or import a local sqlite-latest.sqlite file. Everything runs locally on your machine for instant route planning, fitting, and market lookups.'
  },
  {
    q: 'Does it support multiple EVE accounts and characters?',
    a: 'Yes! You can link as many characters across multiple accounts as you want, switch active pilots from the top bar, or view aggregated assets and multi-character alerts.'
  }
];

function renderFormattedNotes(notes: string) {
  const cleaned = notes.replace(/&nbsp;/gi, ' ').trim();
  const hasHtml = /<[a-z][\s\S]*>/i.test(cleaned);
  if (hasHtml) {
    return (
      <div
        className="space-y-1.5 text-xs leading-relaxed text-slate-300 [&_a]:text-sky-400 [&_a]:underline [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-sky-300 [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
    );
  }
  return (
    <ul className="space-y-1 text-xs leading-relaxed text-slate-300">
      {cleaned
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((line, i) => (
          <li key={i}>{line}</li>
        ))}
    </ul>
  );
}

export function App() {
  const isAdminRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/admin' || window.location.hash === '#admin');

  const [showAdmin, setShowAdmin] = useState(isAdminRoute);
  const [downloads, setDownloads] = useState<number>(0);
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [copiedIsk, setCopiedIsk] = useState(false);
  const [lightbox, setLightbox] = useState<{ title: string; description: string; imageUrl?: string; accent?: string } | null>(null);

  const [cName, setCName] = useState('');
  const [cContact, setCContact] = useState('');
  const [cSubject, setCSubject] = useState('Feedback / Feature Request');
  const [cMessage, setCMessage] = useState('');
  const [cWebsite, setCWebsite] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [cResult, setCResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    void fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { downloads?: number } | null) => {
        if (d && typeof d.downloads === 'number') setDownloads(d.downloads);
      })
      .catch(() => {});

    void fetch('/api/releases')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { releases?: ReleaseEntry[] } | null) => {
        if (d?.releases) setReleases(d.releases);
      })
      .catch(() => {});

    void fetch('/api/screenshots')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { screenshots?: ScreenshotEntry[] } | null) => {
        if (d?.screenshots) setScreenshots(d.screenshots);
      })
      .catch(() => {});
  }, [showAdmin]);

  if (showAdmin) {
    return (
      <div className="relative min-h-screen bg-[#04070E] text-slate-100">
        <SpaceCanvas />
        <AdminPage
          onBack={() => {
            if (window.location.pathname === '/admin') {
              window.history.pushState({}, '', '/');
            } else {
              window.location.hash = '';
            }
            setShowAdmin(false);
          }}
        />
      </div>
    );
  }

  const latest = releases[0] ?? {
    id: 'rel-0-2-0',
    version: 'v0.2.0',
    title: 'Tactical Maps, Multi-Tracker Intel & Structures Hub',
    date: '2026-11-27',
    downloadUrl: '/api/download',
    fileSize: '~118 MB',
    notes:
      '<ul><li><strong>Navigation &amp; Maps:</strong> 2.5D Map, Flat Map, Route Planner, Thera/Turnur, and static Structure Browser</li><li><strong>Live Chatlog Intel:</strong> Multi-tracker split screen &amp; Popout Overlay</li><li><strong>Structures:</strong> Fuel monitor &amp; attack warnings</li></ul>'
  };

  const directDownloadHref = latest.r2Key
    ? `/api/download?file=${encodeURIComponent(latest.r2Key)}`
    : '/api/download';

  const heroScreenshot = screenshots.find((s) => s.destination === 'hero');
  const galleryScreenshots = screenshots.filter((s) => s.destination !== 'hero');

  const handleCopyIskName = () => {
    void navigator.clipboard.writeText('NE Lens');
    setCopiedIsk(true);
    setTimeout(() => setCopiedIsk(false), 2000);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCBusy(true);
    setCResult(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cName,
          contact: cContact,
          subject: cSubject,
          message: cMessage,
          website: cWebsite
        })
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setCResult({ ok: false, msg: data.error ?? 'Could not send message. Try Discord instead.' });
      } else {
        setCResult({ ok: true, msg: 'Message sent! We will get back to you soon.' });
        setCName('');
        setCContact('');
        setCMessage('');
      }
    } catch {
      setCResult({ ok: false, msg: 'Network error sending message.' });
    } finally {
      setCBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#04070E] text-slate-100">
      <SpaceCanvas />

      {/* Fixed Floating Navigation (always stays in place on scroll) */}
      <header className="fixed left-0 right-0 top-3 z-40 mx-auto max-w-6xl px-4">
        <div className="hud-pill flex items-center justify-between px-4 py-2 shadow-2xl">
          <a href="#" className="flex items-center gap-2.5">
            <img
              src="/icon.png"
              alt="New Eden Lens Logo"
              className="h-8 w-8 rounded-full border border-sky-400/50 bg-[#04070E] object-contain p-0.5"
            />
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-white">New Eden Lens</div>
              <div className="text-[9px] uppercase tracking-widest text-sky-400">Photon Tactical Suite</div>
            </div>
          </a>

          <nav className="hidden items-center gap-5 text-xs font-medium text-slate-300 lg:flex">
            <a href="#features" className="hover:text-sky-300">Features</a>
            <a href="#screenshots" className="hover:text-sky-300">Screenshots</a>
            <a href="#download" className="hover:text-sky-300">Download</a>
            <a href="#patch-notes" className="hover:text-sky-300">Patch Notes</a>
            <a href="#support" className="hover:text-amber-300">1M Free SP</a>
            <a href="#faq" className="hover:text-sky-300">FAQ</a>
            <a href="#contact" className="hover:text-sky-300">Contact</a>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-full border border-indigo-400/50 bg-indigo-500/15 px-3.5 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/30 sm:inline-flex"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Discord
            </a>
            <a
              href={directDownloadHref}
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/70 bg-gradient-to-r from-sky-500/30 to-cyan-500/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white hover:from-sky-500/45 hover:to-cyan-500/45"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-28 px-4 pb-16 pt-24">
        {/* Hero */}
        <section className="grid items-center gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-6">
            <div className="hud-pill inline-flex flex-wrap items-center gap-2 px-3.5 py-1 text-[11px] font-semibold text-sky-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>{latest.version}</span>
              <span className="text-slate-600">•</span>
              <span>{downloads.toLocaleString()} Downloads</span>
              <span className="text-slate-600">•</span>
              <span>100% Free &amp; Open Source</span>
            </div>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              Command New Eden with{' '}
              <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-purple-300 bg-clip-text text-transparent">
                Next-Gen Tactical Intel.
              </span>
            </h1>

            <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              An ultra-fast, local-first EVE Online desktop companion styled after Photon UI.
              Navigate 2.5D &amp; Flat maps, run multi-tracker chatlog alerts, monitor corporation
              structures, appraise loot, and fly with an always-on-top Popout Overlay.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={directDownloadHref}
                download
                className="animate-pulse-glow inline-flex items-center gap-2 rounded-full border border-sky-400 bg-gradient-to-r from-sky-500/35 to-cyan-500/30 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:from-sky-500/50 hover:to-cyan-500/45"
              >
                <Download className="h-4 w-4 text-sky-200" />
                Download {latest.version}
              </a>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-indigo-400/50 bg-indigo-500/15 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-indigo-200 hover:bg-indigo-500/30"
              >
                <MessageSquare className="h-4 w-4" />
                Join Discord
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:border-sky-400/60"
              >
                GitHub
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Hero Futuristic Showcase */}
          <div className="lg:col-span-6">
            <div className="photon-panel animate-float-slow overflow-hidden p-4">
              {heroScreenshot ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold uppercase tracking-wider text-sky-300">
                      {heroScreenshot.title}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Live Preview
                    </span>
                  </div>
                  <img
                    src={heroScreenshot.imageUrl}
                    alt={heroScreenshot.title}
                    className="h-64 w-full rounded-xl border border-sky-500/20 object-cover"
                  />
                  {heroScreenshot.description && (
                    <p className="text-xs text-slate-300">{heroScreenshot.description}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-sky-500/20 pb-2 text-[11px]">
                    <span className="font-semibold uppercase tracking-wider text-sky-300">
                      Tactical Telemetry Hub
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Online
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-slate-800/80 bg-[#04070E]/75 p-3.5">
                      <div className="text-[10px] uppercase text-slate-400">Static Stations</div>
                      <div className="mt-1 font-mono text-xl font-bold text-sky-300">5,211</div>
                      <div className="text-[10px] text-slate-500">Zero-latency local lookup</div>
                    </div>
                    <div className="rounded-xl border border-slate-800/80 bg-[#04070E]/75 p-3.5">
                      <div className="text-[10px] uppercase text-slate-400">Audio Alerts</div>
                      <div className="mt-1 font-mono text-xl font-bold text-amber-300">12 Tones</div>
                      <div className="text-[10px] text-slate-500">Custom per-tracker triggers</div>
                    </div>
                    <div className="rounded-xl border border-slate-800/80 bg-[#04070E]/75 p-3.5">
                      <div className="text-[10px] uppercase text-slate-400">Map Engines</div>
                      <div className="mt-1 font-mono text-base font-bold text-emerald-300">2.5D + Flat</div>
                      <div className="text-[10px] text-slate-500">Live GPS &amp; Fleet positions</div>
                    </div>
                    <div className="rounded-xl border border-slate-800/80 bg-[#04070E]/75 p-3.5">
                      <div className="text-[10px] uppercase text-slate-400">Security</div>
                      <div className="mt-1 font-mono text-base font-bold text-purple-300">PKCE + DPAPI</div>
                      <div className="text-[10px] text-slate-500">100% Local Encrypted Tokens</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Bento Features */}
        <section id="features" className="space-y-6">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Modules</div>
            <h2 className="text-3xl font-bold text-white">Built for Solo Pilots, FCs &amp; Industrialists</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={`photon-panel space-y-2.5 p-5 hover:-translate-y-1 ${f.span}`}
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/15 text-sky-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                  <p className="text-xs leading-relaxed text-slate-400">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Screenshots */}
        <section id="screenshots" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Interface</div>
              <h2 className="text-3xl font-bold text-white">Screenshots &amp; Views</h2>
            </div>
            <span className="text-xs text-slate-400">Click any preview to expand</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {galleryScreenshots.length > 0
              ? galleryScreenshots.map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() =>
                      setLightbox({
                        title: shot.title,
                        description: shot.description,
                        imageUrl: shot.imageUrl
                      })
                    }
                    className="photon-panel group overflow-hidden text-left hover:-translate-y-1"
                  >
                    <div className="relative h-56 overflow-hidden bg-[#04070E]">
                      <img
                        src={shot.imageUrl}
                        alt={shot.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="hud-pill absolute left-3 top-3 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                        {shot.destination}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="text-sm font-semibold text-white group-hover:text-sky-300">
                        {shot.title}
                      </div>
                      {shot.description && (
                        <div className="mt-1 text-xs text-slate-400">{shot.description}</div>
                      )}
                    </div>
                  </button>
                ))
              : FALLBACK_PREVIEWS.map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() =>
                      setLightbox({
                        title: shot.title,
                        description: shot.description,
                        accent: shot.accent
                      })
                    }
                    className="photon-panel group overflow-hidden text-left hover:-translate-y-1"
                  >
                    <div className={`relative h-52 bg-gradient-to-br ${shot.accent} p-4`}>
                      <span className="hud-pill inline-block px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                        {shot.badge}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="text-sm font-semibold text-white group-hover:text-sky-300">
                        {shot.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{shot.description}</div>
                    </div>
                  </button>
                ))}
          </div>
        </section>

        {/* Download */}
        <section id="download" className="photon-panel grid gap-6 p-7 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-400">
              <Download className="h-4 w-4" />
              Direct Download
            </div>
            <h2 className="text-2xl font-bold text-white">
              New Eden Lens {latest.version} — Windows 10/11
            </h2>
            <p className="text-xs leading-relaxed text-slate-300">
              Hosted directly on our global Cloudflare R2 edge network. Every build is compiled from
              our transparent open-source repository on GitHub.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={directDownloadHref}
                download
                className="inline-flex items-center gap-2 rounded-full border border-sky-400 bg-gradient-to-r from-sky-500/35 to-cyan-500/30 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:from-sky-500/50 hover:to-cyan-500/45"
              >
                <Download className="h-4 w-4 text-sky-200" />
                Download {latest.version} {latest.fileSize ? `(${latest.fileSize})` : ''}
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-sky-400"
              >
                Inspect Source on GitHub
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {latest.virusTotalUrl && (
                <a
                  href={latest.virusTotalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  VirusTotal Scan
                </a>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4 text-xs lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Security &amp; SmartScreen Info
            </div>
            <ul className="space-y-2 text-slate-300">
              <li>• Total downloads: <strong className="font-mono text-sky-300">{downloads.toLocaleString()}</strong></li>
              <li>• If Windows SmartScreen prompts &ldquo;Windows protected your PC&rdquo;, click <strong>More info → Run anyway</strong>.</li>
              <li>• All EVE SSO tokens are encrypted locally via Windows DPAPI — zero remote token storage.</li>
            </ul>
          </div>
        </section>

        {/* Donation & 1,000,000 Free SP */}
        <section id="support" className="grid gap-5 lg:grid-cols-2">
          <div className="photon-panel flex flex-col justify-between space-y-4 p-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-300">
                <Heart className="h-4 w-4" />
                Support Development
              </div>
              <h3 className="text-xl font-bold text-white">In-Game ISK Donations</h3>
              <p className="text-xs leading-relaxed text-slate-300">
                New Eden Lens is 100% free with zero paywalls or subscriptions. If it saves your
                fleet time or ISK, voluntary in-game ISK donations are always appreciated!
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-[#04070E]/80 p-3.5">
              <div className="flex items-center gap-2.5">
                <Coins className="h-5 w-5 text-amber-300" />
                <div>
                  <div className="text-[10px] uppercase text-slate-400">In-Game Recipient</div>
                  <div className="text-sm font-bold text-white">NE Lens</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyIskName}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/15 px-3.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
              >
                {copiedIsk ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedIsk ? 'Copied' : 'Copy Name'}
              </button>
            </div>
          </div>

          <div className="photon-panel flex flex-col justify-between space-y-4 border-sky-400/35 p-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-300">
                <Sparkles className="h-4 w-4" />
                EVE Online Referral
              </div>
              <h3 className="text-xl font-bold text-white">Claim 1,000,000 Free Skill Points</h3>
              <p className="text-xs leading-relaxed text-slate-300">
                Creating a new EVE account (or claiming on an eligible account that hasn&apos;t used a
                referral link yet) grants <strong className="text-white">1,000,000 unallocated Skill Points</strong> right away—and supports New Eden Lens whenever you upgrade to Omega or buy PLEX at zero extra cost to you.
              </p>
            </div>
            <a
              href={RECRUIT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-400/60 bg-sky-500/20 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-sky-100 hover:bg-sky-500/35"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Claim 1,000,000 Free Skill Points
            </a>
          </div>
        </section>

        {/* Patch Notes */}
        <section id="patch-notes" className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Changelog</div>
            <h2 className="text-3xl font-bold text-white">Patch Notes</h2>
          </div>

          <div className="space-y-4">
            {(releases.length > 0 ? releases : [latest]).map((rel) => (
              <div key={rel.id} className="photon-panel space-y-3 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-full border border-sky-400/50 bg-sky-500/15 px-3 py-0.5 font-mono text-xs font-bold text-sky-300">
                      {rel.version}
                    </span>
                    <h3 className="text-sm font-semibold text-white">{rel.title}</h3>
                  </div>
                  <span className="font-mono text-xs text-slate-400">{rel.date}</span>
                </div>
                {renderFormattedNotes(rel.notes)}
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Support</div>
            <h2 className="text-3xl font-bold text-white">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-2.5">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="photon-panel">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left text-xs font-semibold text-white"
                  >
                    <span className="inline-flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-sky-400" />
                      {item.q}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-800/80 px-5 py-3.5 text-xs leading-relaxed text-slate-300">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact Form */}
        <section id="contact" className="photon-panel p-7">
          <div className="mb-4 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Get in Touch</div>
            <h2 className="text-2xl font-bold text-white">Contact &amp; Feedback</h2>
            <p className="text-xs text-slate-400">
              Send bug reports, feature ideas, or questions directly to our Discord team channel.
            </p>
          </div>

          <form onSubmit={(e) => void handleContactSubmit(e)} className="grid gap-3 text-xs sm:grid-cols-2">
            <input
              type="text"
              value={cWebsite}
              onChange={(e) => setCWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
            />
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">Pilot / Name *</span>
              <input
                type="text"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                required
                placeholder="Your character or name"
                className="w-full rounded-lg border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">Discord Handle or Email</span>
              <input
                type="text"
                value={cContact}
                onChange={(e) => setCContact(e.target.value)}
                placeholder="username or email@domain.com"
                className="w-full rounded-lg border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase text-slate-400">Subject</span>
              <select
                value={cSubject}
                onChange={(e) => setCSubject(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
              >
                <option value="Feedback / Feature Request">Feedback / Feature Request</option>
                <option value="Bug Report">Bug Report</option>
                <option value="Partnership / Corp Setup">Partnership / Corp Setup</option>
                <option value="General Question">General Question</option>
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase text-slate-400">Message *</span>
              <textarea
                rows={4}
                value={cMessage}
                onChange={(e) => setCMessage(e.target.value)}
                required
                placeholder="Write your message..."
                className="w-full rounded-lg border border-slate-700 bg-[#070B12] p-3 text-slate-100 outline-none focus:border-sky-400"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
              {cResult ? (
                <span className={cResult.ok ? 'text-emerald-300' : 'text-rose-400'}>{cResult.msg}</span>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Delivered securely via Cloudflare Pages Functions.
                </span>
              )}
              <button
                type="submit"
                disabled={cBusy}
                className="inline-flex items-center gap-2 rounded-full border border-sky-400/70 bg-sky-500/20 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {cBusy ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </form>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-[#03050A]/90 py-8 text-xs text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <img
              src="/icon.png"
              alt="New Eden Lens Logo"
              className="h-9 w-9 shrink-0 rounded-full border border-sky-500/30 bg-[#04070E] object-contain p-0.5"
            />
            <div className="space-y-1">
              <div className="font-semibold text-slate-200">New Eden Lens</div>
              <div className="text-[11px] text-slate-500">
                Disclaimer: All in-game assets, ships, icons, and trademarks used in this application belong to Fenris Creations. EVE Online and the EVE logo are the registered trademarks of Fenris Creations.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="hover:text-sky-300">
              Discord
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-sky-300">
              GitHub
            </a>
            <button
              type="button"
              onClick={() => setShowAdmin(true)}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-400"
              title="Release Admin"
            >
              <Lock className="h-3 w-3" />
            </button>
          </div>
        </div>
      </footer>

      {/* Screenshot Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div className="photon-panel w-full max-w-4xl space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-semibold text-white">{lightbox.title}</span>
              <button type="button" onClick={() => setLightbox(null)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {lightbox.imageUrl ? (
              <img src={lightbox.imageUrl} alt={lightbox.title} className="max-h-[70vh] w-full rounded-xl object-contain" />
            ) : (
              <div className={`h-80 rounded-xl bg-gradient-to-br ${lightbox.accent ?? 'from-sky-500/20 to-transparent'}`} />
            )}
            <p className="text-xs text-slate-300">{lightbox.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
