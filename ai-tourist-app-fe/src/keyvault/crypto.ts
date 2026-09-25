/**
 * Client-side AES-256-GCM encryption using the Web Crypto API.
 *
 * Why Web Crypto API and not crypto-js:
 *  - Native (zero dependency footprint) and audited by every browser vendor.
 *  - crypto-js is officially deprecated per npm advisories and does not
 *    provide a GCM implementation that runs in pure JS (it uses CBC).
 *  - The SubtleCrypto API requires secure contexts (https / localhost),
 *    which matches our deployment (Vercel TLS, local dev on localhost).
 *
 * Key derivation: PBKDF2 (SHA-256, 100k iterations) over a user-supplied
 * passphrase and a per-user salt. The derived key is a non-extractable
 * AES-GCM CryptoKey. The salt is stored alongside the encrypted blob.
 *
 * Invariants:
 *  - The plaintext API key NEVER leaves this module except via the explicit
 *    return value of `decrypt`. Callers are responsible for not persisting
 *    the plaintext string.
 *  - IV is freshly randomised per encryption call — never reused.
 *  - The auth tag is appended to the ciphertext by GCM and extracted on
 *    decryption (SubtleCrypto keeps them split internally).
 */

import type { EncryptedBlob } from './types';

const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_BITS = 256;
const GCM_IV_BYTES = 12;
const SALT_BYTES = 16;

/** SubtleCrypto is unavailable in non-secure contexts (http://...). */
function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Web Crypto API (crypto.subtle) is not available. ' +
        'Key vault requires a secure context (https or localhost).',
    );
  }
  return subtle;
}

/** Base64 → Uint8Array. Works in browser and jsdom (jsdom ships TextEncoder). */
export function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '');
  // atob is global in browsers and in jsdom ≥ 22.
  const binary = globalThis.atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Uint8Array → base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return globalThis.btoa(binary);
}

/** UTF-8 encode a string. */
function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** UTF-8 decode a byte buffer. */
function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Generate a random salt. Exported so the caller can persist the salt
 * alongside the encrypted blob in localStorage (we store it next to each
 * key blob so the same passphrase always derives the same KEK).
 */
export function generateSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/** Persist a salt as base64. */
export function saltToBase64(salt: Uint8Array): string {
  return bytesToBase64(salt);
}

/** Rehydrate a salt from base64. */
export function saltFromBase64(b64: string): Uint8Array {
  const bytes = base64ToBytes(b64);
  if (bytes.byteLength !== SALT_BYTES) {
    throw new Error(
      `Invalid salt length: expected ${SALT_BYTES} bytes, got ${bytes.byteLength}`,
    );
  }
  return bytes;
}

/**
 * Derive an AES-GCM key from a passphrase + salt using PBKDF2-SHA-256.
 *
 * The returned CryptoKey is non-extractable — the raw bytes cannot be
 * exported, which means even an XSS payload that grabs the reference
 * cannot exfiltrate the KEK directly.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error('Passphrase must not be empty');
  }
  const subtle = getSubtleCrypto();
  const baseKey = await subtle.importKey(
    'raw',
    utf8Encode(passphrase),
    { name: 'PBKDF2' },
    /* extractable */ false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext API key with the given AES-GCM key.
 *
 * A fresh 12-byte IV is generated for every call. The output bundle
 * (ciphertext, iv, authTag) is base64-encoded and matches the
 * `EncryptedBlob` wire format expected by `POST /keys`.
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedBlob> {
  if (typeof plaintext !== 'string') {
    throw new Error('encrypt() requires a string plaintext');
  }
  const subtle = getSubtleCrypto();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const ciphertextBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    utf8Encode(plaintext),
  );
  const ciphertext = new Uint8Array(ciphertextBuf);
  // SubtleCrypto appends the 16-byte auth tag to the ciphertext buffer.
  // Split it out so the server can persist it in its own column.
  const splitAt = ciphertext.byteLength - 16;
  const ctBody = ciphertext.subarray(0, splitAt);
  const authTag = ciphertext.subarray(splitAt);
  if (authTag.byteLength !== 16) {
    throw new Error('Internal error: GCM auth tag has unexpected length');
  }
  return {
    ciphertext: bytesToBase64(ctBody),
    iv: bytesToBase64(iv),
    authTag: bytesToBase64(authTag),
  };
}

/**
 * Decrypt a blob produced by `encrypt()`. Returns the plaintext string.
 *
 * Throws if the auth tag verification fails (wrong key, tampered ciphertext).
 */
export async function decrypt(
  blob: EncryptedBlob,
  key: CryptoKey,
): Promise<string> {
  const subtle = getSubtleCrypto();
  const iv = base64ToBytes(blob.iv);
  const authTag = base64ToBytes(blob.authTag);
  const ctBody = base64ToBytes(blob.ciphertext);
  if (iv.byteLength !== GCM_IV_BYTES) {
    throw new Error(`Invalid IV length: expected ${GCM_IV_BYTES}`);
  }
  if (authTag.byteLength !== 16) {
    throw new Error('Invalid auth tag length: expected 16');
  }
  // Re-join ciphertext + tag because SubtleCrypto expects them concatenated.
  const joined = new Uint8Array(ctBody.byteLength + authTag.byteLength);
  joined.set(ctBody, 0);
  joined.set(authTag, ctBody.byteLength);
  try {
    const plaintextBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      joined,
    );
    return utf8Decode(new Uint8Array(plaintextBuf));
  } catch {
    // Do not leak the DOMException details to logs — wrap as a stable,
    // redacted error.
    throw new Error('Decryption failed: wrong key or tampered blob');
  }
}