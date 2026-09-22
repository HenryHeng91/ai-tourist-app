/**
 * Centralised error handler. Maps AppError → JSON response and sanitises
 * unexpected errors so internal details never leak to clients.
 *
 * SECURITY: never include the original Error.stack or message of an unexpected
 * error in the response body. Log full detail server-side only.
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, BadRequestError } from '../errors';
import { logger } from '../logger';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Express / body-parser errors carry a numeric `status` (e.g. 400 for bad JSON). */
function expressStatus(err: unknown): number | undefined {
  if (err !== null && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Zod errors that escaped the validate middleware (e.g. thrown in a service).
  if (err instanceof ZodError) {
    err = new BadRequestError('Validation failed', err.flatten());
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, err.message);
    }
    const body: ErrorResponseBody = {
      error: { code: err.code, message: err.message },
    };
    if (err.details !== undefined) body.error.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // Express/body-parser errors with a status (e.g. malformed JSON → 400).
  const status = expressStatus(err);
  if (status && status >= 400 && status < 500) {
    const message = err instanceof Error ? err.message : 'Bad request';
    res.status(status).json({ error: { code: 'BAD_REQUEST', message } });
    return;
  }

  // Unexpected error — log full detail, return a generic message.
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
}