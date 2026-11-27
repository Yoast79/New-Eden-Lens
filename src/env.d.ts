/// <reference types="vite/client" />
import type { ElectronBridgeApi } from '@shared/types/ipc';

declare global {
  interface Window {
    eveLens: ElectronBridgeApi;
  }
}

