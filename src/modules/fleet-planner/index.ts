import { Users } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { FleetPlannerModule } from './FleetPlannerModule';

export const fleetPlannerModule: ModuleDefinition = {
  id: 'fleet-planner',
  name: 'Fleet Composer',
  description: 'Build fleet compositions from saved fits with role labels & pilot counts.',
  category: 'utility',
  icon: Users,
  requiredEsiScopes: [],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 12,
  component: FleetPlannerModule
};

