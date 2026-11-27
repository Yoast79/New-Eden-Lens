import { PackageCheck } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { ItemEvaluatorModule } from './ItemEvaluatorModule';

export const itemEvaluatorModule: ModuleDefinition = {
  id: 'item-evaluator',
  name: 'Item Evaluator',
  description: 'Hangar, cargo & contract appraisal using Jita, Amarr, Dodixie, Rens, and Hek orders.',
  category: 'market',
  icon: PackageCheck,
  requiredEsiScopes: [],
  acceptedClipboardFormats: ['hangar'],
  defaultEnabled: true,
  defaultOrder: 0,
  component: ItemEvaluatorModule
};

