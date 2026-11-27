import { Activity } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { PilotAnalyticsModule } from './PilotAnalyticsModule';

export const pilotAnalyticsModule: ModuleDefinition = {
  id: 'pilot-analytics',
  name: 'Pilot & Wealth',
  description: 'Net worth history, wallet journal ticks, implants, and Jump Clone cooldown timers.',
  category: 'character',
  icon: Activity,
  requiredEsiScopes: [
    'esi-wallet.read_character_wallet.v1',
    'esi-assets.read_assets.v1',
    'esi-clones.read_clones.v1',
    'esi-clones.read_implants.v1'
  ],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 8,
  component: PilotAnalyticsModule
};

