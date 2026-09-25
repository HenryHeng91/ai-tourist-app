/**
 * CORS middleware factory.
 *
 * Two factory functions:
 *   - `buildCorsMiddleware()`   — reads allowed origins from config (used by
 *                                 the app factory). Empty list in non-prod
 *                                 is permissive; empty in production denies.
 *   - `buildCorsMiddlewareFor(origins)` — explicit list (used by tests so we
 *                                 don't depend on the singleton config).
 *
 * Behaviour:
 *   - Empty list + non-production => permissive (echo any Origin, no creds).
 *   - Empty list + production     => deny by default (no ACAO header).
 *   - Non-empty list => echo the request Origin if it matches, otherwise no
 *     header. Wildcard subdomain matching: "*.example.com" matches
 *     https://*.example.com.
 *   - Credentials are enabled only when a specific origin is allowed
 *     (browsers reject ACA-Credentials + wildcard).
 */
import cors from 'cors';
import { config } from '../../config/env';
import { logger } from '../logger';

export function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isOriginAllowed(requestOrigin: string, allowed: string[]): boolean {
  return allowed.some((origin) => {
    if (origin === requestOrigin) return true;
    if (origin.startsWith('*.')) {
      const suffix = origin.slice(2);
      return requestOrigin.endsWith(`.${suffix}`) || requestOrigin === suffix;
    }
    return false;
  });
}

/** Build a CORS middleware from an explicit list of allowed origins. */
export function buildCorsMiddlewareFor(allowed: string[]) {
  if (allowed.length === 0) {
    if (config.isProd) {
      // Deny: cb(null, false) makes cors skip header emission and call next()
      // without an error, so the response still goes out but without ACAO.
      return cors({
        origin: (_origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, false),
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      });
    }
    // Dev/test: permissive.
    return cors({
      origin: true,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    });
  }

  return cors({
    origin: (requestOrigin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Same-origin / curl (no Origin header) → allow.
      if (!requestOrigin) {
        cb(null, true);
        return;
      }
      if (isOriginAllowed(requestOrigin, allowed)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
}

/** Build CORS middleware using the configured allowedOrigins list. */
export function buildCorsMiddleware(): ReturnType<typeof buildCorsMiddlewareFor> {
  const allowed = parseOrigins(config.cors.allowedOrigins);
  if (allowed.length === 0 && !config.isProd) {
    logger.info('CORS: permissive mode (no allowedOrigins configured, not production)');
  } else if (allowed.length === 0 && config.isProd) {
    logger.warn('CORS: no allowed origins configured; cross-origin requests will be blocked');
  }
  return buildCorsMiddlewareFor(allowed);
}
