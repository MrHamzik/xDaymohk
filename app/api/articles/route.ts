import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import {
  ARTICLE_BODY_LIMIT, ARTICLE_LEAD_LIMIT, ARTICLE_NUMBER_LIMIT, ARTICLE_TITLE_LIMIT,
  isArticleSection, mapArticleRow,
} from '@/lib/articles';

/**
 * Главы страниц-чтения: «Сира Пророка», «Нохчалла», «Руководство».
 *
 *   GET    /api/articles?section=sira        — опубликованные главы (публично)
 *   GET    /api/articles?section=sira&all=1  — вместе с черновиками (админ)
 *   POST   /api/articles                     — создать главу (админ)
 *   PATCH  /api/articles                     — изменить главу (админ)
 *   DELETE /api/articles?id=…                — удалить главу (админ)
 *
 * Тело главы хранится как markdown и НИКОГДА не рендерится через
 * innerHTML — см. components/reading/Prose.tsx. Поэтому на входе
 * достаточно ограничить длину: разметка обезвреживается на выводе.
 */

const SELECT =
  'id, section, sort_order, chapter_number, title_ru, title_ce, lead_ru, lead_ce, body_ru, body_ce, is_published, updated_at';

/** Обрезать строку до предела; не строка — пустое значение. */
function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'articles:get', limit: 120, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const url = new URL(request.url);
  const section = url.searchParams.get('section');
  if (!isArticleSection(section)) {
    return NextResponse.json({ error: 'Неизвестный раздел' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ articles: [] });

  // Черновики отдаём только администратору: параметру ?all=1 самого по
  // себе верить нельзя, он лишь выражает намерение.
  let includeDrafts = false;
  if (url.searchParams.get('all') === '1') {
    const auth = await authenticateAdmin(request);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    includeDrafts = true;
  }

  let query = admin.from('articles').select(SELECT)
    .eq('section', section)
    .order('sort_order', { ascending: true });
  if (!includeDrafts) query = query.eq('is_published', true);

  const { data, error } = await query;
  if (error) {
    // Миграция 30 могла быть не применена — страница обязана открыться
    // пустой, а не упасть пятисоткой.
    log.warn('articles:GET', 'query failed', { message: error.message });
    return NextResponse.json({ articles: [] });
  }

  return withRateLimitHeaders(
    NextResponse.json({ articles: (data ?? []).map(mapArticleRow) }),
    { ...limit, limit: 120 },
  );
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body || !isArticleSection(body.section)) {
    return NextResponse.json({ error: 'Неизвестный раздел' }, { status: 400 });
  }

  // Новая глава уходит в конец списка: шаг 10 оставляет место для
  // вставки между существующими без перенумерации всего раздела.
  const { data: last } = await admin.from('articles')
    .select('sort_order').eq('section', body.section)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await admin.from('articles').insert({
    section: body.section,
    sort_order: Number(last?.sort_order ?? 0) + 10,
    chapter_number: text(body.chapterNumber, ARTICLE_NUMBER_LIMIT).trim(),
    title_ru: text(body.titleRu, ARTICLE_TITLE_LIMIT),
    title_ce: text(body.titleCe, ARTICLE_TITLE_LIMIT),
    lead_ru: text(body.leadRu, ARTICLE_LEAD_LIMIT),
    lead_ce: text(body.leadCe, ARTICLE_LEAD_LIMIT),
    body_ru: text(body.bodyRu, ARTICLE_BODY_LIMIT),
    body_ce: text(body.bodyCe, ARTICLE_BODY_LIMIT),
    is_published: body.isPublished === true,
  }).select(SELECT).single();

  if (error) {
    log.warn('articles:POST', 'insert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось создать главу' }, { status: 500 });
  }
  return NextResponse.json({ article: mapArticleRow(data) });
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Не указана глава' }, { status: 400 });

  // Собираем патч из ПРИСУТСТВУЮЩИХ полей: редактор сохраняет по одной
  // вкладке языка, и отсутствующее поле не должно затираться пустым.
  const patch: Record<string, unknown> = {};
  if ('chapterNumber' in body) patch.chapter_number = text(body.chapterNumber, ARTICLE_NUMBER_LIMIT).trim();
  if ('titleRu' in body) patch.title_ru = text(body.titleRu, ARTICLE_TITLE_LIMIT);
  if ('titleCe' in body) patch.title_ce = text(body.titleCe, ARTICLE_TITLE_LIMIT);
  if ('leadRu' in body) patch.lead_ru = text(body.leadRu, ARTICLE_LEAD_LIMIT);
  if ('leadCe' in body) patch.lead_ce = text(body.leadCe, ARTICLE_LEAD_LIMIT);
  if ('bodyRu' in body) patch.body_ru = text(body.bodyRu, ARTICLE_BODY_LIMIT);
  if ('bodyCe' in body) patch.body_ce = text(body.bodyCe, ARTICLE_BODY_LIMIT);
  if ('isPublished' in body) patch.is_published = body.isPublished === true;
  if ('sortOrder' in body) patch.sort_order = Number(body.sortOrder) || 0;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 });
  }

  const { data, error } = await admin.from('articles')
    .update(patch).eq('id', id).select(SELECT).single();

  if (error) {
    log.warn('articles:PATCH', 'update failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось сохранить главу' }, { status: 500 });
  }
  return NextResponse.json({ article: mapArticleRow(data) });
}

export async function DELETE(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Не указана глава' }, { status: 400 });

  const { error } = await admin.from('articles').delete().eq('id', id);
  if (error) {
    log.warn('articles:DELETE', 'delete failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось удалить главу' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
