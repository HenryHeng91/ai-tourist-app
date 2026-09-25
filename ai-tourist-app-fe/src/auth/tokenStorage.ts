/**
 * Token persistence helpers.
 *
 * - Access tokens are stored under the public key passed in by callers so the
 *   http interceptor and store can both address the same slot.
 * - Refresh tokens are stored ONLY via `readRefreshToken` /
 *   `writeRefreshToken` / `clearStoredRefreshToken`, which use their own
 *   caller-supplied key. Both `store.ts` and `http.ts` import these helpers
 *   so the refresh-token key is defined in exactly one place per caller.
 *
 * Storage safety: each access to `window.localStorage` is guarded by a
 * `typeof window !== 'undefined'` check so the module can be imported by
 * vitest in jsdom OR by SSR contexts without throwing.
 */
const hasWindow = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function safeGet(key: string): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  if (!hasWindow()) return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // localStorage quota / disabled — ignore; in-memory store is the
    // fallback.
  }
}

export function readAccessToken(key: string): string | null {
  return safeGet(key);
}

export function persistAccessToken(key: string, token: string | null): void {
  safeSet(key, token);
}

export function readRefreshToken(key: string): string | null {
  return safeGet(key);
}

export function writeRefreshToken(key: string, token: string): void {
  safeSet(key, token);
}

export function clearStoredRefreshToken(key: string): void {
  safeSet(key, null);
}
