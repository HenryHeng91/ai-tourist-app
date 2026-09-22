/**
 * AI provider key validation.
 *
 * Makes a single GET request to the provider's /models endpoint using the
 * decrypted key (held in-memory for the call only). On 200 → valid. On 401/403
 * → invalid key. On network error / 5xx → unknown; we conservatively mark
 * `isValid=false` and surface the reason so the client can retry.
 *
 * IMPORTANT: this is the ONLY place the plaintext key exists on the server, and
 * only for the duration of one fetch call. The key is never logged, never
 * stored, never returned. The buffer is zeroed after the call.
 *
 * With the recommended client-side KEK scheme (design §8.1) the server has no
 * way to decrypt and this function is not called — the client validates and
 * tells the server the result. The function is kept for the optional
 * server-side-KEK deployment.
 */
import { config } from '../config/env';
import { logger } from '../shared/logger';

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validate a plaintext API key against the configured provider.
 * Exported for unit testing with a custom fetch.
 */
export async function validateKeyWithProvider(
  plaintextKey: string,
  opts: { baseUrl?: string; validatePath?: string; fetchImpl?: typeof fetch } = {},
): Promise<ValidationResult> {
  const baseUrl = opts.baseUrl ?? config.aiProvider.baseUrl;
  const validatePath = opts.validatePath ?? config.aiProvider.validatePath;
  const doFetch = opts.fetchImpl ?? fetch;

  const url = baseUrl.replace(/\/$/, '') + validatePath;
  // Hold the key material in a Buffer so we can deterministically wipe it after
  // the call. The fetch header still references the immutable input string, but
  // zeroing this buffer removes the copy we materialised here.
  const keyBuf = Buffer.from(plaintextKey, 'utf8');
  try {
    const res = await doFetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${plaintextKey}` },
      // Short timeout so a hung provider doesn't block the save.
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) return { isValid: true };
    if (res.status === 401 || res.status === 403) {
      return { isValid: false, reason: 'provider rejected key (unauthorized)' };
    }
    return { isValid: false, reason: `provider returned status ${res.status}` };
  } catch (err) {
    logger.warn({ err }, 'Provider validation request failed');
    return {
      isValid: false,
      reason: err instanceof Error ? err.message : 'validation request failed',
    };
  } finally {
    // Defence-in-depth: zero the buffer copy of the key. JS strings are immutable
    // so the original parameter cannot be wiped, but we ensure no Buffer copy we
    // created survives this call. The real guarantee is that we never persist the
    // key; this removes one in-memory copy as soon as the fetch completes.
    keyBuf.fill(0);
  }
}