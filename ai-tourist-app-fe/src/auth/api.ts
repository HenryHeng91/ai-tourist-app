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
 * Parse a backend error envelope `{ error: { code, message } }` into an Error
 * with a stable `.code` field. Falls back to the axios message for network
 * errors (status 0).
 */
function apiError(err: unknown): Error & { code?: string; status?: number } {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { code?: string; message?: string } } | undefined;
    const code = data?.error?.code ?? err.code ?? 'NETWORK';
    const message = data?.error?.message ?? err.message ?? 'Request failed';
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
