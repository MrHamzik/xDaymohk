/**
 * Лёгкий структурированный логгер для API-роутов.
 *
 * Почему не console.warn в каждом файле: единый формат, уровни,
 * возможность позже подключить внешний сборщик (Sentry/Logflare)
 * в одном месте, не трогая роуты.
 *
 * Использование:
 *   import { log } from '@/lib/logger';
 *   log.error('letters/send', 'upsert failed', { count: 5 });
 */

type Level = 'info' | 'warn' | 'error';

function toMessage(message: string | Error | Record<string, unknown> | unknown): string {
  if (message instanceof Error) return message.message;
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function emit(level: Level, scope: string, message: string | Error | Record<string, unknown> | unknown, meta?: Record<string, unknown>) {
  const line = `[${level.toUpperCase()}] [${scope}] ${toMessage(message)}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const log = {
  info: (scope: string, message: string | Error | Record<string, unknown> | unknown, meta?: Record<string, unknown>) => emit('info', scope, message, meta),
  warn: (scope: string, message: string | Error | Record<string, unknown> | unknown, meta?: Record<string, unknown>) => emit('warn', scope, message, meta),
  error: (scope: string, message: string | Error | Record<string, unknown> | unknown, meta?: Record<string, unknown>) => emit('error', scope, message, meta),
};
