/**
 * Client-side AI key validation.
 *
 * With the recommended client-side KEK scheme the server cannot decrypt
 * the user's API key, so we cannot do the `/models` test call from the
 * backend without an additional, risky in-memory decrypt. Instead the
 * client decrypts the key in memory and hits the provider directly with
 * the plaintext Authorization header. The plaintext key is never sent
 * anywhere other than the user's chosen AI provider.
 */

import { getProvider } from './types';
import type { ValidationResult } from './types';

export interface ValidateOptions {
  /** Optional AbortSignal so the UI can cancel a slow request. */
  signal?: AbortSignal;
  /** Override the per-provider validateUrl (used in tests). */
  overrideUrl?: string;
  /** Override the global fetch (used in tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Validate a plaintext API key by issuing a single GET to the provider's
 * `validateUrl`. Returns `{ isValid: true }` on 2xx, otherwise
 * `{ isValid: false, reason }`.
 */
export async function validatePlaintextKey(
  provider: string,
  plaintext: string,
  opts: ValidateOptions = {},
): Promise<ValidationResult> {
  const descriptor = getProvider(provider);
  if (!descriptor) {
    return { isValid: false, reason: `Unknown provider: ${provider}` };
  }
  const url = opts.overrideUrl ?? descriptor.validateUrl;
  const doFetch = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (typeof doFetch !== 'function') {
    return { isValid: false, reason: 'fetch is unavailable in this environment' };
  }
  try {
    const res = await doFetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${plaintext}` },
      signal: opts.signal ?? AbortSignal.timeout(10_000),
    });
    if (res.status === 200) return { isValid: true };
    if (res.status === 401 || res.status === 403) {
      return { isValid: false, reason: 'Provider rejected the key (unauthorized).' };
    }
    return { isValid: false, reason: `Provider returned HTTP ${res.status}.` };
  } catch (err) {
    return {
      isValid: false,
      reason: err instanceof Error ? err.message : 'Validation request failed.',
    };
  }
}