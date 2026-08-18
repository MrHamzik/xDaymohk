import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Раздел «Помощь»: частые вопросы и вопросы от пользователей.
 *
 *   GET    /api/support?q=…      — FAQ + публичные вопросы (+ свои, если вошёл)
 *   POST   /api/support          — задать вопрос (нужен вход)
 *   PATCH  /api/support          — ответить / опубликовать (админ)
 *   DELETE /api/support?id=…     — удалить вопрос (автор или админ)
 *
 * Поиск идёт по БД, а не по загруженному на клиент списку: вопросов со
 * временем станут сотни, и тянуть их все в браузер ради строки поиска
 * бессмысленно.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const QUESTION_LIMIT = 1000;
const ANSWER_LIMIT = 4000;

/** Проверить токен и вернуть автора запроса. */
async function caller(request: Request): Promise<{ id: string; email?: string | null } | null> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapFaq = (r: any) => ({
  id: String(r.id),
  questionRu: r.question_ru ?? '',
  questionCe: r.question_ce ?? '',
  answerRu: r.answer_ru ?? '',
  answerCe: r.answer_ce ?? '',
  sortOrder: Number(r.sort_order ?? 0),
  isPublished: r.is_published === true,
});

const mapQuestion = (r: any) => ({
  id: String(r.id),
  authorId: r.author_id ?? null,
  authorName: r.author_name ?? '',
  question: r.question ?? '',
  answer: r.answer ?? '',
  status: r.status ?? 'new',
  isPublic: r.is_public === true,
  answeredAt: r.answered_at ?? null,
  createdAt: r.created_at ?? '',
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'support:get', limit: 120, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ faq: [], questions: [], mine: [] });

  const url = new URL(request.url);
  const search = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  const me = await caller(request);
  const isAdminCaller = me ? !('error' in (await authenticateAdmin(request))) : false;

  // FAQ
  let faq: unknown[] = [];
  try {
    const { data } = await admin.from('support_faq').select('*')
      .eq('is_published', true).order('sort_order', { ascending: true });
    faq = (data ?? []).map(mapFaq);
  } catch { /* таблицы ещё нет — отдаём пусто */ }

  // Публичные вопросы. Поиск по подстроке в вопросе и ответе: ilike
  // покрывает опечатки хуже полнотекстового, зато работает и без
  // словаря, если расширение не поднялось.
  let questions: unknown[] = [];
  try {
    let query = admin.from('support_questions').select('*')
      .eq('is_public', true).eq('status', 'answered')
      .order('created_at', { ascending: false }).limit(50);
    if (search) query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
    const { data } = await query;
    questions = (data ?? []).map(mapQuestion);
  } catch { /* см. выше */ }

  // Свои вопросы — чтобы человек видел статус и ответ.
  let mine: unknown[] = [];
  if (me) {
    try {
      const { data } = await admin.from('support_questions').select('*')
        .eq('author_id', me.id).order('created_at', { ascending: false }).limit(50);
      mine = (data ?? []).map(mapQuestion);
    } catch { /* см. выше */ }
  }

  // Админу — очередь неотвеченных.
  let pending: unknown[] = [];
  if (isAdminCaller) {
    try {
      const { data } = await admin.from('support_questions').select('*')
        .neq('status', 'closed').order('created_at', { ascending: false }).limit(200);
      pending = (data ?? []).map(mapQuestion);
    } catch { /* см. выше */ }
  }

  return withRateLimitHeaders(
    NextResponse.json({ faq, questions, mine, pending }),
    { ...limit, limit: 120 },
  );
}

export async function POST(request: Request) {
  // Вопрос — публичное действие с записью в БД: ограничиваем жёстче,
  // иначе один человек засыплет очередь поддержки.
  const limit = await rateLimit(request, { scope: 'support:ask', limit: 5, windowMs: 600_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много вопросов подряд. Попробуйте позже.' }, { status: 429 }),
      { ...limit, limit: 5 },
    );
  }

  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Войдите, чтобы задать вопрос' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, QUESTION_LIMIT) : '';
  if (question.length < 5) {
    return NextResponse.json({ error: 'Опишите вопрос подробнее' }, { status: 400 });
  }

  // Имя берём из профиля, а не из тела запроса: иначе можно подписаться
  // чужим именем.
  const { data: profile } = await admin.from('user_profiles')
    .select('full_name').eq('id', me.id).maybeSingle();

  const { data, error } = await admin.from('support_questions').insert({
    author_id: me.id,
    author_name: profile?.full_name ?? '',
    question,
  }).select('*').single();

  if (error) {
    log.warn('support:POST', 'insert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось отправить вопрос' }, { status: 500 });
  }
  return NextResponse.json({ question: mapQuestion(data) });
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Не указан вопрос' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.answer === 'string') {
    patch.answer = body.answer.trim().slice(0, ANSWER_LIMIT);
    patch.status = patch.answer ? 'answered' : 'new';
    patch.answered_at = patch.answer ? new Date().toISOString() : null;
  }
  if ('isPublic' in body) patch.is_public = body.isPublic === true;
  if (typeof body.status === 'string' && ['new', 'answered', 'closed'].includes(body.status)) {
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 });
  }

  const { data, error } = await admin.from('support_questions')
    .update(patch).eq('id', id).select('*').single();

  if (error) {
    log.warn('support:PATCH', 'update failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  }

  // Уведомляем автора об ответе. Уважаем настройки уведомлений: функция
  // notifications_enabled добавлена обновлением 28.
  if (patch.status === 'answered' && data.author_id) {
    try {
      const { data: allowed } = await admin.rpc('notifications_enabled', {
        p_user: data.author_id, p_group: 'complaint',
      });
      if (allowed !== false) {
        await admin.from('notifications').insert({
          id: `sup-${data.id}-${Date.now()}`,
          recipient_id: data.author_id,
          type: 'support_answered',
          title: 'Поддержка ответила',
          title_ce: 'ГIо декъехь жоп делла',
          message: String(data.question).slice(0, 140),
          message_ce: String(data.question).slice(0, 140),
        });
      }
    } catch (e) {
      // Уведомление — не причина откатывать ответ.
      log.warn('support:PATCH', 'notify failed', { message: String(e) });
    }
  }

  return NextResponse.json({ question: mapQuestion(data) });
}

export async function DELETE(request: Request) {
  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Войдите, чтобы продолжить' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Не указан вопрос' }, { status: 400 });

  // Удалять может автор или админ. Право проверяем на сервере: клиент
  // мог бы прислать чужой id.
  const { data: row } = await admin.from('support_questions')
    .select('author_id').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Вопрос не найден' }, { status: 404 });

  const isAdminCaller = !('error' in (await authenticateAdmin(request)));
  if (row.author_id !== me.id && !isAdminCaller) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }

  const { error } = await admin.from('support_questions').delete().eq('id', id);
  if (error) {
    log.warn('support:DELETE', 'delete failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось удалить' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
