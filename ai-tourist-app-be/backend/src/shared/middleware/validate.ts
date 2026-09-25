/**
 * Zod request validation middleware factory.
 * Validates body / query / params against a Zod schema and attaches the parsed
 * (typed) values back onto the request. On failure, throws BadRequestError with
 * the flattened issues so callers get actionable feedback.
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema, type ZodTypeAny } from 'zod';
import { BadRequestError } from '../errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function run(schema: ZodSchema<unknown> | undefined, value: unknown): unknown {
  if (!schema) return value;
  try {
    return schema.parse(value);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new BadRequestError('Validation failed', err.flatten());
    }
    throw err;
  }
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = run(schemas.body, req.body);
      if (schemas.query) req.query = run(schemas.query, req.query) as typeof req.query;
      if (schemas.params) req.params = run(schemas.params, req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}