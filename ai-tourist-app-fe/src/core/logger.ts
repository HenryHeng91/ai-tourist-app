/**
 * Lightweight logger that prefixes module name and respects a runtime
 * level. Avoid leaking sensitive data — never pass the AI API key here.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: LogLevel =
  (import.meta.env['VITE_LOG_LEVEL'] as LogLevel | undefined) ??
  (import.meta.env.DEV ? 'debug' : 'warn');

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

function emit(level: LogLevel, scope: string, message: string, ...rest: unknown[]): void {
  if (!shouldLog(level)) return;
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.debug;
  fn(`[${scope}] ${message}`, ...rest);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, ...rest: unknown[]) => emit('debug', scope, msg, ...rest),
    info: (msg: string, ...rest: unknown[]) => emit('info', scope, msg, ...rest),
    warn: (msg: string, ...rest: unknown[]) => emit('warn', scope, msg, ...rest),
    error: (msg: string, ...rest: unknown[]) => emit('error', scope, msg, ...rest),
  };
}
