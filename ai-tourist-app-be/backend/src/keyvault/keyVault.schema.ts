/**
 * Key vault request/response Zod schemas.
 *
 * SECURITY INVARIANT — enforced here + by the service:
 *  - The server stores `ciphertext`, `iv`, `authTag` as BYTEA. It NEVER
 *    decrypts for storage or for ordinary retrieval. GET endpoints return
 *    metadata only (provider, hasKey, isValid, validatedAt).
 *  - The single exception is the `/keys/:id/validate` endpoint, which receives
 *    the plaintext key in the request body and uses it for ONE provider test
 *    call. The plaintext is held in a Buffer for the duration of that fetch
 *    only, then zeroed. It is NEVER persisted.
 *  - With a client-side KEK (recommended) the server cannot decrypt and the
 *    validate endpoint is unnecessary for routine flows — the client validates
 *    directly. The endpoint is still available for users without a client KEK
 *    or for recovery flows.
 */
import { z } from 'zod';

// base64 string (arbitrary length). We accept standard base64 with optional
// padding; the actual byte length is enforced by the GCM constants in the
// service.
const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64');

export const putKeySchema = z.object({
  provider: z.string().min(1).max(64),
  ciphertext: base64,
  iv: base64,
  authTag: base64,
  // Optional: client may assert it has validated the key itself (BYOK pure mode).
  isValid: z.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const validateKeySchema = z.object({
  // Plaintext key supplied ONLY for the duration of one provider test call.
  // Never logged, never persisted, wiped immediately after use.
  plaintext: z.string().min(1).max(2048),
});

export type PutKeyInput = z.infer<typeof putKeySchema>;
export type ValidateKeyInput = z.infer<typeof validateKeySchema>;

export interface StoredKeyMeta {
  id: string;
  provider: string;
  hasKey: boolean;
  isValid: boolean;
  validatedAt: string | null;
  createdAt: string;
}

export interface StoredKeyBlob {
  id: string;
  userId: string;
  provider: string;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  isValid: boolean;
  validatedAt: string | null;
}

export interface ValidationOutcome {
  isValid: boolean;
  reason?: string;
  validatedAt: string;
  provider: string;
}