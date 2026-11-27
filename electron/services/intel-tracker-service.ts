import fs from 'fs';
import os from 'os';
import path from 'path';
import { BrowserWindow, Notification } from 'electron';
import type { AlertSoundId, IntelTrackerAlertEvent, IntelTrackerSetupDto } from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { AppRepository } from '../db/repositories/appRepo';

function extractChannelName(filename: string): string {
  return filename.replace(/_\d{8}_\d{6}(?:_\d+)?\.txt$/i, '').replace(/_\d+_\d+\.txt$/i, '').replace(/\.txt$/i, '');
}

export class IntelTrackerService {
  private timer: NodeJS.Timeout | null = null;
  private fileOffsets = new Map<string, number>();
  private watches: string[] = [];
  private setups: IntelTrackerSetupDto[] = [];
  private selectedChannels = new Set<string>();
  private activeSystemId: number | null = null;
  private characterSystemIds = new Map<number, number>();
  private maxAlertJumps = 5;
  private notifyEnabled = true;
  private getWindow: (() => BrowserWindow | null) | null = null;
  private recentEvents: IntelTrackerAlertEvent[] = [];
  private recentLineDedup = new Map<string, number>();

  constructor(
    private readonly db: LocalDatabase,
    private readonly appRepo: AppRepository
  ) {
    const settings = this.appRepo.getSettings();
    const saved = settings.intelTrackerChannels ?? [];
    for (const ch of saved) {
      if (ch.trim()) this.selectedChannels.add(ch.trim());
    }
    this.setups = Array.isArray(settings.intelTrackerSetups) ? settings.intelTrackerSetups : [];
  }

  getDefaultLogDir(): string {
    const custom = this.appRepo.getSettings().intelTrackerLogDir;
    if (custom && fs.existsSync(custom)) return custom;
    return path.join(os.homedir(), 'Documents', 'EVE', 'logs', 'Chatlogs');
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  setWatches(watches: string[]): void {
    this.watches = watches.map((w) => w.trim()).filter(Boolean);
  }

  setSetups(setups: IntelTrackerSetupDto[]): void {
    this.setups = Array.isArray(setups) ? setups : [];
    this.appRepo.updateSettings({ intelTrackerSetups: this.setups });
  }

  clearEvents(): void {
    this.recentEvents = [];
    this.broadcastEventsSync();
  }

  dismissEvent(id: string): void {
    this.recentEvents = this.recentEvents.filter((e) => e.id !== id);
    this.broadcastEventsSync();
  }

  private broadcastEventsSync(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('intelTracker:events-sync', this.recentEvents);
    }
  }

  setChannels(channels: string[]): void {
    this.selectedChannels = new Set(channels.map((c) => c.trim()).filter(Boolean));
    this.appRepo.updateSettings({ intelTrackerChannels: Array.from(this.selectedChannels) });
  }

  listAvailableChannels(): string[] {
    const dir = this.getDefaultLogDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
    const latestByChannel = new Map<string, number>();
    for (const file of files) {
      const ch = extractChannelName(file);
      if (!ch || ch.toLowerCase().startsWith('private chat')) continue;
      try {
        const stat = fs.statSync(path.join(dir, file));
        const prev = latestByChannel.get(ch) ?? 0;
        if (stat.mtimeMs > prev) latestByChannel.set(ch, stat.mtimeMs);
      } catch {
        // ignore
      }
    }
    return Array.from(latestByChannel.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ch]) => ch);
  }

  setActiveSystemId(systemId: number | null): void {
    this.activeSystemId = systemId;
  }

  setCharacterSystemId(characterId: number, systemId: number | null): void {
    if (systemId === null) {
      this.characterSystemIds.delete(characterId);
    } else {
      this.characterSystemIds.set(characterId, systemId);
    }
  }

  setMaxJumps(jumps: number): void {
    this.maxAlertJumps = Math.max(0, Math.min(30, Math.floor(jumps)));
  }

  setNotifyEnabled(enabled: boolean): void {
    this.notifyEnabled = enabled;
  }

  getRecentEvents(): IntelTrackerAlertEvent[] {
    return this.recentEvents;
  }

  start(getMainWindow: () => BrowserWindow | null): void {
    this.getWindow = getMainWindow;
    if (this.timer) return;
    this.primeFileOffsets();
    this.timer = setInterval(() => this.pollLogs(), 2500);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private primeFileOffsets(): void {
    const dir = this.getDefaultLogDir();
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const stat = fs.statSync(full);
        this.fileOffsets.set(full, stat.size);
      } catch {
        // ignore
      }
    }
  }

  private pollLogs(): void {
    const dir = this.getDefaultLogDir();
    if (!fs.existsSync(dir)) return;

    const now = Date.now();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
    for (const file of files) {
      const full = path.join(dir, file);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      // Only watch logs modified within the last 12 hours
      if (now - stat.mtimeMs > 12 * 60 * 60 * 1000) continue;

      const channelName = extractChannelName(file);
      const hasEnabledSetups = this.setups.some((s) => s.enabled);
      if (!hasEnabledSetups && this.selectedChannels.size > 0 && !this.selectedChannels.has(channelName)) {
        this.fileOffsets.set(full, stat.size);
        continue;
      }

      try {
        const fd = fs.openSync(full, 'r');
        try {
          const liveSize = fs.fstatSync(fd).size;
          const prevOffset = this.fileOffsets.get(full) ?? 0;
          if (liveSize <= prevOffset) {
            if (liveSize < prevOffset) this.fileOffsets.set(full, liveSize);
            continue;
          }
          const len = liveSize - prevOffset;
          const buf = Buffer.alloc(len);
          fs.readSync(fd, buf, 0, len, prevOffset);
          this.fileOffsets.set(full, liveSize);

          // EVE chat logs are UTF-16LE
          const chunk = buf.toString('utf16le');
          for (const rawLine of chunk.split(/\r?\n/)) {
            this.processChatLine(channelName, rawLine);
          }
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        // ignore locked files
      }
    }
  }

  private getAddedCharacterNames(): string[] {
    try {
      const rows = this.db.all<{ character_name: string }>('SELECT character_name FROM characters');
      return rows.map((r) => r.character_name?.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private processChatLine(channel: string, rawLine: string): void {
    // Format: [ 2026.11.25 19:20:01 ] Sender > message
    const match = /^\[\s*[\d.\s:]+\s*\]\s*([^>]+)>\s*(.+)$/.exec(rawLine.trim());
    if (!match) return;
    const sender = match[1].trim();
    const message = match[2].trim();
    if (!message || sender === 'EVE System') return;

    // 10. Ignore self-sent messages (sender matches any added character)
    const addedChars = this.getAddedCharacterNames();
    const lowerSender = sender.toLowerCase();
    if (addedChars.some((name) => name.toLowerCase() === lowerSender)) {
      return;
    }

    // 9. Deduplicate identical chat lines across multi-box log files / setups within 5s
    const now = Date.now();
    const dedupKey = `${channel.toLowerCase()}|${lowerSender}|${message.toLowerCase()}`;
    const prevSeen = this.recentLineDedup.get(dedupKey);
    if (prevSeen && now - prevSeen < 5000) {
      return;
    }
    this.recentLineDedup.set(dedupKey, now);
    if (this.recentLineDedup.size > 250) {
      for (const [k, ts] of this.recentLineDedup.entries()) {
        if (now - ts > 10000) this.recentLineDedup.delete(k);
      }
    }

    const lowerMsg = message.toLowerCase();
    const nameCalled = addedChars.some((name) => {
      const nLower = name.toLowerCase();
      return nLower.length > 0 && lowerMsg.includes(nLower);
    });

    const systemMatch = this.detectSystemInText(message);
    const jumpCache = new Map<number, number | null>();
    const getJumpsFrom = (fromId: number | null | undefined): number | null => {
      if (!systemMatch || !fromId) return null;
      if (jumpCache.has(fromId)) return jumpCache.get(fromId)!;
      const d = this.computeJumpDistance(fromId, systemMatch.solarSystemId);
      jumpCache.set(fromId, d);
      return d;
    };

    const matchedSetupIds: string[] = [];
    const matchedSetupNames: string[] = [];
    const matchedWatchesSet = new Set<string>();
    let chosenSound: AlertSoundId | undefined;
    let anyInRange = false;
    let anyShowInOverlay = false;
    let primaryJumpsAway: number | null = null;

    const enabledSetups = this.setups.filter((s) => s.enabled);

    if (enabledSetups.length > 0) {
      for (const setup of enabledSetups) {
        const chMatches =
          setup.channels.length > 0
            ? setup.channels.includes(channel)
            : this.selectedChannels.size === 0 || this.selectedChannels.has(channel);
        if (!chMatches) continue;

        const isRangeBased = setup.rangeBased !== false;
        const refSystemId =
          setup.rangeSource === 'system'
            ? (setup.rangeSystemId ?? null)
            : setup.rangeSource === 'character'
              ? (setup.rangeCharacterId ? (this.characterSystemIds.get(setup.rangeCharacterId) ?? null) : null)
              : this.activeSystemId;

        const setupJumps = getJumpsFrom(refSystemId);
        if (primaryJumpsAway === null && setupJumps !== null) {
          primaryJumpsAway = setupJumps;
        }

        const setupInRange = !isRangeBased
          ? true
          : setupJumps !== null
            ? setupJumps <= setup.maxJumps
            : systemMatch === null || refSystemId === null;

        let setupMatched = false;

        if (setup.watches.length === 0) {
          // No keywords configured -> match all messages in the channel (respecting rangeBased if a system is mentioned)
          if (!isRangeBased || setupInRange) {
            setupMatched = true;
            if (!chosenSound && setup.systemAlertSound && setup.systemAlertSound !== 'none') {
              chosenSound = setup.systemAlertSound;
            }
          }
        } else {
          for (const rule of setup.watches) {
            const kw = rule.keyword.trim();
            if (kw && (lowerMsg.includes(kw.toLowerCase()) || lowerSender.includes(kw.toLowerCase()))) {
              matchedWatchesSet.add(kw);
              setupMatched = true;
              if (setupInRange && !chosenSound && rule.sound && rule.sound !== 'none') {
                chosenSound = rule.sound;
              }
            }
          }

          if (systemMatch && isRangeBased && setupInRange) {
            setupMatched = true;
            if (!chosenSound && setup.systemAlertSound && setup.systemAlertSound !== 'none') {
              chosenSound = setup.systemAlertSound;
            }
          }

          if (nameCalled) {
            setupMatched = true;
            const callSound =
              setup.nameCallSound && setup.nameCallSound !== 'none'
                ? setup.nameCallSound
                : setup.systemAlertSound;
            if (!chosenSound && callSound && callSound !== 'none') {
              chosenSound = callSound;
            }
          }
        }

        if (setupMatched) {
          matchedSetupIds.push(setup.id);
          matchedSetupNames.push(setup.name);
          if (setupInRange) anyInRange = true;
          if (setup.showInOverlay !== false) anyShowInOverlay = true;
        }
      }

      if (matchedSetupIds.length === 0) return;
    } else {
      if (this.selectedChannels.size > 0 && !this.selectedChannels.has(channel)) return;
      for (const w of this.watches) {
        if (lowerMsg.includes(w.toLowerCase()) || lowerSender.includes(w.toLowerCase())) {
          matchedWatchesSet.add(w);
        }
      }
      primaryJumpsAway = getJumpsFrom(this.activeSystemId);
      anyInRange = primaryJumpsAway === null ? true : primaryJumpsAway <= this.maxAlertJumps;
      if (matchedWatchesSet.size === 0 && !systemMatch && !nameCalled) return;
      chosenSound = 'chime';
      anyShowInOverlay = true;
    }

    const matchedWatches = Array.from(matchedWatchesSet);
    const event: IntelTrackerAlertEvent = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      channel,
      sender,
      message,
      systemName: systemMatch?.solarSystemName ?? null,
      solarSystemId: systemMatch?.solarSystemId ?? null,
      jumpsAway: primaryJumpsAway,
      matchedWatches,
      matchedSetupIds,
      matchedSetupNames,
      soundId: anyInRange ? (chosenSound ?? 'none') : 'none',
      nameCalled,
      inRange: anyInRange,
      showInOverlay: anyShowInOverlay
    };

    this.recentEvents = [event, ...this.recentEvents].slice(0, 150);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('intelTracker:event', event);
    }

    if (
      this.notifyEnabled &&
      Notification.isSupported() &&
      anyInRange &&
      (matchedWatches.length > 0 || nameCalled || (primaryJumpsAway !== null && primaryJumpsAway <= this.maxAlertJumps))
    ) {
      new Notification({
        title: nameCalled ? `Name Called (${channel})` : `IntelTracker Intel (${channel})`,
        body: `${systemMatch ? `${systemMatch.solarSystemName}${primaryJumpsAway !== null ? ` (${primaryJumpsAway}j)` : ''}: ` : ''}${sender}: ${message}`
      }).show();
    }
  }

  private detectSystemInText(text: string): { solarSystemId: number; solarSystemName: string } | null {
    const tokens = text.split(/[\s,;()[\]]+/).filter((t) => t.length >= 3);
    for (const tok of tokens) {
      const row = this.db.get<{ solar_system_id: number; solar_system_name: string }>(
        'SELECT solar_system_id, solar_system_name FROM sde_solar_systems WHERE LOWER(solar_system_name) = LOWER(?) LIMIT 1',
        [tok]
      );
      if (row) {
        return { solarSystemId: row.solar_system_id, solarSystemName: row.solar_system_name };
      }
    }
    return null;
  }

  private computeJumpDistance(fromId: number, toId: number): number | null {
    if (fromId === toId) return 0;
    const rows = this.db.all<{ fromId: number; toId: number }>(
      'SELECT from_solar_system_id AS fromId, to_solar_system_id AS toId FROM sde_stargates'
    );
    const adj = new Map<number, number[]>();
    for (const r of rows) {
      let list = adj.get(r.fromId);
      if (!list) {
        list = [];
        adj.set(r.fromId, list);
      }
      list.push(r.toId);
    }

    const visited = new Set<number>([fromId]);
    const queue: Array<[number, number]> = [[fromId, 0]];
    while (queue.length > 0) {
      const [curr, d] = queue.shift()!;
      if (d >= 12) continue;
      for (const nxt of adj.get(curr) ?? []) {
        if (nxt === toId) return d + 1;
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push([nxt, d + 1]);
        }
      }
    }
    return null;
  }
}

