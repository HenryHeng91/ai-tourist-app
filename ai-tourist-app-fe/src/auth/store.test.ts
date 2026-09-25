import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapAuth, resetAuthStoreForTests, useAuthStore } from './store';
import type { AuthSession } from './types';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  signup: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('./api', () => ({
  login: (...args: unknown[]) => mocks.login(...args),
  signup: (...args: unknown[]) => mocks.signup(...args),
  refresh: (...args: unknown[]) => mocks.refresh(...args),
  logout: (...args: unknown[]) => mocks.logout(...args),
  getMe: (...args: unknown[]) => mocks.getMe(...args),
}));

const session: AuthSession = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: 'user@example.com',
  displayName: 'Traveller',
  accessToken: 'access-xyz',
  refreshToken: 'refresh-xyz',
};

beforeEach(() => {
  window.localStorage.clear();
  resetAuthStoreForTests();
  mocks.login.mockReset();
  mocks.signup.mockReset();
  mocks.refresh.mockReset();
  mocks.logout.mockReset();
  mocks.getMe.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useAuthStore', () => {
  it('starts unauthenticated', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  describe('login', () => {
    it('persists tokens, transitions to authenticated', async () => {
      mocks.login.mockResolvedValueOnce({
        ...session,
        email: 'a@b.com',
      });
      await useAuthStore.getState().login({ email: 'a@b.com', password: 'hunter12pw' });
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.email).toBe('a@b.com');
      expect(state.accessToken).toBe('access-xyz');
      expect(window.localStorage.getItem('ai-tourist-app.refreshToken')).toBe('refresh-xyz');
    });

    it('surfaces the backend error and stays unauthenticated', async () => {
      mocks.login.mockRejectedValueOnce(new Error('Invalid credentials'));
      await expect(
        useAuthStore.getState().login({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toThrow('Invalid credentials');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().error).toBe('Invalid credentials');
    });
  });

  describe('signup', () => {
    it('persists tokens on signup success', async () => {
      mocks.signup.mockResolvedValueOnce(session);
      await useAuthStore
        .getState()
        .signup({ email: 'a@b.com', password: 'hunter12pw', displayName: 'Ada' });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().displayName).toBe('Traveller');
    });

    it('surfaces duplicate-email errors', async () => {
      mocks.signup.mockRejectedValueOnce(new Error('Email already registered'));
      await expect(
        useAuthStore.getState().signup({ email: 'dup@b.com', password: 'hunter12pw' }),
      ).rejects.toThrow('Email already registered');
      expect(useAuthStore.getState().error).toBe('Email already registered');
    });
  });

  describe('logout', () => {
    it('clears tokens and signs out', async () => {
      window.localStorage.setItem('ai-tourist-app.refreshToken', 'r1');
      mocks.logout.mockResolvedValueOnce(undefined);
      await useAuthStore.getState().logout();
      expect(window.localStorage.getItem('ai-tourist-app.refreshToken')).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('clears local state even if the server-side revoke throws', async () => {
      window.localStorage.setItem('ai-tourist-app.refreshToken', 'r1');
      mocks.logout.mockRejectedValueOnce(new Error('boom'));
      await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('refreshSession', () => {
    it('returns false when no refresh token is stored', async () => {
      expect(await useAuthStore.getState().refreshSession()).toBe(false);
    });

    it('rotates the refresh token and updates the access token', async () => {
      window.localStorage.setItem('ai-tourist-app.refreshToken', 'old');
      mocks.refresh.mockResolvedValueOnce({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
      const ok = await useAuthStore.getState().refreshSession();
      expect(ok).toBe(true);
      expect(useAuthStore.getState().accessToken).toBe('new-access');
      expect(window.localStorage.getItem('ai-tourist-app.refreshToken')).toBe('new-refresh');
    });

    it('clears the session when the refresh fails', async () => {
      window.localStorage.setItem('ai-tourist-app.refreshToken', 'expired');
      mocks.refresh.mockRejectedValueOnce(new Error('expired'));
      const ok = await useAuthStore.getState().refreshSession();
      expect(ok).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(window.localStorage.getItem('ai-tourist-app.refreshToken')).toBeNull();
    });
  });

  describe('applyRefreshedTokens', () => {
    it('updates store + storage atomically', () => {
      useAuthStore.getState().applyRefreshedTokens({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
      expect(useAuthStore.getState().accessToken).toBe('new-access');
      expect(window.localStorage.getItem('ai-tourist-app.refreshToken')).toBe('new-refresh');
    });
  });
});

describe('bootstrapAuth', () => {
  it('is a no-op when no tokens are stored', async () => {
    await bootstrapAuth();
    expect(useAuthStore.getState().isBootstrapping).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('refreshes + verifies /auth/me when tokens exist', async () => {
    window.localStorage.setItem('ai-tourist-app.refreshToken', 'r1');
    mocks.refresh.mockResolvedValueOnce({ accessToken: 'access1', refreshToken: 'r2' });
    mocks.getMe.mockResolvedValueOnce({ userId: 'u1', email: 'a@b.com' });
    await bootstrapAuth();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe('u1');
    expect(state.isBootstrapping).toBe(false);
  });

  it('falls back to unauthenticated if refresh fails', async () => {
    window.localStorage.setItem('ai-tourist-app.refreshToken', 'r1');
    mocks.refresh.mockRejectedValueOnce(new Error('expired'));
    await bootstrapAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isBootstrapping).toBe(false);
  });

  it('sets isBootstrapping=false even if /auth/me fails', async () => {
    window.localStorage.setItem('ai-tourist-app.refreshToken', 'r1');
    mocks.refresh.mockResolvedValueOnce({ accessToken: 'access1', refreshToken: 'r2' });
    mocks.getMe.mockRejectedValueOnce(new Error('me failed'));
    await bootstrapAuth();
    expect(useAuthStore.getState().isBootstrapping).toBe(false);
  });
});
