import { History } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { KillboardLookupModule } from './KillboardLookupModule';

export const killboardLookupModule: ModuleDefinition = {
  id: 'killboard-lookup',
  name: 'Killboard Lookup',
  description: 'Search historical zKillboard stats, kills, and losses for any pilot, corp, alliance, ship, or system.',
  category: 'intel',
  icon: History,
  requiredEsiScopes: [],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 7,
  component: KillboardLookupModule
};

