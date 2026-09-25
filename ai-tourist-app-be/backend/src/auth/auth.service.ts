/**
 * Auth service — email+password signup/login/refresh.
 *
 * Passwords hashed with bcrypt (cost from config). JWTs: short-lived access
 * (HS256, signed with access secret) + longer-lived refresh (signed with
 * refresh secret, type-tagged so an access secret can't verify a refresh and
 * vice versa).
 *
 * Refresh tokens are tracked in the `refresh_tokens` table so we can:
 *   - Detect replay (a revoked jti being presented again) and revoke the entire
 *     family for that user (rotation-with-theft-detection, design.md §8.4).
 *   - Invalidate on logout without a stateless JWT blacklist.
 *
 * The service talks to Postgres via the swappable `query` from db/pool, so unit
 * tests inject an in-memory fake.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import { query, withTransaction } from '../db/pool';
import { ConflictError, UnauthorizedError, NotFoundError } from '../shared/errors';
import type {
  LoginResult,
  MeResult,
  RefreshResult,
  SignupResult,
} from './auth.schema';

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
}

interface RefreshTokenRow {
  jti: string;
  user_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  type: 'refresh';
  jti: string; // token id — primary key in refresh_tokens
}

/**
 * Parse a TTL string like `15m`, `1h`, `7d`, `30d` into milliseconds.
 * Supports `s` (seconds), `m` (minutes), `h` (hours), `d` (days).
 * Falls back to 0 (so the token is already expired).
 */
function ttlStringToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 0;
  const [, num, unit] = match as unknown as [string, string, string];
  const n = parseInt(num, 10);
  switch (unit) {
    case 's': return n * 1000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    case 'd': return n * 86_400_000;
    default: return 0;
  }
}

interface SignedPair {
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
}

/**
 * Sign access + refresh tokens for a user. Caller is responsible for persisting
 * the refresh jti to the refresh_tokens table in the same transaction as
 * upstream business logic (signup insert / refresh rotation).
 */
function signTokens(user: { id: string; email: string }): SignedPair {
  const signOpts = (ttl: string) => ({ expiresIn: ttl }) as unknown as jwt.SignOptions;
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, type: 'access' },
    config.jwt.accessSecret,
    signOpts(config.jwt.accessTtl),
  );
  const refreshJti = uuidv4();
  const refreshToken = jwt.sign(
    { sub: user.id, email: user.email, type: 'refresh', jti: refreshJti },
    config.jwt.refreshSecret,
    signOpts(config.jwt.refreshTtl),
  );
  return { accessToken, refreshToken, refreshJti };
}

/** Insert a refresh-token row. `expiresAt` is the JWT exp timestamp as Date. */
async function persistRefresh(
  jti: string,
  userId: string,
  expiresAt: Date,
  client?: { query: (text: string, values?: unknown[]) => Promise<unknown> },
): Promise<void> {
  const q = client ?? { query };
  await q.query(
    `INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)`,
    [jti, userId, expiresAt],
  );
}

export async function signup(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<SignupResult> {
  const email = input.email.toLowerCase().trim();

  const existing = await query<UserRow>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new ConflictError('An account with that email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, config.bcryptCost);
  // Insert the user, sign tokens, persist the refresh jti — all atomically so
  // a failed INSERT leaves no orphan refresh row.
  return withTransaction(async (client) => {
    const inserted = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [email, passwordHash, input.displayName ?? null],
    );
    const user = inserted.rows[0];
    if (!user) throw new Error('Signup insert returned no row');

    const tokens = signTokens({ id: user.id, email: user.email });
    const expiresAt = new Date(Date.now() + ttlStringToMs(config.jwt.refreshTtl));
    await persistRefresh(tokens.refreshJti, user.id, expiresAt, client);

    return {
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  });
}

export async function login(input: { email: string; password: string }): Promise<LoginResult> {
  const email = input.email.toLowerCase().trim();
  const result = await query<UserRow>(
    'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
    [email],
  );
  const user = result.rows[0];
  if (!user || !user.password_hash) {
    // Same error for "no user" and "wrong password" to avoid user enumeration.
    throw new UnauthorizedError('Invalid email or password');
  }
  const ok = await bcrypt.compare(input.password, user.password_hash);
  if (!ok) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return withTransaction(async (client) => {
    const tokens = signTokens({ id: user.id, email: user.email });
    const expiresAt = new Date(Date.now() + ttlStringToMs(config.jwt.refreshTtl));
    await persistRefresh(tokens.refreshJti, user.id, expiresAt, client);

    return {
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  });
}

/**
 * Refresh — rotate the refresh token. The presented jti must be active and not
 * expired; on rotation we revoke the old row and issue a new pair. If the old
 * row was already revoked (replay/theft signal), we revoke the entire family
 * for the user and reject the call.
 */
export async function refresh(refreshToken: string): Promise<RefreshResult> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }

  return withTransaction(async (client) => {
    const rowRes = await client.query<RefreshTokenRow>(
      `SELECT jti, user_id, expires_at, revoked_at
         FROM refresh_tokens
        WHERE jti = $1
        FOR UPDATE`,
      [payload.jti],
    );
    const row = rowRes.rows[0];

    // Replay detection: a revoked jti is being presented again. This means the
    // old token has been compromised. Revoke the whole family for that user.
    if (row?.revoked_at) {
      await client.query(
        `UPDATE refresh_tokens
            SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [payload.sub],
      );
      throw new UnauthorizedError('Refresh token replay detected; session revoked');
    }

    if (!row) {
      throw new UnauthorizedError('Refresh token not found');
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Confirm the user still exists.
    const userRes = await client.query<UserRow>(
      'SELECT id, email FROM users WHERE id = $1',
      [payload.sub],
    );
    const user = userRes.rows[0];
    if (!user) throw new NotFoundError('User not found');

    const tokens = signTokens({ id: user.id, email: user.email });
    const expiresAt = new Date(Date.now() + ttlStringToMs(config.jwt.refreshTtl));
    await persistRefresh(tokens.refreshJti, user.id, expiresAt, client);
    await client.query(
      `UPDATE refresh_tokens
          SET revoked_at = now(),
              replaced_by_jti = $1
        WHERE jti = $2`,
      [tokens.refreshJti, payload.jti],
    );

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  });
}

/**
 * Logout — revoke the supplied refresh token. The client MUST also discard
 * its local copies; this is an extra defence-in-depth step that makes a stolen
 * refresh unusable.
 */
export async function logout(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    // Malformed / unknown — treat as no-op (logout is idempotent).
    return;
  }
  if (payload.type !== 'refresh') return;

  await query(
    `UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, now())
      WHERE jti = $1 AND revoked_at IS NULL`,
    [payload.jti],
  );
}

/**
 * Get the authenticated user's public profile (used by /auth/me). Returns
 * 404 if the user has been deleted since the token was issued.
 */
export async function getMe(userId: string): Promise<MeResult> {
  const res = await query<UserRow>(
    'SELECT id, email FROM users WHERE id = $1',
    [userId],
  );
  const user = res.rows[0];
  if (!user) throw new NotFoundError('User not found');
  return { userId: user.id, email: user.email };
}
