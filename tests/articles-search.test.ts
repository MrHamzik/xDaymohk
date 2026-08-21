import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * GET /api/articles/search — поиск по главам разделов чтения (п.7 ТЗ
 * Этапа 2). Публичный роут: тем важнее валидация входа. Проверяем
 * отказы на мусорных параметрах, экранирование маски LIKE и разбор
 * ответа SQL-функции; сеть подменена моками.
 */

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  withRateLimitHeaders: (response: Response) => response,
}));
vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));

function request(section: string | null, q: string | null) {
  const params = new URLSearchParams();
  if (section !== null) params.set('section', section);
  if (q !== null) params.set('q', q);
  return new Request(`http://localhost/api/articles/search?${params.toString()}`);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 });
  mocks.rpc.mockReset();
});

async function get(section: string | null, q: string | null) {
  const { GET } = await import('@/app/api/articles/search/route');
  const res = await GET(request(section, q));
  return { res, body: await res.json() };
}

describe('GET /api/articles/search — валидация входа', () => {
  it('посторонний раздел — 400', async () => {
    const { res } = await get('unknown', 'запрос');
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('все четыре раздела статей принимаются', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    for (const section of ['quran', 'sira', 'nohchalla', 'guide']) {
      const { res } = await get(section, 'запрос');
      expect(res.status).toBe(200);
    }
  });

  it('имена разделов ПРОГРЕССА не подменяют разделы статей', async () => {
    // 'nochchalma' — имя в user_reading_progress; поиск ходит по
    // именам таблицы articles ('nohchalla').
    const { res } = await get('nochchalma', 'запрос');
    expect(res.status).toBe(400);
  });

  it('короткий запрос (один символ) — 400, база не дёргается', async () => {
    const { res } = await get('sira', 'а');
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('пустого запроса нет — 400', async () => {
    const { res } = await get('sira', '   ');
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('запрос длиннее 100 символов — 400', async () => {
    const { res } = await get('sira', 'а'.repeat(101));
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('лимитер частоты отвечает 429', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const { res } = await get('sira', 'запрос');
    expect(res.status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('GET /api/articles/search — запрос к базе', () => {
  it('служебные символы LIKE экранируются, лимит фиксирован', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await get('quran', '100% вода_тест');
    expect(mocks.rpc).toHaveBeenCalledWith('search_articles', {
      p_section: 'quran',
      p_query: '100\\% вода\\_тест',
      p_limit: 12,
    });
  });

  it('строки функции приводятся к форме результата', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        id: 'id-1', chapter_number: '112', title_ru: 'Аль-Ихляс',
        title_ce: 'Аль-Ихляс (ЦIена дин)', field: 'body_ru',
        snippet: 'Он — Аллах Единый',
      }],
      error: null,
    });
    const { res, body } = await get('quran', 'единый');
    expect(res.status).toBe(200);
    expect(body.results).toEqual([{
      chapterId: 'id-1', chapterNumber: '112', titleRu: 'Аль-Ихляс',
      titleCe: 'Аль-Ихляс (ЦIена дин)', field: 'body_ru',
      snippet: 'Он — Аллах Единый',
    }]);
  });

  it('ошибка базы — пустой список, а не пятисотка (миграция могла не примениться)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    const { res, body } = await get('sira', 'запрос');
    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
  });

  it('мусор вместо массива — пустой список', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { body } = await get('sira', 'запрос');
    expect(body.results).toEqual([]);
  });
});
