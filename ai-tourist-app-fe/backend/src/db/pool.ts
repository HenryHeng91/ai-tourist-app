/**
 * Postgres connection pool.
 *
 * Exposes a `query` function and a `withClient` helper for running multiple
 * statements in a single checked-out client (transactions). The pool is lazily
 * created so importing this module in tests does not require a live DB.
 *
 * Tests inject a fake via `setPoolForTesting`.
 */
import pg, { type Pool, type PoolClient, type QueryConfig, type QueryResult, type QueryResultRow } from 'pg';
// `Pool` is also a value (constructor) on the default export; re-bind for `new`.
const PgPool = pg.Pool;
import { config } from '../config/env';
import { logger } from '../shared/logger';

// PostGIS types: ensure `uuid` and `bytea` parse correctly. pg returns bytea
// as Buffer by default, which is what we want for ciphertext blobs.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => (val === null ? null : Number(val)));

let pool: Pool | null = null;

export interface DbQuery {
  <R extends QueryResultRow = QueryResultRow>(
    text: string | QueryConfig<R>,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new PgPool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (err) => {
      logger.error({ err }, 'Idle pg client error');
    });
  }
  return pool;
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string | QueryConfig,
  values?: unknown[],
): Promise<QueryResult<R>> {
  return getPool().query<R>(text as string, values as unknown[]);
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Run `fn` inside a serialisable transaction. Rolls back on throw. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Test-only: inject a fake pool-like object. Pass `null` to reset.
 * The fake only needs `query` and `connect` (returning a mock client with
 * `query`/`release`).
 */
export function setPoolForTesting(fake: unknown): void {
  if (config.isProd) {
    throw new Error('setPoolForTesting must never be called in production');
  }
  pool = fake as Pool;
}