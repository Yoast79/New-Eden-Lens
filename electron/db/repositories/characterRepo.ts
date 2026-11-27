import { safeStorage } from 'electron';
import type { CharacterRecord, EveAccountRecord } from '@shared/types/esi';
import type { LocalDatabase } from '../connection';

export interface StoredCharacterTokens {
  characterId: number;
  characterName: string;
  corporationId: number | null;
  allianceId: number | null;
  accessToken: string | null;
  refreshToken: string;
  tokenExpiresAt: number;
  scopes: string[];
  isDefault: boolean;
  addedAt: number;
}

function encryptSecret(plain: string): Uint8Array {
  if (safeStorage.isEncryptionAvailable()) {
    return new Uint8Array(safeStorage.encryptString(plain));
  }
  return new Uint8Array(Buffer.from(plain, 'utf8'));
}

function decryptSecret(blob: Uint8Array | Buffer | null): string | null {
  if (!blob) return null;
  const buf = Buffer.from(blob);
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf);
  }
  return buf.toString('utf8');
}

export class CharacterRepository {
  constructor(private readonly db: LocalDatabase) {}

  listAccounts(): EveAccountRecord[] {
    const rows = this.db.all<{
      id: number;
      label: string;
      sort_order: number;
      created_at: number;
    }>('SELECT id, label, sort_order, created_at FROM eve_accounts ORDER BY sort_order ASC, id ASC');

    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      sortOrder: r.sort_order,
      createdAt: r.created_at
    }));
  }

  createAccount(label: string): EveAccountRecord {
    const clean = label.trim() || 'EVE Account';
    const maxOrder =
      this.db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM eve_accounts')?.m ?? -1;
    const now = Date.now();
    this.db.run(
      'INSERT INTO eve_accounts (label, sort_order, created_at) VALUES (?, ?, ?)',
      [clean, maxOrder + 1, now]
    );
    const created = this.db.get<{
      id: number;
      label: string;
      sort_order: number;
      created_at: number;
    }>('SELECT id, label, sort_order, created_at FROM eve_accounts ORDER BY id DESC LIMIT 1')!;
    return {
      id: created.id,
      label: created.label,
      sortOrder: created.sort_order,
      createdAt: created.created_at
    };
  }

  renameAccount(accountId: number, label: string): void {
    const clean = label.trim();
    if (!clean) return;
    this.db.run('UPDATE eve_accounts SET label = ? WHERE id = ?', [clean, accountId]);
  }

  deleteAccount(accountId: number): void {
    this.db.transaction((raw) => {
      raw.run('UPDATE characters SET account_id = NULL WHERE account_id = ?', [accountId]);
      raw.run('DELETE FROM eve_accounts WHERE id = ?', [accountId]);
    });
  }

  assignCharacterAccount(characterId: number, accountId: number | null): void {
    this.db.run('UPDATE characters SET account_id = ? WHERE character_id = ?', [
      accountId,
      characterId
    ]);
  }

  listCharacters(): CharacterRecord[] {
    const rows = this.db.all<{
      character_id: number;
      character_name: string;
      corporation_id: number | null;
      alliance_id: number | null;
      account_id: number | null;
      description: string | null;
      accent_color: string | null;
      token_expires_at: number;
      scopes: string;
      is_main: number;
      is_default: number;
      added_at: number;
    }>(
      `SELECT character_id, character_name, corporation_id, alliance_id, account_id,
              description, accent_color, token_expires_at, scopes, is_main, is_default, added_at
       FROM characters
       ORDER BY is_main DESC, is_default DESC, added_at ASC`
    );

    return rows.map((r) => ({
      characterId: r.character_id,
      characterName: r.character_name,
      corporationId: r.corporation_id,
      allianceId: r.alliance_id,
      accountId: r.account_id,
      description: r.description ?? '',
      accentColor: r.accent_color ?? '',
      tokenExpiresAt: r.token_expires_at,
      scopes: r.scopes.split(' ').filter(Boolean),
      isMain: r.is_main === 1,
      isDefault: r.is_default === 1,
      addedAt: r.added_at
    }));
  }

  updateCharacterMeta(
    characterId: number,
    patch: { description?: string; accentColor?: string }
  ): void {
    if (patch.description !== undefined) {
      this.db.run('UPDATE characters SET description = ? WHERE character_id = ?', [
        patch.description,
        characterId
      ]);
    }
    if (patch.accentColor !== undefined) {
      this.db.run('UPDATE characters SET accent_color = ? WHERE character_id = ?', [
        patch.accentColor,
        characterId
      ]);
    }
  }

  getTokens(characterId: number): StoredCharacterTokens | null {
    const row = this.db.get<{
      character_id: number;
      character_name: string;
      corporation_id: number | null;
      alliance_id: number | null;
      access_token_enc: Uint8Array | null;
      refresh_token_enc: Uint8Array;
      token_expires_at: number;
      scopes: string;
      is_default: number;
      added_at: number;
    }>('SELECT * FROM characters WHERE character_id = ?', [characterId]);

    if (!row) return null;
    const refreshToken = decryptSecret(row.refresh_token_enc);
    if (!refreshToken) return null;

    return {
      characterId: row.character_id,
      characterName: row.character_name,
      corporationId: row.corporation_id,
      allianceId: row.alliance_id,
      accessToken: decryptSecret(row.access_token_enc),
      refreshToken,
      tokenExpiresAt: row.token_expires_at,
      scopes: row.scopes.split(' ').filter(Boolean),
      isDefault: row.is_default === 1,
      addedAt: row.added_at
    };
  }

  upsertCharacter(input: {
    characterId: number;
    characterName: string;
    corporationId?: number | null;
    allianceId?: number | null;
    accountId?: number | null;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number;
    scopes: string[];
  }): CharacterRecord {
    const existingCount = this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM characters')?.cnt ?? 0;
    const now = Date.now();
    const isFirst = existingCount === 0 ? 1 : 0;
    this.db.run(
      `INSERT INTO characters (
         character_id, character_name, corporation_id, alliance_id, account_id,
         access_token_enc, refresh_token_enc, token_expires_at, scopes, is_main, is_default, added_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(character_id) DO UPDATE SET
         character_name = excluded.character_name,
         corporation_id = COALESCE(excluded.corporation_id, characters.corporation_id),
         alliance_id = COALESCE(excluded.alliance_id, characters.alliance_id),
         account_id = COALESCE(excluded.account_id, characters.account_id),
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         token_expires_at = excluded.token_expires_at,
         scopes = excluded.scopes`,
      [
        input.characterId,
        input.characterName,
        input.corporationId ?? null,
        input.allianceId ?? null,
        input.accountId ?? null,
        encryptSecret(input.accessToken),
        encryptSecret(input.refreshToken),
        input.tokenExpiresAt,
        input.scopes.join(' '),
        isFirst,
        isFirst,
        now
      ]
    );
    return this.listCharacters().find((c) => c.characterId === input.characterId)!;
  }

  updateTokens(characterId: number, accessToken: string, refreshToken: string, tokenExpiresAt: number): void {
    this.db.run(
      `UPDATE characters
       SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?
       WHERE character_id = ?`,
      [encryptSecret(accessToken), encryptSecret(refreshToken), tokenExpiresAt, characterId]
    );
  }

  setDefaultCharacter(characterId: number): void {
    this.db.transaction((raw) => {
      raw.run('UPDATE characters SET is_default = 0');
      raw.run('UPDATE characters SET is_default = 1 WHERE character_id = ?', [characterId]);
    });
  }

  setMainCharacter(characterId: number): void {
    this.db.transaction((raw) => {
      raw.run('UPDATE characters SET is_main = 0, is_default = 0');
      raw.run('UPDATE characters SET is_main = 1, is_default = 1 WHERE character_id = ?', [characterId]);
    });
  }

  removeCharacter(characterId: number): void {
    this.db.run('DELETE FROM characters WHERE character_id = ?', [characterId]);
  }

  saveWalletSnapshot(characterId: number, balance: number, estimatedAssetValue = 0): void {
    this.db.run(
      'INSERT INTO wallet_snapshots (character_id, balance, estimated_asset_value, captured_at) VALUES (?, ?, ?, ?)',
      [characterId, balance, estimatedAssetValue, Date.now()]
    );
  }

  getWalletHistory(characterId: number | null) {
    if (characterId === null) {
      return this.db.all<{
        characterId: number;
        balance: number;
        estimatedAssetValue: number;
        capturedAt: number;
      }>(
        `SELECT character_id AS characterId, balance, estimated_asset_value AS estimatedAssetValue, captured_at AS capturedAt
         FROM wallet_snapshots ORDER BY captured_at ASC`
      );
    }
    return this.db.all<{
      characterId: number;
      balance: number;
      estimatedAssetValue: number;
      capturedAt: number;
    }>(
      `SELECT character_id AS characterId, balance, estimated_asset_value AS estimatedAssetValue, captured_at AS capturedAt
       FROM wallet_snapshots WHERE character_id = ? ORDER BY captured_at ASC`,
      [characterId]
    );
  }

  saveSkills(
    characterId: number,
    totalSp: number,
    unallocatedSp: number,
    skills: Array<{
      skill_id: number;
      active_skill_level: number;
      trained_skill_level: number;
      skillpoints_in_skill: number;
    }>
  ): void {
    const now = Date.now();
    this.db.transaction((raw) => {
      raw.run(
        `INSERT INTO character_skill_meta (character_id, total_sp, unallocated_sp, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(character_id) DO UPDATE SET
           total_sp = excluded.total_sp,
           unallocated_sp = excluded.unallocated_sp,
           updated_at = excluded.updated_at`,
        [characterId, totalSp, unallocatedSp, now]
      );
      raw.run('DELETE FROM character_skills WHERE character_id = ?', [characterId]);
      for (const s of skills) {
        raw.run(
          `INSERT INTO character_skills (character_id, skill_id, active_skill_level, trained_skill_level, skillpoints_in_skill)
           VALUES (?, ?, ?, ?, ?)`,
          [characterId, s.skill_id, s.active_skill_level, s.trained_skill_level, s.skillpoints_in_skill]
        );
      }
    });
  }

  getCharacterSkills(characterId: number) {
    const meta = this.db.get<{ total_sp: number; unallocated_sp: number }>(
      'SELECT total_sp, unallocated_sp FROM character_skill_meta WHERE character_id = ?',
      [characterId]
    );
    const skills = this.db.all<{
      skillId: number;
      activeSkillLevel: number;
      trainedSkillLevel: number;
      skillpointsInSkill: number;
    }>(
      `SELECT skill_id AS skillId, active_skill_level AS activeSkillLevel,
              trained_skill_level AS trainedSkillLevel, skillpoints_in_skill AS skillpointsInSkill
       FROM character_skills WHERE character_id = ?`,
      [characterId]
    );
    return {
      totalSp: meta?.total_sp ?? 0,
      unallocatedSp: meta?.unallocated_sp ?? 0,
      skills
    };
  }
}

