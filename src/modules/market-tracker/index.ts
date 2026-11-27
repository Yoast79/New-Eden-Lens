import { LineChart } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { MarketHubModule } from './MarketHubModule';

export const marketTrackerModule: ModuleDefinition = {
  id: 'market-tracker',
  name: 'Market & Trading',
  description: 'Item appraisal, price/volume charts, investments, active orders, contracts, and LP conversion.',
  category: 'market',
  icon: LineChart,
  requiredEsiScopes: ['esi-markets.read_character_orders.v1', 'esi-contracts.read_character_contracts.v1'],
  acceptedClipboardFormats: ['hangar'],
  defaultEnabled: true,
  defaultOrder: 5,
  component: MarketHubModule
};

