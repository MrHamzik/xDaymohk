import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * lib/rate-limit — ограничение частоты запросов.
 *
 * Без Upstash счётчики живут в памяти процесса; здесь проверяется
 * именно эта ветка. Отдельно закреплено разделение по scope: раздача
 * админ-прав и вход не должны съедать общий лимит.
 */

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      throw new Error('Redis в тестах не используется');
    }
  },
}));

function requestFrom(ip: string) {
  return new Request('http://localhost/api/test', { headers: { 'x-real-ip': ip } });
}

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.resetModules();
});

describe('rateLimit (память процесса)', () => {
  it('пропускает запросы до лимита и отклоняет следующий', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    const options = { limit: 3, windowMs: 60_000, scope: 'test-basic' };

    const first = await rateLimit(requestFrom('10.0.0.1'), options);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    await rateLimit(requestFrom('10.0.0.1'), options);
    await rateLimit(requestFrom('10.0.0.1'), options);

    const blocked = await rateLimit(requestFrom('10.0.0.1'), options);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('считает разные IP независимо', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    const options = { limit: 1, windowMs: 60_000, scope: 'test-ip' };

    expect((await rateLimit(requestFrom('10.0.0.1'), options)).allowed).toBe(true);
    expect((await rateLimit(requestFrom('10.0.0.1'), options)).allowed).toBe(false);
    // Сосед за другим адресом не должен страдать от чужого перебора.
    expect((await rateLimit(requestFrom('10.0.0.2'), options)).allowed).toBe(true);
  });

  it('разделяет счётчики по scope', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');

    const login = { limit: 1, windowMs: 60_000, scope: 'login' };
    const upload = { limit: 1, windowMs: 60_000, scope: 'upload' };

    expect((await rateLimit(requestFrom('10.0.0.3'), login)).allowed).toBe(true);
    expect((await rateLimit(requestFrom('10.0.0.3'), login)).allowed).toBe(false);
    // Другой раздел — свой счётчик, лимит входа его не касается.
    expect((await rateLimit(requestFrom('10.0.0.3'), upload)).allowed).toBe(true);
  });

  it('предпочитает x-real-ip подделываемому x-forwarded-for', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    const options = { limit: 1, windowMs: 60_000, scope: 'test-spoof' };

    const real = new Request('http://localhost/api/test', {
      headers: { 'x-real-ip': '10.0.0.9', 'x-forwarded-for': '1.2.3.4' },
    });
    expect((await rateLimit(real, options)).allowed).toBe(true);

    // Тот же x-real-ip, но подменённый x-forwarded-for: лимит обойти
    // не должно — ключ берётся из заголовка, который ставит платформа.
    const spoofed = new Request('http://localhost/api/test', {
      headers: { 'x-real-ip': '10.0.0.9', 'x-forwarded-for': '5.6.7.8' },
    });
    expect((await rateLimit(spoofed, options)).allowed).toBe(false);
  });

  it('ИЗВЕСТНАЯ ДЫРА: запрос без IP каждый раз получает новый счётчик', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    const options = { limit: 1, windowMs: 60_000, scope: 'test-anon' };

    const anonymous = () => new Request('http://localhost/api/test');
    const first = await rateLimit(anonymous(), options);
    const second = await rateLimit(anonymous(), options);

    // Обе попытки проходят: getClientKey отдаёт анониму случайный ключ
    // (Math.random), поэтому лимит для запросов без заголовков IP не
    // работает вовсе. Тест фиксирует текущее поведение — когда ключ
    // сделают постоянным, он упадёт и о правке напомнит.
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
  });
});
