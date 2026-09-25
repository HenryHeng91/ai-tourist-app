/**
 * In-memory rate limiter middleware unit tests.
 *
 * No DB / network — we just exercise the sliding-window logic directly.
 */
import express from 'express';
import request from 'supertest';
import { rateLimit, resetRateLimiter } from '../shared/middleware/rateLimit';
import { errorHandler } from '../shared/middleware/errorHandler';
import { notFound } from '../shared/middleware/notFound';

function buildApp(opts: { max: number; windowMs: number; keyBy: 'user' | 'ip'; userId?: string }) {
  resetRateLimiter();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (opts.keyBy === 'user' && opts.userId) {
      req.user = { userId: opts.userId, email: 'u@x.com' };
    }
    next();
  });
  app.post('/test', rateLimit(opts), (_req, res) => res.status(200).json({ ok: true }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('rateLimit', () => {
  beforeEach(() => resetRateLimiter());

  it('allows up to max requests in the window', async () => {
    const app = buildApp({ max: 3, windowMs: 60_000, keyBy: 'user', userId: 'u-1' });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/test').expect(200);
    }
    await request(app).post('/test').expect(429);
  });

  it('returns 429 with TOO_MANY_REQUESTS code and retryAfterMs detail', async () => {
    const app = buildApp({ max: 1, windowMs: 60_000, keyBy: 'user', userId: 'u-1' });
    await request(app).post('/test').expect(200);
    const res = await request(app).post('/test').expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.body.error.details.retryAfterMs).toEqual(expect.any(Number));
  });

  it('keys by ip when requested', async () => {
    const app = buildApp({ max: 2, windowMs: 60_000, keyBy: 'ip' });
    await request(app).post('/test').expect(200);
    await request(app).post('/test').expect(200);
    await request(app).post('/test').expect(429);
  });

  it('isolates buckets per user', async () => {
    resetRateLimiter();
    const app1 = buildApp({ max: 1, windowMs: 60_000, keyBy: 'user', userId: 'u-A' });
    const app2 = buildApp({ max: 1, windowMs: 60_000, keyBy: 'user', userId: 'u-B' });
    await request(app1).post('/test').expect(200);
    await request(app2).post('/test').expect(200);
    await request(app1).post('/test').expect(429);
    await request(app2).post('/test').expect(429);
  });
});