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

// In-memory user store keyed by email.
let users: Map<
  string,
  { id: string; email: string; password_hash: string; display_name: string | null }
>;

// Refresh-token store (jti -> row).
interface RefreshRow {
  jti: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_jti: string | null;
}
let refreshTokens: Map<string, RefreshRow>;

/** Helper to install a handler on the fake. */
function on(
  substring: string,
  handler: (values: unknown[]) => { rows?: unknown[]; rowCount?: number },
): void {
  fake.when(substring, handler);
}

beforeEach(() => {
  fake = createFakeDb();
  app = createApp();
  users = new Map();
  refreshTokens = new Map();

  // ── users table ──
  on('FROM users WHERE email = $1', (values) => {
    const u = users.get(values[0] as string);
    return { rows: u ? [u] : [] };
  });
  on('INSERT INTO users', (values) => {
    const [email, passwordHash, displayName] = values as [string, string, string | null];
    if (users.has(email)) throw new Error('duplicate email');
    const u = { id: `user-${email}`, email, password_hash: passwordHash, display_name: displayName };
    users.set(email, u);
    return { rows: [u] };
  });
  on('FROM users WHERE id = $1', (values) => {
    const u = [...users.values()].find((x) => x.id === values[0]);
    return { rows: u ? [u] : [] };
  });

  // ── refresh_tokens table ──
  on('INSERT INTO refresh_tokens', (values) => {
    const [jti, userId, expiresAt] = values as [string, string, Date];
    refreshTokens.set(jti, {
      jti,
      user_id: userId,
      expires_at: expiresAt,
      revoked_at: null,
      replaced_by_jti: null,
    });
    return { rows: [], rowCount: 1 };
  });
  on('SELECT jti, user_id, expires_at, revoked_at', (values) => {
    const row = refreshTokens.get(values[0] as string);
    return { rows: row ? [row] : [] };
  });
  on('replaced_by_jti = $1', (values) => {
    const [replacedBy, oldJti] = values as [string, string];
    const row = refreshTokens.get(oldJti);
    if (row && !row.revoked_at) {
      row.revoked_at = new Date();
      row.replaced_by_jti = replacedBy;
    }
    return { rows: [], rowCount: row ? 1 : 0 };
  });
  on('WHERE user_id = $1 AND revoked_at IS NULL', (values) => {
    const [userId] = values as [string];
    let count = 0;
    for (const r of refreshTokens.values()) {
      if (r.user_id === userId && !r.revoked_at) {
        r.revoked_at = new Date();
        count++;
      }
    }
    return { rows: [], rowCount: count };
  });
  on('COALESCE(revoked_at, now())', (values) => {
    const row = refreshTokens.get(values[0] as string);
    if (row && !row.revoked_at) {
      row.revoked_at = new Date();
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
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
      expect(res.accessToken).toEqual(expect.any(String));
      expect(res.refreshToken).toEqual(expect.any(String));

      const decoded = jwt.verify(res.accessToken, config.jwt.accessSecret) as {
        sub: string;
        email: string;
        type: string;
      };
      expect(decoded.sub).toBe(res.userId);
      expect(decoded.email).toBe('alice@example.com');
      expect(decoded.type).toBe('access');

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

    it('uses bcrypt cost 12 (per design spec)', async () => {
      expect(config.bcryptCost).toBe(12);
      await authService.signup({ email: 'cost@example.com', password: 'password123' });
      const stored = users.get('cost@example.com')!;
      expect(stored.password_hash).toMatch(/^\$2[aby]\$12\$/);
    });

    it('rejects duplicate email with ConflictError', async () => {
      await authService.signup({ email: 'dup@example.com', password: 'password123' });
      await expect(
        authService.signup({ email: 'DUP@example.com', password: 'password123' }),
      ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    });

    it('persists a refresh token row in the database', async () => {
      await authService.signup({ email: 'rt@example.com', password: 'password123' });
      expect(refreshTokens.size).toBe(1);
      const row = [...refreshTokens.values()][0];
      expect(row.user_id).toBe('user-rt@example.com');
      expect(row.revoked_at).toBeNull();
      expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.signup({ email: 'login@example.com', password: 'password123' });
    });

    it('returns tokens on valid credentials', async () => {
      const res = await authService.login({ email: 'login@example.com', password: 'password123' });
      expect(res.accessToken).toEqual(expect.any(String));
      expect(res.refreshToken).toEqual(expect.any(String));
      expect(res.email).toBe('login@example.com');
    });

    it('persists a new refresh token on each login', async () => {
      await authService.login({ email: 'login@example.com', password: 'password123' });
      await authService.login({ email: 'login@example.com', password: 'password123' });
      // Two logins + one signup = three active refresh rows (no revoke-on-login).
      expect(refreshTokens.size).toBe(3);
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

  describe('refresh (rotation + revocation)', () => {
    it('issues new tokens from a valid refresh token', async () => {
      const initial = await authService.signup({
        email: 'rf@example.com',
        password: 'password123',
      });
      const res = await authService.refresh(initial.refreshToken);
      expect(res.accessToken).toEqual(expect.any(String));
      expect(res.refreshToken).toEqual(expect.any(String));
      expect(res.refreshToken).not.toBe(initial.refreshToken);
    });

    it('revokes the old jti after rotation', async () => {
      const initial = await authService.signup({
        email: 'rot@example.com',
        password: 'password123',
      });
      const oldJti = jwt.verify(initial.refreshToken, config.jwt.refreshSecret) as {
        jti: string;
      };
      await authService.refresh(initial.refreshToken);
      const oldRow = refreshTokens.get(oldJti.jti);
      expect(oldRow?.revoked_at).not.toBeNull();
      expect(oldRow?.replaced_by_jti).not.toBeNull();
    });

    it('rejects replay (revoked jti) and revokes the whole family', async () => {
      const initial = await authService.signup({
        email: 'replay@example.com',
        password: 'password123',
      });
      const firstRefresh = await authService.refresh(initial.refreshToken);
      await expect(authService.refresh(initial.refreshToken)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
      const secondJti = jwt.verify(firstRefresh.refreshToken, config.jwt.refreshSecret) as {
        jti: string;
      };
      const secondRow = refreshTokens.get(secondJti.jti);
      expect(secondRow?.revoked_at).not.toBeNull();
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

  describe('logout', () => {
    it('revokes the supplied refresh token', async () => {
      const initial = await authService.signup({
        email: 'lo@example.com',
        password: 'password123',
      });
      await authService.logout(initial.refreshToken);
      const jti = jwt.verify(initial.refreshToken, config.jwt.refreshSecret) as { jti: string };
      const row = refreshTokens.get(jti.jti);
      expect(row?.revoked_at).not.toBeNull();
    });

    it('is a no-op when no token supplied', async () => {
      await expect(authService.logout()).resolves.toBeUndefined();
    });

    it('does not throw on garbage tokens (idempotent)', async () => {
      await expect(authService.logout('garbage')).resolves.toBeUndefined();
      await expect(authService.logout('')).resolves.toBeUndefined();
    });
  });

  describe('getMe', () => {
    it('returns userId + email for the authenticated user', async () => {
      const { userId, email } = await authService.signup({
        email: 'me@example.com',
        password: 'password123',
      });
      const me = await authService.getMe(userId);
      expect(me.userId).toBe(userId);
      expect(me.email).toBe(email);
    });

    it('throws NotFoundError if the user was deleted', async () => {
      await expect(authService.getMe('ghost-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });
});

describe('POST /auth/* (supertest)', () => {
  it('POST /auth/signup -> 201 with tokens', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'api-signup@example.com', password: 'password123', displayName: 'Api' })
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.userId).toEqual(expect.any(String));
    expect(res.body.email).toBe('api-signup@example.com');
  });

  it('POST /auth/register (alias) -> 201 with tokens', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'api-reg@example.com', password: 'password123' })
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
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

  it('POST /auth/signup -> 409 on duplicate email', async () => {
    await authService.signup({ email: 'dupe@example.com', password: 'password123' });
    await request(app)
      .post('/auth/signup')
      .send({ email: 'dupe@example.com', password: 'password123' })
      .expect(409);
  });

  it('POST /auth/login -> 200 on valid creds', async () => {
    await authService.signup({ email: 'login2@example.com', password: 'password123' });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login2@example.com', password: 'password123' })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
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
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('POST /auth/refresh -> 401 on garbage', async () => {
    await request(app).post('/auth/refresh').send({ refreshToken: 'garbage' }).expect(401);
  });

  it('POST /auth/refresh -> 401 on replay of revoked token', async () => {
    const initial = await authService.signup({
      email: 'rp@example.com',
      password: 'password123',
    });
    await authService.refresh(initial.refreshToken);
    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(401);
  });

  it('POST /auth/logout -> 204 with refresh token in body', async () => {
    const initial = await authService.signup({
      email: 'logout@example.com',
      password: 'password123',
    });
    await request(app)
      .post('/auth/logout')
      .send({ refreshToken: initial.refreshToken })
      .expect(204);
  });

  it('POST /auth/logout -> 204 with no body (idempotent)', async () => {
    await request(app).post('/auth/logout').expect(204);
  });

  it('POST /auth/logout -> 204 with garbage token (idempotent)', async () => {
    await request(app).post('/auth/logout').send({ refreshToken: 'garbage' }).expect(204);
  });
});

describe('GET /auth/me (protected)', () => {
  it('returns 401 without a bearer token', async () => {
    await request(app).get('/auth/me').expect(401);
  });

  it('returns the authenticated user with a valid access token', async () => {
    const { accessToken, userId, email } = await authService.signup({
      email: 'me2@example.com',
      password: 'password123',
    });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body.email).toBe(email);
  });

  it('returns 401 for an access token signed with the refresh secret', async () => {
    const bad = jwt.sign(
      { sub: 'u', email: 'u@x', type: 'refresh' },
      config.jwt.refreshSecret,
    );
    await request(app).get('/auth/me').set('Authorization', `Bearer ${bad}`).expect(401);
  });
});
