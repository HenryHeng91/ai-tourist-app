/**
 * Key vault HTTP routes (Issue #25 — T2.1 Key Vault Backend).
 *
 * Mounted at /keys by the app factory. All routes require auth.
 *
 *   POST   /keys                store / replace an encrypted key blob
 *   GET    /keys                list key metadata (never the blob)
 *   GET    /keys/:id            key metadata for one row
 *   DELETE /keys/:id            delete a key
 *   POST   /keys/:id/validate   single provider test call; updates is_valid
 *
 * SECURITY:
 *  - GET endpoints return only metadata. The ciphertext blob is never returned.
 *  - /keys/:id/validate is the ONLY endpoint that accepts plaintext; the body
 *    holds it for the duration of one fetch and is wiped immediately after.
 *    The validate endpoint is rate-limited per user (10/min).
 */
import { Router } from 'express';
import { validate } from '../shared/middleware/validate';
import { requireAuth } from '../shared/middleware/auth';
import { rateLimit } from '../shared/middleware/rateLimit';
import { asyncHandler } from '../shared/asyncHandler';
import type { AuthedRequest } from '../shared/types';
import * as keyVaultService from './keyVault.service';
import {
  putKeySchema,
  idParamSchema,
  validateKeySchema,
} from './keyVault.schema';

export const keyVaultRouter = Router();

keyVaultRouter.use(requireAuth);

// 10 validations / minute / user — enough for retry, small enough to deter
// abuse of the plaintext-accepting endpoint.
const validateLimiter = rateLimit({ windowMs: 60_000, max: 10, keyBy: 'user' });

// POST /keys — store / replace.
keyVaultRouter.post(
  '/',
  validate({ body: putKeySchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const meta = await keyVaultService.putKey(userId, req.body);
    res.status(200).json(meta);
  }),
);

// GET /keys — list all keys for the user (metadata only).
keyVaultRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const metas = await keyVaultService.listKeyMeta(userId);
    res.status(200).json({ keys: metas });
  }),
);

// GET /keys/:id — one key's metadata.
keyVaultRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const meta = await keyVaultService.getKeyMeta(userId, req.params.id);
    res.status(200).json(meta);
  }),
);

// DELETE /keys/:id — delete a key.
keyVaultRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    await keyVaultService.deleteKey(userId, req.params.id);
    res.status(204).end();
  }),
);

// POST /keys/:id/validate — single provider test call.
// Body: { plaintext: string }. Plaintext is wiped immediately after use.
keyVaultRouter.post(
  '/:id/validate',
  validate({ params: idParamSchema, body: validateKeySchema }),
  validateLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const outcome = await keyVaultService.validateStoredKey(
      userId,
      req.params.id,
      req.body.plaintext,
    );
    res.status(200).json(outcome);
  }),
);