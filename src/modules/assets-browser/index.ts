import { Boxes } from 'lucide-react';
import type { ModuleDefinition } from '@shared/types/module';
import { AssetsBrowserModule } from './AssetsBrowserModule';

export const assetsBrowserModule: ModuleDefinition = {
  id: 'assets-browser',
  name: 'Assets Browser',
  description: 'Searchable character & all-account asset inventory with locations and valuations.',
  category: 'character',
  icon: Boxes,
  requiredEsiScopes: ['esi-assets.read_assets.v1'],
  acceptedClipboardFormats: [],
  defaultEnabled: true,
  defaultOrder: 13,
  component: AssetsBrowserModule
};

