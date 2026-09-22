/**
 * Tourist spot registry HTTP routes (Sprint 2, Issue #6).
 * Mounted at /spots by the app factory.
 *
 *   GET    /spots?lat=&lng=&radiusKm=&limit=   nearest-spot query (ST_DWithin)
 *   GET    /spots?bbox=minLng,minLat,maxLng,maxLat&limit=  map-area query
 *   GET    /spots/:id                          single spot (full detail)
 *   POST   /spots                              create/seed (auth required)
 *   POST   /spots/sync                         POI refresh (auth required)
 *
 * GET endpoints are public (tourist spots are non-sensitive public data).
 * POST endpoints require authentication. Admin-role enforcement is future work.
 */
import { Router } from 'express';
import { validate } from '../shared/middleware/validate';
import { requireAuth } from '../shared/middleware/auth';
import { asyncHandler } from '../shared/asyncHandler';
import { BadRequestError } from '../shared/errors';
import type { AuthedRequest } from '../shared/types';
import * as spotsService from './spots.service';
import * as poiService from './poi/poi.service';
import {
  spotsListQuerySchema,
  idParamSchema,
  createSpotSchema,
  syncSchema,
  parseBbox,
} from './spots.schema';

export const spotsRouter = Router();

const DEFAULT_RADIUS_KM = 5;
const DEFAULT_LIMIT = 50;

// ── GET /spots — nearest or bbox query ─────────────────────────────────

spotsRouter.get(
  '/',
  validate({ query: spotsListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm, bbox, limit } = req.query as {
      lat?: number;
      lng?: number;
      radiusKm?: number;
      bbox?: string;
      limit?: number;
    };
    const lim = limit ?? DEFAULT_LIMIT;

    if (bbox) {
      // Bounding-box query (map area).
      const parsed = parseBbox(bbox);
      const spots = await spotsService.findInBbox(parsed, lim);
      res.status(200).json({ spots });
      return;
    }

    if (lat !== undefined && lng !== undefined) {
      // Nearest-spot query.
      const spots = await spotsService.findNearby(lat, lng, radiusKm ?? DEFAULT_RADIUS_KM, lim);
      res.status(200).json({ spots });
      return;
    }

    // Neither bbox nor lat+lng — reject.
    if ((lat !== undefined) !== (lng !== undefined)) {
      throw new BadRequestError('Both lat and lng are required for a nearest-spot query');
    }
    throw new BadRequestError('Provide lat+lng for a nearest-spot query or bbox for a map-area query');
  }),
);

// ── GET /spots/:id — single spot ──────────────────────────────────────

spotsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const spot = await spotsService.findById(req.params.id);
    res.status(200).json(spot);
  }),
);

// ── POST /spots/sync — POI refresh (auth required) ────────────────────
// Registered before POST /spots so Express matches the literal path first.

spotsRouter.post(
  '/sync',
  requireAuth,
  validate({ body: syncSchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { lat, lng, radiusKm } = req.body;
    const result = await poiService.syncArea(lat, lng, radiusKm);
    res.status(200).json(result);
  }),
);

// ── POST /spots — create/seed (auth required) ─────────────────────────

spotsRouter.post(
  '/',
  requireAuth,
  validate({ body: createSpotSchema }),
  asyncHandler(async (req: AuthedRequest, res) => {
    // TODO: enforce admin role once role system exists (design §5.1).
    const result = await spotsService.createSpot(req.body);
    res.status(201).json(result);
  }),
);
