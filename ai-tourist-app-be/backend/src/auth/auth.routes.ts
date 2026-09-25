/**
 * Auth HTTP routes. Mounted at /auth by the app factory.
 */
import { Router } from 'express';
import { validate } from '../shared/middleware/validate';
import { asyncHandler } from '../shared/asyncHandler';
import { requireAuth } from '../shared/middleware/auth';
import type { AuthedRequest } from '../shared/types';
import * as authService from './auth.service';
import { signupSchema, loginSchema, refreshSchema } from './auth.schema';

export const authRouter = Router();

authRouter.post(
  '/signup',
  validate({ body: signupSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  }),
);

// Alias for spec naming — some clients prefer /register. Identical handler.
authRouter.post(
  '/register',
  validate({ body: signupSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  }),
);

authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken);
    res.status(200).json(result);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    // refreshToken is optional — the client may send it in the body or simply
    // clear its local copies. Logout is idempotent.
    const refreshToken =
      typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
    await authService.logout(refreshToken);
    res.status(204).end();
  }),
);

// /auth/me — returns the authenticated user's identity. Used by the FE on
// boot to restore session (calls /auth/refresh first if access token expired).
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const me = await authService.getMe(req.user!.userId);
    res.status(200).json(me);
  }),
);
