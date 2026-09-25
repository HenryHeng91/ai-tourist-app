import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from './types';

/**
 * `auth/api.ts` calls `/auth/*` via its OWN axios instance (`rawHttp`) — it
 * must NOT use the shared `httpClient` (which carries the auto-refresh
 * interceptor) for the credential endpoints. We mock `axios` at the module
 * boundary so the test verifies the URL + payload, not the network.
 */
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}));

vi.mock('axios', () => {
  const mockAxios = {
    isAxiosError: (err: unknown): boolean =>
      Boolean(err && typeof err === 'object' && (err as { isAxios?: boolean }).isAxios === true),
  };
  const instance = {
    post: (...args: unknown[]) => mocks.post(...args),
    get: (...args: unknown[]) => mocks.get(...args),
    create: () => instance,
  };
  return { default: { ...mockAxios, ...instance }, ...mockAxios, ...instance };
});

import { getMe, login, logout, refresh, signup } from './api';

const session: AuthResponse = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: 'user@example.com',
  displayName: 'Traveller',
  accessToken: 'access-xyz',
  refreshToken: 'refresh-xyz',
};

beforeEach(() => {
  mocks.post.mockReset();
  mocks.get.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auth api', () => {
  describe('signup', () => {
    it('POSTs to /auth/signup with email + password', async () => {
      mocks.post.mockResolvedValueOnce({ data: session });
      const result = await signup({ email: 'a@b.com', password: 'hunter12pw' });
      expect(result).toEqual(session);
      expect(mocks.post).toHaveBeenCalledWith(
        '/auth/signup',
        { email: 'a@b.com', password: 'hunter12pw' },
      );
    });

    it('includes displayName only when provided', async () => {
      mocks.post.mockResolvedValueOnce({ data: session });
      await signup({ email: 'a@b.com', password: 'hunter12pw', displayName: 'Ada' });
      expect(mocks.post).toHaveBeenCalledWith(
        '/auth/signup',
        { email: 'a@b.com', password: 'hunter12pw', displayName: 'Ada' },
      );
    });

    it('omits displayName for empty string', async () => {
      mocks.post.mockResolvedValueOnce({ data: session });
      await signup({ email: 'a@b.com', password: 'hunter12pw', displayName: '' });
      const payload = mocks.post.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('displayName');
    });

    it('surfaces upstream errors with backend code', async () => {
      mocks.post.mockRejectedValueOnce({
        isAxios: true,
        message: 'Request failed',
        code: 'ERR_BAD_REQUEST',
        response: {
          status: 409,
          data: { error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } },
        },
      });
      await expect(signup({ email: 'a@b.com', password: 'hunter12pw' })).rejects.toMatchObject({
        code: 'EMAIL_TAKEN',
        message: 'Email already registered',
        status: 409,
      });
    });
  });

  describe('login', () => {
    it('POSTs to /auth/login with credentials', async () => {
      mocks.post.mockResolvedValueOnce({ data: session });
      const result = await login({ email: 'a@b.com', password: 'hunter12pw' });
      expect(result).toEqual(session);
      expect(mocks.post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'a@b.com', password: 'hunter12pw' },
      );
    });

    it('maps 401 to INVALID_CREDENTIALS-shaped errors', async () => {
      mocks.post.mockRejectedValueOnce({
        isAxios: true,
        message: 'Request failed',
        code: 'ERR_BAD_REQUEST',
        response: {
          status: 401,
          data: { error: { code: 'INVALID_CREDENTIALS', message: 'Bad creds' } },
        },
      });
      await expect(login({ email: 'a@b.com', password: 'wrong' })).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
        status: 401,
      });
    });
  });

  describe('refresh', () => {
    it('POSTs the refresh token and returns the rotated pair', async () => {
      mocks.post.mockResolvedValueOnce({
        data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      });
      const result = await refresh('old-refresh');
      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      expect(mocks.post).toHaveBeenCalledWith(
        '/auth/refresh',
        { refreshToken: 'old-refresh' },
      );
    });

    it('rejects with a friendly code on replay', async () => {
      mocks.post.mockRejectedValueOnce({
        isAxios: true,
        message: 'Request failed',
        code: 'ERR_BAD_REQUEST',
        response: {
          status: 401,
          data: { error: { code: 'REFRESH_REPLAY', message: 'Replay detected' } },
        },
      });
      await expect(refresh('stale-token')).rejects.toMatchObject({
        code: 'REFRESH_REPLAY',
        status: 401,
      });
    });
  });

  describe('logout', () => {
    it('POSTs the refresh token to /auth/logout', async () => {
      mocks.post.mockResolvedValueOnce({});
      await logout('refresh-xyz');
      expect(mocks.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'refresh-xyz' });
    });

    it('does not throw when the server-side revoke fails', async () => {
      mocks.post.mockRejectedValueOnce(new Error('network'));
      await expect(logout('refresh-xyz')).resolves.toBeUndefined();
    });
  });

  describe('getMe', () => {
    it('GETs /auth/me with bearer token', async () => {
      mocks.get.mockResolvedValueOnce({
        data: { userId: 'u1', email: 'a@b.com' },
      });
      const result = await getMe('access-xyz');
      expect(result).toEqual({ userId: 'u1', email: 'a@b.com' });
      expect(mocks.get).toHaveBeenCalledWith('/auth/me', {
        headers: { Authorization: 'Bearer access-xyz' },
      });
    });
  });
});
