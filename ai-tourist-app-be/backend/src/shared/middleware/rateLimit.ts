/**
 * Simple in-memory sliding-window rate limiter middleware.
 *
 * NOTE: this is single-process and best-effort — for a multi-instance
 * deployment, swap this for a Redis-backed limiter (e.g. `rate-limiter-flexible`
 * with a Redis store). The interface is the same so the call site doesn't
 * change.
 *
 * Usage:
 *   router.post('/...', rateLimit({ windowMs: 60_000, max: 10, keyBy: 'user' }), handler)
 *
 * `keyBy`:
 *   - 'user'   → keys on req.user!.userId (requires requireAuth upstream)
 *   - 'ip'     → keys on the request IP (works for unauthenticated routes)
 */
import type { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '../errors';
import type { AuthedRequest } from '../types';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyBy: 'user' | 'ip';
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Test-only: clear all state. */
export function resetRateLimiter(): void {
  buckets.clear();
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, keyBy } = opts;
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = resolveKey(req as AuthedRequest, keyBy);
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    existing.count++;
    if (existing.count > max) {
      const retryAfterMs = Math.max(0, existing.resetAt - now);
      next(new TooManyRequestsError('Rate limit exceeded', { retryAfterMs }));
      return;
    }
    next();
  };
}

function resolveKey(req: AuthedRequest, by: 'user' | 'ip'): string {
  if (by === 'user') {
    if (req.user?.userId) return `u:${req.user.userId}`;
    // Fall back to IP if for some reason user isn't set — the route should
    // require auth upstream.
    return `i:${req.ip ?? 'unknown'}`;
  }
  return `i:${req.ip ?? 'unknown'}`;
}