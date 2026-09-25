/**
 * HTTP client for the key vault backend endpoints.
 *
 * Backend contract (see `backend/src/keyvault/keyVault.routes.ts`):
 *   POST   /me/keys              store / replace encrypted blob
 *   GET    /me/keys              list metadata { keys: StoredKeyMeta[] }
 *   GET    /me/keys/:provider    one metadata record
 *   DELETE /me/keys/:provider    delete the blob
 *
 * SECURITY: this module NEVER accepts or returns a plaintext key.
 * The `EncryptedBlob` is the only thing that crosses the network for
 * ciphertext payloads.
 */

import { httpClient } from '../core/http';
import type { EncryptedBlob, StoredKeyMeta } from './types';

export interface PutKeyRequest {
  provider: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  /** Client-side validation assertion. Defaults to true when omitted. */
  isValid?: boolean;
}

/** POST /me/keys — store or replace the encrypted blob for one provider. */
export async function putKey(input: PutKeyRequest & EncryptedBlob): Promise<StoredKeyMeta> {
  const body = {
    provider: input.provider,
    ciphertext: input.ciphertext,
    iv: input.iv,
    authTag: input.authTag,
    ...(typeof input.isValid === 'boolean' ? { isValid: input.isValid } : {}),
  };
  const { data } = await httpClient.post<StoredKeyMeta>('/me/keys', body);
  return data;
}

/** GET /me/keys — list all stored key metadata for the authenticated user. */
export async function listKeys(): Promise<StoredKeyMeta[]> {
  const { data } = await httpClient.get<{ keys: StoredKeyMeta[] }>('/me/keys');
  return data.keys;
}

/** GET /me/keys/:provider — metadata for a single provider. */
export async function getKey(provider: string): Promise<StoredKeyMeta> {
  const { data } = await httpClient.get<StoredKeyMeta>(`/me/keys/${encodeURIComponent(provider)}`);
  return data;
}

/** DELETE /me/keys/:provider — drop the stored blob for a provider. */
export async function deleteKey(provider: string): Promise<void> {
  await httpClient.delete(`/me/keys/${encodeURIComponent(provider)}`);
}