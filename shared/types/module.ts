import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ClipboardFormat, ParsedClipboard } from './clipboard';

export type ModuleCategory =
  | 'navigation'
  | 'intel'
  | 'market'
  | 'character'
  | 'utility';

export interface WorkerNotifyPayload {
  title: string;
  body: string;
  severity?: 'info' | 'warning' | 'alert';
  playSound?: boolean;
}

export interface BackgroundWorkerContext {
  getCharacterIds: () => number[];
  getActiveCharacterId: () => number | null;
  esiFetch: <T>(
    path: string,
    options?: { characterId?: number; method?: 'GET' | 'POST'; body?: unknown }
  ) => Promise<T>;
  notify: (payload: WorkerNotifyPayload) => void;
  emit: (event: string, data: unknown) => void;
}

export interface ModuleBackgroundWorker {
  intervalMs?: number;
  onStart?: (ctx: BackgroundWorkerContext) => Promise<void> | void;
  onTick?: (ctx: BackgroundWorkerContext) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  onCharacterChanged?: (
    characterId: number | null,
    ctx: BackgroundWorkerContext
  ) => Promise<void> | void;
}

export interface ModuleProps {
  activeCharacterId: number | null;
  incomingClipboard?: ParsedClipboard | null;
  onWorkerEvent: (handler: (event: string, data: unknown) => void) => () => void;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  icon: LucideIcon;
  requiredEsiScopes: string[];
  component: ComponentType<ModuleProps>;
  backgroundWorker?: ModuleBackgroundWorker;
  acceptedClipboardFormats?: ClipboardFormat[];
  defaultEnabled?: boolean;
  defaultOrder?: number;
}

export interface ModuleConfigRecord {
  moduleId: string;
  enabled: boolean;
  sortOrder: number;
  settings: Record<string, unknown>;
}

