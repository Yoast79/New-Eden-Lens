import { Factory, Globe2, Pickaxe } from 'lucide-react';
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

export const miningTrackerModule: ModuleDefinition = {
  id: 'mining-tracker',
  name: 'Mining Tracker',
  icon: Pickaxe,
  category: 'market',
  description: 'Personal & fleet mining ledger, ore/ice/moon m³ yields, and ISK/hr.',
  defaultEnabled: true,
  defaultOrder: 16,
  requiredEsiScopes: [],
  component: createWipComponent({
    title: 'Mining Tracker',
    description: 'Track ore, ice, gas, and moon mining yields with live hub ISK valuation.',
    icon: Pickaxe,
    plannedFeatures: [
      'Sync character mining ledger and compressed ore market prices',
      'Calculate real-time ISK/hour and m³/hour per barge or exhumer',
      'Support fleet payout splits and reprocessing yield comparisons'
    ]
  })
};

export const industryCalculatorModule: ModuleDefinition = {
  id: 'industry-calculator',
  name: 'Industry Calculator',
  icon: Factory,
  category: 'market',
  description: 'Blueprint ME/TE BOMs, job cost index estimates, and build-vs-buy margins.',
  defaultEnabled: true,
  defaultOrder: 17,
  requiredEsiScopes: [],
  component: createWipComponent({
    title: 'Industry Calculator',
    description: 'Compute manufacturing & reaction material trees, job fees, and profit margins.',
    icon: Factory,
    plannedFeatures: [
      'Full SDE blueprint BOM expansion with ME/TE and structure rig bonuses',
      'System cost index lookup and live input/output hub pricing',
      'Active character industry job slot & completion timer tracking'
    ]
  })
};
