/**
 * Structured logger. Pino in prod, plain console in test for readable output.
 * SECURITY: never call logger with secrets or key material.
 */
import pino from 'pino';
import { config } from '../config/env';

export const logger =
  config.isTest
    ? ({
        level: 'silent',
        info: (_msg: string, ..._args: unknown[]) => undefined,
        warn: (_msg: string, ..._args: unknown[]) => undefined,
        error: (msg: string, ...args: unknown[]) => console.error(msg, ...args),
        debug: (_msg: string, ..._args: unknown[]) => undefined,
        child: () => logger,
      } as unknown as pino.Logger)
    : pino({ level: config.logLevel });