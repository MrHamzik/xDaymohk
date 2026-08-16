import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { isAdminEmail } from '@/lib/admin';
import { log } from '@/lib/logger';
import {
  authenticateTaskRequest,
  taskAuthError,
  checkExecutorEligibility,
  countActiveTasks,
  notifyTaskEvent,
  touchExecutorActivity,
  isExecutorActive,
  makeId,
  type ExecutorProfile,
} from '@/lib/tasks/server';
import { TASK_AUTO_CONFIRM_HOURS } from '@/lib/types';

/**
 * Действия над заданием. Все переходы статусов только здесь, на сервере:
 * клиент присылает намерение, права и текущий статус проверяются по БД.
 *
 * POST /api/tasks/:id { action }
 *   take     — взять срочное задание (первый нажавший)
 *   join     — записаться на запланированное
 *   leave    — отказаться от записи
 *   exclude  — заказчик исключает участника (обратно не записаться)
 *   submit   — исполнитель нажал «Выполнил» (пошли 3 часа)
 *   confirm  — заказчик подтвердил (сделка закрыта)
 *   reject   — заказчик не принял (спор: 24 часа на разбор)
 *   cancel   — отмена задания
 *   attend   — отметка явки + бонус на запланированном
 */

type Action =
  | 'take' | 'join' | 'leave' | 'exclude'
  | 'submit' | 'confirm' | 'reject' | 'cancel' | 'attend';

const ACTIONS: Action[] = ['take', 'join', 'leave', 'exclude', 'submit', 'confirm', 'reject', 'cancel', 'attend'];

/** GET /api/tasks/:id — карточка с участниками. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000, scope: 'task-read' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const { id } = await context.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: task, error } = await client
    .from('v_tasks_feed')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    log.warn('task read failed:', error.message);
    return NextResponse.json({ error: 'Не удалось загрузить задание' }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });

  const { data: participants } = await client
    .from('task_participants')
    .select('id, task_id, user_id, status, attended, bonus_percent, joined_at, excluded_at, user_profiles(full_name, avatar_url, resident_rating, tasks_done_count)')
    .eq('task_id', id)
    .order('joined_at', { ascending: true });

  return NextResponse.json({
    task,
    participants: (participants ?? []).map((p) => {
      const u = p.user_profiles as unknown as {
        full_name?: string; avatar_url?: string;
        resident_rating?: number; tasks_done_count?: number;
      } | null;
      return {
        id: p.id,
        taskId: p.task_id,
        userId: p.user_id,
        status: p.status,
        attended: p.attended,
        bonusPercent: p.bonus_percent,
        joinedAt: p.joined_at,
        excludedAt: p.excluded_at,
        fullName: u?.full_name ?? '',
        avatarUrl: u?.avatar_url ?? '',
        rating: Number(u?.resident_rating ?? 0),
        tasksDoneCount: Number(u?.tasks_done_count ?? 0),
      };
    }),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000, scope: 'task-action' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const { id } = await context.params;
  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, email, admin } = auth;
  const isAdmin = isAdminEmail(email);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const action = String(body.action ?? '') as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  }

  const { data: task, error: taskError } = await admin
    .from('tasks')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (taskError) {
    log.warn('task action: read failed:', taskError.message);
    return NextResponse.json({ error: 'Не удалось загрузить задание' }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });

  const isAuthor = String(task.author_id) === userId;

  switch (action) {
    // ---------------------------------------------------------------
    // Взять срочное / записаться на запланированное
    // ---------------------------------------------------------------
    case 'take':
    case 'join': {
      if (task.status !== 'open') {
        return NextResponse.json({ error: 'Задание уже недоступно' }, { status: 409 });
      }
      if (task.is_archived) {
        return NextResponse.json({ error: 'Задание в архиве' }, { status: 409 });
      }
      // Просроченное не отдаём, даже если фоновая пометка ещё не прошла.
      const deadline = task.deadline_at ? new Date(task.deadline_at).getTime() : null;
      if (deadline && deadline < Date.now()) {
        return NextResponse.json({ error: 'Срок выполнения истёк' }, { status: 409 });
      }

      // Брать задания может только «Активен» — иначе счётчик «подходит N»
      // врал бы, а заказчик ждал бы исполнителя, который не в сети.
      const { data: statusRow } = await admin
        .from('executor_status')
        .select('is_active, active_until')
        .eq('user_id', userId)
        .maybeSingle();
      if (!isExecutorActive(statusRow)) {
        return NextResponse.json(
          { error: 'Включите статус «Активен», чтобы брать задания' },
          { status: 403 },
        );
      }

      const { data: profile } = await admin
        .from('user_profiles')
        .select('id, resident_rating, tasks_done_count, tasks_blocked_until, is_blocked, birth_date, created_at')
        .eq('id', userId)
        .maybeSingle();
      if (!profile) return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 });

      // Исключённый заказчиком не возвращается на это задание.
      const { data: existing } = await admin
        .from('task_participants')
        .select('id, status')
        .eq('task_id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (existing?.status === 'excluded') {
        return NextResponse.json({ error: 'Заказчик исключил вас из этого задания' }, { status: 403 });
      }
      if (existing && existing.status !== 'cancelled') {
        return NextResponse.json({ error: 'Вы уже участвуете в этом задании' }, { status: 409 });
      }

      const activeCount = await countActiveTasks(admin, userId);
      const eligibility = checkExecutorEligibility(
        profile as ExecutorProfile,
        task,
        activeCount,
      );
      if (!eligibility.ok) {
        return NextResponse.json({ error: eligibility.reason }, { status: 403 });
      }

      // Гонка «первый забирает»: считаем занятые места и не даём выйти
      // за slots. Полную атомарность даст UNIQUE(task_id,user_id) плюс
      // проверка ниже — двойной клик одним человеком отсечётся индексом.
      const { count: taken } = await admin
        .from('task_participants')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', id)
        .in('status', ['joined', 'attended', 'done']);
      if ((taken ?? 0) >= Number(task.slots ?? 1)) {
        return NextResponse.json({ error: 'Все места уже заняты' }, { status: 409 });
      }

      const participantId = existing?.id ?? makeId('tp');
      const { error: upsertError } = await admin
        .from('task_participants')
        .upsert({
          id: participantId,
          task_id: id,
          user_id: userId,
          status: 'joined',
          joined_at: new Date().toISOString(),
          excluded_at: null,
        }, { onConflict: 'task_id,user_id' });
      if (upsertError) {
        log.warn('task join failed:', upsertError.message);
        return NextResponse.json({ error: 'Не удалось записаться' }, { status: 500 });
      }

      // Срочное занимает единственное место → сразу «в процессе».
      if (task.kind === 'urgent') {
        await admin.from('tasks').update({ status: 'in_progress' }).eq('id', id);
      }

      await notifyTaskEvent(admin, {
        recipientId: String(task.author_id),
        type: task.kind === 'urgent' ? 'task_taken' : 'task_joined',
        title: task.kind === 'urgent' ? 'Задание взяли' : 'Новая запись на задание',
        message: `«${task.title}»`,
        titleCe: task.kind === 'urgent' ? 'ТIедиллар схьаэцна' : 'ТIедилларна керла дIаязвар',
      });
      await touchExecutorActivity(admin, userId);

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Отказаться от записи
    // ---------------------------------------------------------------
    case 'leave': {
      const { data: participant } = await admin
        .from('task_participants')
        .select('id, status')
        .eq('task_id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!participant || participant.status === 'excluded') {
        return NextResponse.json({ error: 'Вы не участвуете в задании' }, { status: 404 });
      }

      await admin
        .from('task_participants')
        .update({ status: 'cancelled' })
        .eq('id', participant.id);

      // Срочное снова открыто для других.
      if (task.kind === 'urgent' && task.status === 'in_progress') {
        await admin.from('tasks').update({ status: 'open' }).eq('id', id);
      }

      await notifyTaskEvent(admin, {
        recipientId: String(task.author_id),
        type: 'task_cancelled',
        title: 'Исполнитель отказался',
        message: `«${task.title}»`,
      });

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Заказчик исключает участника
    // ---------------------------------------------------------------
    case 'exclude': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может исключать' }, { status: 403 });
      }
      const targetUserId = String(body.userId ?? '').trim();
      if (!targetUserId) {
        return NextResponse.json({ error: 'Не указан участник' }, { status: 400 });
      }

      const { error: excludeError } = await admin
        .from('task_participants')
        .update({ status: 'excluded', excluded_at: new Date().toISOString() })
        .eq('task_id', id)
        .eq('user_id', targetUserId);
      if (excludeError) {
        return NextResponse.json({ error: 'Не удалось исключить' }, { status: 500 });
      }

      if (task.kind === 'urgent' && task.status === 'in_progress') {
        await admin.from('tasks').update({ status: 'open' }).eq('id', id);
      }

      await notifyTaskEvent(admin, {
        recipientId: targetUserId,
        type: 'task_excluded',
        title: 'Вас исключили из задания',
        message: `«${task.title}»`,
      });

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // «Выполнил» — стартуют 3 часа автоподтверждения
    // ---------------------------------------------------------------
    case 'submit': {
      const { data: participant } = await admin
        .from('task_participants')
        .select('id, status')
        .eq('task_id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!participant || !['joined', 'attended'].includes(String(participant.status))) {
        return NextResponse.json({ error: 'Вы не исполнитель этого задания' }, { status: 403 });
      }
      if (!['open', 'in_progress'].includes(String(task.status))) {
        return NextResponse.json({ error: 'Задание уже не в работе' }, { status: 409 });
      }

      await admin
        .from('tasks')
        .update({ status: 'awaiting_confirm', submitted_at: new Date().toISOString() })
        .eq('id', id);

      await notifyTaskEvent(admin, {
        recipientId: String(task.author_id),
        type: 'task_submitted',
        title: 'Задание выполнено — подтвердите',
        message: `«${task.title}». Если не подтвердить за ${TASK_AUTO_CONFIRM_HOURS} ч, оно закроется автоматически.`,
      });

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Подтверждение заказчиком
    // ---------------------------------------------------------------
    case 'confirm': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может подтвердить' }, { status: 403 });
      }
      if (task.status !== 'awaiting_confirm') {
        return NextResponse.json({ error: 'Задание не ожидает подтверждения' }, { status: 409 });
      }

      await completeTask(admin, id, String(task.title));
      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Заказчик не принял работу — спор
    // ---------------------------------------------------------------
    case 'reject': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может отклонить' }, { status: 403 });
      }
      if (task.status !== 'awaiting_confirm') {
        return NextResponse.json({ error: 'Задание не ожидает подтверждения' }, { status: 409 });
      }
      const reason = String(body.reason ?? '').trim().slice(0, 500);

      // Возвращаем в работу: у сторон есть сутки договориться, дальше
      // разбирают админы по жалобе (жалобы уже есть в проекте).
      await admin
        .from('tasks')
        .update({ status: 'in_progress', submitted_at: null, cancel_reason: reason || null })
        .eq('id', id);

      const { data: parts } = await admin
        .from('task_participants')
        .select('user_id')
        .eq('task_id', id)
        .in('status', ['joined', 'attended']);
      for (const p of parts ?? []) {
        await notifyTaskEvent(admin, {
          recipientId: String(p.user_id),
          type: 'task_cancel_requested',
          title: 'Заказчик не принял работу',
          message: reason ? `«${task.title}»: ${reason}` : `«${task.title}»`,
        });
      }

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Отмена задания
    // ---------------------------------------------------------------
    case 'cancel': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может отменить' }, { status: 403 });
      }
      if (['completed', 'cancelled'].includes(String(task.status))) {
        return NextResponse.json({ error: 'Задание уже закрыто' }, { status: 409 });
      }
      const reason = String(body.reason ?? '').trim().slice(0, 500);

      await admin
        .from('tasks')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason || null,
          is_archived: true,
        })
        .eq('id', id);

      const { data: parts } = await admin
        .from('task_participants')
        .select('user_id')
        .eq('task_id', id)
        .in('status', ['joined', 'attended']);
      for (const p of parts ?? []) {
        await notifyTaskEvent(admin, {
          recipientId: String(p.user_id),
          type: 'task_cancelled',
          title: 'Задание отменено',
          message: reason ? `«${task.title}»: ${reason}` : `«${task.title}»`,
        });
      }

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Отметка явки + бонус (запланированное)
    // ---------------------------------------------------------------
    case 'attend': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может отметить явку' }, { status: 403 });
      }
      const entries = Array.isArray(body.attendance) ? body.attendance : [];
      if (entries.length === 0) {
        return NextResponse.json({ error: 'Пустой список явки' }, { status: 400 });
      }

      for (const raw of entries) {
        const entry = raw as { userId?: string; attended?: boolean; bonusPercent?: number };
        const targetId = String(entry.userId ?? '').trim();
        if (!targetId) continue;
        const attended = entry.attended === true;
        // Наказание рублём убрали (работа сделана — платят полностью),
        // поэтому только бонус 0..20 %.
        const bonus = Math.min(Math.max(Math.floor(Number(entry.bonusPercent) || 0), 0), 20);

        await admin
          .from('task_participants')
          .update({
            attended,
            bonus_percent: attended ? bonus : 0,
            status: attended ? 'done' : 'no_show',
          })
          .eq('task_id', id)
          .eq('user_id', targetId);

        if (attended) {
          const { data: u } = await admin
            .from('user_profiles')
            .select('tasks_done_count')
            .eq('id', targetId)
            .maybeSingle();
          await admin
            .from('user_profiles')
            .update({ tasks_done_count: Number(u?.tasks_done_count ?? 0) + 1 })
            .eq('id', targetId);
        }

        await notifyTaskEvent(admin, {
          recipientId: targetId,
          type: attended ? 'task_rate_pending' : 'task_cancelled',
          title: attended ? 'Оцените заказчика' : 'Отмечена неявка',
          message: `«${task.title}»`,
        });
      }

      await admin
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString(), is_archived: true })
        .eq('id', id);

      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  }
}

/**
 * Закрытие задания: помечаем исполнителей выполнившими, растим счётчик
 * (он питает фильтр «мин. выполненных заданий») и зовём обе стороны
 * оценить друг друга.
 */
async function completeTask(
  admin: SupabaseClient,
  taskId: string,
  title: string,
) {
  const { data: parts } = await admin
    .from('task_participants')
    .select('user_id')
    .eq('task_id', taskId)
    .in('status', ['joined', 'attended']);

  for (const p of parts ?? []) {
    const targetId = String(p.user_id);
    await admin
      .from('task_participants')
      .update({ status: 'done' })
      .eq('task_id', taskId)
      .eq('user_id', targetId);

    const { data: u } = await admin
      .from('user_profiles')
      .select('tasks_done_count')
      .eq('id', targetId)
      .maybeSingle();
    await admin
      .from('user_profiles')
      .update({ tasks_done_count: Number(u?.tasks_done_count ?? 0) + 1 })
      .eq('id', targetId);

    await notifyTaskEvent(admin, {
      recipientId: targetId,
      type: 'task_confirmed',
      title: 'Задание подтверждено',
      message: `«${title}». Оцените заказчика.`,
    });
  }

  await admin
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString(), is_archived: true })
    .eq('id', taskId);
}
