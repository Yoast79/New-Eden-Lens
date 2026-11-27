import { Radar } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { LocalIntelModule } from './LocalIntelModule';

export const localIntelModule: ModuleDefinition = {
  id: 'local-intel',
  name: 'Local & D-Scan Intel',
  description: 'Instant D-Scan ship class grouping and Local pilot threat analysis.',
  category: 'intel',
  icon: Radar,
  requiredEsiScopes: [],
  acceptedClipboardFormats: ['dscan', 'local'],
  defaultEnabled: true,
  defaultOrder: 4,
  component: LocalIntelModule
};

