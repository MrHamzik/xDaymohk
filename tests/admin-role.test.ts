import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * POST /api/admin/role — выдача и снятие админ-прав.
 *
 * Самый чувствительный роут проекта: он раздаёт полномочия. Проверяем
 * именно отказы, а не «счастливый путь», — дыра здесь означает чужой
 * доступ ко всей админке.
 *
 * Supabase и rate-limit подменяются: тест про правила доступа, а не про
 * сеть. Мок объявлен через vi.hoisted, потому что vi.mock поднимается
 * наверх файла и обычные переменные к моменту его выполнения ещё не
 * созданы.
 */

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  rateLimit: vi.fn(),
  updateEq: vi.fn(),
  maybeSingle: vi.fn(),
  writeAdminAudit: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ authenticateAdmin: mocks.authenticateAdmin }));
vi.mock('@/lib/admin-audit', () => ({ writeAdminAudit: mocks.writeAdminAudit }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  withRateLimitHeaders: (response: Response) => response,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      update: () => ({ eq: mocks.updateEq }),
    }),
  }),
}));

const OWNER = 'mr.hamzik1026@gmail.com';
const OTHER_ADMIN = 'nabis95@gmail.com';

function request(body: unknown) {
  return new Request('http://localhost/api/admin/role', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 });
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.writeAdminAudit.mockResolvedValue(undefined);
});

describe('POST /api/admin/role', () => {
  it('отказывает гостю без сессии', async () => {
    mocks.authenticateAdmin.mockResolvedValue({ error: 'Сессия не найдена', status: 401 });
    const { POST } = await import('@/app/api/admin/role/route');

    const response = await POST(request({ userId: 'user-1', makeAdmin: true }));

    expect(response.status).toBe(401);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });

  it('отказывает обычному админу: права раздаёт только владелец', async () => {
    mocks.authenticateAdmin.mockResolvedValue({ email: OTHER_ADMIN, userId: 'admin-2' });
    const { POST } = await import('@/app/api/admin/role/route');

    const response = await POST(request({ userId: 'user-1', makeAdmin: true }));

    expect(response.status).toBe(403);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });

  it('не даёт понизить владельца проекта', async () => {
    mocks.authenticateAdmin.mockResolvedValue({ email: OWNER, userId: 'owner-1' });
    mocks.maybeSingle.mockResolvedValue({
      data: { email: OWNER, full_name: 'Владелец', is_admin: true },
      error: null,
    });
    const { POST } = await import('@/app/api/admin/role/route');

    const response = await POST(request({ userId: 'owner-1', makeAdmin: false }));

    expect(response.status).toBe(400);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });

  it('владелец выдаёт права и действие попадает в журнал', async () => {
    mocks.authenticateAdmin.mockResolvedValue({ email: OWNER, userId: 'owner-1' });
    mocks.maybeSingle.mockResolvedValue({
      data: { email: 'user@example.com', full_name: 'Житель', is_admin: false },
      error: null,
    });
    const { POST } = await import('@/app/api/admin/role/route');

    const response = await POST(request({ userId: 'user-1', makeAdmin: true }));

    expect(response.status).toBe(200);
    expect(mocks.updateEq).toHaveBeenCalled();
    // Журнал обязателен: без следа нельзя разобрать, кто выдал права.
    expect(mocks.writeAdminAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'role_grant', targetUserId: 'user-1' }),
    );
  });

  it('возвращает 429 при превышении частоты запросов', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const { POST } = await import('@/app/api/admin/role/route');
    // Счётчики вызовов копятся в пределах файла: модуль роута
    // импортируется один раз, а моки общие. Обнуляем перед проверкой.
    mocks.authenticateAdmin.mockClear();
    mocks.updateEq.mockClear();

    const response = await POST(request({ userId: 'user-1', makeAdmin: true }));

    expect(response.status).toBe(429);
    // Лимит срабатывает ДО проверки прав — запрос дальше не идёт.
    expect(mocks.authenticateAdmin).not.toHaveBeenCalled();
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });
});
