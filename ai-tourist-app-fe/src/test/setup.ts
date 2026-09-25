import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest 2.1 with globals:true should register RTL cleanup automatically, but
// in practice some setups leak DOM across tests in the same file —
// `getByLabelText` returns stale matches from prior renders, causing
// ambiguous queries and "Number of calls: 0" failures. Run cleanup
// explicitly after every test to guarantee a fresh DOM.
afterEach(() => {
  cleanup();
});

// ── localStorage polyfill ──────────────────────────────────────────
// Node 25 exposes a stub localStorage on globalThis without
// `--localstorage-file`, which vitest 4.1.x's jsdom env then leaks through.
// Its populateGlobal allowlist does not include localStorage, so jsdom's
// working Storage is dropped and Node's broken stub wins — leaving
// `window.localStorage.getItem` undefined. Install a working in-memory
// Storage shim before any module that reads localStorage at import time.
if (typeof window !== 'undefined') {
  type MaybeStorage = Storage | undefined | { getItem?: unknown };
  const candidate = (globalThis as { localStorage?: MaybeStorage }).localStorage;
  const isBroken =
    !candidate || typeof (candidate as Storage).getItem !== 'function';
  if (isBroken) {
    const data = new Map<string, string>();
    const memoryStorage: Storage = {
      get length() {
        return data.size;
      },
      clear() {
        data.clear();
      },
      getItem(key: string) {
        return data.has(key) ? (data.get(key) ?? null) : null;
      },
      setItem(key: string, value: string) {
        data.set(key, String(value));
      },
      removeItem(key: string) {
        data.delete(key);
      },
      key(index: number) {
        return Array.from(data.keys())[index] ?? null;
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: memoryStorage,
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: memoryStorage,
    });
  }
}