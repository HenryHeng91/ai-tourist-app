import { afterEach, describe, expect, it } from 'vitest';
import {
  getHeldPlaintextKey,
  heldProviders,
  holdPlaintextKey,
  releasePlaintextKey,
  wipeHeldPlaintextKeys,
} from './keyHolder';

afterEach(() => {
  wipeHeldPlaintextKeys();
});

describe('keyHolder', () => {
  it('stores and retrieves a plaintext key', () => {
    holdPlaintextKey('openai', 'sk-test');
    expect(getHeldPlaintextKey('openai')).toBe('sk-test');
  });

  it('returns undefined for an unknown provider', () => {
    expect(getHeldPlaintextKey('anthropic')).toBeUndefined();
  });

  it('lists held providers', () => {
    holdPlaintextKey('openai', 'a');
    holdPlaintextKey('anthropic', 'b');
    expect([...heldProviders()].sort()).toEqual(['anthropic', 'openai']);
  });

  it('removes a specific provider', () => {
    holdPlaintextKey('openai', 'a');
    holdPlaintextKey('anthropic', 'b');
    releasePlaintextKey('openai');
    expect(getHeldPlaintextKey('openai')).toBeUndefined();
    expect(getHeldPlaintextKey('anthropic')).toBe('b');
  });

  it('wipes everything', () => {
    holdPlaintextKey('openai', 'a');
    holdPlaintextKey('anthropic', 'b');
    wipeHeldPlaintextKeys();
    expect(heldProviders()).toEqual([]);
  });
});