/**
 * `useAuthStore` — Zustand store for the authenticated session.
 *
 * Token persistence:
 *   - Access tokens live in memory AND in localStorage so a hard reload can
 *     keep the user signed in for a single request window. On boot, the
 *     http interceptor will refresh if /auth/me rejects the stored access
 *     token.
 *   - Refresh tokens live ONLY in localStorage (never exposed to the rest of
 *     the app). Exposed to `core/http.ts` via the `getStoredRefreshToken()`
 *     helper for the auto-refresh interceptor.
 *
 * The store is intentionally minimal: UI-level signals (loading, error) and
 * the public session. Persistence is handled in two side-effect hooks
 * (`persistAccessToken`, `persistRefreshToken`) so the store stays pure.
 */
import { create } from 'zustand';
import * as api from './api';
import {
  persistAccessToken,
  readAccessToken,
  readRefreshToken,
  clearStoredRefreshToken,
} from './tokenStorage';
import type { AuthSession, AuthTokens } from './types';

const ACCESS_TOKEN_STORAGE_KEY = 'ai-tourist-app.authToken';
const REFRESH_TOKEN_STORAGE_KEY = 'ai-tourist-app.refreshToken';

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  accessToken: string | null;
  isBootstrapping: boolean;
  error: string | null;
  // ── actions ───────────────────────────────────────────────────────
  login: (input: { email: string; password: string }) => Promise<AuthSession>;
  signup: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  /** Apply tokens from outside (used by the auto-refresh interceptor). */
  applyRefreshedTokens: (tokens: AuthTokens) => void;
  clearError: () => void;
}

function apiMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

/**
 * Read tokens from localStorage on boot. Access token may be empty (forcing
 * a refresh on first request), refresh token is required to attempt one.
 */
function readInitialTokens(): { access: string | null; refresh: string | null } {
  return {
    access: readAccessToken(ACCESS_TOKEN_STORAGE_KEY),
    refresh: readRefreshToken(REFRESH_TOKEN_STORAGE_KEY),
  };
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = readInitialTokens();
  return {
    isAuthenticated: false,
    userId: null,
    email: null,
    displayName: null,
    // Only seed from storage if we have BOTH tokens — a half-paired session
    // means a refresh is needed before /auth/me will pass.
    accessToken: initial.refresh ? initial.access : null,
    isBootstrapping: true,
    error: null,

    async login(input) {
      set({ error: null });
      try {
        const session = await api.login(input);
        persistAccessToken(ACCESS_TOKEN_STORAGE_KEY, session.accessToken);
        // Refresh token goes through the dedicated storage so the
        // auto-refresh interceptor can read it back later.
        window.localStorage?.setItem(REFRESH_TOKEN_STORAGE_KEY, session.refreshToken);
        set({
          isAuthenticated: true,
          userId: session.userId,
          email: session.email,
          displayName: session.displayName,
          accessToken: session.accessToken,
          isBootstrapping: false,
          error: null,
        });
        return session;
      } catch (err) {
        set({ error: apiMessage(err), isBootstrapping: false });
        throw err;
      }
    },

    async signup(input) {
      set({ error: null });
      try {
        const session = await api.signup(input);
        persistAccessToken(ACCESS_TOKEN_STORAGE_KEY, session.accessToken);
        window.localStorage?.setItem(REFRESH_TOKEN_STORAGE_KEY, session.refreshToken);
        set({
          isAuthenticated: true,
          userId: session.userId,
          email: session.email,
          displayName: session.displayName,
          accessToken: session.accessToken,
          isBootstrapping: false,
          error: null,
        });
        return session;
      } catch (err) {
        set({ error: apiMessage(err), isBootstrapping: false });
        throw err;
      }
    },

    async logout() {
      const refreshToken = readRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
      // Best-effort server-side revoke. A failure here MUST NOT prevent the
      // client from clearing its local session — the user's request to sign
      // out is authoritative on this device.
      if (refreshToken) {
        try {
          await api.logout(refreshToken);
        } catch {
          // Swallow; we'll clear local state regardless.
        }
      }
      clearStoredRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
      persistAccessToken(ACCESS_TOKEN_STORAGE_KEY, null);
      set({
        isAuthenticated: false,
        userId: null,
        email: null,
        displayName: null,
        accessToken: null,
        error: null,
      });
      void get;
    },

    async refreshSession() {
      const refreshToken = readRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
      if (!refreshToken) return false;
      try {
        const tokens = await api.refresh(refreshToken);
        // Persist the rotated refresh token so a future refresh uses the
        // latest one (the old one is now revoked server-side).
        window.localStorage?.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
        persistAccessToken(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
        set({ accessToken: tokens.accessToken });
        return true;
      } catch {
        // Refresh failed — try-clearing the session so the user is forced to
        // re-authenticate.
        clearStoredRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
        persistAccessToken(ACCESS_TOKEN_STORAGE_KEY, null);
        set({
          isAuthenticated: false,
          userId: null,
          email: null,
          displayName: null,
          accessToken: null,
        });
        return false;
      }
    },

    applyRefreshedTokens(tokens) {
      persistAccessToken(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
      window.localStorage?.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
      set({ accessToken: tokens.accessToken });
    },

    clearError() {
      set({ error: null });
    },
  };
});

/**
 * Boot-time sync: if we have BOTH tokens, call /auth/me on the access token
 * to confirm it's still valid. On 401 the http interceptor auto-refreshes.
 * If neither token is present, this is a no-op.
 *
 * Exposed as a separate function (called from main.tsx) so the store
 * initialization stays synchronous.
 */
export async function bootstrapAuth(): Promise<void> {
  const { refreshSession } = useAuthStore.getState();
  const initial = readInitialTokens();
  if (!initial.refresh) {
    useAuthStore.setState({ isBootstrapping: false });
    return;
  }
  // First, attempt a refresh to get a fresh pair (and validates the refresh
  // token is still alive). If it fails, surface a clean unauthenticated state.
  const ok = await refreshSession();
  if (!ok) {
    useAuthStore.setState({ isBootstrapping: false });
    return;
  }
  try {
    const session = await api.getMe(useAuthStore.getState().accessToken ?? '');
    useAuthStore.setState({
      isAuthenticated: true,
      userId: session.userId,
      email: session.email,
      displayName: null,
      isBootstrapping: false,
    });
  } catch {
    useAuthStore.setState({ isBootstrapping: false });
  }
}

/** Helper for tests: reset the store and storage. */
export function resetAuthStoreForTests(): void {
  clearStoredRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
  persistAccessToken(ACCESS_TOKEN_STORAGE_KEY, null);
  useAuthStore.setState({
    isAuthenticated: false,
    userId: null,
    email: null,
    displayName: null,
    accessToken: null,
    isBootstrapping: false,
    error: null,
  });
}
