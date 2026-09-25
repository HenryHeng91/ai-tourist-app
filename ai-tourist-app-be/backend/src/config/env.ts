/**
 * Centralised, validated environment config.
 * Loads .env once and exposes typed values. Fails fast on missing required
 * secrets in production.
 */
import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required env var: ${name}`);
    }
    // In dev/test fall back to a clearly-marked placeholder so the app boots.
    return fallback ?? '';
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

export interface AppConfig {
  nodeEnv: string;
  isTest: boolean;
  isProd: boolean;
  port: number;
  logLevel: string;
  databaseUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  bcryptCost: number;
  keyVaultKek: string;
  aiProvider: {
    baseUrl: string;
    validatePath: string;
  };
  /** Server-side Google Places API key for POI data (NOT the user's AI key). */
  googlePlaces: {
    apiKey: string;
    baseUrl: string;
    enabled: boolean;
  };
  /** Wikidata SPARQL fallback for POI data when Google Places is unavailable. */
  wikidata: {
    enabled: boolean;
    sparqlEndpoint: string;
  };
  cors: {
    /** Comma-separated list of allowed origins (exact match or `*.host` wildcard). */
    allowedOrigins: string;
  };
}

export const config: AppConfig = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProd: process.env.NODE_ENV === 'production',
  port: int('PORT', 4000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/ai_travel_guide'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  bcryptCost: int('BCRYPT_COST', 12),
  keyVaultKek: required('KEY_VAULT_KEK', 'dev-kek'),
  aiProvider: {
    baseUrl: process.env.AI_PROVIDER_BASE_URL ?? 'https://api.openai.com',
    validatePath: process.env.AI_PROVIDER_VALIDATE_PATH ?? '/v1/models',
  },
  googlePlaces: {
    // Server-side POI key — NOT the user's AI key. Optional: POI sync is disabled
    // when unset unless the Wikidata fallback is enabled.
    apiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
    baseUrl: process.env.GOOGLE_PLACES_BASE_URL ?? 'https://places.googleapis.com',
    enabled: !!(process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACES_API_KEY.length > 0),
  },
  wikidata: {
    enabled: (process.env.WIKIDATA_FALLBACK_ENABLED ?? 'false').toLowerCase() === 'true',
    sparqlEndpoint: process.env.WIKIDATA_SPARQL_ENDPOINT ?? 'https://query.wikidata.org/sparql',
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS ?? '',
  },
};