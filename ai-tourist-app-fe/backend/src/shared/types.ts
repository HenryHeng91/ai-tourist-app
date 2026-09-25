/**
 * Express request augmented with the authenticated user payload.
 */
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}