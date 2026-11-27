import { useState } from 'react';
import { Crosshair, History } from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import type { HistoricalKillEntityKind } from '@shared/types/modules-data';
import { KillboardLookupModule } from '@/modules/killboard-lookup/KillboardLookupModule';
import { KillboardModule } from './KillboardModule';

export interface LookupTarget {
  kind: HistoricalKillEntityKind;
  id: number;
  name?: string;
  nonce: number;
}

export function KillboardHubModule(props: ModuleProps) {
  const [tab, setTab] = useState<'live' | 'lookup'>('live');
  const [lookupTarget, setLookupTarget] = useState<LookupTarget | null>(null);

  const handleJumpToLookup = (target: { kind: HistoricalKillEntityKind; id: number; name?: string }) => {
    setLookupTarget({ ...target, nonce: Date.now() });
    setTab('lookup');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-eve-border bg-eve-panel/60 px-4 py-2">
        <button
          type="button"
          onClick={() => setTab('live')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'live'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <Crosshair className="h-3.5 w-3.5" />
          Live Killboard
        </button>
        <button
          type="button"
          onClick={() => setTab('lookup')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'lookup'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          Killboard Lookup
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'live' ? (
          <KillboardModule {...props} onJumpToLookup={handleJumpToLookup} />
        ) : (
          <KillboardLookupModule {...props} initialTarget={lookupTarget} />
        )}
      </div>
    </div>
  );
}

