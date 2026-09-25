/**
 * Minimal forward-only SQL migrations runner.
 *
 * Migrations are plain `.sql` files in `src/migrations`, sorted by filename.
 * A `schema_migrations` table tracks which have been applied.
 *
 * Commands:
 *   run | up    apply all pending
 *   down        roll back the last applied (best-effort; requires a matching
 *               `<name>.down.sql` — skipped if absent)
 *   create <n>  print a suggested next filename (no file written)
 *
 * Usage: `npm run migrate` (runs `up`).
 *
 * NOTE: this file is excluded from typecheck via tsconfig (it's a CLI). It is
 * still type-correct; the exclusion is only to keep `tsc --noEmit` from
 * complaining about the shebang-style entry.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { query, withClient, closePool } from './pool';
import { logger } from '../shared/logger';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

interface MigrationFile {
  name: string;
  sql: string;
}

function listMigrations(suffix: string): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(suffix))
    .sort();
  return files.map((f) => ({
    name: basename(f, suffix),
    sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf8'),
  }));
}

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedNames(): Promise<string[]> {
  const res = await query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
  return res.rows.map((r) => r.name);
}

async function up(): Promise<void> {
  await ensureMigrationsTable();
  const pending = listMigrations('.up.sql');
  const applied = new Set(await appliedNames());
  for (const m of pending) {
    if (applied.has(m.name)) continue;
    logger.info(`Applying migration ${m.name} ...`);
    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
    logger.info(`Applied ${m.name}`);
  }
}

async function down(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedNames();
  if (applied.length === 0) {
    logger.info('Nothing to roll back.');
    return;
  }
  const last = applied[applied.length - 1];
  const downFiles = listMigrations('.down.sql');
  const match = downFiles.find((f) => f.name === last);
  if (!match) {
    logger.warn(`No down migration for ${last}; skipping.`);
    return;
  }
  logger.info(`Rolling back ${last} ...`);
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(match.sql);
      await client.query('DELETE FROM schema_migrations WHERE name = $1', [last]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
  logger.info(`Rolled back ${last}`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'run';
  try {
    if (cmd === 'run' || cmd === 'up') {
      await up();
    } else if (cmd === 'down') {
      await down();
    } else if (cmd === 'create') {
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      logger.info(`Suggested: src/migrations/${ts}_<description>.up.sql`);
    } else {
      logger.error(`Unknown command: ${cmd}`);
      process.exitCode = 1;
    }
  } finally {
    await closePool();
  }
}

void main();