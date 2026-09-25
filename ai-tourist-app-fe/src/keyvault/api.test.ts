import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
} from './crypto';
import type { StoredKeyMeta } from './types';

// Mock the shared http client so api.ts exercises a stable surface.
const post = vi.fn();
const get = vi.fn();
const del = vi.fn();

vi.mock('../core/http', () => ({
  httpClient: {
    post: (...args: unknown[]) => post(...args),
    get: (...args: unknown[]) => get(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

import { deleteKey, getKey, listKeys, putKey } from './api';

const VALID_CT = bytesToBase64(new Uint8Array(32));
const VALID_IV = bytesToBase64(new Uint8Array(12));
const VALID_TAG = bytesToBase64(new Uint8Array(16));

const meta: StoredKeyMeta = {
  provider: 'openai',
  hasKey: true,
  isValid: true,
  validatedAt: new Date().toISOString(),
};

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  del.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('keyVault api', () => {
  it('putKey POSTs the encrypted blob and returns metadata', async () => {
    post.mockResolvedValueOnce({ data: meta });
    const result = await putKey({
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
    });
    expect(result).toEqual(meta);
    expect(post).toHaveBeenCalledWith('/me/keys', {
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
    });
    // SECURITY: payload must NOT contain any plaintext.
    const payload = post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('plaintext');
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('key');
  });

  it('putKey sends isValid when explicitly false', async () => {
    post.mockResolvedValueOnce({ data: { ...meta, isValid: false } });
    await putKey({
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
      isValid: false,
    });
    expect(post).toHaveBeenCalledWith('/me/keys', {
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
      isValid: false,
    });
  });

  it('listKeys unwraps the { keys: [] } envelope', async () => {
    get.mockResolvedValueOnce({ data: { keys: [meta] } });
    const result = await listKeys();
    expect(result).toEqual([meta]);
    expect(get).toHaveBeenCalledWith('/me/keys');
  });

  it('getKey fetches a single provider', async () => {
    get.mockResolvedValueOnce({ data: meta });
    const result = await getKey('openai');
    expect(result).toEqual(meta);
    expect(get).toHaveBeenCalledWith('/me/keys/openai');
  });

  it('getKey URL-encodes the provider name', async () => {
    get.mockResolvedValueOnce({ data: meta });
    await getKey('my provider/x');
    expect(get).toHaveBeenCalledWith('/me/keys/my%20provider%2Fx');
  });

  it('deleteKey issues a DELETE and returns void', async () => {
    del.mockResolvedValueOnce({});
    await expect(deleteKey('openai')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith('/me/keys/openai');
  });

  it('surfaces upstream errors', async () => {
    post.mockRejectedValueOnce(new Error('boom'));
    await expect(
      putKey({
        provider: 'openai',
        ciphertext: VALID_CT,
        iv: VALID_IV,
        authTag: VALID_TAG,
      }),
    ).rejects.toThrow(/boom/);
  });

  it('blobs are base64 round-trippable', () => {
    // Sanity: the bytes survive a JSON round trip (base64 is what crosses the wire).
    expect(base64ToBytes(VALID_CT).byteLength).toBe(32);
    expect(base64ToBytes(VALID_IV).byteLength).toBe(12);
    expect(base64ToBytes(VALID_TAG).byteLength).toBe(16);
  });
});