/**
 * Auth module — public types.
 *
 * Auth tokens live on the wire and on the dev's tongue but never on the
 * server's disk in plaintext form. See `auth.service.ts` in the backend for
 * how they're persisted (refresh-token rotation + family revocation on replay).
 */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
}

export interface AuthError {
  code: string;
  message: string;
}

/** Possible shape of the /auth/signup and /auth/login response. */
export type AuthResponse = AuthSession;
