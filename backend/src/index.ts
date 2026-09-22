/**
 * Server bootstrap. Binds the Express app to the configured port.
 * Tests import `createApp` directly and never call this file.
 */
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './shared/logger';
import { closePool } from './db/pool';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port} (${config.nodeEnv})`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down ...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));