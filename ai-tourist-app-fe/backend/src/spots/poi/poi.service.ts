/**
 * POI sync service — orchestrates Google Places + Wikidata fallback and
 * upserts results into the tourist_spots table.
 *
 * Flow:
 *  1. If Google Places is configured, search nearby.
 *  2. If GP returns nothing (or fails) and Wikidata fallback is enabled,
 *     try Wikidata.
 *  3. Upsert each result via spots.service.upsertFromPoi.
 *
 * Individual upsert failures are logged and skipped — one bad place doesn't
 * fail the whole sync.
 */
import { config } from '../../config/env';
import { logger } from '../../shared/logger';
import { BadRequestError } from '../../shared/errors';
import * as poiClient from './poi.client';
import * as spotsService from '../spots.service';
import type { SyncResult } from '../spots.schema';

/**
 * Sync tourist spots for a geographic area from the configured POI source(s).
 * @param lat    centre latitude
 * @param lng    centre longitude
 * @param radiusKm  search radius (default 5km, max 50km)
 */
export async function syncArea(
  lat: number,
  lng: number,
  radiusKm = 5,
): Promise<SyncResult> {
  if (!config.googlePlaces.enabled && !config.wikidata.enabled) {
    throw new BadRequestError(
      'No POI source configured. Set GOOGLE_PLACES_API_KEY or enable WIKIDATA_FALLBACK_ENABLED.',
    );
  }

  let places: poiClient.PoiPlace[] = [];
  let source = 'google_places';

  // 1. Try Google Places.
  if (config.googlePlaces.enabled) {
    try {
      places = await poiClient.searchNearbyGooglePlaces(lat, lng, radiusKm * 1000);
    } catch (err) {
      logger.warn({ err }, 'Google Places search failed, trying fallback');
    }
  }

  // 2. Fallback to Wikidata if GP empty/unavailable.
  if (places.length === 0 && config.wikidata.enabled) {
    try {
      places = await poiClient.searchNearbyWikidata(lat, lng, radiusKm);
      source = 'wikidata';
    } catch (err) {
      logger.warn({ err }, 'Wikidata fallback search failed');
    }
  }

  if (places.length === 0) {
    return { synced: 0, found: 0, source };
  }

  // 3. Upsert each place. Individual failures are logged, not fatal.
  let synced = 0;
  for (const place of places) {
    try {
      await spotsService.upsertFromPoi(place, source);
      synced++;
    } catch (err) {
      logger.warn({ err, placeId: place.placeId }, 'Failed to upsert POI spot');
    }
  }

  return { synced, found: places.length, source };
}