import type { LogLevel } from './config.js';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

export interface Logger {
  readonly level: LogLevel;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

/**
 * JSON-lines logger. Emits one `console.log(JSON.stringify(...))` per record, filtered by level.
 * Callers must never pass API keys, request headers, extracted page content, prompts, or full guides.
 */
export function createLogger(
  level: LogLevel,
  sink: (line: string) => void = (line) => console.log(line)
): Logger {
  const threshold = LEVELS[level];
  const emit = (recordLevel: LogLevel, msg: string, fields?: LogFields) => {
    if (LEVELS[recordLevel] < threshold) return;
    const record: Record<string, unknown> = {
      t: new Date().toISOString(),
      level: recordLevel,
      msg,
      ...(fields ?? {}),
    };
    sink(JSON.stringify(record));
  };
  return {
    level,
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}
