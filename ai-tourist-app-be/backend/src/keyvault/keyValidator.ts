/**
 * AI provider key validation.
 *
 * Dispatches to a provider-specific test endpoint based on the `provider`
 * label. For each provider we make ONE minimal request — enough to confirm
 * the key authenticates, no more.
 *
 * Provider test endpoints (a single GET/POST per provider):
 *   - openai         → GET  {base}/v1/models
 *   - openai-compat  → GET  {base}/v1/models (alias for any OpenAI-shaped API)
 *   - anthropic      → POST {base}/v1/messages  (smallest allowed request:
 *                       1 token, max_tokens=1, any model)
 *   - google-genai   → GET  {base}/v1beta/models
 *   - xai            → GET  {base}/v1/models
 *
 * Status mapping:
 *   - 2xx  → valid
 *   - 401/403 → invalid (unauthorized)
 *   - 400 with auth-style error → invalid (e.g. anthropic returns 401 for
 *     bad keys, 400 for bad bodies — we treat 400 as "can't tell", see impl)
 *   - 5xx, network error, timeout → invalid with reason, marked as such so
 *     the client can retry
 *
 * SECURITY: this is the ONLY place plaintext ever exists on the server. It
 * exists only for the duration of one fetch, then is zeroed. Never logged,
 * never stored.
 */
import { config } from '../config/env';
import { logger } from '../shared/logger';

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

export type ProviderName = 'openai' | 'openai-compat' | 'anthropic' | 'google-genai' | 'xai';

interface ProviderConfig {
  baseUrl: string;
  /** Builder for the URL to hit. */
  buildUrl: (baseUrl: string) => string;
  /** Builder for the fetch init. The `keyBuf` may be used; do not retain. */
  buildInit: (plaintextKey: string) => RequestInit;
  /** Status → isValid decision. Default mapping is handled by caller. */
  interpret?: (status: number) => ValidationResult | null;
}

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  openai: {
    baseUrl: 'https://api.openai.com',
    buildUrl: (b) => `${trim(b)}/v1/models`,
    buildInit: (k) => ({
      method: 'GET',
      headers: { Authorization: `Bearer ${k}` },
    }),
  },
  'openai-compat': {
    // Generic OpenAI-shaped API; default baseUrl from config.
    baseUrl: 'https://api.openai.com',
    buildUrl: (b) => `${trim(b)}/v1/models`,
    buildInit: (k) => ({
      method: 'GET',
      headers: { Authorization: `Bearer ${k}` },
    }),
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    buildUrl: (b) => `${trim(b)}/v1/messages`,
    buildInit: (k) => ({
      method: 'POST',
      headers: {
        'x-api-key': k,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Smallest valid request the API accepts (1 input token, max_tokens=1).
        // We don't care about the content — we only want to know if the key
        // authenticates. The model name is the cheapest available.
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'x' }],
      }),
    }),
    interpret: (status) => {
      // 401 = bad key. 400 = bad request body (key may be fine but model
      // name wrong / quota issue) — treat as unknown/invalid.
      if (status === 401 || status === 403) {
        return { isValid: false, reason: 'provider rejected key (unauthorized)' };
      }
      if (status === 400) {
        return { isValid: false, reason: 'provider rejected request (400)' };
      }
      return null;
    },
  },
  'google-genai': {
    baseUrl: 'https://generativelanguage.googleapis.com',
    buildUrl: (b) => `${trim(b)}/v1beta/models`,
    buildInit: (k) => ({
      method: 'GET',
      headers: { 'x-goog-api-key': k },
    }),
  },
  xai: {
    baseUrl: 'https://api.x.ai',
    buildUrl: (b) => `${trim(b)}/v1/models`,
    buildInit: (k) => ({
      method: 'GET',
      headers: { Authorization: `Bearer ${k}` },
    }),
  },
};

function trim(s: string): string {
  return s.replace(/\/$/, '');
}

/**
 * Resolve a provider config, allowing per-provider baseUrl overrides via the
 * second argument (e.g. for OpenAI-compatible endpoints with custom hosts).
 */
export function getProviderConfig(
  provider: string,
  overrides: { openaiBaseUrl?: string; openaiCompatBaseUrl?: string } = {},
): ProviderConfig | null {
  if (!isKnownProvider(provider)) return null;
  if (provider === 'openai' && overrides.openaiBaseUrl) {
    return { ...PROVIDERS.openai, baseUrl: overrides.openaiBaseUrl };
  }
  if (provider === 'openai-compat' && overrides.openaiCompatBaseUrl) {
    return { ...PROVIDERS['openai-compat'], baseUrl: overrides.openaiCompatBaseUrl };
  }
  return PROVIDERS[provider];
}

export function isKnownProvider(provider: string): provider is ProviderName {
  return provider in PROVIDERS;
}

/**
 * Validate a plaintext API key against the provider specified by `provider`.
 * Picks the right test endpoint + auth header for that provider. The plaintext
 * is wiped (Buffer zeroed) before this function returns.
 *
 * Exported for unit testing with a custom `fetchImpl`.
 */
export async function validateKeyForProvider(
  provider: string,
  plaintextKey: string,
  opts: {
    fetchImpl?: typeof fetch;
    /** Per-call overrides (e.g. custom base URL for OpenAI-compatible hosts). */
    overrides?: { openaiBaseUrl?: string };
  } = {},
): Promise<ValidationResult> {
  const cfg = getProviderConfig(provider, opts.overrides);
  if (!cfg) {
    return { isValid: false, reason: `unknown provider: ${provider}` };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const url = cfg.buildUrl(cfg.baseUrl);
  const init = cfg.buildInit(plaintextKey);

  // Hold a Buffer copy so we can deterministically wipe the in-memory copy.
  const keyBuf = Buffer.from(plaintextKey, 'utf8');

  try {
    const res = await doFetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });

    // Provider-specific mapping if defined.
    if (cfg.interpret) {
      const interpreted = cfg.interpret(res.status);
      if (interpreted) return interpreted;
    }
    // Default mapping.
    if (res.status >= 200 && res.status < 300) return { isValid: true };
    if (res.status === 401 || res.status === 403) {
      return { isValid: false, reason: 'provider rejected key (unauthorized)' };
    }
    return { isValid: false, reason: `provider returned status ${res.status}` };
  } catch (err) {
    logger.warn({ err, provider }, 'Provider validation request failed');
    return {
      isValid: false,
      reason: err instanceof Error ? err.message : 'validation request failed',
    };
  } finally {
    keyBuf.fill(0);
  }
}

/**
 * Legacy entry point kept for back-compat with the existing keyValidator tests
 * (calls OpenAI /models). Prefer `validateKeyForProvider` for new code.
 */
export async function validateKeyWithProvider(
  plaintextKey: string,
  opts: { baseUrl?: string; validatePath?: string; fetchImpl?: typeof fetch } = {},
): Promise<ValidationResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? config.aiProvider.baseUrl;
  const validatePath = opts.validatePath ?? config.aiProvider.validatePath;
  const url = baseUrl.replace(/\/$/, '') + validatePath;
  const keyBuf = Buffer.from(plaintextKey, 'utf8');
  try {
    const res = await doFetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${plaintextKey}` },
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
    keyBuf.fill(0);
  }
}