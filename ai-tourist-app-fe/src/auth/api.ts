/**
 * Auth HTTP client — wraps the backend `/auth/*` endpoints.
 *
 * IMPORTANT: this module talks to the backend using a SEPARATE axios
 * instance (`rawHttp`) so that on 401 it doesn't itself trigger the
 * auto-refresh interceptor. The shared `httpClient` (which carries the
 * bearer + auto-refresh) is only used for authenticated calls (e.g.
 * `getMe`).
 *
 * The auto-refresh interceptor in `core/http.ts` reads the latest tokens
 * from the auth store, so we write new tokens back via that store, not
 * back into the interceptor's state.
 */
import axios, { AxiosInstance } from 'axios';
import { appConfig } from '../core/config';
import type { AuthResponse, AuthSession, AuthTokens } from './types';

interface LoginInput {
  email: string;
  password: string;
}

interface SignupInput extends LoginInput {
  displayName?: string;
}

const rawHttp: AxiosInstance = axios.create({
  baseURL: appConfig.apiUrl,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

function toSession(res: { data: AuthResponse }): AuthSession {
  return {
    userId: res.data.userId,
    email: res.data.email,
    displayName: res.data.displayName ?? null,
    accessToken: res.data.accessToken,
    refreshToken: res.data.refreshToken,
  };
}

/**
 * Map a backend `error.code` to a user-friendly localized message.
 *
 * WHY: the backend returns raw exception messages (e.g. "An account with
 * that email already exists") which are leaky, technical, and may expose
 * internal phrasing. The AuthPage displays whatever we throw verbatim, so we
 * rewrite each known code to a stable, friendly, English-only message the UI
 * can render. Adding a new backend error code requires adding an entry here.
 *
 * Codes we know about (keep in sync with `backend/src/shared/errors.ts` +
 * `backend/src/auth/auth.service.ts`):
 *   - EMAIL_TAKEN            → 409 on signup (ConflictError in auth.service)
 *   - INVALID_CREDENTIALS    → 401 on login  (UnauthorizedError)
 *   - UNAUTHORIZED           → generic 401
 *   - REFRESH_REPLAY         → 401 on refresh, session revoked
 *   - BAD_REQUEST            → 400 (Zod validation, malformed body)
 *   - RATE_LIMITED           → 429
 *   - INTERNAL               → 500
 *   - NETWORK                → no response (axios code, status 0)
 */
const FRIENDLY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  EMAIL_TAKEN: 'An account with that email already exists. Try signing in instead.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  UNAUTHORIZED: 'You need to sign in to continue.',
  REFRESH_REPLAY: 'Your session ended for security reasons. Please sign in again.',
  BAD_REQUEST: 'Some of the information you entered is invalid. Please review and try again.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  INTERNAL: 'Something went wrong on our end. Please try again in a moment.',
  NETWORK: 'Cannot reach the server. Check your connection and try again.',
};

function friendlyMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return FRIENDLY_ERROR_MESSAGES[code] ?? fallback;
}

/**
 * Parse a backend error envelope `{ error: { code, message } }` into an Error
 * with a stable `.code` field. The thrown `Error.message` is the LOCALIZED,
 * user-friendly text mapped from `error.code` so the AuthPage (and any other
 * UI surface that shows `err.message`) never leaks raw backend phrasing.
 *
 * Falls back to the axios message for network errors (status 0).
 */
function apiError(err: unknown): Error & { code?: string; status?: number } {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { code?: string; message?: string } } | undefined;
    const code = data?.error?.code ?? err.code ?? 'NETWORK';
    const backendMessage = data?.error?.message ?? err.message ?? 'Request failed';
    const message = friendlyMessage(code, backendMessage);
    const e = new Error(message) as Error & { code?: string; status?: number };
    e.code = code;
    e.status = err.response?.status;
    return e;
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/** POST /auth/signup — create a user and return session tokens. */
export async function signup(input: SignupInput): Promise<AuthSession> {
  try {
    const res = await rawHttp.post<AuthResponse>('/auth/signup', {
      email: input.email,
      password: input.password,
      ...(input.displayName ? { displayName: input.displayName } : {}),
    });
    return toSession(res);
  } catch (err) {
    throw apiError(err);
  }
}

/** POST /auth/login — exchange credentials for session tokens. */
export async function login(input: LoginInput): Promise<AuthSession> {
  try {
    const res = await rawHttp.post<AuthResponse>('/auth/login', input);
    return toSession(res);
  } catch (err) {
    throw apiError(err);
  }
}

/** POST /auth/refresh — rotate the refresh token; returns a fresh pair. */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  try {
    const res = await rawHttp.post<AuthTokens>('/auth/refresh', { refreshToken });
    return res.data;
  } catch (err) {
    throw apiError(err);
  }
}

/** POST /auth/logout — revoke the supplied refresh token. */
export async function logout(refreshToken: string): Promise<void> {
  try {
    await rawHttp.post('/auth/logout', { refreshToken });
  } catch (err) {
    // Logout is best-effort — server-side revocation may fail but the client
    // discards its local copies regardless. We don't surface the error; the
    // UI will clear the session either way.
    void err;
  }
}

/** GET /auth/me — returns the authenticated user (used to verify a refresh). */
export async function getMe(accessToken: string): Promise<{ userId: string; email: string }> {
  const res = await rawHttp.get<{ userId: string; email: string }>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}