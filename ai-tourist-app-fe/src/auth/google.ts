/**
 * Google OAuth social-login scaffold (Task 1.3.4).
 *
 * STATUS: stub only — full Google OAuth is OUT OF SCOPE for Sprint 1
 * (per the task description "Optional for Sprint 1"). The shape below
 * documents the contract that the real implementation will use, so the
 * UI can render the button and the rest of the app can call it without
 * a code change later.
 *
 * Wiring this up requires:
 *   - `npm i @react-oauth/google`
 *   - A `VITE_GOOGLE_CLIENT_ID` env var
 *   - Backend endpoint `POST /auth/google` accepting an ID token and
 *     returning the same `AuthSession` envelope as `/auth/login`.
 *
 * Until those land, `signInWithGoogle()` throws so callers fail fast.
 */

export interface GoogleAuthConfig {
  clientId: string;
}

export function readGoogleAuthConfig(): GoogleAuthConfig | null {
  // Vite injects import.meta.env.* at build time.
  const clientId = (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ?? '';
  if (!clientId) return null;
  return { clientId };
}

/**
 * Exchange a Google ID token for a session.
 *
 * The backend will validate the ID token and return our standard
 * `AuthSession` envelope (userId, email, displayName, accessToken,
 * refreshToken).
 */
export async function signInWithGoogle(idToken: string): Promise<never> {
  void idToken;
  throw new Error(
    'Google social login is scaffolded but not wired up in Sprint 1. ' +
      'See task 1.3.4 in the GitHub issue tracker.',
  );
}

/**
 * Returns true when the client has the configuration needed to attempt
 * Google OAuth (i.e. a `VITE_GOOGLE_CLIENT_ID` env var is set). The UI
 * hides the Google sign-in button when this is false.
 */
export function isGoogleAuthConfigured(): boolean {
  return readGoogleAuthConfig() !== null;
}
