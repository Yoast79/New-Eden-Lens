import { Pickaxe } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { MiningTrackerModule } from './MiningTrackerModule';

export const miningTrackerModule: ModuleDefinition = {
  id: 'mining-tracker',
  name: 'Mining Tracker',
  icon: Pickaxe,
  category: 'market',
  description: 'Personal & fleet mining ledger, ISK/hr, m³/hr, fleet payout splits, and reprocessing yield comparisons.',
  defaultEnabled: true,
  defaultOrder: 16,
  requiredEsiScopes: ['esi-industry.read_character_mining.v1'],
  acceptedClipboardFormats: [],
  component: MiningTrackerModule
};

