import { useState } from 'react';
import { BookOpen, Bug, Lightbulb, MessageSquare, ShieldCheck, X } from 'lucide-react';
import { MODULE_REGISTRY } from '@/modules/registry';

export const APP_VERSION = 'v0.2.0';

const MODULE_TUTORIALS: Record<string, string[]> = {
  'item-evaluator': [
    'Open your EVE Hangar, Cargo, or Contract window, select items, and press Ctrl+C.',
    'Click Paste & Appraise (or press Ctrl+V anywhere in New Eden Lens) or Clear to reset.',
    'Switch between Jita, Amarr, Dodixie, Rens, and Hek to compare Buy, Sell, Split, and total hauling m³.'
  ],
  'skill-planner': [
    'Skill Monitor & Queue: View your active skill queue with live countdown timers, completion dates, trained/untrained skills, attributes, and active implants.',
    'Skill & Injector Planner: Search any ship, module, or skill (or paste an EFT fit) to calculate missing SP, training times, and Large/Small Skill Injectors.',
    'SP Farming (WIP): Future home for multi-character Skill Extractor profit and Omega/PLEX break-even tracking.'
  ],
  'tactical-map': [
    'Tactical Map: Zoom out for all of New Eden with region borders and Pochven, switch overlays (Security, Kills, Jumps, Sov), and right-click systems to Set Destination or mark notes.',
    'Route Planner: Pick Origin & Destination (or paste an EVE route), optimize by Shortest, Highsec, Avoid Low/Null, or Most Dangerous, and push Waypoints to EVE Autopilot (requires esi-ui.write_waypoint.v1).',
    'Thera / Turnur: Browse live EVE-Scout wormhole connections with Posted age, TTL (Time To Live), ship size limits, jump distances, and one-click Dest.'
  ],
  'local-intel': [
    'Copy your D-Scan (Ctrl+A then Ctrl+C) or Local Chat pilot list and paste into New Eden Lens.',
    'D-Scan hulls are grouped by class (Capitals, Recon/Cyno, Logistics, Tackle, Frigates–Battleships, Mining, Haulers).',
    'Local pilots read your in-game Character/Corp/Alliance standings via ESI; click a pilot name to open their public killboard profile or click Set to add a custom standing/note.'
  ],
  'intel-tracker': [
    'Live Chatlog Intel watches your local EVE Chatlogs folder (select a custom folder anytime) in real time.',
    'Create multiple alert trackers with custom channels, keywords, per-alert sounds, and range sources.',
    'Turned-off trackers minimize into a stack below active trackers so you can re-enable them anytime.'
  ],
  'market-tracker': [
    'Item Appraisal: Paste EVE hangar, cargo, or contract items (Ctrl+V) to appraise Buy, Sell, Split, and hauling m³ across major trade hubs.',
    'Market & Investments: Inspect 60-day price history, daily trade velocity, and log personal buy/sell investments.',
    'Active Orders & Contracts: Track buy/sell orders (red = undercut/overbid, green = top price) and Active/Contract History (requires esi-markets.read_character_orders.v1 & esi-contracts.read_character_contracts.v1).',
    'LP Conversion: Compare ISK/LP offers across NPC corporations with active LP stores (optional esi-characters.read_loyalty.v1 for pilot balances).'
  ],
  killboard: [
    'Live Killboard: Real-time zKillboard stream filtered by your Tracker Groups. Click the lookup icon on any ship, pilot, or system to jump straight to Killboard Lookup, or click a row to open on zKillboard.',
    'Killboard Lookup: Lazy-search any Character, Corporation, Alliance, Ship, or System, filter All/Kills/Losses, open on zKillboard, or click Add to Tracker to watch that entity live.'
  ],
  'structure-timers': [
    'Sync owned corporation structures via ESI to track low fuel (< 7 days) and vulnerability/reinforce timers.',
    'Add manual war-target structures with Shield, Armor, Hull, or Anchoring timers and click Set Dest to route directly.'
  ],
  'ship-fitter': [
    'Import an EFT fit, sync saved fittings from ESI, or build a fit from scratch using the circular EVE-style fitting ring.',
    'Simulate active implants and switch skill calculation between Selected Pilot, All Level 0, or All Level 1–5.'
  ],
  'fleet-planner': [
    'Create a fleet composition with name & description, then add saved ship fits with role labels (FC, DPS, Logi, Miner, Tackle, etc.).'
  ],
  'assets-browser': [
    'Sync ESI assets for the Active Pilot or switch to All Characters for a complete searchable inventory.',
    'View specific ship/container, NPC station, and Upwell structure locations with estimated ISK values and one-click Set Dest.'
  ],
  'pilot-analytics': [
    'Select a pilot (or All Characters) to view wallet + asset net worth history, ISK/hr/24h/7d KPIs, Top Asset, and Top Ship.',
    'Check your Jump Clone station names, active implants, and live Jump Clone cooldown countdown.'
  ],
  'wormhole-mapper': [
    'Auto-tracks your active character across J-space wormholes (including the K-space entry and exit portals).',
    'Toggle Eveeye-style node details (Class, Effect, Statics, Sigs, Pilots), paste Cosmic Signatures, or click Clear Chain to start fresh.'
  ],
  'sp-farming': [
    'Work In Progress: Will track multi-character 5.5M+ SP thresholds, Skill Extractor timers, and Omega/PLEX break-even profit.'
  ],
  'planetary-interaction': [
    'Colonies & Timers: Sync active planetary colonies across one or all registered characters to monitor live extractor expiration countdowns, hourly extraction rates, Launchpad/Storage fill bars, and one-click Set Dest.',
    'P1–P4 Profit Calculator: Compare live profit/day, customs office (POCO) import/export taxes, and margins across all P1–P4 schematics by trade hub, and click any commodity to inspect its full production chain.',
    'Planet Guide: Reference all 8 EVE planet types, their raw P0 resources, and which P2 commodities can be produced on a single planet.'
  ],
  'mining-tracker': [
    'Mining Ledger: Sync your character mining ledger via ESI (requires esi-industry.read_character_mining.v1) to view mined ores, compressed ore values, and reprocessed mineral values.',
    'Yield & Fleet Split: Estimate real-time ISK/hour and m³/hour per barge or exhumer, compare raw vs compressed vs reprocessed yields, and calculate fleet payout splits.'
  ],
  'industry-calculator': [
    'Crafting Calculator: Search any blueprint/product, configure ME/TE, Structure, Rig, Facility Tax, Market Hub, and Industry Implants (auto-detected from your pilot or simulated).',
    'Route Optimizer: Switch between Cheapest, Fastest, or Custom per-item Craft/Buy and Mine/Buy switches (green highlights the active method), optionally deduct owned assets (Use Own Materials), and export Shopping (Multibuy), Gathering, Craft Queue, and Missing Blueprints.',
    'Blueprint Browser & Active Jobs: Search owned BPOs/BPCs across all characters with Maxed (10/20) vs Can Improve indicators, Set Dest, Load in Calc, and live industry job countdown timers.'
  ],
  'lp-conversion': [
    'Pick a popular NPC corporation or type in Search LP Store (fuzzy matching only shows NPC corporations with active LP stores).',
    'Compare Instant Buy vs. Sell Order ISK/LP across trade hubs, including ISK fees and required trade-in item costs.',
    'Requires optional scope esi-characters.read_loyalty.v1 to display your pilot LP balances (click Update Scopes in Accounts & Pilots).'
  ],
  'thera-turnur': [
    'Browse live Thera and Turnur wormhole connections from EVE-Scout with Posted age, TTL (Time To Live), max ship size, and space class filters.',
    'Set your origin system (or quick-pick Jita, Amarr, Dodixie, Rens, Hek) and sort by jump distance or TTL.',
    'Click Dest to set your EVE Autopilot destination (requires esi-ui.write_waypoint.v1).'
  ]
};

export function HelpModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'walkthroughs' | 'disclaimers'>('walkthroughs');
  const [selectedId, setSelectedId] = useState(MODULE_REGISTRY[0]?.id ?? 'item-evaluator');
  const [feedbackNotice, setFeedbackNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<'bug' | 'feature' | null>(null);
  const [fbTitle, setFbTitle] = useState('');
  const [fbContact, setFbContact] = useState('');
  const [fbMessage, setFbMessage] = useState('');
  const [fbIncludeMeta, setFbIncludeMeta] = useState(true);
  const [fbSending, setFbSending] = useState(false);

  const selectedMod = MODULE_REGISTRY.find((m) => m.id === selectedId);
  const steps = MODULE_TUTORIALS[selectedId] ?? [];

  const handleOpenFeedback = (kind: 'bug' | 'feature') => {
    setFeedbackKind((prev) => (prev === kind ? null : kind));
    setFeedbackNotice(null);
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackKind || fbSending) return;
    setFbSending(true);
    setFeedbackNotice(null);
    try {
      const res = await window.eveLens.app.submitFeedback({
        kind: feedbackKind,
        title: fbTitle,
        message: fbMessage,
        contact: fbContact || undefined,
        appVersion: fbIncludeMeta ? APP_VERSION : undefined
      });
      if (res.ok) {
        setFeedbackNotice({
          ok: true,
          msg: `${feedbackKind === 'bug' ? 'Bug report' : 'Feature request'} sent! Thank you for helping improve New Eden Lens.`
        });
        setFbTitle('');
        setFbMessage('');
        setFeedbackKind(null);
      } else {
        setFeedbackNotice({ ok: false, msg: res.error ?? 'Failed to send feedback.' });
      }
    } catch {
      setFeedbackNotice({ ok: false, msg: 'Failed to send feedback.' });
    } finally {
      setFbSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="photon-panel flex max-h-[88vh] w-full max-w-3xl flex-col shadow-2xl">
        <div className="photon-header flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Help &amp; Walkthroughs
            </span>
            <span className="num-mono border border-eve-border bg-eve-bg px-1.5 py-0.2 text-[10px] text-eve-accent">
              {APP_VERSION}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-eve-muted hover:text-eve-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Top Tab Bar + Community Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel/70 px-4 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('walkthroughs')}
              className={`border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                activeTab === 'walkthroughs'
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              Module Walkthroughs
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('disclaimers')}
              className={`inline-flex items-center gap-1.5 border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                activeTab === 'disclaimers'
                  ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Disclaimers
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                void window.eveLens.app.openExternal('https://discord.gg/tWM8wSJrfM')
              }
              className="inline-flex items-center gap-1 border border-indigo-400/50 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/25"
            >
              <MessageSquare className="h-3 w-3" />
              Join Discord
            </button>
            <button
              type="button"
              onClick={() => handleOpenFeedback('bug')}
              className={`inline-flex items-center gap-1 border px-2.5 py-1 text-[11px] ${
                feedbackKind === 'bug'
                  ? 'border-eve-danger/70 bg-eve-danger/15 font-semibold text-eve-danger'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:border-eve-danger/50 hover:text-eve-danger'
              }`}
            >
              <Bug className="h-3 w-3" />
              Bug Reports
            </button>
            <button
              type="button"
              onClick={() => handleOpenFeedback('feature')}
              className={`inline-flex items-center gap-1 border px-2.5 py-1 text-[11px] ${
                feedbackKind === 'feature'
                  ? 'border-eve-accent/70 bg-eve-accent-muted font-semibold text-eve-accent'
                  : 'border-eve-border bg-eve-bg text-eve-muted hover:border-eve-accent/50 hover:text-eve-accent'
              }`}
            >
              <Lightbulb className="h-3 w-3" />
              Feature Requests
            </button>
          </div>
        </div>

        {feedbackNotice && (
          <div
            className={`flex items-center justify-between border-b px-4 py-1.5 text-[11px] ${
              feedbackNotice.ok
                ? 'border-eve-success/40 bg-eve-success/10 text-eve-success'
                : 'border-eve-danger/40 bg-eve-danger/10 text-eve-danger'
            }`}
          >
            <span>{feedbackNotice.msg}</span>
            <button type="button" onClick={() => setFeedbackNotice(null)} className="underline">
              Dismiss
            </button>
          </div>
        )}

        {feedbackKind && (
          <form
            onSubmit={(e) => void handleSubmitFeedback(e)}
            className="space-y-2.5 border-b border-eve-border bg-eve-bg/80 px-4 py-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-eve-accent">
                {feedbackKind === 'bug' ? 'Submit Bug Report' : 'Submit Feature Request'}
              </span>
              <button
                type="button"
                onClick={() => setFeedbackKind(null)}
                className="text-[11px] text-eve-muted hover:text-eve-text"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                required
                value={fbTitle}
                onChange={(e) => setFbTitle(e.target.value)}
                placeholder={feedbackKind === 'bug' ? 'Short summary of the bug *' : 'Feature title *'}
                className="border border-eve-border bg-eve-panel px-2.5 py-1.5 text-xs text-eve-text outline-none focus:border-eve-accent"
              />
              <input
                type="text"
                value={fbContact}
                onChange={(e) => setFbContact(e.target.value)}
                placeholder="Pilot name or Discord handle (optional)"
                className="border border-eve-border bg-eve-panel px-2.5 py-1.5 text-xs text-eve-text outline-none focus:border-eve-accent"
              />
            </div>
            <textarea
              rows={3}
              required
              value={fbMessage}
              onChange={(e) => setFbMessage(e.target.value)}
              placeholder={
                feedbackKind === 'bug'
                  ? 'Describe what happened and how to reproduce it... *'
                  : 'Describe your idea and how it would help you... *'
              }
              className="w-full border border-eve-border bg-eve-panel p-2.5 text-xs text-eve-text outline-none focus:border-eve-accent"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-eve-muted">
                <input
                  type="checkbox"
                  checked={fbIncludeMeta}
                  onChange={(e) => setFbIncludeMeta(e.target.checked)}
                />
                Include app version ({APP_VERSION}) &amp; OS (no pilot tokens or personal data sent)
              </label>
              <button
                type="submit"
                disabled={fbSending}
                className="border border-eve-accent/60 bg-eve-accent-muted px-3 py-1 text-xs font-semibold text-eve-accent hover:bg-eve-accent/25 disabled:opacity-50"
              >
                {fbSending ? 'Sending...' : 'Send Report'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'walkthroughs' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-12">
            {/* Module Selector */}
            <div className="divide-y divide-eve-border/50 overflow-y-auto border-r border-eve-border bg-eve-bg/50 md:col-span-4">
              {MODULE_REGISTRY.map((mod) => {
                const Icon = mod.icon;
                const active = mod.id === selectedId;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedId(mod.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs ${
                      active
                        ? 'bg-eve-accent-muted text-eve-accent'
                        : 'text-eve-text hover:bg-eve-elevated'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{mod.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Tutorial Content */}
            <div className="overflow-y-auto p-4 md:col-span-8">
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold text-eve-text">{selectedMod?.name}</div>
                  <p className="mt-1 text-xs text-eve-muted">{selectedMod?.description}</p>
                </div>

                <div className="border border-eve-border bg-eve-bg/60 p-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-eve-accent">
                    Required ESI Scopes
                  </div>
                  {selectedMod && selectedMod.requiredEsiScopes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMod.requiredEsiScopes.map((scope) => (
                        <code
                          key={scope}
                          className="border border-eve-border bg-eve-panel px-2 py-0.5 text-[10px] text-eve-text"
                        >
                          {scope}
                        </code>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-eve-muted">
                      No mandatory ESI scopes required (works with public data; optional character scopes may enhance features).
                    </p>
                  )}
                </div>

                <div className="border border-eve-border bg-eve-bg/60 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-eve-accent">
                    Quick Walkthrough
                  </div>
                  <ol className="list-decimal space-y-2 pl-4 text-xs text-eve-text">
                    {steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            <div className="space-y-2 border border-eve-border bg-eve-bg/60 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-eve-accent">
                <ShieldCheck className="h-4 w-4" />
                Privacy &amp; Local-First Guarantee
              </div>
              <p className="leading-relaxed text-eve-text">
                Nothing is shared with any 3rd party analytics or tracking backend — all EVE SSO tokens, character data, SDE tables, routes, and fittings stay locally on your device in SQLite.
              </p>
              <p className="leading-relaxed text-eve-muted">
                Outbound network requests go only to official EVE Online services (ESI &amp; Image Server) and public community data feeds you explicitly enable (such as public killstreams, Fuzzwork SDE downloads, or public wormhole/signature APIs).
              </p>
            </div>

            <div className="space-y-2 border border-eve-border bg-eve-bg/60 p-4 text-eve-muted">
              <div className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                Trademarks &amp; Ownership
              </div>
              <p>• All New Eden Lens assets belong to Fenris Creations and are trademarked.</p>
              <p>• EVE Online and all associated logos, ships, items, and icons are trademarks of CCP hf.</p>
              <p>• App Version: <span className="num-mono text-eve-accent">{APP_VERSION}</span> (Major.Minor.Patch — minor increments for new modules/features, patch increments for fixes).</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
