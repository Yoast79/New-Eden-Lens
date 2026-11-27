import { useEffect, useState } from 'react';
import { Building2, Compass, Map as MapIcon, Waypoints } from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import { RoutePlannerModule } from '@/modules/route-planner/RoutePlannerModule';
import { TheraTurnurModule } from '@/modules/thera-turnur/TheraTurnurModule';
import { StructureBrowserTab } from './StructureBrowserTab';
import { TacticalMapModule } from './TacticalMapModule';

export function NavigationHubModule(props: ModuleProps) {
  const [tab, setTab] = useState<'map' | 'route' | 'thera' | 'structures'>('map');

  useEffect(() => {
    if (props.incomingClipboard?.format === 'route') {
      setTab('route');
    }
  }, [props.incomingClipboard]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-eve-border bg-eve-panel/60 px-4 py-2">
        <button
          type="button"
          onClick={() => setTab('map')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'map'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <MapIcon className="h-3.5 w-3.5" />
          Tactical Map
        </button>
        <button
          type="button"
          onClick={() => setTab('route')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'route'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <Waypoints className="h-3.5 w-3.5" />
          Route Planner
        </button>
        <button
          type="button"
          onClick={() => setTab('thera')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'thera'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          Thera / Turnur
        </button>
        <button
          type="button"
          onClick={() => setTab('structures')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'structures'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          Structure Browser
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'map' && <TacticalMapModule {...props} />}
        {tab === 'route' && <RoutePlannerModule {...props} />}
        {tab === 'thera' && <TheraTurnurModule {...props} />}
        {tab === 'structures' && <StructureBrowserTab {...props} />}
      </div>
    </div>
  );
}

