import { Crosshair } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { KillboardHubModule } from './KillboardHubModule';

export const killboardModule: ModuleDefinition = {
  id: 'killboard',
  name: 'Killboard',
  description: 'Real-time zKillboard RedisQ tracker with watchlists and historical entity lookup.',
  category: 'intel',
  icon: Crosshair,
  requiredEsiScopes: [],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 6,
  component: KillboardHubModule
};

