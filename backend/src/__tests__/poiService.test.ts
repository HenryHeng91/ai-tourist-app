/**
 * POI service orchestration unit tests (Sprint 2, Issue #6).
 *
 * Uses jest.mock for config, poi.client, and spots.service so we can control
 * each dependency independently and test the sync orchestration logic:
 *  - Google Places → upsert
 *  - Google Places fail → Wikidata fallback
 *  - Neither configured → BadRequest
 *  - Individual upsert failures are non-fatal
 */
import type { PoiPlace } from '../spots/poi/poi.client';

// Mutable mock config — prefixed with `mock` so Jest hoists it before the
// jest.mock factory runs. Includes the fields logger.ts reads at import time.
const mockConfig = {
  isTest: true,
  logLevel: 'silent',
  googlePlaces: { enabled: false, apiKey: '', baseUrl: 'https://test' },
  wikidata: { enabled: false, sparqlEndpoint: 'https://test' },
};

jest.mock('../config/env', () => ({ config: mockConfig }));
jest.mock('../spots/poi/poi.client', () => ({
  searchNearbyGooglePlaces: jest.fn(),
  searchNearbyWikidata: jest.fn(),
  TOURIST_TYPES: ['tourist_attraction', 'museum', 'park', 'landmark'],
}));
jest.mock('../spots/spots.service', () => ({
  upsertFromPoi: jest.fn(),
}));

// Import AFTER mocks are in place.
import { syncArea } from '../spots/poi/poi.service';
import * as poiClient from '../spots/poi/poi.client';
import * as spotsService from '../spots/spots.service';

describe('poi.service.syncArea', () => {
  const samplePlaces: PoiPlace[] = [
    { placeId: 'ChIJ1', name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945, types: ['landmark'] },
    { placeId: 'ChIJ2', name: 'Louvre', lat: 48.86, lng: 2.34, types: ['museum'] },
  ];

  beforeEach(() => {
    mockConfig.googlePlaces.enabled = false;
    mockConfig.wikidata.enabled = false;
    (poiClient.searchNearbyGooglePlaces as jest.Mock).mockReset();
    (poiClient.searchNearbyWikidata as jest.Mock).mockReset();
    (spotsService.upsertFromPoi as jest.Mock).mockReset();
  });

  it('throws BadRequest when no POI source configured', async () => {
    await expect(syncArea(48.85, 2.29, 5)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      statusCode: 400,
    });
  });

  it('uses Google Places when enabled and upserts results', async () => {
    mockConfig.googlePlaces.enabled = true;
    (poiClient.searchNearbyGooglePlaces as jest.Mock).mockResolvedValue(samplePlaces);
    (spotsService.upsertFromPoi as jest.Mock).mockResolvedValue('spot-id');

    const result = await syncArea(48.85, 2.29, 5);

    expect(result).toEqual({ synced: 2, found: 2, source: 'google_places' });
    expect(poiClient.searchNearbyGooglePlaces).toHaveBeenCalledWith(48.85, 2.29, 5000);
    expect(spotsService.upsertFromPoi).toHaveBeenCalledTimes(2);
    expect(spotsService.upsertFromPoi).toHaveBeenNthCalledWith(1, samplePlaces[0], 'google_places');
  });

  it('falls back to Wikidata when Google Places returns empty', async () => {
    mockConfig.googlePlaces.enabled = true;
    mockConfig.wikidata.enabled = true;
    (poiClient.searchNearbyGooglePlaces as jest.Mock).mockResolvedValue([]);
    (poiClient.searchNearbyWikidata as jest.Mock).mockResolvedValue(samplePlaces);
    (spotsService.upsertFromPoi as jest.Mock).mockResolvedValue('spot-id');

    const result = await syncArea(48.85, 2.29, 5);

    expect(result.source).toBe('wikidata');
    expect(result.found).toBe(2);
    expect(result.synced).toBe(2);
    expect(poiClient.searchNearbyWikidata).toHaveBeenCalled();
  });

  it('falls back to Wikidata when Google Places throws', async () => {
    mockConfig.googlePlaces.enabled = true;
    mockConfig.wikidata.enabled = true;
    (poiClient.searchNearbyGooglePlaces as jest.Mock).mockRejectedValue(new Error('GP down'));
    (poiClient.searchNearbyWikidata as jest.Mock).mockResolvedValue(samplePlaces);
    (spotsService.upsertFromPoi as jest.Mock).mockResolvedValue('spot-id');

    const result = await syncArea(48.85, 2.29, 5);

    expect(result.source).toBe('wikidata');
    expect(result.synced).toBe(2);
  });

  it('returns synced:0 when both sources return empty', async () => {
    mockConfig.googlePlaces.enabled = true;
    mockConfig.wikidata.enabled = true;
    (poiClient.searchNearbyGooglePlaces as jest.Mock).mockResolvedValue([]);
    (poiClient.searchNearbyWikidata as jest.Mock).mockResolvedValue([]);

    const result = await syncArea(48.85, 2.29, 5);

    // Wikidata fallback was attempted (and returned empty), so source is 'wikidata'.
    expect(result).toEqual({ synced: 0, found: 0, source: 'wikidata' });
    expect(spotsService.upsertFromPoi).not.toHaveBeenCalled();
  });

  it('uses Wikidata directly when Google Places not enabled', async () => {
    mockConfig.wikidata.enabled = true;
    (poiClient.searchNearbyWikidata as jest.Mock).mockResolvedValue(samplePlaces);
    (spotsService.upsertFromPoi as jest.Mock).mockResolvedValue('spot-id');

    const result = await syncArea(48.85, 2.29, 5);

    expect(result.source).toBe('wikidata');
    expect(result.synced).toBe(2);
    expect(poiClient.searchNearbyGooglePlaces).not.toHaveBeenCalled();
  });

  it('counts individual upsert failures as non-fatal', async () => {
    mockConfig.googlePlaces.enabled = true;
    (poiClient.searchNearbyGooglePlaces as jest.Mock).mockResolvedValue(samplePlaces);
    (spotsService.upsertFromPoi as jest.Mock)
      .mockResolvedValueOnce('id-1')
      .mockRejectedValueOnce(new Error('upsert failed'));

    const result = await syncArea(48.85, 2.29, 5);

    expect(result.found).toBe(2);
    expect(result.synced).toBe(1);
  });

  it('passes default radiusKm=5 when not specified', async () => {
    mockConfig.googlePlaces.enabled = true;
    (poiClient.searchNearbyGooglePlaces as jest.Mock).mockResolvedValue([]);

    await syncArea(48.85, 2.29);

    expect(poiClient.searchNearbyGooglePlaces).toHaveBeenCalledWith(48.85, 2.29, 5000);
  });
});