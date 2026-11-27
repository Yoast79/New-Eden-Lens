import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CharacterRecord, EveAccountRecord } from '@shared/types/esi';

interface AccountContextValue {
  accounts: EveAccountRecord[];
  characters: CharacterRecord[];
  activeCharacterId: number | null;
  activeCharacter: CharacterRecord | null;
  isAggregateMode: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  selectCharacter: (characterId: number | null) => void;
  loginCharacter: (scopes?: string[], accountId?: number | null) => Promise<CharacterRecord | null>;
  removeCharacter: (characterId: number) => Promise<void>;
  setMainCharacter: (characterId: number) => Promise<void>;
  setDefaultCharacter: (characterId: number) => Promise<void>;
  updateCharacterMeta: (
    characterId: number,
    patch: { description?: string; accentColor?: string }
  ) => Promise<void>;
  reloadCharacterApi: (characterId: number) => Promise<void>;
  createAccount: (label: string) => Promise<EveAccountRecord>;
  renameAccount: (accountId: number, label: string) => Promise<void>;
  deleteAccount: (accountId: number) => Promise<void>;
  assignCharacterAccount: (characterId: number, accountId: number | null) => Promise<void>;
  refreshCharacters: () => Promise<void>;
  clearAuthError: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<EveAccountRecord[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<number | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshCharacters = useCallback(async () => {
    const [acctList, charList] = await Promise.all([
      window.eveLens.auth.listAccounts(),
      window.eveLens.auth.listCharacters()
    ]);
    setAccounts(acctList);
    setCharacters(charList);
    setActiveCharacterId((prev) => {
      if (prev !== null && charList.some((c) => c.characterId === prev)) return prev;
      if (charList.length === 0) return null;
      const mainOrDefault =
        charList.find((c) => c.isMain) ?? charList.find((c) => c.isDefault) ?? charList[0];
      return mainOrDefault.characterId;
    });
  }, []);

  useEffect(() => {
    void refreshCharacters();
  }, [refreshCharacters]);

  const selectCharacter = useCallback((characterId: number | null) => {
    setActiveCharacterId(characterId);
    if (characterId !== null) {
      void window.eveLens.auth.setDefaultCharacter(characterId);
    }
  }, []);

  const loginCharacter = useCallback(
    async (scopes?: string[], accountId?: number | null) => {
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        const added = await window.eveLens.auth.loginPkce(scopes, accountId);
        await refreshCharacters();
        setActiveCharacterId(added.characterId);
        return added;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'EVE SSO authentication failed');
        return null;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [refreshCharacters]
  );

  const removeCharacter = useCallback(
    async (characterId: number) => {
      await window.eveLens.auth.removeCharacter(characterId);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const setMainCharacter = useCallback(
    async (characterId: number) => {
      await window.eveLens.auth.setMainCharacter(characterId);
      setActiveCharacterId(characterId);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const setDefaultCharacter = useCallback(
    async (characterId: number) => {
      await window.eveLens.auth.setDefaultCharacter(characterId);
      setActiveCharacterId(characterId);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const updateCharacterMeta = useCallback(
    async (characterId: number, patch: { description?: string; accentColor?: string }) => {
      await window.eveLens.auth.updateCharacterMeta(characterId, patch);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const reloadCharacterApi = useCallback(
    async (characterId: number) => {
      await window.eveLens.auth.refreshCharacter(characterId).catch(() => null);
      await window.eveLens.esi.syncCharacterSnapshot(characterId);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const createAccount = useCallback(
    async (label: string) => {
      const created = await window.eveLens.auth.createAccount(label);
      await refreshCharacters();
      return created;
    },
    [refreshCharacters]
  );

  const renameAccount = useCallback(
    async (accountId: number, label: string) => {
      await window.eveLens.auth.renameAccount(accountId, label);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const deleteAccount = useCallback(
    async (accountId: number) => {
      await window.eveLens.auth.deleteAccount(accountId);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const assignCharacterAccount = useCallback(
    async (characterId: number, accountId: number | null) => {
      await window.eveLens.auth.assignCharacterAccount(characterId, accountId);
      await refreshCharacters();
    },
    [refreshCharacters]
  );

  const activeCharacter =
    activeCharacterId === null
      ? null
      : (characters.find((c) => c.characterId === activeCharacterId) ?? null);

  return (
    <AccountContext.Provider
      value={{
        accounts,
        characters,
        activeCharacterId,
        activeCharacter,
        isAggregateMode: activeCharacterId === null && characters.length > 0,
        isAuthenticating,
        authError,
        selectCharacter,
        loginCharacter,
        removeCharacter,
        setMainCharacter,
        setDefaultCharacter,
        updateCharacterMeta,
        reloadCharacterApi,
        createAccount,
        renameAccount,
        deleteAccount,
        assignCharacterAccount,
        refreshCharacters,
        clearAuthError: () => setAuthError(null)
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccounts must be used inside AccountProvider');
  return ctx;
}
