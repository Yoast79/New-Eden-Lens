import { Factory } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { IndustryCalculatorModule } from './IndustryCalculatorModule';

export const industryCalculatorModule: ModuleDefinition = {
  id: 'industry-calculator',
  name: 'Industry Calculator',
  icon: Factory,
  category: 'market',
  description: 'Blueprint browser, crafting BOM trees, pilot skill times, job fees, and active industry jobs.',
  defaultEnabled: true,
  defaultOrder: 17,
  requiredEsiScopes: [
    'esi-characters.read_blueprints.v1',
    'esi-industry.read_character_jobs.v1',
    'esi-skills.read_skills.v1'
  ],
  acceptedClipboardFormats: [],
  component: IndustryCalculatorModule
};

