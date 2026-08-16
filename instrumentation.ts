import * as Sentry from '@sentry/nextjs';

// Sentry инициализируется ТОЛЬКО если задан SENTRY_DSN.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  });
}

export const onRequestError = Sentry.captureRequestError;
