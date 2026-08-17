import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { authenticateTaskRequest, taskAuthError, notifyTaskEvent, makeId } from '@/lib/tasks/server';

/**
 * Взаимные отзывы о ЧЕЛОВЕКЕ по итогам задания.
 *
 * Отличие от /api/reviews: там оценивают НАВЫКИ специалиста в анкете
 * (profiles.rating), здесь — самого жителя как участника сделки
 * (user_profiles.resident_rating). Два независимых рейтинга.
 *
 * Защита от накрутки: оценить можно только после завершённого задания и
 * только того, с кем реально имел дело. Связка задание+автор+цель
 * уникальна — второй отзыв по тому же заданию не пройдёт.
 */

/** GET /api/tasks/reviews?userId= — отзывы о жителе. */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000, scope: 'res-reviews-list' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ reviews: [] });

  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Через вьюху: прямой JOIN к user_profiles от анонимного клиента
  // отсекается политикой «self select», и отзывы приходили без имён.
  const { data, error } = await client
    .from('v_resident_reviews')
    .select('*')
    .eq('target_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    log.warn('resident reviews list failed:', error.message);
    return NextResponse.json({ reviews: [] });
  }

  return NextResponse.json({
    reviews: (data ?? []).map((r) => ({
      id: r.id,
      taskId: r.task_id,
      targetId: r.target_id,
      authorId: r.author_id,
      targetRole: r.target_role,
      rating: Number(r.rating),
      text: r.text,
      createdAt: r.created_at,
      authorName: r.author_name ?? 'Житель Даймохк',
      authorAvatarUrl: r.author_avatar_url ?? '',
    })),
  });
}

/** POST /api/tasks/reviews { taskId, targetId, rating, text } */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 20, windowMs: 60_000, scope: 'res-reviews-write' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 20 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, admin } = auth;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const taskId = String(body.taskId ?? '').trim();
  const targetId = String(body.targetId ?? '').trim();
  const rating = Number(body.rating);
  const text = String(body.text ?? '').trim().slice(0, 500);

  if (!taskId || !targetId) {
    return NextResponse.json({ error: 'Не указано задание или получатель' }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Оценка должна быть от 1 до 5' }, { status: 400 });
  }
  if (targetId === userId) {
    return NextResponse.json({ error: 'Нельзя оценить самого себя' }, { status: 400 });
  }

  const { data: task, error: taskError } = await admin
    .from('tasks')
    .select('id, author_id, status, title')
    .eq('id', taskId)
    .maybeSingle();
  if (taskError) {
    return NextResponse.json({ error: 'Не удалось загрузить задание' }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });

  // Оценка только по закрытой сделке — иначе рейтинг стал бы оружием
  // в ещё не завершённом споре.
  if (task.status !== 'completed') {
    return NextResponse.json({ error: 'Оценить можно только завершённое задание' }, { status: 409 });
  }

  const { data: participants } = await admin
    .from('task_participants')
    .select('user_id, status')
    .eq('task_id', taskId)
    .in('status', ['done', 'attended']);
  const executorIds = (participants ?? []).map((p) => String(p.user_id));
  const authorId = String(task.author_id);
  const isAuthor = authorId === userId;
  const isExecutor = executorIds.includes(userId);

  if (!isAuthor && !isExecutor) {
    return NextResponse.json({ error: 'Вы не участвовали в этом задании' }, { status: 403 });
  }
  // Заказчик оценивает только исполнителей, исполнитель — только заказчика.
  const targetIsExecutor = executorIds.includes(targetId);
  const targetIsAuthor = targetId === authorId;
  if (isAuthor && !targetIsExecutor) {
    return NextResponse.json({ error: 'Этот человек не выполнял ваше задание' }, { status: 403 });
  }
  if (isExecutor && !targetIsAuthor) {
    return NextResponse.json({ error: 'Исполнитель оценивает только заказчика' }, { status: 403 });
  }

  const { data: existing } = await admin
    .from('resident_reviews')
    .select('id')
    .eq('task_id', taskId)
    .eq('author_id', userId)
    .eq('target_id', targetId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'Вы уже оценили по этому заданию' }, { status: 409 });
  }

  const { error: insertError } = await admin.from('resident_reviews').insert({
    id: makeId('rr'),
    task_id: taskId,
    target_id: targetId,
    author_id: userId,
    target_role: targetIsAuthor ? 'customer' : 'executor',
    rating,
    text,
  });
  if (insertError) {
    log.warn('resident review insert failed:', insertError.message);
    return NextResponse.json({ error: 'Не удалось сохранить отзыв' }, { status: 500 });
  }

  // resident_rating пересчитывает триггер recompute_resident_rating.
  const { data: updated } = await admin
    .from('user_profiles')
    .select('resident_rating, resident_review_count')
    .eq('id', targetId)
    .maybeSingle();

  await notifyTaskEvent(admin, {
    recipientId: targetId,
    type: 'task_rated',
    title: 'Вас оценили',
    message: `«${task.title}»: ${rating}★`,
    titleCe: 'Хьо мах хадийна',
  });

  return NextResponse.json({
    success: true,
    rating: Number(updated?.resident_rating ?? 0),
    reviewCount: Number(updated?.resident_review_count ?? 0),
  });
}
