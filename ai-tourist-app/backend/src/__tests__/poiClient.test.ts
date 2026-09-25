/**
 * POI client unit tests — Google Places v1 + Wikidata SPARQL (Sprint 2, Issue #6).
 *
 * Uses a mock fetch (no real network calls). Same pattern as keyValidator.test.ts.
 */
import {
  searchNearbyGooglePlaces,
  searchNearbyWikidata,
  TOURIST_TYPES,
  type PoiPlace,
  type FetchImpl,
} from '../spots/poi/poi.client';

// ── Helpers ────────────────────────────────────────────────────────────

function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}): Response {
  const status = opts.status ?? 200;
  return {
    ok: opts.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => opts.json ?? {},
    text: async () => opts.text ?? '',
  } as unknown as Response;
}

// ── Google Places v1 ───────────────────────────────────────────────────

describe('searchNearbyGooglePlaces', () => {
  const GP_RESPONSE = {
    places: [
      {
        id: 'ChIJ1',
        displayName: { text: 'Eiffel Tower' },
        location: { latitude: 48.8584, longitude: 2.2945 },
        rating: 4.7,
        types: ['tourist_attraction', 'landmark'],
        userRatingCount: 1000,
        formattedAddress: 'Paris, France',
      },
      {
        id: 'ChIJ2',
        displayName: { text: 'Louvre Museum' },
        location: { latitude: 48.8606, longitude: 2.3376 },
        rating: 4.8,
        types: ['museum', 'tourist_attraction'],
        userRatingCount: 2000,
        formattedAddress: 'Paris, France',
      },
    ],
  };

  it('parses Google Places v1 response into PoiPlace[]', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse({ json: GP_RESPONSE }));
    const places = await searchNearbyGooglePlaces(48.85, 2.29, 5000, {
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(places).toHaveLength(2);
    expect(places[0]).toEqual<PoiPlace>({
      placeId: 'ChIJ1',
      name: 'Eiffel Tower',
      lat: 48.8584,
      lng: 2.2945,
      rating: 4.7,
      userRatingCount: 1000,
      types: ['tourist_attraction', 'landmark'],
      formattedAddress: 'Paris, France',
    });
    expect(places[1].name).toBe('Louvre Museum');
  });

  it('sends correct request shape (POST, API key header, field mask, tourist types)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse({ json: { places: [] } }));
    await searchNearbyGooglePlaces(48.85, 2.29, 5000, {
      apiKey: 'my-key',
      baseUrl: 'https://places.googleapis.com',
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('my-key');
    expect(headers['X-Goog-FieldMask']).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body.includedTypes).toEqual([...TOURIST_TYPES]);
    expect(body.locationRestriction.circle.center.latitude).toBe(48.85);
    expect(body.languageCode).toBe('en');
  });

  it('returns empty array when API returns no places', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse({ json: { places: [] } }));
    const places = await searchNearbyGooglePlaces(0, 0, 1000, {
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(places).toEqual([]);
  });

  it('throws on non-200 response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      makeResponse({ status: 403, text: 'API key invalid' }),
    );
    await expect(
      searchNearbyGooglePlaces(0, 0, 1000, {
        apiKey: 'bad-key',
        fetchImpl: fetchImpl as unknown as FetchImpl,
      }),
    ).rejects.toThrow('Google Places API error 403');
  });

  it('throws when no API key configured', async () => {
    const fetchImpl = jest.fn();
    await expect(
      searchNearbyGooglePlaces(0, 0, 1000, {
        apiKey: '',
        fetchImpl: fetchImpl as unknown as FetchImpl,
      }),
    ).rejects.toThrow('API key not configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('filters out places missing required fields', async () => {
    const partialResponse = {
      places: [
        { id: 'ChIJ1', displayName: { text: 'Good' }, location: { latitude: 1, longitude: 2 } },
        { id: null, displayName: { text: 'No ID' }, location: { latitude: 1, longitude: 2 } },
        { id: 'ChIJ3', displayName: { text: 'No location' } },
      ],
    };
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse({ json: partialResponse }));
    const places = await searchNearbyGooglePlaces(0, 0, 1000, {
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(places).toHaveLength(1);
    expect(places[0].placeId).toBe('ChIJ1');
  });

  it('clamps radius to Google Places max of 50050m', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse({ json: { places: [] } }));
    await searchNearbyGooglePlaces(0, 0, 100000, {
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.locationRestriction.circle.radius).toBe(50050);
  });
});

// ── Wikidata SPARQL ────────────────────────────────────────────────────

describe('searchNearbyWikidata', () => {
  const SPARQL_RESPONSE = {
    results: {
      bindings: [
        {
          item: { value: 'http://www.wikidata.org/entity/Q243' },
          itemLabel: { value: 'Eiffel Tower' },
          itemDescription: { value: 'iron lattice tower in Paris' },
          coord: { value: 'Point(2.2945 48.8584)' },
        },
        {
          item: { value: 'http://www.wikidata.org/entity/Q19675' },
          itemLabel: { value: 'Louvre Museum' },
          itemDescription: { value: 'art museum in Paris' },
          coord: { value: 'Point(2.3376 48.8606)' },
        },
      ],
    },
  };

  it('parses Wikidata SPARQL response into PoiPlace[]', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse({ json: SPARQL_RESPONSE }));
    const places = await searchNearbyWikidata(48.85, 2.29, 5, {
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(places).toHaveLength(2);
    expect(places[0]).toEqual<PoiPlace>({
      placeId: 'Q243',
      name: 'Eiffel Tower',
      description: 'iron lattice tower in Paris',
      lat: 48.8584,
      lng: 2.2945,
    });
    expect(places[1].placeId).toBe('Q19675');
  });

  it('sends GET with SPARQL Accept header and encoded query', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      makeResponse({ json: { results: { bindings: [] } } }),
    );
    await searchNearbyWikidata(48.85, 2.29, 5, {
      sparqlEndpoint: 'https://query.wikidata.org/sparql',
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://query.wikidata.org/sparql?query=');
    expect(url).toContain('Point('); // SPARQL query is URL-encoded in the query string
    expect(init.method).toBe('GET');
    const headers = init.headers as Record<string, string>;
    expect(headers['Accept']).toBe('application/sparql-results+json');
  });

  it('returns empty when no bindings', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      makeResponse({ json: { results: { bindings: [] } } }),
    );
    const places = await searchNearbyWikidata(0, 0, 5, {
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(places).toEqual([]);
  });

  it('throws on SPARQL error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      makeResponse({ status: 500, text: 'SPARQL timeout' }),
    );
    await expect(
      searchNearbyWikidata(0, 0, 5, { fetchImpl: fetchImpl as unknown as FetchImpl }),
    ).rejects.toThrow('Wikidata SPARQL error 500');
  });

  it('filters out bindings with missing fields', async () => {
    const partialResponse = {
      results: {
        bindings: [
          {
            item: { value: 'http://www.wikidata.org/entity/Q243' },
            itemLabel: { value: 'Good' },
            coord: { value: 'Point(2.2945 48.8584)' },
          },
          { item: { value: 'http://www.wikidata.org/entity/Q1' }, itemLabel: { value: 'No coord' } },
          { itemLabel: { value: 'No item' }, coord: { value: 'Point(0 0)' } },
        ],
      },
    };
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse({ json: partialResponse }));
    const places = await searchNearbyWikidata(0, 0, 5, {
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(places).toHaveLength(1);
    expect(places[0].placeId).toBe('Q243');
  });
});