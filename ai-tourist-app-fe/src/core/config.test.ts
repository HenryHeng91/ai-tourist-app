import { describe, expect, it } from 'vitest';
import { appConfig } from './config';

describe('appConfig', () => {
  it('exposes a frozen config object', () => {
    expect(Object.isFrozen(appConfig)).toBe(true);
  });

  it('always carries an apiUrl string (fallback or env)', () => {
    expect(typeof appConfig.apiUrl).toBe('string');
    expect(appConfig.apiUrl.length).toBeGreaterThan(0);
  });

  it('normalises trailing slashes away', () => {
    expect(appConfig.apiUrl.endsWith('/')).toBe(false);
  });

  it('accepts a missing Google Maps key without throwing', () => {
    // The map module will surface its own error at first use; booting the
    // app should never depend on this key being present.
    expect(typeof appConfig.googleMapsKey).toBe('string');
  });

  it('exposes appVersion as a string', () => {
    expect(typeof appConfig.appVersion).toBe('string');
  });

  it('exposes isProduction as a boolean', () => {
    expect(typeof appConfig.isProduction).toBe('boolean');
  });
});
