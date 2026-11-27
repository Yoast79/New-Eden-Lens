import { useState } from 'react';
import { Check, Coins, Copy, ExternalLink, Heart, Sparkles, X } from 'lucide-react';

const RECRUIT_URL =
  'https://www.eveonline.com/signup?invc=1d722c89-d13f-4c71-928b-d2e0f05aa5a0';

export function DonationModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const recipient = 'NE Lens';

  const handleCopy = async () => {
    await window.eveLens.clipboard.writeText(recipient);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="photon-panel w-full max-w-md shadow-2xl">
        <div className="photon-header flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Thank You
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-eve-muted hover:text-eve-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs">
          <p className="leading-relaxed text-eve-muted">
            New Eden Lens is 100% free and local-first—no real-money paywalls or subscriptions. If
            it saves your fleet time or ISK, voluntary in-game ISK donations are always appreciated!
          </p>

          {/* In-Game ISK Donation */}
          <div className="flex items-center justify-between border border-eve-border bg-eve-bg p-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-eve-warning" />
              <div>
                <div className="text-[10px] uppercase text-eve-muted">In-Game Recipient</div>
                <div className="font-semibold text-eve-text">{recipient}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-[11px] text-eve-accent"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy Name'}
            </button>
          </div>

          {/* 1,000,000 Free Skill Points Referral */}
          <div className="space-y-2 border border-eve-accent/40 bg-eve-accent-muted/15 p-3">
            <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-eve-accent">
              <Sparkles className="h-4 w-4" />
              Get 1,000,000 Free Skill Points
            </div>
            <p className="leading-relaxed text-eve-muted">
              Creating a new EVE Online account (or claiming on an eligible existing account that has
              never used a recruitment link) grants you <strong className="text-eve-text">1,000,000 unallocated Skill Points</strong> right away—enough to skip weeks of early training. Whenever a recruited account upgrades to Omega or buys PLEX in the EVE Store, it also supports New Eden Lens at zero extra cost to you.
            </p>
            <button
              type="button"
              onClick={() => void window.eveLens.app.openExternal(RECRUIT_URL)}
              className="inline-flex w-full items-center justify-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-3 py-1.5 font-semibold text-eve-accent hover:bg-eve-accent/25"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Claim 1,000,000 Free Skill Points
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
