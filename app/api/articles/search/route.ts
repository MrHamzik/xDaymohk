import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { isArticleSection } from '@/lib/articles';
import { escapeLikePattern } from '@/lib/reading-rules';

/**
 * Поиск по главам раздела чтения (п.7 ТЗ Этапа 2).
 *
 *   GET /api/articles/search?section=sira&q=фраза
 *
 * Публичный эндпоинт: ищет только по опубликованным главам — это
 * гарантирует сама SQL-функция search_articles (миграция 71), поэтому
 * черновики не утекут даже при вызове через сервисный клиент. Запрос
 * уходит в Postgres параметром; шаблон LIKE строится внутри функции, а
 * служебные символы % и _ экранируются ещё здесь.
 *
 * Поиск НЕ трогает сохранённый прогресс чтения (п.7): он ничего не
 * пишет в user_reading_progress, а переход по результату открывается
 * страницей чтения в режиме исследования.
 */

export interface SearchHit {
  chapterId: string;
  chapterNumber: string;
  titleRu: string;
  titleCe: string;
  field: string;
  snippet: string;
}

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const RESULT_LIMIT = 12;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'articles:search', limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const url = new URL(request.url);
  const section = url.searchParams.get('section');
  const query = (url.searchParams.get('q') ?? '').trim();

  if (!isArticleSection(section)) {
    return NextResponse.json({ error: 'Неизвестный раздел' }, { status: 400 });
  }
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ error: 'Введите минимум два символа' }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: 'Слишком длинный запрос' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ results: [] });

  const { data, error } = await admin.rpc('search_articles', {
    p_section: section,
    // % и _ в пользовательском запросе — символы маски LIKE: без
    // экранирования «100%» искал бы «100» плюс что угодно.
    p_query: escapeLikePattern(query),
    p_limit: RESULT_LIMIT,
  });

  if (error) {
    // Миграция 71 могла быть не применена — поиск отвечает пусто, а не
    // валит страницу чтения.
    log.warn('articles:search', 'rpc failed', { message: error.message });
    return NextResponse.json({ results: [] });
  }

  const results: SearchHit[] = ((data ?? []) as any[]).map((row) => ({
    chapterId: String(row.id),
    chapterNumber: String(row.chapter_number ?? ''),
    titleRu: String(row.title_ru ?? ''),
    titleCe: String(row.title_ce ?? ''),
    field: String(row.field ?? ''),
    snippet: String(row.snippet ?? ''),
  }));

  return withRateLimitHeaders(NextResponse.json({ results }), { ...limit, limit: 30 });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
