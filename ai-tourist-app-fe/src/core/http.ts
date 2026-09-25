import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import { appConfig } from './config';
import { useAuthStore } from '../auth/store';
import { readRefreshToken, clearStoredRefreshToken } from '../auth/tokenStorage';

/**
 * Shared Axios instance.
 * - Attaches `Authorization: Bearer <accessToken>` from the auth store.
 * - On 401, attempts ONE silent refresh via `/auth/refresh`. All concurrent
 *   requests share a single refresh promise to avoid rotation races.
 * - After a successful refresh, the original request is retried once with
 *   the new token.
 * - After a failed refresh, tokens are cleared and the original 401 is
 *   rethrown so the UI can redirect to /login.
 *
 * Token storage keys are owned by the auth store; this module reads the
 * refresh token directly from localStorage via the shared helper.
 */

const REFRESH_TOKEN_STORAGE_KEY = 'ai-tourist-app.refreshToken';
const REFRESH_ENDPOINT = '/auth/refresh';

/** Marker we set on retried requests so the interceptor doesn't loop. */
const RETRY_FLAG = '__aiTouristAuthRetry';

interface PendingRetry {
  promise: Promise<string | null>;
  resolve: (token: string | null) => void;
  reject: (err: unknown) => void;
}

let pendingRefresh: PendingRetry | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = readRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken) {
    clearStoredRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
    return null;
  }

  try {
    // We call the refresh endpoint through a private axios instance — the
    // shared `httpClient` carries the bearer + retry queue which we don't
    // want for refresh.
    const rawClient = axios.create({
      baseURL: appConfig.apiUrl,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await rawClient.post<{ accessToken: string; refreshToken: string }>(
      REFRESH_ENDPOINT,
      { refreshToken },
    );
    const { accessToken, refreshToken: newRefresh } = res.data;
    useAuthStore.getState().applyRefreshedTokens({
      accessToken,
      refreshToken: newRefresh,
    });
    return accessToken;
  } catch {
    // Refresh failed — force-clear session so the user is signed out.
    clearStoredRefreshToken(REFRESH_TOKEN_STORAGE_KEY);
    useAuthStore.setState({
      isAuthenticated: false,
      userId: null,
      email: null,
      displayName: null,
      accessToken: null,
    });
    return null;
  }
}

/** Get (or create) a single in-flight refresh promise for the next 401. */
function getOrStartRefresh(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh.promise;
  let resolve!: (token: string | null) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<string | null>((res, rej) => {
    resolve = res;
    reject = rej;
  }) as Promise<string | null>;
  pendingRefresh = { promise, resolve, reject };
  performRefresh()
    .then((token) => {
      pendingRefresh?.resolve(token);
      pendingRefresh = null;
    })
    .catch((err) => {
      pendingRefresh?.reject(err);
      pendingRefresh = null;
    });
  return promise;
}

export function createHttpClient(): AxiosInstance {
  const client = axios.create({
    baseURL: appConfig.apiUrl,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use((req: InternalAxiosRequestConfig) => {
    // Read the in-memory access token first (faster than storage), fall back
    // to the store state for callers that haven't been wired through the
    // store yet.
    const state = useAuthStore.getState();
    const token = state.accessToken ?? null;
    if (token) {
      req.headers.set('Authorization', `Bearer ${token}`);
    }
    return req;
  });

  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const originalConfig = error.config as (AxiosRequestConfig & { [RETRY_FLAG]?: boolean }) | undefined;
      const status = error.response?.status;

      // Only attempt a refresh for the configured auth-protected surface; the
      // /auth/* endpoints themselves don't carry a bearer and shouldn't be
      // retried on 401 (a 401 from /login means bad credentials).
      if (status === 401 && originalConfig && !originalConfig[RETRY_FLAG]) {
        // Don't loop on the refresh endpoint itself or on /auth/login (we get
        // here legitimately when credentials are wrong).
        const url = originalConfig.url ?? '';
        if (url.includes(REFRESH_ENDPOINT) || url.includes('/auth/')) {
          return Promise.reject(error);
        }

        originalConfig[RETRY_FLAG] = true;
        const newToken = await getOrStartRefresh();
        if (!newToken) {
          // Refresh failed — surface the original 401 to the caller.
          return Promise.reject(error);
        }
        originalConfig.headers = {
          ...(originalConfig.headers ?? {}),
          Authorization: `Bearer ${newToken}`,
        };
        return client(originalConfig);
      }

      return Promise.reject(error);
    },
  );

  return client;
}

export const httpClient = createHttpClient();
