/**
 * In-memory fake Postgres pool for unit tests.
 *
 * Implements the subset of `pg.Pool`/`PoolClient` the services use:
 *   - pool.query(text, values) -> { rows, rowCount }
 *   - pool.connect() -> mock client with query/release
 *
 * Tests seed the fake with handler functions keyed by a SQL substring so the
 * fake doesn't need a real SQL parser. Each handler receives the values array
 * and returns { rows, rowCount }. The first matching handler wins; unmatched
 * queries throw so missing stubs are caught. Transaction control statements
 * (BEGIN / COMMIT / ROLLBACK) are accepted transparently.
 *
 * jest.config has resetMocks:true, so the mock implementations are wiped
 * between tests. Tests must therefore (re)seed handlers in beforeEach and call
 * `fake.install()` (or just use `fake.when(...)` which installs lazily).
 *
 * This keeps unit tests fast, hermetic, and DB-free (per self-test rules).
 */
import { setPoolForTesting } from '../../db/pool';

export interface FakeQueryResult {
  rows?: Record<string, unknown>[];
  rowCount?: number;
}
export type FakeHandler = (values: unknown[]) => FakeQueryResult;

interface FakeClient {
  query: jest.Mock;
  release: jest.Mock;
}

export interface FakeDb {
  pool: { query: jest.Mock; connect: jest.Mock; on: jest.Mock };
  client: FakeClient;
  /** Register a handler matched when the SQL contains `substring`. */
  when: (substring: string, handler: FakeHandler) => FakeDb;
  /** (Re)install mock implementations from current handlers. */
  install: () => void;
  /** Reset registered handlers. */
  reset: () => void;
  handlers: { substring: string; handler: FakeHandler }[];
}

/** Transaction-control statements that the fake accepts as no-ops. */
const TX_CONTROL = /^\s*(?:begin|commit|rollback|end)\b/i;

export function createFakeDb(): FakeDb {
  const handlers: { substring: string; handler: FakeHandler }[] = [];

  function runQuery(text: unknown, values?: unknown): FakeQueryResult {
    const sql = typeof text === 'string' ? text : (text as { text?: string }).text ?? '';
    if (TX_CONTROL.test(sql)) return { rows: [], rowCount: 0 };
    const args: unknown[] = Array.isArray(values) ? values : [];
    for (const { substring, handler } of handlers) {
      if (sql.includes(substring)) return handler(args);
    }
    throw new Error(`FakeDb: no handler matched SQL: ${sql.slice(0, 160)}`);
  }

  const client: FakeClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const pool = {
    query: jest.fn(),
    connect: jest.fn(() => Promise.resolve(client)),
    on: jest.fn(),
  };

  function install(): void {
    pool.query.mockImplementation((text: unknown, values?: unknown) =>
      Promise.resolve(runQuery(text, values)),
    );
    client.query.mockImplementation((text: unknown, values?: unknown) =>
      Promise.resolve(runQuery(text, values)),
    );
    pool.connect.mockImplementation(() => Promise.resolve(client));
    setPoolForTesting(pool);
  }

  install();

  return {
    pool,
    client,
    when: (substring, handler) => {
      handlers.push({ substring, handler });
      install();
      return undefined as unknown as FakeDb;
    },
    install,
    reset: () => {
      handlers.length = 0;
      install();
    },
    handlers,
  };
}
