import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  ExternalLink,
  FolderPlus,
  MoreHorizontal,
  Palette,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Star,
  Trash2,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { DEFAULT_ESI_SCOPES } from '@shared/constants/eve';
import type { CharacterRecord, EveAccountRecord } from '@shared/types/esi';
import { useAccounts } from '@/core/contexts/AccountContext';
import { useTheme } from '@/core/contexts/ThemeContext';
import { EveIcon } from './EveIcon';
import { EveLoginButton } from './EveLoginButton';
import { ConfirmModal } from './ConfirmModal';

const PKCE_CALLBACK = 'http://127.0.0.1:14580/callback';
const CHAR_COLORS = ['#00F0FF', '#E5A93C', '#2EE59D', '#E8683C', '#A855F7', '#F43F5E', ''];

export function AccountManagerModal({ onClose }: { onClose: () => void }) {
  const {
    accounts,
    characters,
    activeCharacterId,
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
    clearAuthError
  } = useAccounts();
  const { settings, updateSettings } = useTheme();

  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [clientIdInput, setClientIdInput] = useState(settings?.esiClientId ?? '');
  const [copiedCallback, setCopiedCallback] = useState(false);
  const [syncingCharId, setSyncingCharId] = useState<number | null>(null);

  // Popup state for adding a new character / account via EVE SSO
  const [addPopupAccountId, setAddPopupAccountId] = useState<number | null | undefined>(undefined);
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<number | null>(null);

  const hasClientId = Boolean(settings?.esiClientId?.trim());

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newAccountLabel.trim() || `EVE Account ${accounts.length + 1}`;
    await createAccount(label);
    setNewAccountLabel('');
  };

  const handleSaveClientId = async () => {
    await updateSettings({ esiClientId: clientIdInput.trim() });
  };

  const handleCopyCallback = async () => {
    await window.eveLens.clipboard.writeText(PKCE_CALLBACK);
    setCopiedCallback(true);
    setTimeout(() => setCopiedCallback(false), 1500);
  };

  const handleConfirmLoginPopup = async () => {
    let targetAccountId = addPopupAccountId ?? null;
    if (targetAccountId === null && accounts.length === 0) {
      const created = await createAccount('Account 1 (Main)');
      targetAccountId = created.id;
    }
    const added = await loginCharacter(undefined, targetAccountId);
    if (added) {
      setAddPopupAccountId(undefined);
    }
  };

  const handleReloadApi = async (characterId: number) => {
    setSyncingCharId(characterId);
    try {
      await reloadCharacterApi(characterId);
    } finally {
      setSyncingCharId(null);
    }
  };

  const unassignedChars = characters.filter(
    (c) => c.accountId === null || !accounts.some((a) => a.id === c.accountId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="photon-panel relative flex max-h-[88vh] w-full max-w-3xl flex-col shadow-2xl">
        {/* Header */}
        <div className="photon-header flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-eve-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Account &amp; Character Manager
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAddPopupAccountId(accounts[0]?.id ?? null)}
              className="inline-flex items-center gap-1.5 border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-[11px] font-semibold text-eve-accent hover:bg-eve-accent/25"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Character
            </button>
            <button type="button" onClick={onClose} className="text-eve-muted hover:text-eve-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {authError && (
            <div className="flex items-center justify-between border border-eve-danger/50 bg-eve-danger/10 px-3 py-2 text-xs text-eve-danger">
              <span>{authError}</span>
              <button type="button" onClick={clearAuthError} className="underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Clean Add Account Bar (no inline login button) */}
          <form
            onSubmit={(e) => void handleCreateAccount(e)}
            className="flex items-center gap-2 border border-eve-border bg-eve-bg/60 p-3"
          >
            <input
              type="text"
              value={newAccountLabel}
              onChange={(e) => setNewAccountLabel(e.target.value)}
              placeholder="New Account Name (e.g. Main Account, Alt / Dread)..."
              className="flex-1 border border-eve-border bg-eve-panel px-2.5 py-1.5 text-xs text-eve-text focus:border-eve-accent focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 border border-eve-border-strong bg-eve-elevated px-3 py-1.5 text-xs font-medium text-eve-text hover:border-eve-accent"
            >
              <FolderPlus className="h-3.5 w-3.5 text-eve-accent" />
              Add Account
            </button>
          </form>

          {/* Account Groups */}
          {accounts.length === 0 && characters.length === 0 ? (
            <div className="border border-eve-border bg-eve-bg/40 p-8 text-center">
              <div className="text-sm font-medium text-eve-text">No EVE Accounts Linked Yet</div>
              <p className="mx-auto mt-1 max-w-md text-xs text-eve-muted">
                Create an account group above or click <strong className="text-eve-accent">Add Character</strong> to authorize your pilots via EVE SSO.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const accountChars = characters.filter((c) => c.accountId === account.id);
                return (
                  <AccountGroupCard
                    key={account.id}
                    account={account}
                    characters={accountChars}
                    allAccounts={accounts}
                    activeCharacterId={activeCharacterId}
                    syncingCharId={syncingCharId}
                    isEditing={editingAccountId === account.id}
                    editingLabel={editingLabel}
                    onStartRename={() => {
                      setEditingAccountId(account.id);
                      setEditingLabel(account.label);
                    }}
                    onChangeEditLabel={setEditingLabel}
                    onCommitRename={async () => {
                      await renameAccount(account.id, editingLabel);
                      setEditingAccountId(null);
                    }}
                    onDeleteAccount={() => setConfirmDeleteAccountId(account.id)}
                    onOpenAddChar={() => setAddPopupAccountId(account.id)}
                    onSelectCharacter={(id) => {
                      selectCharacter(id);
                      onClose();
                    }}
                    onSetMain={(id) => void setMainCharacter(id)}
                    onSetDefault={(id) => void setDefaultCharacter(id)}
                    onUpdateMeta={(id, patch) => void updateCharacterMeta(id, patch)}
                    onAssignAccount={(charId, nextAccId) =>
                      void assignCharacterAccount(charId, nextAccId)
                    }
                    onReloadApi={(charId) => void handleReloadApi(charId)}
                    onUpdateScopes={(accId) => void loginCharacter(undefined, accId)}
                    onRemoveCharacter={(charId) => void removeCharacter(charId)}
                  />
                );
              })}

              {unassignedChars.length > 0 && (
                <div className="border border-eve-border bg-eve-bg/50">
                  <div className="flex items-center justify-between border-b border-eve-border bg-eve-panel px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-eve-muted">
                      Unassigned Characters ({unassignedChars.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddPopupAccountId(null)}
                      className="inline-flex items-center gap-1 border border-eve-border px-2 py-1 text-[11px] text-eve-accent hover:border-eve-accent"
                    >
                      <UserPlus className="h-3 w-3" />
                      Add Pilot
                    </button>
                  </div>
                  <div className="divide-y divide-eve-border/50">
                    {unassignedChars.map((char) => (
                      <CharacterRow
                        key={char.characterId}
                        char={char}
                        accounts={accounts}
                        isActive={char.characterId === activeCharacterId}
                        isSyncing={syncingCharId === char.characterId}
                        onSelect={() => {
                          selectCharacter(char.characterId);
                          onClose();
                        }}
                        onSetMain={() => void setMainCharacter(char.characterId)}
                        onSetDefault={() => void setDefaultCharacter(char.characterId)}
                        onUpdateMeta={(patch) => void updateCharacterMeta(char.characterId, patch)}
                        onAssignAccount={(accId) =>
                          void assignCharacterAccount(char.characterId, accId)
                        }
                        onReloadApi={() => void handleReloadApi(char.characterId)}
                        onUpdateScopes={() => void loginCharacter(undefined, char.accountId)}
                        onRemove={() => void removeCharacter(char.characterId)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Popup Modal for Adding Character / EVE SSO Login */}
        {addPopupAccountId !== undefined && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
            <div className="photon-panel w-full max-w-md space-y-4 p-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-eve-border pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                  Link EVE Character
                </span>
                <button
                  type="button"
                  onClick={() => setAddPopupAccountId(undefined)}
                  className="text-eve-muted hover:text-eve-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!hasClientId && (
                <div className="space-y-2 border border-eve-warning/50 bg-eve-warning/10 p-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-eve-warning">
                    <span>EVE Developer Client ID Required</span>
                    <button
                      type="button"
                      onClick={() =>
                        void window.eveLens.app.openExternal('https://developers.eveonline.com/applications')
                      }
                      className="inline-flex items-center gap-1 text-eve-accent hover:underline"
                    >
                      Portal <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="Paste Client ID..."
                      className="flex-1 border border-eve-border bg-eve-bg px-2.5 py-1 font-mono text-xs text-eve-text"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveClientId()}
                      disabled={!clientIdInput.trim()}
                      className="border border-eve-accent/60 bg-eve-accent-muted px-2.5 py-1 text-[11px] font-semibold text-eve-accent"
                    >
                      Save
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-eve-muted">
                    <span className="font-mono">{PKCE_CALLBACK}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopyCallback()}
                      className="inline-flex items-center gap-1 text-eve-accent"
                    >
                      {copiedCallback ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {accounts.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-eve-muted">
                    Assign to Account
                  </label>
                  <select
                    value={addPopupAccountId ?? ''}
                    onChange={(e) =>
                      setAddPopupAccountId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full border border-eve-border bg-eve-bg px-2.5 py-1.5 text-xs text-eve-text"
                  >
                    <option value="">Unassigned</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-center pt-1">
                <EveLoginButton
                  loading={isAuthenticating}
                  onClick={() => void handleConfirmLoginPopup()}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDeleteAccountId !== null}
        title="Delete Account Group"
        onCancel={() => setConfirmDeleteAccountId(null)}
        onConfirm={async () => {
          if (confirmDeleteAccountId !== null) {
            await deleteAccount(confirmDeleteAccountId);
          }
          setConfirmDeleteAccountId(null);
        }}
      />
    </div>
  );
}

function AccountGroupCard({
  account,
  characters,
  allAccounts,
  activeCharacterId,
  syncingCharId,
  isEditing,
  editingLabel,
  onStartRename,
  onChangeEditLabel,
  onCommitRename,
  onDeleteAccount,
  onOpenAddChar,
  onSelectCharacter,
  onSetMain,
  onSetDefault,
  onUpdateMeta,
  onAssignAccount,
  onReloadApi,
  onUpdateScopes,
  onRemoveCharacter
}: {
  account: EveAccountRecord;
  characters: CharacterRecord[];
  allAccounts: EveAccountRecord[];
  activeCharacterId: number | null;
  syncingCharId: number | null;
  isEditing: boolean;
  editingLabel: string;
  onStartRename: () => void;
  onChangeEditLabel: (val: string) => void;
  onCommitRename: () => Promise<void>;
  onDeleteAccount: () => void;
  onOpenAddChar: () => void;
  onSelectCharacter: (id: number) => void;
  onSetMain: (id: number) => void;
  onSetDefault: (id: number) => void;
  onUpdateMeta: (id: number, patch: { description?: string; accentColor?: string }) => void;
  onAssignAccount: (charId: number, accId: number | null) => void;
  onReloadApi: (charId: number) => void;
  onUpdateScopes: (accId: number | null) => void;
  onRemoveCharacter: (charId: number) => void;
}) {
  return (
    <div className="border border-eve-border bg-eve-bg/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eve-border bg-eve-panel px-3 py-2">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onCommitRename();
              }}
            >
              <input
                type="text"
                autoFocus
                value={editingLabel}
                onChange={(e) => onChangeEditLabel(e.target.value)}
                onBlur={() => void onCommitRename()}
                className="border border-eve-accent bg-eve-bg px-2 py-0.5 text-xs text-eve-text focus:outline-none"
              />
            </form>
          ) : (
            <>
              <span className="text-xs font-semibold uppercase tracking-wider text-eve-text">
                {account.label}
              </span>
              <span className="num-mono text-[10px] text-eve-muted">
                ({characters.length} / 3)
              </span>
              <button
                type="button"
                onClick={onStartRename}
                title="Rename Account"
                className="p-0.5 text-eve-muted hover:text-eve-accent"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenAddChar}
            className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-elevated px-2.5 py-1 text-[11px] text-eve-text hover:border-eve-accent hover:text-eve-accent"
          >
            <UserPlus className="h-3 w-3" />
            Add Character
          </button>
          <button
            type="button"
            onClick={onDeleteAccount}
            title="Delete Account Group"
            className="border border-eve-border p-1.5 text-eve-muted hover:border-eve-danger/50 hover:text-eve-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="px-3 py-3 text-xs text-eve-muted">
          No characters linked to this account yet. Click <strong className="text-eve-text">Add Character</strong> to authorize a slot.
        </div>
      ) : (
        <div className="divide-y divide-eve-border/50">
          {characters.map((char) => (
            <CharacterRow
              key={char.characterId}
              char={char}
              accounts={allAccounts}
              isActive={char.characterId === activeCharacterId}
              isSyncing={syncingCharId === char.characterId}
              onSelect={() => onSelectCharacter(char.characterId)}
              onSetMain={() => onSetMain(char.characterId)}
              onSetDefault={() => onSetDefault(char.characterId)}
              onUpdateMeta={(patch) => onUpdateMeta(char.characterId, patch)}
              onAssignAccount={(accId) => onAssignAccount(char.characterId, accId)}
              onReloadApi={() => onReloadApi(char.characterId)}
              onUpdateScopes={() => onUpdateScopes(char.accountId)}
              onRemove={() => onRemoveCharacter(char.characterId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterRow({
  char,
  accounts,
  isActive,
  isSyncing,
  onSelect,
  onSetMain,
  onSetDefault,
  onUpdateMeta,
  onAssignAccount,
  onReloadApi,
  onUpdateScopes,
  onRemove
}: {
  char: CharacterRecord;
  accounts: EveAccountRecord[];
  isActive: boolean;
  isSyncing: boolean;
  onSelect: () => void;
  onSetMain: () => void;
  onSetDefault: () => void;
  onUpdateMeta: (patch: { description?: string; accentColor?: string }) => void;
  onAssignAccount: (accId: number | null) => void;
  onReloadApi: () => void;
  onUpdateScopes: () => void;
  onRemove: () => void;
}) {
  const missingScopes = DEFAULT_ESI_SCOPES.filter((s) => !char.scopes.includes(s));
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(char.description);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      setConfirmDelete(false);
      return;
    }
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  return (
    <div
      title={char.description || 'No description set'}
      className={`relative flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
        isActive ? 'bg-eve-accent-muted/40' : 'hover:bg-eve-elevated/40'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="relative shrink-0"
          style={
            char.accentColor
              ? { boxShadow: `0 0 0 2px ${char.accentColor}` }
              : undefined
          }
        >
          <EveIcon
            path={`characters/${char.characterId}/portrait?size=64`}
            size={34}
            alt={char.characterName}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelect}
              className="text-xs font-semibold text-eve-text hover:text-eve-accent"
            >
              {char.characterName}
            </button>
            {char.isMain && (
              <span className="inline-flex items-center gap-1 border border-eve-accent/60 bg-eve-accent-muted px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-eve-accent">
                <Crown className="h-2.5 w-2.5" />
                Main
              </span>
            )}
            {char.isDefault && !char.isMain && (
              <span className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-elevated px-1.5 py-0.2 text-[10px] uppercase text-eve-text">
                Default
              </span>
            )}
            {isActive && (
              <span className="border border-eve-success/50 bg-eve-success/10 px-1.5 py-0.2 text-[10px] uppercase tracking-wider text-eve-success">
                Active
              </span>
            )}
          </div>
          {editingDesc ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onUpdateMeta({ description: descInput.trim() });
                setEditingDesc(false);
              }}
              className="mt-1 flex items-center gap-1"
            >
              <input
                type="text"
                autoFocus
                value={descInput}
                onChange={(e) => setDescInput(e.target.value)}
                placeholder="Incursion Pilot, PI Alt, Scout..."
                className="w-52 border border-eve-accent bg-eve-bg px-1.5 py-0.5 text-[11px] text-eve-text focus:outline-none"
              />
              <button
                type="submit"
                className="border border-eve-accent/60 bg-eve-accent-muted px-1.5 py-0.5 text-[10px] text-eve-accent"
              >
                Save
              </button>
            </form>
          ) : (
            <div className="text-[10px] text-eve-muted">
              {char.description ? char.description : `Pilot #${char.characterId}`}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {missingScopes.length > 0 && (
          <button
            type="button"
            onClick={onUpdateScopes}
            title={`Missing scopes: ${missingScopes.join(', ')}`}
            className="inline-flex items-center gap-1 border border-amber-500/60 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Update Scopes ({missingScopes.length})
          </button>
        )}
        {accounts.length > 0 && (
          <select
            value={char.accountId ?? ''}
            onChange={(e) => onAssignAccount(e.target.value ? Number(e.target.value) : null)}
            title="Move character to account"
            className="border border-eve-border bg-eve-panel px-2 py-1 text-[11px] text-eve-text"
          >
            <option value="">Unassigned</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}

        {/* Consolidated Options Menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1 border border-eve-border-strong bg-eve-panel px-2 py-1 text-[11px] text-eve-text hover:border-eve-accent"
            title="Character Options"
          >
            {isSyncing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-eve-accent" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
            Options
          </button>

          {menuOpen && (
            <div className="photon-panel absolute right-0 top-full z-30 mt-1 w-56 py-1 shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  onSetMain();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-text hover:bg-eve-accent-muted"
              >
                <Crown className="h-3.5 w-3.5 text-eve-accent" />
                Set Main
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetDefault();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-text hover:bg-eve-accent-muted"
              >
                <Star className="h-3.5 w-3.5 text-eve-warning" />
                Set Default
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingDesc(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-text hover:bg-eve-accent-muted"
              >
                <Pencil className="h-3.5 w-3.5 text-eve-muted" />
                Add / Edit Description
              </button>
              <button
                type="button"
                onClick={() => {
                  onReloadApi();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-text hover:bg-eve-accent-muted"
              >
                <RefreshCw className="h-3.5 w-3.5 text-eve-accent" />
                Reload API
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateScopes();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-text hover:bg-eve-accent-muted"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                Update Scopes (Re-auth)
              </button>
              <div className="border-y border-eve-border/60 px-3 py-1.5">
                <div className="mb-1 flex items-center gap-1 text-[10px] uppercase text-eve-muted">
                  <Palette className="h-3 w-3" />
                  Set Color
                </div>
                <div className="flex items-center gap-1.5">
                  {CHAR_COLORS.map((col) => (
                    <button
                      key={col || 'none'}
                      type="button"
                      onClick={() => {
                        onUpdateMeta({ accentColor: col });
                        setMenuOpen(false);
                      }}
                      className="h-4 w-4 border border-white/30"
                      style={{ backgroundColor: col || 'transparent' }}
                      title={col || 'None'}
                    />
                  ))}
                </div>
              </div>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-eve-danger hover:bg-eve-danger/15"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Character
                </button>
              ) : (
                <div className="flex items-center justify-between gap-1.5 bg-eve-danger/10 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onRemove();
                      setMenuOpen(false);
                      setConfirmDelete(false);
                    }}
                    className="flex-1 border border-eve-danger bg-eve-danger px-2 py-1 text-[11px] font-semibold text-white"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="border border-eve-border bg-eve-panel px-2 py-1 text-[11px] text-eve-text"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
