import { Map as MapIcon } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { NavigationHubModule } from './NavigationHubModule';

export const tacticalMapModule: ModuleDefinition = {
  id: 'tactical-map',
  name: 'Navigation & Maps',
  description: 'Interactive New Eden tactical map, A*/Dijkstra route planner, and live Thera/Turnur connections.',
  category: 'navigation',
  icon: MapIcon,
  requiredEsiScopes: [
    'esi-ui.write_waypoint.v1',
    'esi-location.read_location.v1',
    'esi-fleets.read_fleet.v1'
  ],
  acceptedClipboardFormats: ['route'],
  defaultEnabled: true,
  defaultOrder: 2,
  component: NavigationHubModule
};

