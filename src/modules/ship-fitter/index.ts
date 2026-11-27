import { Wrench } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { ShipFitterModule } from './ShipFitterModule';

export const shipFitterModule: ModuleDefinition = {
  id: 'ship-fitter',
  name: 'Ship Fitter',
  description: 'Dogma-powered fitting simulator with EFT import/export and character skill stats.',
  category: 'utility',
  icon: Wrench,
  requiredEsiScopes: [
    'esi-fittings.read_fittings.v1',
    'esi-fittings.write_fittings.v1',
    'esi-skills.read_skills.v1'
  ],
  acceptedClipboardFormats: ['eft'],
  defaultEnabled: true,
  defaultOrder: 7,
  component: ShipFitterModule
};

