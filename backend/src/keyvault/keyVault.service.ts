/**
 * Key vault service — store / fetch metadata / delete encrypted API key blobs.
 *
 * SECURITY INVARIANTS (enforced here + by the schema):
 *  - The server stores `ciphertext`, `iv`, `auth_tag` as BYTEA. It NEVER
 *    decrypts and NEVER returns the blob in any endpoint that could expose it
 *    to a non-owner. GET returns only metadata (provider, hasKey, isValid).
 *  - Plaintext key is never logged, never persisted, never returned.
 *  - One key per (user, provider) — enforced by a UNIQUE constraint and an
 *    explicit upsert here.
 *
 * Validation: by default we trust the client's `isValid` assertion (pure BYOK,
 * recommended). When the deployment uses a server-side KEK (env KEY_VAULT_KEK
 * set to a real value in prod), the service can optionally decrypt in-memory
 * for a one-shot validation call. That path is not enabled by default and is
 * out of scope for Sprint 1; the hook is here for completeness.
 */
import { query } from '../db/pool';
import { BadRequestError, NotFoundError } from '../shared/errors';
import type { PutKeyInput, StoredKeyMeta } from './keyVault.schema';

interface ApiKeyRow {
  provider: string;
  is_valid: boolean;
  validated_at: string | null;
}

function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

export async function putKey(
  userId: string,
  input: PutKeyInput,
): Promise<StoredKeyMeta> {
  const ciphertext = base64ToBuffer(input.ciphertext);
  const iv = base64ToBuffer(input.iv);
  const authTag = base64ToBuffer(input.authTag);

  // Sanity: GCM IV is 12 bytes, auth tag is 16 bytes. Ciphertext length is
  // unbounded (it's the encrypted key). Reject obviously malformed blobs so
  // bad data doesn't sit in the DB.
  if (iv.length !== 12) {
    throw new BadRequestError('iv must be 12 bytes (base64-decoded)');
  }
  if (authTag.length !== 16) {
    throw new BadRequestError('authTag must be 16 bytes (base64-decoded)');
  }
  if (ciphertext.length === 0) {
    throw new BadRequestError('ciphertext must not be empty');
  }

  const isValid = input.isValid ?? true;
  const validatedAt = isValid ? new Date().toISOString() : null;

  // Upsert: one key per (user, provider).
  const result = await query<ApiKeyRow>(
    `INSERT INTO api_keys (user_id, provider, ciphertext, iv, auth_tag, is_valid, validated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE
       SET ciphertext   = EXCLUDED.ciphertext,
           iv            = EXCLUDED.iv,
           auth_tag      = EXCLUDED.auth_tag,
           is_valid      = EXCLUDED.is_valid,
           validated_at  = EXCLUDED.validated_at
     RETURNING provider, is_valid, validated_at`,
    [userId, input.provider, ciphertext, iv, authTag, isValid, validatedAt],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Key upsert returned no row');
  return {
    provider: row.provider,
    hasKey: true,
    isValid: row.is_valid,
    validatedAt: row.validated_at,
  };
}

/** Returns metadata only — never the ciphertext blob. */
export async function getKeyMeta(userId: string, provider: string): Promise<StoredKeyMeta> {
  const result = await query<ApiKeyRow>(
    'SELECT provider, is_valid, validated_at FROM api_keys WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  );
  if (result.rows.length === 0) {
    return { provider, hasKey: false, isValid: false, validatedAt: null };
  }
  const row = result.rows[0];
  return {
    provider: row.provider,
    hasKey: true,
    isValid: row.is_valid,
    validatedAt: row.validated_at,
  };
}

/** Returns metadata for every key the user has stored. */
export async function listKeyMeta(userId: string): Promise<StoredKeyMeta[]> {
  const result = await query<ApiKeyRow>(
    'SELECT provider, is_valid, validated_at FROM api_keys WHERE user_id = $1 ORDER BY provider',
    [userId],
  );
  return result.rows.map((row) => ({
    provider: row.provider,
    hasKey: true,
    isValid: row.is_valid,
    validatedAt: row.validated_at,
  }));
}

export async function deleteKey(userId: string, provider: string): Promise<void> {
  const result = await query(
    'DELETE FROM api_keys WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError('No key for that provider');
  }
}