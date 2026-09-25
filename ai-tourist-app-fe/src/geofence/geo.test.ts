import { describe, expect, it } from 'vitest';
import { haversineMeters, isWithinRadius } from './geo';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });

  it('matches a known distance (London to Paris ≈ 343 km)', () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    const metres = haversineMeters(london, paris);
    expect(metres).toBeGreaterThan(340_000);
    expect(metres).toBeLessThan(350_000);
  });

  it('is symmetric', () => {
    const a = { lat: 35.6762, lng: 139.6503 };
    const b = { lat: 40.7128, lng: -74.006 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe('isWithinRadius', () => {
  const tokyoTower = { lat: 35.6586, lng: 139.7454 };

  it('returns true for a point inside the radius', () => {
    const nearby = { lat: 35.6590, lng: 139.7460 };
    expect(isWithinRadius(tokyoTower, nearby, 100)).toBe(true);
  });

  it('returns false for a point outside the radius', () => {
    const osaka = { lat: 34.6937, lng: 135.5023 };
    expect(isWithinRadius(tokyoTower, osaka, 100)).toBe(false);
  });

  it('returns false for invalid radii', () => {
    expect(isWithinRadius(tokyoTower, tokyoTower, -1)).toBe(false);
    expect(isWithinRadius(tokyoTower, tokyoTower, Number.NaN)).toBe(false);
  });
});
