/**
 * Auth HTTP routes. Mounted at /auth by the app factory.
 */
import { Router } from 'express';
import { validate } from '../shared/middleware/validate';
import { asyncHandler } from '../shared/asyncHandler';
import * as authService from './auth.service';
import { signupSchema, loginSchema, refreshSchema } from './auth.schema';

export const authRouter = Router();

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