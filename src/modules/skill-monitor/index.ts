import { GraduationCap } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { SkillMonitorModule } from './SkillMonitorModule';

export const skillMonitorModule: ModuleDefinition = {
  id: 'skill-monitor',
  name: 'Skill Monitor',
  description: 'Monitor active skill queue, completion timers, trained/untrained skills, attributes, and implants.',
  category: 'character',
  icon: GraduationCap,
  requiredEsiScopes: [
    'esi-skills.read_skills.v1',
    'esi-skills.read_skillqueue.v1',
    'esi-clones.read_implants.v1'
  ],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 2,
  component: SkillMonitorModule
};

