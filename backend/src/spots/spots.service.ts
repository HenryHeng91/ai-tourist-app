/**
 * Tourist spot registry service — PostGIS geo queries (Sprint 2, Issue #6).
 *
 * Three read paths:
 *  - findNearby:  ST_DWithin nearest-spot query, sorted by distance.
 *  - findById:    single spot by UUID.
 *  - findInBbox:  bounding-box query using && + ST_MakeEnvelope.
 *
 * Two write paths:
 *  - createSpot:        manual seed/create.
 *  - upsertFromPoi:     upsert from Google Places or Wikidata (conflict on
 *                        place_id / wikidata_id respectively).
 *
 * The service talks to Postgres via the swappable `query` from db/pool, so
 * unit tests inject an in-memory fake (see __tests__/helpers/fakeDb.ts).
 */
import { query } from '../db/pool';
import { NotFoundError } from '../shared/errors';
import type {
  TouristSpotSummary,
  TouristSpotFull,
  CreateSpotInput,
  Bbox,
} from './spots.schema';
import type { PoiPlace } from './poi/poi.client';

// ── DB row shape ───────────────────────────────────────────────────────

interface SpotRow {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  category: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
  place_id: string | null;
  wikidata_id: string | null;
  rating: number | null;
  categories: string[] | null;
  synced_at: string | null;
  distance_m?: number;
}

// ── Row mappers ────────────────────────────────────────────────────────

function toSummary(row: SpotRow): TouristSpotSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    geofenceRadiusM: row.geofence_radius_m,
    category: row.category,
    source: row.source,
    rating: row.rating,
    ...(row.distance_m !== undefined ? { distanceM: row.distance_m } : {}),
  };
}

function toFull(row: SpotRow): TouristSpotFull {
  return {
    ...toSummary(row),
    metadata: row.metadata,
    placeId: row.place_id,
    wikidataId: row.wikidata_id,
    categories: row.categories,
    syncedAt: row.synced_at,
  };
}

// Shared column list for all SELECT queries. ST_Y/ST_X extract lat/lng from
// the GEOGRAPHY point (stored as lng,lat per PostGIS convention).
const SELECT_COLS = `
  id, name, description,
  ST_Y(geom::geometry) AS lat,
  ST_X(geom::geometry) AS lng,
  geofence_radius_m, category, metadata, source,
  place_id, wikidata_id, rating, categories, synced_at
`;

// ── Read: nearest-spot query ───────────────────────────────────────────

/**
 * Find tourist spots within `radiusKm` of (lat, lng), sorted by distance.
 * Uses PostGIS ST_DWithin + ST_Distance on the GIST index.
 */
export async function findNearby(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number,
): Promise<TouristSpotSummary[]> {
  const radiusM = Math.round(radiusKm * 1000);
  const result = await query<SpotRow>(
    `SELECT ${SELECT_COLS},
            ST_Distance(geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_m
     FROM tourist_spots
     WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
     ORDER BY distance_m
     LIMIT $4`,
    [lat, lng, radiusM, limit],
  );
  return result.rows.map(toSummary);
}

// ── Read: by ID ────────────────────────────────────────────────────────

export async function findById(id: string): Promise<TouristSpotFull> {
  const result = await query<SpotRow>(
    `SELECT ${SELECT_COLS}
     FROM tourist_spots
     WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('Tourist spot not found');
  }
  return toFull(row);
}

// ── Read: bounding-box query ───────────────────────────────────────────

/**
 * Find tourist spots within a bounding box (map area query).
 * Uses the && operator with ST_MakeEnvelope for efficient GIST index usage.
 */
export async function findInBbox(bbox: Bbox, limit: number): Promise<TouristSpotSummary[]> {
  const result = await query<SpotRow>(
    `SELECT ${SELECT_COLS}
     FROM tourist_spots
     WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
     ORDER BY name
     LIMIT $5`,
    [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat, limit],
  );
  return result.rows.map(toSummary);
}

// ── Write: manual create/seed ──────────────────────────────────────────

export async function createSpot(input: CreateSpotInput): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO tourist_spots (name, description, geom, geofence_radius_m, category, metadata, source)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, $7, 'seed')
     RETURNING id`,
    [
      input.name,
      input.description ?? null,
      input.lat,
      input.lng,
      input.geofenceRadiusM ?? 200,
      input.category ?? null,
      input.metadata ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Spot insert returned no row');
  return { id: row.id };
}

// ── Write: upsert from POI ─────────────────────────────────────────────

/**
 * Upsert a tourist spot from a POI source (Google Places or Wikidata).
 * Conflicts on `place_id` (Google) or `wikidata_id` (Wikidata) so re-syncs
 * update rather than duplicate.
 */
export async function upsertFromPoi(place: PoiPlace, source: string): Promise<string> {
  if (source === 'wikidata') {
    return upsertFromWikidata(place);
  }
  return upsertFromGooglePlaces(place);
}

async function upsertFromGooglePlaces(place: PoiPlace): Promise<string> {
  const category = pickPrimaryCategory(place.types);
  const metadata = buildPoiMetadata(place);
  const result = await query<{ id: string }>(
    `INSERT INTO tourist_spots
       (name, geom, category, metadata, source, place_id, rating, categories, synced_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4, $5, 'google_places', $6, $7, $8, now())
     ON CONFLICT (place_id) DO UPDATE SET
       name       = EXCLUDED.name,
       geom       = EXCLUDED.geom,
       category   = EXCLUDED.category,
       metadata   = EXCLUDED.metadata,
       rating     = EXCLUDED.rating,
       categories = EXCLUDED.categories,
       synced_at  = now()
     RETURNING id`,
    [
      place.name,
      place.lat,
      place.lng,
      category,
      metadata,
      place.placeId,
      place.rating ?? null,
      place.types ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('POI upsert returned no row');
  return row.id;
}

async function upsertFromWikidata(place: PoiPlace): Promise<string> {
  const category = pickPrimaryCategory(place.types);
  const metadata = buildPoiMetadata(place);
  const result = await query<{ id: string }>(
    `INSERT INTO tourist_spots
       (name, description, geom, category, metadata, source, wikidata_id, synced_at)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, 'wikidata', $7, now())
     ON CONFLICT (wikidata_id) DO UPDATE SET
       name        = EXCLUDED.name,
       description = EXCLUDED.description,
       geom        = EXCLUDED.geom,
       category    = EXCLUDED.category,
       metadata    = EXCLUDED.metadata,
       synced_at   = now()
     RETURNING id`,
    [
      place.name,
      place.description ?? null,
      place.lat,
      place.lng,
      category,
      metadata,
      place.placeId, // Wikidata Q-ID stored in wikidata_id
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Wikidata upsert returned no row');
  return row.id;
}

function pickPrimaryCategory(types?: string[]): string | null {
  if (!types || types.length === 0) return null;
  // Prefer the most specific tourist type; fall back to the first.
  const priority = ['landmark', 'museum', 'park', 'tourist_attraction'];
  for (const t of priority) {
    if (types.includes(t)) return t;
  }
  return types[0];
}

function buildPoiMetadata(place: PoiPlace): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (place.userRatingCount !== undefined) meta.userRatingCount = place.userRatingCount;
  if (place.formattedAddress !== undefined) meta.formattedAddress = place.formattedAddress;
  if (place.types !== undefined) meta.types = place.types;
  return meta;
}