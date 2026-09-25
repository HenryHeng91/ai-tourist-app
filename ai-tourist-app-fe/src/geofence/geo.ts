/**
 * Haversine great-circle distance in metres.
 * Used by the geofence module (and tested independently — pure function,
 * no browser APIs — so it ships under Issue 1.1's testing baseline).
 */
const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  lat: number;
  lng: number;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

/**
 * Returns true when `point` is within `radiusMeters` of `center`.
 * Compares haversine distance; suitable for radii up to a few km
 * (for large distances, project to a metric plane first).
 */
export function isWithinRadius(
  center: LatLng,
  point: LatLng,
  radiusMeters: number,
): boolean {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) return false;
  return haversineMeters(center, point) <= radiusMeters;
}
