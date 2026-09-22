/**
 * Tourist spot registry — placeholder router for Sprint 1.
 * Full CRUD + PostGIS nearest-spot query lands in Sprint 2 (Issue #5).
 * Exposed now so the modular-monolith wiring is complete and the route is
 * discoverable.
 */
import { Router } from 'express';
import { asyncHandler } from '../shared/asyncHandler';

export const spotsRouter = Router();

spotsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // Sprint 2: implement PostGIS ST_DWithin nearest-spot query.
    res.status(200).json({ spots: [], message: 'spot registry not implemented until Sprint 2' });
  }),
);