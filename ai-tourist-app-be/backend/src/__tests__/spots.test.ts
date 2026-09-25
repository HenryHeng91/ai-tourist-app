/**
 * Tourist spot registry — service + route unit tests (Sprint 2, Issue #6).
 *
 * DB layer is mocked via createFakeDb (no real Postgres/PostGIS needed).
 * Service tests call service functions directly; route tests use supertest
 * against the full app.
 *
 * Covers:
 *  - findNearby (ST_DWithin) — returns spots sorted by distance, empty when none
 *  - findById — full spot, 404 when not found
 *  - findInBbox (ST_MakeEnvelope) — spots within bounding box
 *  - createSpot — returns id
 *  - upsertFromPoi — Google Places + Wikidata paths
 *  - GET /spots?lat&lng, ?bbox, validation errors
 *  - GET /spots/:id — 200, 404, 400 (invalid uuid)
 *  - POST /spots — auth required, 201, 400
 *  - POST /spots/sync — auth required, 400 when no POI configured
 */
import request from 'supertest';
import { createApp } from '../app';
import { createFakeDb, type FakeDb } from './helpers/fakeDb';
import * as spotsService from '../spots/spots.service';
import * as authService from '../auth/auth.service';
import type { PoiPlace } from '../spots/poi/poi.client';

let fake: FakeDb;
let app: ReturnType<typeof createApp>;

// Sample DB row (snake_case, as pg returns it).
const spotRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Eiffel Tower',
  description: 'Iron lattice tower in Paris',
  lat: 48.8584,
  lng: 2.2945,
  geofence_radius_m: 200,
  category: 'landmark',
  metadata: { openingHours: '9am-11pm' },
  source: 'seed',
  place_id: null,
  wikidata_id: null,
  rating: 4.7,
  categories: ['landmark', 'tourist_attraction'],
  synced_at: null,
};

const NOT_FOUND_ID = '00000000-0000-0000-0000-000000000000';

beforeEach(() => {
  fake = createFakeDb();
  app = createApp();

  // ── auth handlers (so POST routes work via supertest) ──
  const users = new Map<string, { id: string; email: string; password_hash: string; display_name: string | null }>();
  fake.when('FROM users WHERE email = $1', (values) => {
    const u = users.get(values[0] as string);
    return { rows: u ? [u] : [] };
  });
  fake.when('INSERT INTO users', (values) => {
    const [email, passwordHash, displayName] = values as [string, string, string | null];
    const u = { id: `user-${email}`, email, password_hash: passwordHash, display_name: displayName };
    users.set(email, u);
    return { rows: [u] };
  });
  fake.when('FROM users WHERE id = $1', (values) => {
    const u = [...users.values()].find((x) => x.id === values[0]);
    return { rows: u ? [u] : [] };
  });
  // refresh_tokens INSERT — needed because authService.signup now persists the
  // refresh jti inside a transaction. Storing it isn't observable from the
  // spots tests; we just need to absorb the call.
  fake.when('INSERT INTO refresh_tokens', () => ({ rows: [], rowCount: 1 }));

  // ── spot query handlers (order matters: specific substrings first) ──
  fake.when('ST_DWithin', () => ({ rows: [{ ...spotRow, distance_m: 500 }] }));
  fake.when('ST_MakeEnvelope', () => ({ rows: [spotRow] }));
  fake.when('WHERE id = $1', (values) => {
    if (values[0] === NOT_FOUND_ID) return { rows: [] };
    return { rows: [spotRow] };
  });
  fake.when('ON CONFLICT (place_id)', () => ({ rows: [{ id: 'upserted-gp-id' }] }));
  fake.when('ON CONFLICT (wikidata_id)', () => ({ rows: [{ id: 'upserted-wd-id' }] }));
  fake.when('INSERT INTO tourist_spots', () => ({ rows: [{ id: 'new-seed-id' }] }));
});

async function signupAndToken(email: string): Promise<string> {
  const r = await authService.signup({ email, password: 'password123' });
  return r.accessToken;
}

// ────────────────────────────────────────────────────────────────────────
// Service unit tests
// ────────────────────────────────────────────────────────────────────────

describe('spotsService (unit)', () => {
  describe('findNearby', () => {
    it('returns spots sorted by distance with distanceM field', async () => {
      const spots = await spotsService.findNearby(48.85, 2.29, 5, 50);
      expect(spots).toHaveLength(1);
      expect(spots[0].id).toBe(spotRow.id);
      expect(spots[0].name).toBe('Eiffel Tower');
      expect(spots[0].lat).toBe(48.8584);
      expect(spots[0].lng).toBe(2.2945);
      expect(spots[0].geofenceRadiusM).toBe(200);
      expect(spots[0].distanceM).toBe(500);
    });

    it('returns empty array when no spots in range', async () => {
      fake.reset();
      fake.when('ST_DWithin', () => ({ rows: [] }));
      const spots = await spotsService.findNearby(0, 0, 1, 50);
      expect(spots).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns a full spot with all fields', async () => {
      const spot = await spotsService.findById(spotRow.id);
      expect(spot.id).toBe(spotRow.id);
      expect(spot.name).toBe('Eiffel Tower');
      expect(spot.metadata).toEqual({ openingHours: '9am-11pm' });
      expect(spot.placeId).toBeNull();
      expect(spot.wikidataId).toBeNull();
      expect(spot.categories).toEqual(['landmark', 'tourist_attraction']);
      expect(spot.syncedAt).toBeNull();
      expect(spot.distanceM).toBeUndefined();
    });

    it('throws NotFound when spot does not exist', async () => {
      await expect(spotsService.findById(NOT_FOUND_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('findInBbox', () => {
    it('returns spots within the bounding box', async () => {
      const spots = await spotsService.findInBbox(
        { minLng: 2.2, minLat: 48.8, maxLng: 2.4, maxLat: 48.9 },
        50,
      );
      expect(spots).toHaveLength(1);
      expect(spots[0].name).toBe('Eiffel Tower');
      expect(spots[0].distanceM).toBeUndefined();
    });

    it('returns empty when no spots in box', async () => {
      fake.reset();
      fake.when('ST_MakeEnvelope', () => ({ rows: [] }));
      const spots = await spotsService.findInBbox(
        { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 },
        50,
      );
      expect(spots).toEqual([]);
    });
  });

  describe('createSpot', () => {
    it('inserts a seed spot and returns the id', async () => {
      const result = await spotsService.createSpot({
        name: 'Big Ben',
        description: 'Clock tower',
        lat: 51.5007,
        lng: -0.1246,
        category: 'landmark',
      });
      expect(result.id).toBe('new-seed-id');
    });
  });

  describe('upsertFromPoi', () => {
    const gpPlace: PoiPlace = {
      placeId: 'ChIJ123',
      name: 'Colosseum',
      lat: 41.8902,
      lng: 12.4922,
      rating: 4.7,
      userRatingCount: 1000,
      types: ['tourist_attraction', 'landmark'],
      formattedAddress: 'Rome, Italy',
    };

    it('upserts a Google Places spot (conflict on place_id)', async () => {
      const id = await spotsService.upsertFromPoi(gpPlace, 'google_places');
      expect(id).toBe('upserted-gp-id');
    });

    it('upserts a Wikidata spot (conflict on wikidata_id)', async () => {
      const wdPlace: PoiPlace = {
        placeId: 'Q12345',
        name: 'Stonehenge',
        description: 'Prehistoric monument',
        lat: 51.1789,
        lng: -1.8262,
        types: ['tourist_attraction'],
      };
      const id = await spotsService.upsertFromPoi(wdPlace, 'wikidata');
      expect(id).toBe('upserted-wd-id');
    });
  });
});

// ────────────────────────────────────────────────────────────────────────
// Route tests (supertest)
// ────────────────────────────────────────────────────────────────────────

describe('GET /spots (supertest)', () => {
  it('?lat&lng&radiusKm → 200 with spots array', async () => {
    const res = await request(app)
      .get('/spots')
      .query({ lat: 48.85, lng: 2.29, radiusKm: 5 })
      .expect(200);
    expect(res.body.spots).toHaveLength(1);
    expect(res.body.spots[0].name).toBe('Eiffel Tower');
    expect(res.body.spots[0].distanceM).toBe(500);
  });

  it('?lat&lng (default radius) → 200', async () => {
    await request(app).get('/spots').query({ lat: 48.85, lng: 2.29 }).expect(200);
  });

  it('?bbox=minLng,minLat,maxLng,maxLat → 200 with spots array', async () => {
    const res = await request(app)
      .get('/spots')
      .query({ bbox: '2.2,48.8,2.4,48.9' })
      .expect(200);
    expect(res.body.spots).toHaveLength(1);
    expect(res.body.spots[0].name).toBe('Eiffel Tower');
  });

  it('no params → 400', async () => {
    const res = await request(app).get('/spots').expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('?lat without lng → 400', async () => {
    await request(app).get('/spots').query({ lat: 48.85 }).expect(400);
  });

  it('?bbox with invalid format → 400', async () => {
    await request(app).get('/spots').query({ bbox: 'not,a,valid,bbox,x' }).expect(400);
  });

  it('?lat out of range → 400', async () => {
    await request(app).get('/spots').query({ lat: 999, lng: 0 }).expect(400);
  });

  it('?limit > 200 → 400', async () => {
    await request(app)
      .get('/spots')
      .query({ lat: 48.85, lng: 2.29, limit: 201 })
      .expect(400);
  });
});

describe('GET /spots/:id (supertest)', () => {
  it('→ 200 with full spot', async () => {
    const res = await request(app).get(`/spots/${spotRow.id}`).expect(200);
    expect(res.body.id).toBe(spotRow.id);
    expect(res.body.name).toBe('Eiffel Tower');
    expect(res.body.metadata).toEqual({ openingHours: '9am-11pm' });
    expect(res.body.categories).toEqual(['landmark', 'tourist_attraction']);
  });

  it('→ 404 when not found', async () => {
    await request(app).get(`/spots/${NOT_FOUND_ID}`).expect(404);
  });

  it('→ 400 on invalid UUID', async () => {
    await request(app).get('/spots/not-a-uuid').expect(400);
  });
});

describe('POST /spots (supertest)', () => {
  it('→ 401 without auth', async () => {
    await request(app)
      .post('/spots')
      .send({ name: 'Test Spot', lat: 48.85, lng: 2.29 })
      .expect(401);
  });

  it('→ 201 with id when authenticated', async () => {
    const token = await signupAndToken('spots-create@example.com');
    const res = await request(app)
      .post('/spots')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Big Ben', lat: 51.5007, lng: -0.1246, category: 'landmark' })
      .expect(201);
    expect(res.body.id).toBeDefined();
  });

  it('→ 400 on missing name', async () => {
    const token = await signupAndToken('spots-bad@example.com');
    await request(app)
      .post('/spots')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 51.5, lng: -0.12 })
      .expect(400);
  });

  it('→ 400 on invalid lat', async () => {
    const token = await signupAndToken('spots-badlat@example.com');
    await request(app)
      .post('/spots')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', lat: 999, lng: 0 })
      .expect(400);
  });
});

describe('POST /spots/sync (supertest)', () => {
  it('→ 401 without auth', async () => {
    await request(app)
      .post('/spots/sync')
      .send({ lat: 48.85, lng: 2.29 })
      .expect(401);
  });

  it('→ 400 when no POI source configured', async () => {
    const token = await signupAndToken('spots-sync@example.com');
    const res = await request(app)
      .post('/spots/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 48.85, lng: 2.29 })
      .expect(400);
    expect(res.body.error.message).toContain('No POI source configured');
  });
});