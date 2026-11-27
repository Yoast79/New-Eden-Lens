import { GitBranch } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { WormholeMapperModule } from './WormholeMapperModule';

export const wormholeMapperModule: ModuleDefinition = {
  id: 'wormhole-mapper',
  name: 'Wormhole Mapper',
  description: 'Interactive wormhole chain mapper with 5s auto-location tracking.',
  category: 'navigation',
  icon: GitBranch,
  requiredEsiScopes: ['esi-location.read_location.v1'],
  acceptedClipboardFormats: ['signatures'],
  defaultEnabled: true,
  defaultOrder: 9,
  component: WormholeMapperModule
};

