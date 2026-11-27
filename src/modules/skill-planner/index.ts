import { GraduationCap } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { SkillsHubModule } from './SkillsHubModule';

export const skillPlannerModule: ModuleDefinition = {
  id: 'skill-planner',
  name: 'Skills & Training',
  description: 'Live skill queue monitor, trained/untrained skills, implants, SP/injector planner, and SP farming.',
  category: 'character',
  icon: GraduationCap,
  requiredEsiScopes: [
    'esi-skills.read_skills.v1',
    'esi-skills.read_skillqueue.v1',
    'esi-clones.read_implants.v1'
  ],
  acceptedClipboardFormats: ['eft'],
  defaultEnabled: true,
  defaultOrder: 1,
  component: SkillsHubModule
};

