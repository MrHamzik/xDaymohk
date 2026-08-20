import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * POST /api/donations/cloudtips — вебхук пожертвований.
 *
 * Роут принимает деньги, поэтому проверяем подпись: без неё кто угодно
 * дорисовал бы себе сумму сбора. Отдельно закреплена защита от повтора
 * (idempotency) — платёжные системы штатно шлют один и тот же вебхук
 * несколько раз, и повтор не должен удваивать сумму.
 */

const SECRET = 'test-webhook-secret';

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  withRateLimitHeaders: (response: Response) => response,
}));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

/**
 * Заглушка построителя запросов Supabase.
 *
 * Методы-фильтры (eq/gte/lt/...) возвращают сам объект, поэтому цепочка
 * любой длины собирается сама. Объект при этом «thenable»: await на нём
 * отдаёт то, что положили в rows, — так ведёт себя настоящий клиент.
 */
function queryBuilder(rows: unknown[] = []) {
  const builder: Record<string, unknown> = {
    upsert: mocks.upsert,
    insert: mocks.insert,
    update: () => ({ eq: mocks.update }),
    maybeSingle: mocks.maybeSingle,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  for (const method of ['select', 'eq', 'gte', 'lt', 'lte', 'gt', 'order', 'limit', 'or']) {
    builder[method] = () => builder;
  }
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => queryBuilder([{ amount: 500 }]),
    rpc: mocks.rpc,
  }),
}));

/** Тело в том же виде, в каком его шлёт CloudTips: form-urlencoded. */
function payload(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    success: 'true',
    amount: '500',
    transactionid: 'tx-0001',
    currency: 'RUB',
    createddate: '2026-08-20T10:00:00Z',
    name: 'Аноним',
    ...overrides,
  }).toString();
}

function sign(body: string, secret = SECRET) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

function request(body: string, signature?: string) {
  return new Request('http://localhost/api/donations/cloudtips', {
    method: 'POST',
    headers: signature ? { 'x-content-hmac': signature } : {},
    body,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.CLOUDTIPS_WEBHOOK_SECRET = SECRET;
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 119, resetAt: Date.now() + 60_000 });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
});

describe('POST /api/donations/cloudtips', () => {
  it('отклоняет запрос без подписи', async () => {
    const { POST } = await import('@/app/api/donations/cloudtips/route');

    const response = await POST(request(payload()));

    expect(response.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('отклоняет подделанную подпись', async () => {
    const { POST } = await import('@/app/api/donations/cloudtips/route');
    const body = payload();

    const response = await POST(request(body, sign(body, 'wrong-secret')));

    expect(response.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('отклоняет подмену суммы при верной подписи исходного тела', async () => {
    const { POST } = await import('@/app/api/donations/cloudtips/route');
    const original = payload({ amount: '10' });
    const tampered = payload({ amount: '100000' });

    // Подпись валидна для original, но тело подменено на tampered.
    const response = await POST(request(tampered, sign(original)));

    expect(response.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('принимает корректно подписанное пожертвование', async () => {
    const { POST } = await import('@/app/api/donations/cloudtips/route');
    const body = payload();

    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ operation_id: 'cloudtips-tx-0001', amount: 500 }),
      // onConflict по operation_id — та самая защита от повторной
      // доставки одного и того же вебхука.
      expect.objectContaining({ onConflict: 'operation_id' }),
    );
  });

  it('отклоняет неуспешный или нулевой платёж', async () => {
    const { POST } = await import('@/app/api/donations/cloudtips/route');
    mocks.upsert.mockClear();

    const failed = payload({ success: 'false' });
    expect((await POST(request(failed, sign(failed)))).status).toBe(400);

    const zero = payload({ amount: '0' });
    expect((await POST(request(zero, sign(zero)))).status).toBe(400);

    const foreign = payload({ currency: 'USD' });
    expect((await POST(request(foreign, sign(foreign)))).status).toBe(400);

    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('не работает, если секрет вебхука не задан', async () => {
    delete process.env.CLOUDTIPS_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/donations/cloudtips/route');
    const body = payload();

    const response = await POST(request(body, sign(body)));

    // 503, а не 200: без секрета проверить отправителя нечем, поэтому
    // роут обязан отказать, а не принимать всё подряд.
    expect(response.status).toBe(503);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
