import { useEffect, useState } from 'react';
import {
  Activity,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  HelpCircle,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Radar,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
  X
} from 'lucide-react';
import { AdminPage, type ReleaseEntry } from './components/AdminPage';
import { SpaceCanvas } from './components/SpaceCanvas';

const DISCORD_URL = 'https://discord.new-eden-lens.com';
const GITHUB_URL = 'https://github.com/Yoast79/New-Eden-Lens';

const FEATURES = [
  {
    icon: MapIcon,
    title: 'Navigation & Maps Hub',
    desc: 'Switch between an interactive 2.5D Cluster Map and a clean Flat Map with live GPS tracking, Route Planner, Thera/Turnur wormholes, and an instant 5,211-station Structure Browser.'
  },
  {
    icon: BellRing,
    title: 'Live Chatlog Intel (IntelTracker)',
    desc: 'Watch multiple EVE chatlog channels simultaneously in an auto-splitting grid. Set custom sounds, per-tracker jump ranges, name-mention alerts, and Popout Overlay badges.'
  },
  {
    icon: Crosshair,
    title: 'Live Killboard & Lookup',
    desc: 'Real-time zKillboard stream filtered by your custom tracker groups, paired with instant character, corp, alliance, ship, and system lookup.'
  },
  {
    icon: TrendingUp,
    title: 'Market, Appraisal & LP Store',
    desc: 'Paste cargo or contracts for instant hub appraisals, inspect 60-day market history, track active orders, and calculate top ISK/LP conversion offers.'
  },
  {
    icon: Wrench,
    title: 'Ship Fitter & Fleet Planner',
    desc: 'Import EFT fits or sync from ESI, simulate implants and pilot skills in a circular Photon fitting ring, and organize fleet doctrine compositions.'
  },
  {
    icon: Building2,
    title: 'Structures & Fuel Monitor',
    desc: 'Monitor corporation-owned structures with fuel countdowns, low-fuel alerts, reinforce/attack warnings, online services, and custom war timers.'
  },
  {
    icon: Radar,
    title: 'Always-On-Top Popout Overlay',
    desc: 'Compact overlay window that attaches to your EVE client with Local/D-Scan, Live Kills, Live Alerts (with unread red-dot badges), and Wormhole tracking.'
  },
  {
    icon: Activity,
    title: 'Local-First EVE SSO (PKCE)',
    desc: 'Multi-character OAuth via official EVE SSO PKCE. Tokens are encrypted locally using Windows DPAPI and never sent to any external server.'
  }
];

const SCREENSHOT_PREVIEWS = [
  {
    id: 'maps',
    title: '2.5D & Flat Tactical Maps',
    subtitle: 'Anti-overlap schematic layout, live GPS follow, ice belts, and instant Structure Browser.',
    accent: 'from-sky-500/20 to-cyan-500/5',
    badge: 'Navigation & Maps'
  },
  {
    id: 'intel',
    title: 'Multi-Tracker Live Chatlog Intel',
    subtitle: 'Auto-splitting tracker panes, custom WebAudio alerts, and Popout Overlay routing.',
    accent: 'from-emerald-500/20 to-sky-500/5',
    badge: 'IntelTracker'
  },
  {
    id: 'structures',
    title: 'Corporation Structures & Timers',
    subtitle: 'Real-time fuel monitor, reinforce/attack alerts, and custom war timers.',
    accent: 'from-amber-500/20 to-rose-500/5',
    badge: 'Structures'
  },
  {
    id: 'overlay',
    title: 'In-Game Popout Overlay',
    subtitle: 'Compact always-on-top D-Scan, Kills, Alerts, and Wormhole companion.',
    accent: 'from-purple-500/20 to-sky-500/5',
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
    a: 'Windows SmartScreen shows a warning for newly released executables that do not yet have an expensive EV code-signing certificate. You can verify the SHA-256 checksum on the Download section, check the VirusTotal report, or inspect and build the app directly from the GitHub repository.'
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

export function App() {
  const isAdminRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/admin' || window.location.hash === '#admin');

  const [showAdmin, setShowAdmin] = useState(isAdminRoute);
  const [downloads, setDownloads] = useState<number>(0);
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [copiedHash, setCopiedHash] = useState(false);
  const [lightbox, setLightbox] = useState<(typeof SCREENSHOT_PREVIEWS)[number] | null>(null);

  // Contact form state
  const [cName, setCName] = useState('');
  const [cContact, setCContact] = useState('');
  const [cSubject, setCSubject] = useState('Feedback / Feature Request');
  const [cMessage, setCMessage] = useState('');
  const [cWebsite, setCWebsite] = useState(''); // honeypot
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
  }, [showAdmin]);

  if (showAdmin) {
    return (
      <div className="relative min-h-screen bg-[#070B12] text-slate-100">
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
      '+ Navigation & Maps hub with 2.5D Map, Flat Map, Route Planner, Thera/Turnur, and static Structure Browser\n+ Live Chatlog Intel (IntelTracker) with multi-tracker split screen & Popout Overlay\n+ Structures module with fuel monitor & attack warnings'
  };

  const handleCopySha = () => {
    if (!latest.sha256) return;
    void navigator.clipboard.writeText(latest.sha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#070B12] text-slate-100">
      <SpaceCanvas />

      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-sky-500/20 bg-[#070B12]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="#" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center border border-sky-400/50 bg-sky-500/15">
              <Rocket className="h-4 w-4 text-sky-300" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wider uppercase text-slate-100">
                New Eden Lens
              </div>
              <div className="text-[10px] uppercase tracking-widest text-sky-400">
                Photon Tactical Suite
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-6 text-xs font-medium text-slate-300 md:flex">
            <a href="#features" className="hover:text-sky-300">Features</a>
            <a href="#screenshots" className="hover:text-sky-300">Screenshots</a>
            <a href="#download" className="hover:text-sky-300">Download</a>
            <a href="#patch-notes" className="hover:text-sky-300">Patch Notes</a>
            <a href="#faq" className="hover:text-sky-300">FAQ</a>
            <a href="#contact" className="hover:text-sky-300">Contact</a>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 border border-indigo-400/50 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 sm:inline-flex"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Discord
            </a>
            <a
              href="#download"
              className="inline-flex items-center gap-1.5 border border-sky-400/70 bg-sky-500/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-500/30"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-24 px-4 py-14">
        {/* Hero */}
        <section className="grid items-center gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="inline-flex flex-wrap items-center gap-2 border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Latest Release: {latest.version}</span>
              <span className="text-slate-500">•</span>
              <span>{downloads.toLocaleString()} Downloads</span>
              <span className="text-slate-500">•</span>
              <span>Open Source</span>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Your All-in-One{' '}
              <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-amber-300 bg-clip-text text-transparent">
                EVE Online
              </span>{' '}
              Tactical Companion.
            </h1>

            <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Built in the crisp Photon UI style. Explore 2.5D &amp; Flat tactical maps, monitor live
              chatlog intel across multiple trackers, track structure fuel &amp; timers, appraise cargo,
              fit ships, and keep an always-on-top Popout Overlay right over your client.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/download"
                className="animate-pulse-glow inline-flex items-center gap-2 border border-sky-400 bg-sky-500/25 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-500/35"
              >
                <Download className="h-4 w-4 text-sky-300" />
                Download for Windows ({latest.version})
              </a>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-indigo-400/50 bg-indigo-500/15 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-indigo-200 hover:bg-indigo-500/25"
              >
                <MessageSquare className="h-4 w-4" />
                Join Discord
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-slate-700 bg-slate-900/70 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:border-sky-400/60"
              >
                View Source
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Animated App Preview Card */}
          <div className="lg:col-span-5">
            <div className="photon-panel animate-float-slow space-y-3 p-4">
              <div className="flex items-center justify-between border-b border-sky-500/20 pb-2 text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-sky-300">
                  Live Intel &amp; Tactical Telemetry
                </span>
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Connected
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="border border-slate-800 bg-[#070B12]/80 p-3">
                  <div className="text-[10px] uppercase text-slate-400">Static Stations</div>
                  <div className="mt-1 font-mono text-lg font-bold text-sky-300">5,211</div>
                  <div className="text-[10px] text-slate-500">Instant local browser</div>
                </div>
                <div className="border border-slate-800 bg-[#070B12]/80 p-3">
                  <div className="text-[10px] uppercase text-slate-400">Intel Sound Alerts</div>
                  <div className="mt-1 font-mono text-lg font-bold text-amber-300">12 Tones</div>
                  <div className="text-[10px] text-slate-500">Per-keyword &amp; overlay</div>
                </div>
                <div className="border border-slate-800 bg-[#070B12]/80 p-3">
                  <div className="text-[10px] uppercase text-slate-400">Map Styles</div>
                  <div className="mt-1 font-mono text-sm font-bold text-emerald-300">2.5D + Flat</div>
                  <div className="text-[10px] text-slate-500">Live GPS &amp; Fleet</div>
                </div>
                <div className="border border-slate-800 bg-[#070B12]/80 p-3">
                  <div className="text-[10px] uppercase text-slate-400">Auth Security</div>
                  <div className="mt-1 font-mono text-sm font-bold text-sky-300">PKCE + DPAPI</div>
                  <div className="text-[10px] text-slate-500">100% Local Tokens</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="space-y-6">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Capabilities</div>
            <h2 className="text-2xl font-bold text-white">Everything You Need in One Neocom</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="photon-panel space-y-2.5 p-4 transition-transform hover:-translate-y-0.5">
                  <div className="inline-flex h-8 w-8 items-center justify-center border border-sky-400/40 bg-sky-500/15 text-sky-300">
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
              <h2 className="text-2xl font-bold text-white">Screenshots &amp; Views</h2>
            </div>
            <span className="text-xs text-slate-400">Click any preview to inspect</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {SCREENSHOT_PREVIEWS.map((shot) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => setLightbox(shot)}
                className="photon-panel group overflow-hidden text-left transition-transform hover:-translate-y-0.5"
              >
                <div className={`relative h-48 bg-gradient-to-br ${shot.accent} p-4`}>
                  <img
                    src={`/screenshots/${shot.id}.png`}
                    alt={shot.title}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <span className="relative z-10 inline-block border border-sky-400/50 bg-[#070B12]/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                    {shot.badge}
                  </span>
                </div>
                <div className="p-4">
                  <div className="text-sm font-semibold text-white group-hover:text-sky-300">{shot.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{shot.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Download & Trust */}
        <section id="download" className="photon-panel grid gap-6 p-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-400">
              <Download className="h-4 w-4" />
              Download Installer
            </div>
            <h2 className="text-2xl font-bold text-white">
              New Eden Lens {latest.version} — Windows 10/11
            </h2>
            <p className="text-xs leading-relaxed text-slate-300">
              Downloads are counted anonymously. Because the installer is community-built and open source,
              we publish the full source code on GitHub alongside release checksums so you can verify every build.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/download"
                className="inline-flex items-center gap-2 border border-sky-400 bg-sky-500/25 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-500/35"
              >
                <Download className="h-4 w-4 text-sky-300" />
                Download {latest.version} {latest.fileSize ? `(${latest.fileSize})` : ''}
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-sky-400"
              >
                Inspect on GitHub
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {latest.virusTotalUrl && (
                <a
                  href={latest.virusTotalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  VirusTotal Scan
                </a>
              )}
            </div>

            {latest.sha256 && (
              <div className="flex items-center justify-between gap-2 border border-slate-800 bg-[#070B12] px-3 py-2 text-[11px]">
                <span className="truncate font-mono text-slate-400">SHA-256: {latest.sha256}</span>
                <button
                  type="button"
                  onClick={handleCopySha}
                  className="inline-flex shrink-0 items-center gap-1 text-sky-300 hover:text-sky-200"
                >
                  {copiedHash ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedHash ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4 text-xs lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Security &amp; SmartScreen Info
            </div>
            <ul className="space-y-2 text-slate-300">
              <li>• Total tracked downloads: <strong className="font-mono text-sky-300">{downloads.toLocaleString()}</strong></li>
              <li>• If Windows SmartScreen says &ldquo;Windows protected your PC&rdquo;, click <strong>More info → Run anyway</strong> (standard for unsigned open-source installers).</li>
              <li>• All EVE SSO tokens are stored locally with Windows DPAPI encryption — zero telemetry or remote token storage.</li>
            </ul>
          </div>
        </section>

        {/* Patch Notes */}
        <section id="patch-notes" className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Changelog</div>
            <h2 className="text-2xl font-bold text-white">Patch Notes</h2>
          </div>

          <div className="space-y-4">
            {(releases.length > 0 ? releases : [latest]).map((rel) => (
              <div key={rel.id} className="photon-panel space-y-2.5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="border border-sky-400/50 bg-sky-500/15 px-2 py-0.5 font-mono text-xs font-bold text-sky-300">
                      {rel.version}
                    </span>
                    <h3 className="text-sm font-semibold text-white">{rel.title}</h3>
                  </div>
                  <span className="font-mono text-xs text-slate-400">{rel.date}</span>
                </div>
                <ul className="space-y-1 text-xs leading-relaxed text-slate-300">
                  {rel.notes
                    .split(/\r?\n/)
                    .filter((l) => l.trim())
                    .map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Support</div>
            <h2 className="text-2xl font-bold text-white">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-2">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="photon-panel">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-white"
                  >
                    <span className="inline-flex items-center gap-2">
                      <HelpCircle className="h-3.5 w-3.5 text-sky-400" />
                      {item.q}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-800/80 px-4 py-3 text-xs leading-relaxed text-slate-300">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact Form (Server-side Discord Webhook) */}
        <section id="contact" className="photon-panel p-6">
          <div className="mb-4 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Get in Touch</div>
            <h2 className="text-2xl font-bold text-white">Contact &amp; Feedback</h2>
            <p className="text-xs text-slate-400">
              Send bug reports, feature ideas, or questions directly to our Discord team channel.
            </p>
          </div>

          <form onSubmit={(e) => void handleContactSubmit(e)} className="grid gap-3 text-xs sm:grid-cols-2">
            {/* Honeypot anti-spam field */}
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
                className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">Discord Handle or Email</span>
              <input
                type="text"
                value={cContact}
                onChange={(e) => setCContact(e.target.value)}
                placeholder="username or email@domain.com"
                className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase text-slate-400">Subject</span>
              <select
                value={cSubject}
                onChange={(e) => setCSubject(e.target.value)}
                className="w-full border border-slate-700 bg-[#070B12] px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
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
                className="w-full border border-slate-700 bg-[#070B12] p-3 text-slate-100 outline-none focus:border-sky-400"
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
                className="inline-flex items-center gap-2 border border-sky-400/70 bg-sky-500/20 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {cBusy ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </form>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-[#05080E] py-8 text-xs text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:text-left">
          <div className="space-y-1">
            <div className="font-semibold text-slate-200">New Eden Lens</div>
            <div className="text-[11px] text-slate-500">
              EVE Online and the EVE logo are the registered trademarks of Fenris Creations. All rights reserved.
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div
            className="photon-panel w-full max-w-3xl space-y-3 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-semibold text-white">{lightbox.title}</span>
              <button type="button" onClick={() => setLightbox(null)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={`relative h-80 bg-gradient-to-br ${lightbox.accent}`}>
              <img
                src={`/screenshots/${lightbox.id}.png`}
                alt={lightbox.title}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="h-full w-full object-contain"
              />
            </div>
            <p className="text-xs text-slate-300">{lightbox.subtitle}</p>
          </div>
        </div>
      )}
    </div>
  );
}

