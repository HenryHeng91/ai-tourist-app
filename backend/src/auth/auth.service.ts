/**
 * Auth service — email+password signup/login/refresh.
 *
 * Passwords hashed with bcrypt (cost from config). JWTs: short-lived access
 * (HS256, signed with access secret) + longer-lived refresh (signed with
 * refresh secret, type-tagged so an access secret can't verify a refresh and
 * vice versa).
 *
 * The service talks to Postgres via the swappable `query` from db/pool, so unit
 * tests inject an in-memory fake.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import { query } from '../db/pool';
import { ConflictError, UnauthorizedError, NotFoundError } from '../shared/errors';
import type { AuthTokens } from './auth.schema';

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  type: 'refresh';
  jti: string; // token id — supports future rotation/blacklist
}

function signTokens(user: { id: string; email: string }): AuthTokens {
  const signOpts = (ttl: string) => ({ expiresIn: ttl }) as unknown as jwt.SignOptions;
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, type: 'access' },
    config.jwt.accessSecret,
    signOpts(config.jwt.accessTtl),
  );
  const refreshToken = jwt.sign(
    { sub: user.id, email: user.email, type: 'refresh', jti: uuidv4() },
    config.jwt.refreshSecret,
    signOpts(config.jwt.refreshTtl),
  );
  return { accessToken, refreshToken };
}

export async function signup(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ userId: string; email: string; displayName: string | null } & AuthTokens> {
  const email = input.email.toLowerCase().trim();

  // Check for existing user.
  const existing = await query<UserRow>(
    'SELECT id FROM users WHERE email = $1',
    [email],
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('An account with that email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, config.bcryptCost);
  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name`,
    [email, passwordHash, input.displayName ?? null],
  );
  const user = result.rows[0];
  if (!user) throw new Error('Signup insert returned no row');

  const tokens = signTokens({ id: user.id, email: user.email });
  return {
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    ...tokens,
  };
}

export async function login(input: { email: string; password: string }): Promise<
  { userId: string; email: string; displayName: string | null } & AuthTokens
> {
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
  const tokens = signTokens({ id: user.id, email: user.email });
  return {
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    ...tokens,
  };
}

export async function refresh(refreshToken: string): Promise<{ userId: string; email: string } & AuthTokens> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }
  // Confirm the user still exists.
  const res = await query<UserRow>('SELECT id, email FROM users WHERE id = $1', [payload.sub]);
  if (res.rows.length === 0) {
    throw new NotFoundError('User not found');
  }
  const user = res.rows[0];
  const tokens = signTokens({ id: user.id, email: user.email });
  return { userId: user.id, email: user.email, ...tokens };
}
/**
 * Logout — invalidate a refresh token.
 *
 * JWTs are stateless, so true revocation requires a server-side blacklist
 * (future work). For now we verify the supplied refresh token is well-formed
 * and signed by us; the client MUST also discard its local copies. A malformed
 * or unknown token is a no-op (logout is idempotent).
 */
export async function logout(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as RefreshTokenPayload;
    if (payload.type !== 'refresh') return;
    // No blacklist store yet — acceptance is the contract. The client clears its
    // local tokens; a future blacklist table will reject subsequent refreshes.
  } catch {
    // Ignore invalid/expired tokens — logout stays idempotent.
  }
}