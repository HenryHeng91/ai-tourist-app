/**
 * Public types for the BYOK key vault module.
 *
 * SECURITY: this file MUST NOT contain any plaintext-key type. The wire format
 * between client and server is exclusively ciphertext + iv + authTag. The
 * plaintext key lives in-memory only, for as long as needed to call the AI
 * provider, then is zeroed.
 */

export type AiProviderId = 'openai' | 'anthropic' | 'google' | 'xai';

/**
 * The canonical list of supported providers. Order is intentional — it is the
 * order shown in the "Add API Key" dropdown.
 */
export const SUPPORTED_PROVIDERS: ReadonlyArray<AiProviderId> = [
  'openai',
  'anthropic',
  'google',
  'xai',
];

export interface ProviderDescriptor {
  id: AiProviderId;
  label: string;
  /**
   * Direct-to-provider URL used for client-side validation (calls a public,
   * key-authenticated endpoint that succeeds/fails based on key validity).
   * Never proxied via our backend — the plaintext key never leaves the
   * browser during validation.
   */
  validateUrl: string;
  /**
   * Placeholder shown in the masked API-key input so users know the expected
   * format (e.g. OpenAI keys start with `sk-`).
   */
  placeholder: string;
}

export const PROVIDERS: ReadonlyArray<ProviderDescriptor> = [
  {
    id: 'openai',
    label: 'OpenAI',
    validateUrl: 'https://api.openai.com/v1/models',
    placeholder: 'sk-...',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    validateUrl: 'https://api.anthropic.com/v1/models',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'google',
    label: 'Google AI',
    validateUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    placeholder: 'AIza...',
  },
  {
    id: 'xai',
    label: 'xAI',
    validateUrl: 'https://api.x.ai/v1/models',
    placeholder: 'xai-...',
  },
];

export function getProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isSupportedProvider(value: string): value is AiProviderId {
  return SUPPORTED_PROVIDERS.includes(value as AiProviderId);
}

/** Plaintext API key. Held in-memory only — never persisted, never logged. */
export type PlaintextKey = string;

/**
 * AES-256-GCM ciphertext bundle. All byte fields are base64-encoded so they
 * survive JSON transport and the Postgres `bytea` round-trip.
 */
export interface EncryptedBlob {
  /** AES-256-GCM ciphertext (the encrypted API key). */
  ciphertext: string;
  /** 12-byte GCM nonce/IV, base64-encoded. */
  iv: string;
  /** 16-byte GCM authentication tag, base64-encoded. */
  authTag: string;
}

/**
 * Server-returned metadata for a stored key. The server NEVER returns the
 * ciphertext blob; this shape mirrors `StoredKeyMeta` in the backend.
 *
 * `id` is the UUID used to address the row on the backend (`/keys/:id`). The
 * provider name is still exposed for display / grouping, but it is NOT used
 * to address the row.
 */
export interface StoredKeyMeta {
  /** UUID used to address this row on the backend (GET/DELETE `/keys/:id`). */
  id: string;
  provider: string;
  hasKey: boolean;
  isValid: boolean;
  validatedAt: string | null;
}

/**
 * Decryption result for a blob held in the local key holder. The decrypted
 * plaintext is exposed via a callback so the caller can use it and then
 * drop the reference. The holder keeps no plaintext outside the call scope.
 */
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}