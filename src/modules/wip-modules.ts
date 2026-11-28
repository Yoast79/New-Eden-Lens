import { Globe2 } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { createWipComponent } from './shared/WorkInProgressModule';

export const planetaryInteractionModule: ModuleDefinition = {
  id: 'planetary-interaction',
  name: 'Planetary Interaction',
  icon: Globe2,
  category: 'market',
  description: 'Colony extractor timers, P1–P4 factory chains, and customs office routing.',
  defaultEnabled: true,
  defaultOrder: 15,
  requiredEsiScopes: [],
  component: createWipComponent({
    title: 'Planetary Interaction',
    description: 'Monitor planet extractors, storage fill levels, and P1–P4 production chains.',
    icon: Globe2,
    plannedFeatures: [
      'Sync colony layouts and extractor expiration timers across all characters',
      'Alert before extractors expire or launchpads reach capacity',
      'Calculate P1–P4 profitability and tax impact by market hub'
    ]
  })
};
