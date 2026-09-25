/**
 * JWT auth middleware.
 * - `requireAuth`: rejects requests without a valid Bearer access token.
 * - `optionalAuth`: attaches `req.user` if a valid token is present, otherwise
 *   leaves it undefined (used by endpoints that behave differently for anon).
 *
 * Tokens are issued by the auth module. The payload shape is { sub, email }.
 */
import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { UnauthorizedError } from '../errors';
import type { AuthedRequest, AuthUser } from '../types';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

export function signAccessToken(user: AuthUser): string {
  const payload: AccessTokenPayload = { sub: user.userId, email: user.email, type: 'access' };
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtl } as unknown as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new UnauthorizedError('Invalid token type');
  }
  return decoded;
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or malformed Authorization header'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    next();
  }
}