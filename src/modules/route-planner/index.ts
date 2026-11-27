import { Compass } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { RoutePlannerModule } from './RoutePlannerModule';

export const routePlannerModule: ModuleDefinition = {
  id: 'route-planner',
  name: 'Route Planner',
  description: 'A*/Dijkstra route solver with security filters, avoid lists & fleet share codes.',
  category: 'navigation',
  icon: Compass,
  requiredEsiScopes: ['esi-ui.write_waypoint.v1'],
  acceptedClipboardFormats: ['route'],
  defaultEnabled: true,
  defaultOrder: 3,
  component: RoutePlannerModule
};

