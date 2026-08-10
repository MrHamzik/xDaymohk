/**
 * Simple in-memory rate limiter for edge/serverless routes.
 * Buckets are per IP; in serverless/multi-instance environments this is a
 * best-effort defense and should be replaced with a shared store (Upstash
 * Redis, etc.) in production.
 */
interface RateLimitOptions {
  /** Max requests within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 5_000;

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? 'anonymous';
}

function pruneExpired(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

export function rateLimit(request: Request, options: RateLimitOptions): { allowed: boolean; remaining: number; resetAt: number } {
  const key = getClientKey(request);
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt };
  }

  if (existing.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: options.limit - existing.count, resetAt: existing.resetAt };
}

export function withRateLimitHeaders(response: Response, info: { remaining: number; resetAt: number; limit: number }): Response {
  response.headers.set('X-RateLimit-Limit', String(info.limit));
  response.headers.set('X-RateLimit-Remaining', String(info.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(info.resetAt / 1000)));
  return response;
}
