/**
 * CORS configuration tests.
 *
 * Uses `buildCorsMiddlewareFor(origins)` directly so each test gets an
 * isolated middleware instance — no global config dependency.
 *
 * Verifies:
 *  - Permissive mode (empty list, non-prod): any Origin gets ACAO.
 *  - Strict mode: allowed origin echoes back in ACAO; disallowed origin gets
 *    no ACAO header.
 *  - Same-origin (no Origin header) always passes through.
 *  - Wildcard subdomain matching.
 *  - Preflight OPTIONS returns the configured methods.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { buildCorsMiddlewareFor, parseOrigins, isOriginAllowed } from '../shared/middleware/cors';

function appWith(origins: string[]): Express {
  const app = express();
  app.use(buildCorsMiddlewareFor(origins));
  app.get('/ping', (_req, res) => {
    res.status(200).json({ pong: true });
  });
  return app;
}

describe('CORS middleware', () => {
  describe('parseOrigins / isOriginAllowed (unit)', () => {
    it('parseOrigins trims and drops empties', () => {
      expect(parseOrigins('https://a.com, https://b.com ,')).toEqual([
        'https://a.com',
        'https://b.com',
      ]);
    });

    it('isOriginAllowed exact match', () => {
      expect(isOriginAllowed('https://a.com', ['https://a.com'])).toBe(true);
      expect(isOriginAllowed('https://other.com', ['https://a.com'])).toBe(false);
    });

    it('isOriginAllowed wildcard subdomain', () => {
      expect(isOriginAllowed('https://api.example.com', ['*.example.com'])).toBe(true);
      expect(isOriginAllowed('https://example.org', ['*.example.com'])).toBe(false);
    });
  });

  describe('permissive mode (empty origins, non-prod)', () => {
    it('any Origin gets echoed in ACAO', async () => {
      const app = appWith([]);
      const res = await request(app).get('/ping').set('Origin', 'https://example.com').expect(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://example.com');
    });

    it('same-origin / curl (no Origin) is allowed', async () => {
      const app = appWith([]);
      const res = await request(app).get('/ping').expect(200);
      expect(res.body.pong).toBe(true);
    });
  });

  describe('strict mode (origins configured)', () => {
    it('allowed origin echoes back in ACAO', async () => {
      const app = appWith(['https://app.example.com', 'https://staging.example.com']);
      const res = await request(app).get('/ping').set('Origin', 'https://app.example.com').expect(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
    });

    it('disallowed origin does NOT receive ACAO header', async () => {
      const app = appWith(['https://app.example.com']);
      const res = await request(app).get('/ping').set('Origin', 'https://evil.example.org').expect(200);
      // Browser will treat no ACAO as a CORS rejection; server still returns 200.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('same-origin (no Origin) is allowed', async () => {
      const app = appWith(['https://app.example.com']);
      const res = await request(app).get('/ping').expect(200);
      expect(res.body.pong).toBe(true);
    });

    it('wildcard subdomain matching', async () => {
      const app = appWith(['*.example.com']);
      const a = await request(app).get('/ping').set('Origin', 'https://app.example.com').expect(200);
      expect(a.headers['access-control-allow-origin']).toBe('https://app.example.com');
      const b = await request(app).get('/ping').set('Origin', 'https://api.example.com').expect(200);
      expect(b.headers['access-control-allow-origin']).toBe('https://api.example.com');
      const c = await request(app).get('/ping').set('Origin', 'https://example.org').expect(200);
      expect(c.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('preflight', () => {
    it('OPTIONS returns the configured methods for an allowed origin', async () => {
      const app = appWith(['https://app.example.com']);
      const res = await request(app)
        .options('/ping')
        .set('Origin', 'https://app.example.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization, Content-Type')
        .send();
      expect([200, 204]).toContain(res.status);
      const allowMethods = (res.headers['access-control-allow-methods'] as string) ?? '';
      expect(allowMethods).toMatch(/POST/);
    });
  });
});
