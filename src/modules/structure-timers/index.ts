import { Building2 } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { StructureTimersModule } from './StructureTimersModule';

export const structureTimersModule: ModuleDefinition = {
  id: 'structure-timers',
  name: 'Structures',
  description: 'Corporation structures, fuel monitor, attack warnings, and custom war timers.',
  category: 'intel',
  icon: Building2,
  requiredEsiScopes: ['esi-corporations.read_structures.v1', 'esi-ui.write_waypoint.v1'],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 11,
  component: StructureTimersModule
};

