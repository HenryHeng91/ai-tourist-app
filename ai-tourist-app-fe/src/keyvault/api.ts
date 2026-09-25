/**
 * HTTP client for the key vault backend endpoints.
 *
 * Backend contract (see `backend/src/keyvault/keyVault.routes.ts`):
 *   POST   /keys                store / replace encrypted blob
 *   GET    /keys                list metadata { keys: StoredKeyMeta[] }
 *   GET    /keys/:id            one metadata record (addressed by UUID id)
 *   DELETE /keys/:id            delete the blob
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

/** POST /keys — store or replace the encrypted blob for one provider. */
export async function putKey(input: PutKeyRequest & EncryptedBlob): Promise<StoredKeyMeta> {
  const body = {
    provider: input.provider,
    ciphertext: input.ciphertext,
    iv: input.iv,
    authTag: input.authTag,
    ...(typeof input.isValid === 'boolean' ? { isValid: input.isValid } : {}),
  };
  const { data } = await httpClient.post<StoredKeyMeta>('/keys', body);
  return data;
}

/** GET /keys — list all stored key metadata for the authenticated user. */
export async function listKeys(): Promise<StoredKeyMeta[]> {
  const { data } = await httpClient.get<{ keys: StoredKeyMeta[] }>('/keys');
  return data.keys;
}

/** GET /keys/:id — metadata for a single row, addressed by UUID id. */
export async function getKey(id: string): Promise<StoredKeyMeta> {
  const { data } = await httpClient.get<StoredKeyMeta>(`/keys/${encodeURIComponent(id)}`);
  return data;
}

/** DELETE /keys/:id — drop the stored blob for a row, addressed by UUID id. */
export async function deleteKey(id: string): Promise<void> {
  await httpClient.delete(`/keys/${encodeURIComponent(id)}`);
}