/**
 * POI client — Google Places API (Nearby Search, v1) + Wikidata SPARQL fallback.
 *
 * Google Places v1 endpoint:
 *   POST https://places.googleapis.com/v1/places:searchNearby
 *   Headers: X-Goog-Api-Key, X-Goog-FieldMask
 *   Body:    { locationRestriction, includedTypes, languageCode }
 *
 * Wikidata fallback:
 *   GET  https://query.wikidata.org/sparql?query=<SPARQL>
 *   Accept: application/sparql-results+json
 *
 * The client uses the global `fetch` (Node ≥20). Tests inject a fake via
 * `fetchImpl`.
 */
import { config } from '../../config/env';


// ── Public types ───────────────────────────────────────────────────────

export interface PoiPlace {
  placeId: string;          // Google place_id or Wikidata Q-ID
  name: string;
  description?: string;     // Wikidata item description (Google Places doesn't provide one)
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  formattedAddress?: string;
}

export type FetchImpl = typeof fetch;

// Tourist categories to filter by (per Issue #6 task spec).
export const TOURIST_TYPES = [
  'tourist_attraction',
  'museum',
  'park',
  'landmark',
] as const;

// ── Google Places v1 ───────────────────────────────────────────────────

// Field mask: only request the fields we use (cost + payload control).
const GP_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.types',
  'places.userRatingCount',
  'places.formattedAddress',
].join(',');

interface GpResponse {
  places?: GpPlace[];
}
interface GpPlace {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  types?: string[];
  userRatingCount?: number;
  formattedAddress?: string;
}

/**
 * Search for tourist spots near (lat, lng) using Google Places Nearby Search v1.
 * Returns parsed PoiPlace[] — empty if no results. Throws on API errors.
 */
export async function searchNearbyGooglePlaces(
  lat: number,
  lng: number,
  radiusM: number,
  opts: { apiKey?: string; baseUrl?: string; fetchImpl?: FetchImpl } = {},
): Promise<PoiPlace[]> {
  const apiKey = opts.apiKey ?? config.googlePlaces.apiKey;
  if (!apiKey) {
    throw new Error('Google Places API key not configured');
  }
  const baseUrl = (opts.baseUrl ?? config.googlePlaces.baseUrl).replace(/\/$/, '');
  const doFetch = opts.fetchImpl ?? fetch;

  // Google Places v1 caps radius at 50050m. Clamp to stay within bounds.
  const radius = Math.min(Math.max(Math.round(radiusM), 1), 50050);

  const url = `${baseUrl}/v1/places:searchNearby`;
  const body = JSON.stringify({
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius,
      },
    },
    includedTypes: [...TOURIST_TYPES],
    languageCode: 'en',
  });

  const res = await doFetch(url, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': GP_FIELD_MASK,
      'Content-Type': 'application/json',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Places API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as GpResponse;
  if (!data.places || data.places.length === 0) return [];

  return data.places
    .filter((p): p is GpPlace & { id: string; displayName: { text: string }; location: { latitude: number; longitude: number } } =>
      !!p.id && !!p.displayName?.text && !!p.location?.latitude && !!p.location?.longitude,
    )
    .map((p) => ({
      placeId: p.id,
      name: p.displayName.text,
      lat: p.location.latitude,
      lng: p.location.longitude,
      ...(p.rating !== undefined ? { rating: p.rating } : {}),
      ...(p.userRatingCount !== undefined ? { userRatingCount: p.userRatingCount } : {}),
      ...(p.types ? { types: p.types } : {}),
      ...(p.formattedAddress ? { formattedAddress: p.formattedAddress } : {}),
    }));
}

// ── Wikidata SPARQL fallback ───────────────────────────────────────────

// Wikidata Q-IDs for tourist categories.
const WD_TOURIST_QIDS = [
  'Q570116',  // tourist attraction
  'Q33515',   // museum
  'Q22978',   // park
];

interface SparqlResults {
  results: {
    bindings: SparqlBinding[];
  };
}
interface SparqlBinding {
  item?: { value: string };         // full URI: http://www.wikidata.org/entity/Q123
  itemLabel?: { value: string };
  itemDescription?: { value: string };
  coord?: { value: string };        // "Point(lng lat)" WKT literal
}

/**
 * Search for tourist spots near (lat, lng) using the Wikidata Query Service.
 * Returns parsed PoiPlace[] — empty if no results. Throws on SPARQL errors.
 */
export async function searchNearbyWikidata(
  lat: number,
  lng: number,
  radiusKm: number,
  opts: { sparqlEndpoint?: string; fetchImpl?: FetchImpl } = {},
): Promise<PoiPlace[]> {
  const endpoint = opts.sparqlEndpoint ?? config.wikidata.sparqlEndpoint;
  const doFetch = opts.fetchImpl ?? fetch;

  const typesFilter = WD_TOURIST_QIDS.map((q) => `wd:${q}`).join(' ');
  const sparql = `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  VALUES ?type { ${typesFilter} }
  ?item wdt:P31 ?type .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam bd:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam bd:radius "${radiusKm}" .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 50`;

  const url = `${endpoint}?query=${encodeURIComponent(sparql)}`;
  const res = await doFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'ai-travel-guide-backend/0.1 (POI fallback)',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Wikidata SPARQL error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as SparqlResults;
  const bindings = data.results?.bindings ?? [];
  if (bindings.length === 0) return [];

  return bindings
    .map((b) => parseWikidataBinding(b))
    .filter((p): p is PoiPlace => p !== null);
}

function parseWikidataBinding(b: SparqlBinding): PoiPlace | null {
  if (!b.item?.value || !b.itemLabel?.value || !b.coord?.value) return null;

  // Extract Q-ID from full URI: http://www.wikidata.org/entity/Q123 → Q123
  const qid = b.item.value.split('/').pop() ?? '';
  if (!qid.startsWith('Q')) return null;

  // Parse WKT Point: "Point(lng lat)" → { lng, lat }
  const match = b.coord.value.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return null;
  const coordLng = Number(match[1]);
  const coordLat = Number(match[2]);
  if (Number.isNaN(coordLng) || Number.isNaN(coordLat)) return null;

  return {
    placeId: qid,
    name: b.itemLabel.value,
    ...(b.itemDescription?.value ? { description: b.itemDescription.value } : {}),
    lat: coordLat,
    lng: coordLng,
  };
}
