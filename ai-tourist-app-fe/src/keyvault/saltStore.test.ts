import { afterEach, describe, expect, it } from 'vitest';
import {
  bytesToBase64,
  generateSalt,
} from './crypto';
import {
  clearStoredSalt,
  getStoredSalt,
  setStoredSalt,
  wipeUserKeyVaultState,
} from './saltStore';

afterEach(() => {
  wipeUserKeyVaultState('user-1');
  wipeUserKeyVaultState('user-2');
  wipeUserKeyVaultState('self');
});

describe('saltStore', () => {
  it('returns null for a user that has no salt yet', () => {
    expect(getStoredSalt('user-1')).toBeNull();
  });

  it('round-trips a salt per user', () => {
    const saltB64 = bytesToBase64(generateSalt());
    setStoredSalt('user-1', saltB64);
    expect(getStoredSalt('user-1')).toBe(saltB64);
    expect(getStoredSalt('user-2')).toBeNull();
  });

  it('isolates salts between users', () => {
    setStoredSalt('user-1', 'salt-a');
    setStoredSalt('user-2', 'salt-b');
    expect(getStoredSalt('user-1')).toBe('salt-a');
    expect(getStoredSalt('user-2')).toBe('salt-b');
  });

  it('removes a salt when asked', () => {
    setStoredSalt('user-1', 'salt');
    clearStoredSalt('user-1');
    expect(getStoredSalt('user-1')).toBeNull();
  });

  it('wipes a user without affecting others', () => {
    setStoredSalt('user-1', 'a');
    setStoredSalt('user-2', 'b');
    wipeUserKeyVaultState('user-1');
    expect(getStoredSalt('user-1')).toBeNull();
    expect(getStoredSalt('user-2')).toBe('b');
  });
});