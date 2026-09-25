/**
 * 404 handler for unmatched routes.
 */
import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError('Route not found'));
}