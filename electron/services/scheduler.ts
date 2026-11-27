import { BrowserWindow, clipboard } from 'electron';
import type { AppRepository } from '../db/repositories/appRepo';
import type { CharacterRepository } from '../db/repositories/characterRepo';
import type { EsiClient } from './esi-client';

export class BackgroundScheduler {
  private snapshotTimer: NodeJS.Timeout | null = null;
  private clipboardTimer: NodeJS.Timeout | null = null;
  private lastClipboard = '';

  constructor(
    private readonly appRepo: AppRepository,
    private readonly characterRepo: CharacterRepository,
    private readonly esiClient: EsiClient
  ) {}

  start(getMainWindow: () => BrowserWindow | null): void {
    this.lastClipboard = clipboard.readText();

    // Sync character snapshots every 10 minutes
    this.snapshotTimer = setInterval(() => {
      void this.syncAllCharacters();
    }, 10 * 60 * 1000);

    // Optional clipboard watcher polling every 750ms when enabled
    this.clipboardTimer = setInterval(() => {
      const settings = this.appRepo.getSettings();
      if (!settings.clipboardAutoWatch) return;

      const current = clipboard.readText();
      if (current && current !== this.lastClipboard) {
        this.lastClipboard = current;
        getMainWindow()?.webContents.send('clipboard:changed', current);
      }
    }, 750);
  }

  async syncCharacterSnapshot(characterId: number): Promise<{ ok: boolean; syncedAt: number }> {
    try {
      const balance = await this.esiClient.request<number>(`/characters/${characterId}/wallet`, {
        characterId
      });
      if (typeof balance === 'number') {
        this.characterRepo.saveWalletSnapshot(characterId, balance, 0);
      }
    } catch {
      // Wallet scope might not be granted; continue gracefully
    }

    try {
      const skillsData = await this.esiClient.request<{
        total_sp: number;
        unallocated_sp?: number;
        skills: Array<{
          skill_id: number;
          active_skill_level: number;
          trained_skill_level: number;
          skillpoints_in_skill: number;
        }>;
      }>(`/characters/${characterId}/skills`, { characterId });

      if (skillsData && Array.isArray(skillsData.skills)) {
        this.characterRepo.saveSkills(
          characterId,
          skillsData.total_sp ?? 0,
          skillsData.unallocated_sp ?? 0,
          skillsData.skills
        );
      }
    } catch {
      // Skills scope might not be granted; continue gracefully
    }

    return { ok: true, syncedAt: Date.now() };
  }

  async syncAllCharacters(): Promise<void> {
    const chars = this.characterRepo.listCharacters();
    for (const c of chars) {
      await this.syncCharacterSnapshot(c.characterId);
    }
  }

  stop(): void {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.clipboardTimer) clearInterval(this.clipboardTimer);
    this.snapshotTimer = null;
    this.clipboardTimer = null;
  }
}

