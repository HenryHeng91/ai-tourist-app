/**
 * Tourist spot request/response Zod schemas (Sprint 2, Issue #6).
 *
 * Query params for GET /spots arrive as strings from Express; Zod coerce
 * transforms them to numbers. The route handler interprets the result:
 *   - lat+lng present  → nearest-spot query (ST_DWithin)
 *   - bbox present     → map-area query (bounding box)
 *   - neither           → 400
 */
import { z } from 'zod';
import { BadRequestError } from '../shared/errors';

// ── Query schemas ──────────────────────────────────────────────────────

export const spotsListQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.1).max(100).optional(),
  bbox: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ── Body schemas ───────────────────────────────────────────────────────

export const createSpotSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geofenceRadiusM: z.number().int().min(10).max(10000).optional(),
  category: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const syncSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(50).optional(),
});

// ── Response types ─────────────────────────────────────────────────────

export interface TouristSpotSummary {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  geofenceRadiusM: number;
  category: string | null;
  source: string;
  rating: number | null;
  distanceM?: number;
}

export interface TouristSpotFull extends TouristSpotSummary {
  metadata: Record<string, unknown> | null;
  placeId: string | null;
  wikidataId: string | null;
  categories: string[] | null;
  syncedAt: string | null;
}

export interface CreateSpotInput {
  name: string;
  description?: string;
  lat: number;
  lng: number;
  geofenceRadiusM?: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncInput {
  lat: number;
  lng: number;
  radiusKm?: number;
}

export interface SyncResult {
  synced: number;
  found: number;
  source: string;
}

// ── Bbox helper ────────────────────────────────────────────────────────

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Parse a bbox query string `minLng,minLat,maxLng,maxLat` into a validated
 * Bbox. Throws BadRequestError on malformed input.
 */
export function parseBbox(raw: string): Bbox {
  const parts = raw.split(',').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new BadRequestError('bbox must be four comma-separated numbers: minLng,minLat,maxLng,maxLat');
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) {
    throw new BadRequestError('bbox coordinates out of range');
  }
  if (minLng > maxLng || minLat > maxLat) {
    throw new BadRequestError('bbox min must be less than max');
  }
  return { minLng, minLat, maxLng, maxLat };
}
