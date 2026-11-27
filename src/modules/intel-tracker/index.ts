import { Radio } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { IntelTrackerModule } from './IntelTrackerModule';

export const intelTrackerModule: ModuleDefinition = {
  id: 'intel-tracker',
  name: 'Live Chatlog Intel',
  description: 'Real-time EVE chatlog watcher with jump distance & watchlist alerts.',
  category: 'intel',
  icon: Radio,
  requiredEsiScopes: [],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 10,
  component: IntelTrackerModule
};

