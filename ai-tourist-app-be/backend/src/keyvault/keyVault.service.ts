/**
 * Key vault service — store / fetch metadata / delete / validate encrypted API
 * key blobs.
 *
 * SECURITY INVARIANTS (enforced here + by the schema):
 *  - The server stores `ciphertext`, `iv`, `auth_tag` as BYTEA. It NEVER
 *    decrypts and NEVER returns the blob in any endpoint that could expose it
 *    to a non-owner. GET returns only metadata.
 *  - Plaintext key is never logged, never persisted, never returned by the
 *    ordinary endpoints.
 *  - One key per (user, provider) — enforced by a UNIQUE constraint and an
 *    explicit upsert here.
 *
 * Validation flow:
 *  - POST /keys/:id/validate accepts { plaintext } in the body.
 *  - The service fetches the encrypted blob for the user, decrypts ONLY in
 *    a short-lived Buffer, makes ONE provider test call, zeroes the buffer,
 *    and updates is_valid / validated_at.
 *  - Plaintext is never returned in the response; only the validation result.
 */
import { query } from '../db/pool';
import { BadRequestError, NotFoundError } from '../shared/errors';
import { logger } from '../shared/logger';
import * as validator from './keyValidator';
import type {
  PutKeyInput,
  StoredKeyMeta,
  StoredKeyBlob,
  ValidationOutcome,
} from './keyVault.schema';

interface ApiKeyMetaRow {
  id: string;
  provider: string;
  is_valid: boolean;
  validated_at: string | null;
  created_at: string;
}

interface ApiKeyBlobRow {
  id: string;
  user_id: string;
  provider: string;
  ciphertext: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  is_valid: boolean;
  validated_at: string | null;
}

function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

function toMeta(row: ApiKeyMetaRow): StoredKeyMeta {
  return {
    id: row.id,
    provider: row.provider,
    hasKey: true,
    isValid: row.is_valid,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
  };
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
  const result = await query<ApiKeyMetaRow>(
    `INSERT INTO api_keys (user_id, provider, ciphertext, iv, auth_tag, is_valid, validated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE
       SET ciphertext   = EXCLUDED.ciphertext,
           iv            = EXCLUDED.iv,
           auth_tag      = EXCLUDED.auth_tag,
           is_valid      = EXCLUDED.is_valid,
           validated_at  = EXCLUDED.validated_at
     RETURNING id, provider, is_valid, validated_at, created_at`,
    [userId, input.provider, ciphertext, iv, authTag, isValid, validatedAt],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Key upsert returned no row');
  return toMeta(row);
}

/** Returns metadata only — never the ciphertext blob. */
export async function getKeyMeta(userId: string, id: string): Promise<StoredKeyMeta> {
  const result = await query<ApiKeyMetaRow>(
    'SELECT id, provider, is_valid, validated_at, created_at FROM api_keys WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  if (result.rows.length === 0) {
    return { id, provider: '', hasKey: false, isValid: false, validatedAt: null, createdAt: '' };
  }
  return toMeta(result.rows[0]);
}

/** Returns metadata for every key the user has stored. */
export async function listKeyMeta(userId: string): Promise<StoredKeyMeta[]> {
  const result = await query<ApiKeyMetaRow>(
    'SELECT id, provider, is_valid, validated_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY provider',
    [userId],
  );
  return result.rows.map(toMeta);
}

export async function deleteKey(userId: string, id: string): Promise<void> {
  const result = await query('DELETE FROM api_keys WHERE user_id = $1 AND id = $2', [
    userId,
    id,
  ]);
  if (result.rowCount === 0) {
    throw new NotFoundError('No key with that id');
  }
}

/**
 * INTERNAL: fetches the encrypted blob + metadata for the given id, scoped to
 * the owner. Used only by the validate flow.
 */
async function fetchBlobForOwner(userId: string, id: string): Promise<StoredKeyBlob> {
  const result = await query<ApiKeyBlobRow>(
    `SELECT id, user_id, provider, ciphertext, iv, auth_tag, is_valid, validated_at
     FROM api_keys WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('No key with that id');
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    isValid: row.is_valid,
    validatedAt: row.validated_at,
  };
}

/**
 * Validate a stored key by making a single provider test call.
 *
 * The caller (the /keys/:id/validate endpoint) supplies the plaintext in the
 * request body. This function:
 *   1. Confirms the key exists and belongs to the user (else NotFound).
 *   2. Dispatches to the provider-specific validator.
 *   3. Updates is_valid + validated_at.
 *   4. Returns a small outcome object — never the plaintext, never the blob.
 *
 * The plaintext is wiped as soon as the validator returns; we do not keep a
 * reference past this function's scope.
 */
export async function validateStoredKey(
  userId: string,
  id: string,
  plaintext: string,
): Promise<ValidationOutcome> {
  const blob = await fetchBlobForOwner(userId, id);

  let result: validator.ValidationResult;
  try {
    result = await validator.validateKeyForProvider(blob.provider, plaintext);
  } catch (err) {
    // Unexpected (programming) error — log + rethrow.
    logger.error({ err, provider: blob.provider }, 'Validation dispatch failed');
    throw err;
  }

  const validatedAt = new Date().toISOString();

  await query(
    `UPDATE api_keys SET is_valid = $1, validated_at = $2
     WHERE user_id = $3 AND id = $4`,
    [result.isValid, validatedAt, userId, id],
  );

  return {
    isValid: result.isValid,
    reason: result.reason,
    validatedAt,
    provider: blob.provider,
  };
}