/**
 * Per-user salt persistence. The salt is NOT secret — it just makes the
 * PBKDF2 derivation unique per-user so a leaked KEK of one user cannot be
 * used to decrypt another user's blob.
 *
 * Storage key shape: `ai-tourist-app.keyVault.salt.<userId>`
 */
const SALT_KEY_PREFIX = 'ai-tourist-app.keyVault.salt.';

function storageKey(userId: string): string {
  return `${SALT_KEY_PREFIX}${userId}`;
}

function safeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // localStorage unavailable (e.g. private mode); in-memory only.
  }
}

function safeRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

export function getStoredSalt(userId: string): string | null {
  return safeGet(storageKey(userId));
}

export function setStoredSalt(userId: string, saltB64: string): void {
  safeSet(storageKey(userId), saltB64);
}

export function clearStoredSalt(userId: string): void {
  safeRemove(storageKey(userId));
}

/**
 * Wipe ALL key-vault localStorage state for the given user. Called on
 * logout so a subsequent user on the same browser cannot piggyback on a
 * stale salt.
 */
export function wipeUserKeyVaultState(userId: string): void {
  clearStoredSalt(userId);
}