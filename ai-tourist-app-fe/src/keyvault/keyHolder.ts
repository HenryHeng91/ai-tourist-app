/**
 * In-memory holder for unlocked plaintext keys.
 *
 * Plaintext keys live in this map ONLY between explicit unlock and lock
 * events. Never written to disk. The map is wiped on logout.
 *
 * IMPORTANT: this is a separate concept from `useKeyVaultStore`. The
 * Zustand store is the React-observable view (metadata, action loading
 * flags); the holder is a non-reactive side-store so the plaintext
 * reference is NOT exposed to devtools / React DevTools / time-travel
 * debugging.
 */

const holder = new Map<string, string>();

export function holdPlaintextKey(provider: string, plaintext: string): void {
  holder.set(provider, plaintext);
}

export function getHeldPlaintextKey(provider: string): string | undefined {
  return holder.get(provider);
}

export function releasePlaintextKey(provider: string): void {
  holder.delete(provider);
}

/**
 * Drop ALL held plaintext keys. Called on logout so a subsequent user
 * cannot inherit them.
 */
export function wipeHeldPlaintextKeys(): void {
  holder.clear();
}

export function heldProviders(): ReadonlyArray<string> {
  return [...holder.keys()];
}