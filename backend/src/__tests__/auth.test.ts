/**
 * Auth service + endpoint unit tests.
 *
 * DB layer is mocked via createFakeDb. JWT/bcrypt use real implementations
 * (fast, deterministic with fixed secrets).
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { config } from '../config/env';
import { createFakeDb, type FakeDb } from './helpers/fakeDb';
import * as authService from '../auth/auth.service';

let fake: FakeDb;
let app: ReturnType<typeof createApp>;

// In-memory user store keyed by email, mirrored into the fake DB handlers.
let users: Map<string, { id: string; email: string; password_hash: string; display_name: string | null }>;

beforeEach(() => {
  fake = createFakeDb();
  app = createApp();
  users = new Map();

  // SELECT existing user by email (used by signup + login).
  fake.when('FROM users WHERE email = $1', (values) => {
    const email = values[0] as string;
    const u = users.get(email);
    return { rows: u ? [u] : [] };
  });

  // INSERT user (signup).
  fake.when('INSERT INTO users', (values) => {
    const [email, passwordHash, displayName] = values as [string, string, string | null];
    if (users.has(email)) {
      // Simulate the UNIQUE constraint — service guards against this, but be safe.
      throw new Error('duplicate email');
    }
    const id = `user-${email}`;
    const u = { id, email, password_hash: passwordHash, display_name: displayName };
    users.set(email, u);
    return { rows: [u] };
  });

  // SELECT user by id (refresh).
  fake.when('FROM users WHERE id = $1', (values) => {
    const id = values[0] as string;
    const u = [...users.values()].find((x) => x.id === id);
    return { rows: u ? [u] : [] };
  });
});

describe('authService (unit)', () => {
  describe('signup', () => {
    it('creates a user and returns tokens', async () => {
      const res = await authService.signup({
        email: 'Alice@Example.com',
        password: 'password123',
        displayName: 'Alice',
      });
      expect(res.userId).toBe('user-alice@example.com');
      expect(res.email).toBe('alice@example.com');
      expect(res.displayName).toBe('Alice');
      expect(res.token).toEqual(expect.any(String));
      expect(res.refreshToken).toEqual(expect.any(String));

      // Access token decodes with the access secret and correct payload.
      const decoded = jwt.verify(res.token, config.jwt.accessSecret) as {
        sub: string;
        email: string;
        type: string;
      };
      expect(decoded.sub).toBe(res.userId);
      expect(decoded.email).toBe('alice@example.com');
      expect(decoded.type).toBe('access');

      // Refresh token decodes with the refresh secret.
      const rt = jwt.verify(res.refreshToken, config.jwt.refreshSecret) as {
        type: string;
        jti: string;
      };
      expect(rt.type).toBe('refresh');
      expect(rt.jti).toEqual(expect.any(String));
    });

    it('hashes the password with bcrypt (never stores plaintext)', async () => {
      await authService.signup({ email: 'bob@example.com', password: 'supersecret' });
      const stored = users.get('bob@example.com')!;
      expect(stored.password_hash).not.toBe('supersecret');
      expect(await bcrypt.compare('supersecret', stored.password_hash)).toBe(true);
      expect(await bcrypt.compare('wrong', stored.password_hash)).toBe(false);
    });

    it('rejects duplicate email with ConflictError', async () => {
      await authService.signup({ email: 'dup@example.com', password: 'password123' });
      await expect(
        authService.signup({ email: 'DUP@example.com', password: 'password123' }),
      ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.signup({ email: 'login@example.com', password: 'password123' });
    });

    it('returns tokens on valid credentials', async () => {
      const res = await authService.login({ email: 'login@example.com', password: 'password123' });
      expect(res.token).toEqual(expect.any(String));
      expect(res.refreshToken).toEqual(expect.any(String));
      expect(res.email).toBe('login@example.com');
    });

    it('rejects wrong password with UnauthorizedError', async () => {
      await expect(
        authService.login({ email: 'login@example.com', password: 'nope' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 });
    });

    it('rejects unknown user with the same error (no enumeration)', async () => {
      await expect(
        authService.login({ email: 'ghost@example.com', password: 'password123' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 });
    });
  });

  describe('refresh', () => {
    it('issues new tokens from a valid refresh token', async () => {
      const initial = await authService.signup({
        email: 'rf@example.com',
        password: 'password123',
      });
      const res = await authService.refresh(initial.refreshToken);
      expect(res.token).toEqual(expect.any(String));
      expect(res.refreshToken).toEqual(expect.any(String));
      expect(res.userId).toBe(initial.userId);
    });

    it('rejects a refresh token signed with the access secret', async () => {
      const bad = jwt.sign(
        { sub: 'x', email: 'x@x.com', type: 'refresh', jti: '1' },
        config.jwt.accessSecret,
      );
      await expect(authService.refresh(bad)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });

    it('rejects an expired/garbage token', async () => {
      await expect(authService.refresh('not-a-jwt')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });
  });
});

describe('POST /auth/* (supertest)', () => {
  it('POST /auth/signup -> 201 with tokens', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'api@example.com', password: 'password123', displayName: 'Api' })
      .expect(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.userId).toEqual(expect.any(String));
  });

  it('POST /auth/signup -> 400 on invalid email', async () => {
    await request(app)
      .post('/auth/signup')
      .send({ email: 'not-an-email', password: 'password123' })
      .expect(400);
  });

  it('POST /auth/signup -> 400 on short password', async () => {
    await request(app)
      .post('/auth/signup')
      .send({ email: 'short@example.com', password: 'short' })
      .expect(400);
  });

  it('POST /auth/login -> 200 on valid creds', async () => {
    await authService.signup({ email: 'login2@example.com', password: 'password123' });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login2@example.com', password: 'password123' })
      .expect(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('POST /auth/login -> 401 on bad creds', async () => {
    await request(app)
      .post('/auth/login')
      .send({ email: 'nope@example.com', password: 'password123' })
      .expect(401);
  });

  it('POST /auth/refresh -> 200 with new access token', async () => {
    const initial = await authService.signup({
      email: 'rf2@example.com',
      password: 'password123',
    });
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('POST /auth/refresh -> 401 on garbage', async () => {
    await request(app).post('/auth/refresh').send({ refreshToken: 'garbage' }).expect(401);
  });
});