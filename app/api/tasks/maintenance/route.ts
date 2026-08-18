import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { notifyTaskEvent } from '@/lib/tasks/server';
import { TASK_AUTO_CONFIRM_HOURS, TASK_BLOCK_HOURS } from '@/lib/types';

/**
 * Обслуживание заданий по расписанию:
 *   1. автоподтверждение — заказчик молчит 3 часа после «Выполнил»;
 *   2. просрочка — срок вышел, задание никто не взял.
 *
 * Вызывается тихо при открытии раздела (как раздел «Письма» в админке) и
 * может дублироваться pg_cron. Идемпотентен: выбираются только строки в
 * подходящем статусе, повторный вызов ничего не портит.
 *
 * Доступ: без сессии, но с обязательным секретом в заголовке ЛИБО
 * с ограничением по частоте — иначе любой мог бы дёргать эндпоинт.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000, scope: 'tasks-maintenance' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Если секрет задан — требуем его (для pg_cron / внешнего планировщика).
  // Без секрета работает как «тихий» вызов из UI, защищённый rate-limit.
  const cronSecret = process.env.TASKS_CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('x-cron-secret');
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = Date.now();
  let autoConfirmed = 0;
  let expired = 0;

  // ---------------------------------------------------------------
  // 1. Автоподтверждение: 3 часа тишины после «Выполнил».
  //    Заказчик получает блокировку на создание заданий (6 ч) —
  //    штраф за то, что заставил исполнителя ждать.
  // ---------------------------------------------------------------
  const confirmCutoff = new Date(now - TASK_AUTO_CONFIRM_HOURS * 3_600_000).toISOString();
  const { data: stale, error: staleError } = await admin
    .from('tasks')
    .select('id, title, author_id, submitted_at')
    .eq('status', 'awaiting_confirm')
    .lt('submitted_at', confirmCutoff)
    .limit(100);

  if (staleError) {
    log.warn('maintenance: stale query failed:', staleError.message);
  }

  for (const task of stale ?? []) {
    const taskId = String(task.id);

    const { data: parts } = await admin
      .from('task_participants')
      .select('user_id')
      .eq('task_id', taskId)
      .in('status', ['joined', 'attended']);

    for (const p of parts ?? []) {
      const executorId = String(p.user_id);
      await admin
        .from('task_participants')
        .update({ status: 'done' })
        .eq('task_id', taskId)
        .eq('user_id', executorId);

      const { data: u } = await admin
        .from('user_profiles')
        .select('tasks_done_count')
        .eq('id', executorId)
        .maybeSingle();
      await admin
        .from('user_profiles')
        .update({ tasks_done_count: Number(u?.tasks_done_count ?? 0) + 1 })
        .eq('id', executorId);

      await notifyTaskEvent(admin, {
        recipientId: executorId,
        type: 'task_auto_confirmed',
        title: 'Задание подтверждено автоматически',
        message: `«${task.title}»: заказчик не ответил за ${TASK_AUTO_CONFIRM_HOURS} ч.`,
      });
    }

    await admin
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        is_archived: true,
      })
      .eq('id', taskId);

    // Блокировка заказчика на 6 часов.
    const blockedUntil = new Date(now + TASK_BLOCK_HOURS * 3_600_000).toISOString();
    await admin
      .from('user_profiles')
      .update({ tasks_blocked_until: blockedUntil })
      .eq('id', String(task.author_id));

    await notifyTaskEvent(admin, {
      recipientId: String(task.author_id),
      type: 'task_auto_confirmed',
      title: 'Задание закрыто автоматически',
      message: `«${task.title}». Вы не подтвердили за ${TASK_AUTO_CONFIRM_HOURS} ч — `
        + `создание новых заданий заблокировано на ${TASK_BLOCK_HOURS} ч.`,
    });

    autoConfirmed += 1;
  }

  // ---------------------------------------------------------------
  // 2. Просрочка: срок вышел, задание так и не взяли.
  // ---------------------------------------------------------------
  const { data: overdue, error: overdueError } = await admin
    .from('tasks')
    .select('id, title, author_id')
    .eq('status', 'open')
    .eq('is_archived', false)
    .lt('deadline_at', new Date(now).toISOString())
    .limit(100);

  if (overdueError) {
    log.warn('maintenance: overdue query failed:', overdueError.message);
  }

  for (const task of overdue ?? []) {
    await admin
      .from('tasks')
      .update({ status: 'expired', is_archived: true })
      .eq('id', String(task.id));

    await notifyTaskEvent(admin, {
      recipientId: String(task.author_id),
      type: 'task_expired',
      title: 'Срок задания истёк',
      message: `«${task.title}»: задание никто не взял.`,
    });

    expired += 1;
  }

  // ── Споры: возвращаем в работу по истечении суток ──────────────
  // Спор не должен висеть вечно: если стороны не договорились и никто
  // не подал жалобу, исполнитель снова может сдать работу, а заказчик —
  // принять или отменить.
  let disputesReleased = 0;
  const { data: staleDisputes } = await admin
    .from('tasks')
    .select('id, title, author_id')
    .eq('status', 'disputed')
    .lt('dispute_until', new Date().toISOString());

  for (const task of staleDisputes ?? []) {
    const { error } = await admin
      .from('tasks')
      .update({ status: 'in_progress', dispute_until: null })
      .eq('id', task.id);
    if (error) {
      log.warn('maintenance: dispute release failed', { message: error.message });
      continue;
    }

    const { data: parts } = await admin
      .from('task_participants')
      .select('user_id')
      .eq('task_id', task.id)
      .in('status', ['joined', 'attended']);

    for (const p of [...(parts ?? []), { user_id: task.author_id }]) {
      if (!p.user_id) continue;
      await notifyTaskEvent(admin, {
        recipientId: String(p.user_id),
        type: 'task_dispute_released',
        title: 'Срок рассмотрения истёк',
        message: `«${task.title}» снова в работе.`,
      });
    }
    disputesReleased += 1;
  }

  return NextResponse.json({ success: true, autoConfirmed, expired, disputesReleased });
}
