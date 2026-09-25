/**
 * Auth request/response Zod schemas.
 */
import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SignupResult {
  userId: string;
  email: string;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
}

export type LoginResult = SignupResult;

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export interface MeResult {
  userId: string;
  email: string;
}