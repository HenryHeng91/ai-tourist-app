/**
 * Group service — placeholder router for Sprint 1.
 * CRUD + invite tokens + threshold config lands in Sprint 2 (Issue #6).
 */
import { Router } from 'express';
import { asyncHandler } from '../shared/asyncHandler';

export const groupRouter = Router();

groupRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.status(200).json({ groups: [], message: 'group service not implemented until Sprint 2' });
  }),
);