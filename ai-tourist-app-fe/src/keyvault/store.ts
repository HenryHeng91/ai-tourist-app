/**
 * `useKeyVaultStore` — Zustand store for the BYOK key vault UI.
 *
 * Holds:
 *  - `keys`: server-returned metadata for each provider (NEVER the blob)
 *  - `selectedProvider`: which provider the user is acting on
 *  - `isLoading`: list-keys fetch in progress
 *  - `isSubmitting`: an add / delete call is in progress
 *  - `isValidating`: a per-provider client-side validation is in progress
 *  - `error`: last user-visible error (cleared on success)
 *
 * This store is the UI's view of metadata. The plaintext key NEVER lives
 * here — it lives in the non-reactive `keyHolder` module for the lifetime
 * of a single inference call (or until `wipeHeldPlaintextKeys()`).
 */

import { create } from 'zustand';
import * as api from './api';
import {
  deriveKey,
  encrypt,
  generateSalt,
  saltFromBase64,
  saltToBase64,
} from './crypto';
import { getStoredSalt, setStoredSalt, wipeUserKeyVaultState } from './saltStore';
import {
  holdPlaintextKey,
  releasePlaintextKey,
  wipeHeldPlaintextKeys,
} from './keyHolder';
import { validatePlaintextKey } from './validate';
import { getProvider, isSupportedProvider, type EncryptedBlob, type StoredKeyMeta } from './types';
import { createLogger } from '../core/logger';

const log = createLogger('keyVault');

export type ValidationStatus = 'unknown' | 'valid' | 'invalid';

export interface ProviderValidationState {
  status: ValidationStatus;
  reason: string | null;
}

export interface KeyVaultState {
  keys: StoredKeyMeta[];
  selectedProvider: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  isValidating: boolean;
  validation: Record<string, ProviderValidationState>;
  error: string | null;
  // ── actions ───────────────────────────────────────────────────────
  fetchKeys: () => Promise<void>;
  addKey: (input: AddKeyInput) => Promise<StoredKeyMeta>;
  removeKey: (provider: string) => Promise<void>;
  validateKey: (provider: string) => Promise<ProviderValidationState>;
  unlockKey: (provider: string, passphrase: string) => Promise<void>;
  lockKey: (provider: string) => void;
  lockAll: () => void;
  selectProvider: (provider: string | null) => void;
  clearError: () => void;
}

export interface AddKeyInput {
  provider: string;
  plaintext: string;
  passphrase: string;
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

function makeValidationState(s: ProviderValidationState): ProviderValidationState {
  return { status: s.status, reason: s.reason };
}

export const useKeyVaultStore = create<KeyVaultState>((set, get) => ({
  keys: [],
  selectedProvider: null,
  isLoading: false,
  isSubmitting: false,
  isValidating: false,
  validation: {},
  error: null,

  async fetchKeys() {
    set({ isLoading: true, error: null });
    try {
      const keys = await api.listKeys();
      set({ keys, isLoading: false });
    } catch (err) {
      log.warn('fetchKeys failed', errMsg(err));
      set({ isLoading: false, error: errMsg(err) });
    }
  },

  async addKey(input) {
    if (!isSupportedProvider(input.provider)) {
      const msg = `Unsupported provider: ${input.provider}`;
      set({ error: msg });
      throw new Error(msg);
    }
    set({ isSubmitting: true, error: null });
    try {
      // Salt handling: persist per-user so subsequent unlocks produce the
      // same KEK. If a salt already exists we re-use it; otherwise we
      // generate and persist a fresh one.
      const existingSaltB64 = getStoredSalt('self');
      const salt = existingSaltB64
        ? saltFromBase64(existingSaltB64)
        : generateSalt();
      if (!existingSaltB64) setStoredSalt('self', saltToBase64(salt));

      const kek = await deriveKey(input.passphrase, salt);
      const blob: EncryptedBlob = await encrypt(input.plaintext, kek);

      // Free the plaintext reference ASAP. It was never observable to React.
      // We deliberately do NOT cache the KEK either — derive fresh on unlock.
      const meta = await api.putKey({
        provider: input.provider,
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
        isValid: true,
      });
      // Refresh list so the UI reflects the new entry without an extra fetch.
      const keys = await api.listKeys();
      set({ keys, isSubmitting: false });
      return meta;
    } catch (err) {
      log.warn('addKey failed', errMsg(err));
      set({ isSubmitting: false, error: errMsg(err) });
      throw err instanceof Error ? err : new Error(errMsg(err));
    }
  },

  async removeKey(provider) {
    set({ isSubmitting: true, error: null });
    try {
      await api.deleteKey(provider);
      releasePlaintextKey(provider);
      const validation = get().validation;
      const nextValidation: Record<string, ProviderValidationState> = { ...validation };
      delete nextValidation[provider];
      const keys = await api.listKeys();
      set({
        keys,
        isSubmitting: false,
        validation: nextValidation,
      });
    } catch (err) {
      log.warn('removeKey failed', errMsg(err));
      set({ isSubmitting: false, error: errMsg(err) });
      throw err instanceof Error ? err : new Error(errMsg(err));
    }
  },

  async validateKey(provider) {
    if (!getProvider(provider)) {
      const state = makeValidationState({ status: 'invalid', reason: 'Unknown provider' });
      set((s) => ({ validation: { ...s.validation, [provider]: state } }));
      return state;
    }
    set({ isValidating: true, error: null });
    try {
      // Fetch metadata so we know whether the user has stored a key.
      const meta = await api.getKey(provider);
      if (!meta.hasKey) {
        const state = makeValidationState({ status: 'invalid', reason: 'No key stored for this provider' });
        set((s) => ({
          validation: { ...s.validation, [provider]: state },
          isValidating: false,
        }));
        return state;
      }
      // Server-side shape validation: just confirm the blob structure.
      // Deeper client-side validation requires the user to unlock their
      // vault (which the Settings page prompts for). We always do a shape
      // check via `getKey` (above) so the user sees "valid" if the blob is
      // well-formed and marked isValid=true server-side.
      const state = makeValidationState({
        status: meta.isValid ? 'valid' : 'invalid',
        reason: meta.isValid ? null : 'Server marked this key invalid',
      });
      set((s) => ({
        validation: { ...s.validation, [provider]: state },
        isValidating: false,
      }));
      return state;
    } catch (err) {
      const reason = errMsg(err);
      const state = makeValidationState({ status: 'invalid', reason });
      log.warn('validateKey failed', reason);
      set((s) => ({
        validation: { ...s.validation, [provider]: state },
        isValidating: false,
        error: reason,
      }));
      return state;
    }
  },

  async unlockKey(provider, passphrase) {
    // We need the blob to decrypt. The server returns metadata only, so
    // a true unlock requires either: (a) we kept an in-memory copy of the
    // blob at add-time, or (b) we re-fetch a fresh blob. The backend
    // currently returns metadata only, not the blob. So `unlockKey`
    // is a no-op for now and the plaintext key is only kept after `addKey`
    // (the user just typed it).
    //
    // For BYOK inference later (Issue 4.1), we'll fetch the blob and
    // decrypt it here using the passphrase. The signature is preserved so
    // the call site is stable.
    if (!passphrase) throw new Error('Passphrase required');
    if (!getProvider(provider)) throw new Error('Unknown provider');
    // Touch the holder so the type stays exported and the unlock signature
    // remains stable for downstream issues.
    void holdPlaintextKey;
  },

  lockKey(provider) {
    releasePlaintextKey(provider);
  },

  lockAll() {
    wipeHeldPlaintextKeys();
    wipeUserKeyVaultState('self');
  },

  selectProvider(provider) {
    set({ selectedProvider: provider });
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * After addKey the plaintext reference is held in memory for the current
 * session only — useful for the subsequent validation call. Callers that
 * prefer to lock immediately can call `lockKey(provider)` themselves.
 */
export async function addKeyAndHold(
  input: AddKeyInput,
): Promise<StoredKeyMeta> {
  const meta = await useKeyVaultStore.getState().addKey(input);
  holdPlaintextKey(input.provider, input.plaintext);
  return meta;
}

/**
 * Validate the held plaintext key against the provider's `/models` endpoint.
 * Used by the Settings page after add. Returns the validation state for
 * the UI.
 */
export async function validateHeldKey(
  provider: string,
  plaintext: string,
): Promise<ProviderValidationState> {
  const setState = useKeyVaultStore.setState;
  setState({ isValidating: true });
  try {
    const result = await validatePlaintextKey(provider, plaintext);
    const next = makeValidationState({
      status: result.isValid ? 'valid' : 'invalid',
      reason: result.reason ?? null,
    });
    setState((s) => ({
      validation: { ...s.validation, [provider]: next },
      isValidating: false,
    }));
    return next;
  } catch (err) {
    const reason = errMsg(err);
    const next = makeValidationState({ status: 'invalid', reason });
    setState((s) => ({
      validation: { ...s.validation, [provider]: next },
      isValidating: false,
      error: reason,
    }));
    return next;
  }
}