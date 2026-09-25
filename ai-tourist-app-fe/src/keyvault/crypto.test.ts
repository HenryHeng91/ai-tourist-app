import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decrypt,
  deriveKey,
  encrypt,
  generateSalt,
  saltFromBase64,
  saltToBase64,
} from './crypto';

/**
 * jsdom ≥ 22 exposes `crypto.subtle` from Node's webcrypto. If a future
 * environment lacks it we fail loudly rather than silently falling back
 * to a non-Web-Crypto path (the whole point of this module is to use
 * the audited native implementation).
 */

const PASSPHRASE = 'correct horse battery staple';
const PASSPHRASE_2 = 'Tr0ub4dor&3';

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    expect(base64ToBytes(bytesToBase64(original))).toEqual(original);
  });

  it('handles an empty buffer', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });
});

describe('salt generation', () => {
  it('produces a 16-byte salt', () => {
    const salt = generateSalt();
    expect(salt.byteLength).toBe(16);
  });

  it('produces a fresh salt on every call', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(bytesToBase64(a)).not.toBe(bytesToBase64(b));
  });

  it('rejects a salt of the wrong length', () => {
    expect(() => saltFromBase64(bytesToBase64(new Uint8Array(8)))).toThrow(/Invalid salt length/);
  });
});

describe('deriveKey', () => {
  it('produces a non-extractable AES-GCM key', async () => {
    const salt = generateSalt();
    const key = await deriveKey(PASSPHRASE, salt);
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(expect.arrayContaining(['encrypt', 'decrypt']));
  });

  it('throws on an empty passphrase', async () => {
    await expect(deriveKey('', generateSalt())).rejects.toThrow(/Passphrase must not be empty/);
  });

  it('derives the same key from the same passphrase + salt', async () => {
    const salt = generateSalt();
    const a = await deriveKey(PASSPHRASE, salt);
    const b = await deriveKey(PASSPHRASE, salt);
    // Two derived keys are independent CryptoKey objects but must
    // decrypt each other's output — which we verify in the next block.
    const blob = await encrypt('hello', a);
    expect(await decrypt(blob, b)).toBe('hello');
  });

  it('derives a different key from a different passphrase', async () => {
    const salt = generateSalt();
    const a = await deriveKey(PASSPHRASE, salt);
    const b = await deriveKey(PASSPHRASE_2, salt);
    const blob = await encrypt('hello', a);
    await expect(decrypt(blob, b)).rejects.toThrow(/Decryption failed/);
  });

  it('derives a different key from a different salt', async () => {
    const a = await deriveKey(PASSPHRASE, generateSalt());
    const b = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('hello', a);
    await expect(decrypt(blob, b)).rejects.toThrow(/Decryption failed/);
  });
});

describe('encrypt → decrypt', () => {
  it('round-trips ASCII plaintext', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('sk-test-1234567890', key);
    expect(blob.ciphertext.length).toBeGreaterThan(0);
    expect(blob.iv.length).toBeGreaterThan(0);
    expect(blob.authTag.length).toBeGreaterThan(0);
    expect(await decrypt(blob, key)).toBe('sk-test-1234567890');
  });

  it('round-trips UTF-8 plaintext (emoji + non-ASCII)', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('café — 🗝️ — Ω', key);
    expect(await decrypt(blob, key)).toBe('café — 🗝️ — Ω');
  });

  it('round-trips an empty string', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('', key);
    expect(await decrypt(blob, key)).toBe('');
  });

  it('round-trips a long plaintext', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const long = 'A'.repeat(2000);
    const blob = await encrypt(long, key);
    expect(await decrypt(blob, key)).toBe(long);
  });

  it('uses a fresh 12-byte IV on every call', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const a = await encrypt('same plaintext', key);
    const b = await encrypt('same plaintext', key);
    expect(base64ToBytes(a.iv).byteLength).toBe(12);
    expect(base64ToBytes(b.iv).byteLength).toBe(12);
    expect(a.iv).not.toBe(b.iv);
  });

  it('produces a 16-byte auth tag', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('anything', key);
    expect(base64ToBytes(blob.authTag).byteLength).toBe(16);
  });

  it('detects ciphertext tampering', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('secret', key);
    const tamperedCt = bytesToBase64(
      new Uint8Array([...(base64ToBytes(blob.ciphertext).slice()), 0x01]),
    );
    await expect(decrypt({ ...blob, ciphertext: tamperedCt }, key)).rejects.toThrow(/Decryption failed/);
  });

  it('detects auth-tag tampering', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('secret', key);
    const tagBytes = base64ToBytes(blob.authTag);
    const first = tagBytes[0];
    if (first === undefined) throw new Error('expected tag byte');
    tagBytes[0] = first ^ 0xff;
    await expect(
      decrypt({ ...blob, authTag: bytesToBase64(tagBytes) }, key),
    ).rejects.toThrow(/Decryption failed/);
  });

  it('rejects an invalid IV length', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('secret', key);
    await expect(
      decrypt({ ...blob, iv: bytesToBase64(new Uint8Array(8)) }, key),
    ).rejects.toThrow(/Invalid IV length/);
  });

  it('rejects an invalid auth-tag length', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const blob = await encrypt('secret', key);
    await expect(
      decrypt({ ...blob, authTag: bytesToBase64(new Uint8Array(8)) }, key),
    ).rejects.toThrow(/Invalid auth tag length/);
  });
});

describe('salt round-trip', () => {
  it('survives a base64 round-trip', () => {
    const salt = generateSalt();
    const restored = saltFromBase64(saltToBase64(salt));
    expect(restored).toEqual(salt);
  });
});