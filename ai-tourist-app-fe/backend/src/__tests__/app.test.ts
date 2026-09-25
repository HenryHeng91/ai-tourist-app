/**
 * App-level smoke tests: health check, 404, error shape, security headers.
 */
import request from 'supertest';
import { createApp } from '../app';

describe('app', () => {
  const app = createApp();

  it('GET /health -> 200', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.ts).toEqual(expect.any(String));
  });

  it('unknown route -> 404 with error envelope', async () => {
    const res = await request(app).get('/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toEqual(expect.any(String));
  });

  it('sets security headers via helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('returns 400 on malformed JSON body', async () => {
    await request(app)
      .post('/auth/signup')
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);
  });
});