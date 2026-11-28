import { Globe2 } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { PlanetaryInteractionModule } from './PlanetaryInteractionModule';

export const planetaryInteractionModule: ModuleDefinition = {
  id: 'planetary-interaction',
  name: 'Planetary Interaction',
  icon: Globe2,
  category: 'market',
  description: 'Colony extractor timers, storage alerts, P1–P4 profit calculator, and planet resource guide.',
  defaultEnabled: true,
  defaultOrder: 15,
  requiredEsiScopes: ['esi-planets.manage_planets.v1'],
  acceptedClipboardFormats: [],
  component: PlanetaryInteractionModule
};

