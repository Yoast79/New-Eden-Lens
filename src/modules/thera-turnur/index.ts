import { Compass } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { TheraTurnurModule } from './TheraTurnurModule';

export const theraTurnurModule: ModuleDefinition = {
  id: 'thera-turnur',
  name: 'Thera / Turnur Connections',
  icon: Compass,
  category: 'navigation',
  description: 'Live Thera & Turnur wormhole exit browser with jump distances & autopilot.',
  defaultEnabled: true,
  defaultOrder: 19,
  requiredEsiScopes: [],
  component: TheraTurnurModule
};

