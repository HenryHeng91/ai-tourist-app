/**
 * Key vault request/response Zod schemas.
 *
 * The server stores the encrypted blob as-is (ciphertext + iv + authTag,
 * all base64). It NEVER decrypts. Validation is a single best-effort call to
 * the provider's /models endpoint using the decrypted key in-memory only for
 * the duration of that call — see design §8.1 / §5.1 note.
 *
 * With the recommended client-side KEK scheme the server cannot decrypt at all
 * (it lacks the KEK), so validation is performed client-side and the server
 * stores the blob as pre-validated. The `isValid` flag is then taken from the
 * request or defaulted to true.
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

export const providerParamSchema = z.object({
  provider: z.string().min(1).max(64),
});

export type PutKeyInput = z.infer<typeof putKeySchema>;

export interface StoredKeyMeta {
  provider: string;
  hasKey: boolean;
  isValid: boolean;
  validatedAt: string | null;
}