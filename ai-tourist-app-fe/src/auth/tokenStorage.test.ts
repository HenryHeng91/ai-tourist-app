import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredRefreshToken,
  persistAccessToken,
  readAccessToken,
  readRefreshToken,
  writeRefreshToken,
} from './tokenStorage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('tokenStorage', () => {
  it('persists and reads an access token', () => {
    persistAccessToken('k1', 'access-1');
    expect(readAccessToken('k1')).toBe('access-1');
  });

  it('removes the access token when set to null', () => {
    persistAccessToken('k1', 'access-1');
    persistAccessToken('k1', null);
    expect(readAccessToken('k1')).toBeNull();
  });

  it('persists and reads a refresh token', () => {
    writeRefreshToken('rk', 'refresh-1');
    expect(readRefreshToken('rk')).toBe('refresh-1');
  });

  it('clears the refresh token', () => {
    writeRefreshToken('rk', 'refresh-1');
    clearStoredRefreshToken('rk');
    expect(readRefreshToken('rk')).toBeNull();
  });

  it('uses independent keys for access and refresh', () => {
    persistAccessToken('access-key', 'access-1');
    writeRefreshToken('refresh-key', 'refresh-1');
    expect(readAccessToken('access-key')).toBe('access-1');
    expect(readRefreshToken('refresh-key')).toBe('refresh-1');
    clearStoredRefreshToken('refresh-key');
    expect(readAccessToken('access-key')).toBe('access-1');
  });

  it('returns null when localStorage throws on read', () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error('quota');
    };
    expect(readAccessToken('k')).toBeNull();
    window.localStorage.getItem = original;
  });

  it('does not throw when localStorage write fails', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => persistAccessToken('k', 'access-1')).not.toThrow();
    expect(() => writeRefreshToken('rk', 'r-1')).not.toThrow();
    window.localStorage.setItem = original;
  });
});
