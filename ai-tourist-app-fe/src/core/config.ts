/**
 * Application configuration resolved from Vite environment variables.
 * Centralised so the rest of the app never reads `import.meta.env` directly.
 */

export interface AppConfig {
  apiUrl: string;
  googleMapsKey: string;
  publicAppUrl: string | undefined;
  appVersion: string;
  isProduction: boolean;
}

function required(name: string, fallback?: string): string {
  const value = import.meta.env[name as 'VITE_API_URL'] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Check your .env.local file against .env.example.`,
    );
  }
  return value as string;
}

function optional(name: string, fallback: string): string {
  const value = import.meta.env[name as 'VITE_API_URL'];
  return value && value !== '' ? (value as string) : fallback;
}

export const appConfig: AppConfig = Object.freeze({
  apiUrl: required('VITE_API_URL', 'http://localhost:4000').replace(/\/$/, ''),
  googleMapsKey: optional('VITE_GOOGLE_MAPS_KEY', ''),
  publicAppUrl: import.meta.env['VITE_PUBLIC_APP_URL'] as string | undefined,
  appVersion: (import.meta.env['APP_VERSION'] as string | undefined) ?? '0.0.0',
  isProduction: import.meta.env.PROD,
});
