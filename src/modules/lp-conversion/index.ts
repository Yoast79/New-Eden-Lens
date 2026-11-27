import { Award } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { LpConversionModule } from './LpConversionModule';

export const lpConversionModule: ModuleDefinition = {
  id: 'lp-conversion',
  name: 'LP Conversion',
  icon: Award,
  category: 'market',
  description: 'Loyalty Point store ISK/LP optimizer across faction & NPC corporations.',
  defaultEnabled: true,
  defaultOrder: 18,
  requiredEsiScopes: [],
  component: LpConversionModule
};

