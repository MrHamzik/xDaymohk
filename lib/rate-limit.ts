/**
 * Rate limiter: Upstash Redis в проде (serverless-safe, общий счётчик
 * между инстансами), fallback на in-memory, если UPSTASH_REDIS_REST_URL
 * не задан (локальная разработка).
 *
 * Ключи: `rl:<scope>:<clientKey>` с TTL = window. Используем INCR + EXPIRE.
 */

import { Redis } from '@upstash/redis';

interface RateLimitOptions {
  /** Max requests within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Префикс ключа (чтобы разные роуты не мешали друг другу). */
  scope?: string;
  /**
   * Кого считаем вместо IP. Нужно там, где за одним адресом сидит
   * много людей (домашний Wi-Fi, офис, мобильный NAT): по IP они
   * делят один счётчик и выжигают лимит друг другу. Обычно сюда
   * передают id пользователя из уже проверенной сессии.
   */
  identifier?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// In-memory fallback (dev / нет Redis)
interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      return new Redis({ url, token });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Ключ клиента для rate-limit.
 * x-real-ip ставится платформой (надёжен); x-forwarded-for может быть
 * подделан, поэтому используем его только если x-real-ip нет.
 * Анонимы получают уникальный ключ (не делят лимит).
 */
function getClientKey(request: Request): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  return `anon-${Math.random().toString(36).slice(2, 10)}`;
}

function pruneExpired(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

async function rateLimitMemory(key: string, options: Required<RateLimitOptions>): Promise<RateLimitResult> {
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

async function rateLimitRedis(redis: Redis, key: string, options: Required<RateLimitOptions>): Promise<RateLimitResult> {
  const now = Date.now();
  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.pexpire(key, options.windowMs);
    const res = await multi.exec();
    const count = Number(res?.[0] ?? 0);
    const resetAt = now + options.windowMs;
    return {
      allowed: count <= options.limit,
      remaining: Math.max(0, options.limit - count),
      resetAt,
    };
  } catch {
    // Redis недоступен — fallback на память, чтобы не ронять роуты.
    return rateLimitMemory(key, options);
  }
}

export async function rateLimit(request: Request, options: RateLimitOptions): Promise<RateLimitResult> {
  const who = options.identifier?.trim() || getClientKey(request);
  const key = `rl:${options.scope ?? 'default'}:${who}`;
  const full: Required<RateLimitOptions> = {
    limit: options.limit,
    windowMs: options.windowMs,
    scope: options.scope ?? 'default',
    identifier: who,
  };
  const redis = getRedis();
  if (redis) return rateLimitRedis(redis, key, full);
  return rateLimitMemory(key, full);
}

/**
 * Обнуляет счётчик — вызывать после УСПЕШНО завершённой операции.
 *
 * Лимит нужен против перебора, а не против того, кто добился своего с
 * первого раза. Без сброса удачная попытка тратит слот наравне с
 * неудачной, и человек, однажды удаливший аккаунт и решивший вернуться,
 * упирался в «Too many requests».
 */
export async function resetRateLimit(request: Request, options: Pick<RateLimitOptions, 'scope' | 'identifier'>): Promise<void> {
  const who = options.identifier?.trim() || getClientKey(request);
  const key = `rl:${options.scope ?? 'default'}:${who}`;
  buckets.delete(key);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // Счётчик сам протухнет по TTL — падать из-за этого незачем.
  }
}

export function withRateLimitHeaders(response: Response, info: { remaining: number; resetAt: number; limit: number }): Response {
  response.headers.set('X-RateLimit-Limit', String(info.limit));
  response.headers.set('X-RateLimit-Remaining', String(Math.max(0, info.remaining)));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(info.resetAt / 1000)));
  return response;
}
