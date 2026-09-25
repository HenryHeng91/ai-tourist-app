/**
 * Key vault HTTP routes. Mounted at /me/keys by the app factory.
 * All routes require auth.
 *
 *   POST   /me/keys            store / replace a key blob
 *   GET    /me/keys            list key metadata (never the blob)
 *   GET    /me/keys/:provider  key metadata for one provider
 *   DELETE /me/keys/:provider  delete a key
 *
 * The POST endpoint NEVER returns the stored blob. The GET endpoints return
 * only { provider, hasKey, isValid, validatedAt }.
 */
import { Router } from 'express';
import { validate } from '../shared/middleware/validate';
import { requireAuth } from '../shared/middleware/auth';
import { asyncHandler } from '../shared/asyncHandler';
import type { AuthedRequest } from '../shared/types';
import * as keyVaultService from './keyVault.service';
import { putKeySchema, providerParamSchema } from './keyVault.schema';

export const keyVaultRouter = Router();

keyVaultRouter.use(requireAuth);

// POST /me/keys — store / replace.
keyVaultRouter.post(
  '/',
  validate({ body: putKeySchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const meta = await keyVaultService.putKey(userId, req.body);
    res.status(200).json(meta);
  }),
);

// GET /me/keys — list all keys for the user (metadata only).
keyVaultRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const metas = await keyVaultService.listKeyMeta(userId);
    res.status(200).json({ keys: metas });
  }),
);

// GET /me/keys/:provider — one key's metadata.
keyVaultRouter.get(
  '/:provider',
  validate({ params: providerParamSchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const meta = await keyVaultService.getKeyMeta(userId, req.params.provider);
    res.status(200).json(meta);
  }),
);

// DELETE /me/keys/:provider — delete a key.
keyVaultRouter.delete(
  '/:provider',
  validate({ params: providerParamSchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    await keyVaultService.deleteKey(userId, req.params.provider);
    res.status(204).end();
  }),
);