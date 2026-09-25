import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearStoredRefreshToken, writeRefreshToken } from '../auth/tokenStorage';

/**
 * Smoke tests for the http client.
 *
 * The detailed refresh-on-401 flow is exercised end-to-end via the
 * live backend (see task report T1.3-auth.md). Here we just verify
 * the module exposes the shared client with the expected axios
 * surface area.
 */

describe('httpClient', () => {
  it('is exported as a callable axios-like instance', async () => {
    const { httpClient } = await import('./http');
    expect(httpClient).toBeDefined();
    expect(typeof (httpClient as unknown as { request?: unknown }).request).toBe(
      'function',
    );
    expect(typeof (httpClient as unknown as { post?: unknown }).post).toBe(
      'function',
    );
    expect(typeof (httpClient as unknown as { get?: unknown }).get).toBe(
      'function',
    );
    expect(typeof (httpClient as unknown as { interceptors?: unknown }).interceptors).toBe(
      'object',
    );
  });

  it('exposes the request interceptor manager', async () => {
    const { httpClient } = await import('./http');
    const client = httpClient as unknown as {
      interceptors: { request: { use: (...args: unknown[]) => unknown } };
    };
    expect(typeof client.interceptors.request.use).toBe('function');
  });

  it('exposes the response interceptor manager', async () => {
    const { httpClient } = await import('./http');
    const client = httpClient as unknown as {
      interceptors: { response: { use: (...args: unknown[]) => unknown } };
    };
    expect(typeof client.interceptors.response.use).toBe('function');
  });

  it('createHttpClient returns a fresh instance each call', async () => {
    const { createHttpClient } = await import('./http');
    const a = createHttpClient();
    const b = createHttpClient();
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
  });
});

describe('httpClient token side effects', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('clears stored refresh token via helper', () => {
    writeRefreshToken('ai-tourist-app.refreshToken', 'old-refresh');
    clearStoredRefreshToken('ai-tourist-app.refreshToken');
    expect(window.localStorage.getItem('ai-tourist-app.refreshToken')).toBeNull();
  });
});
