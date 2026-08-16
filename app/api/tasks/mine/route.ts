import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { authenticateTaskRequest, taskAuthError } from '@/lib/tasks/server';
import { mapTaskRow } from '@/lib/tasks/map';

/**
 * GET /api/tasks/mine — задания, где текущий пользователь ИСПОЛНИТЕЛЬ.
 *
 * Отдельный роут, потому что общая лента /api/tasks публичная и ничего
 * не знает о сессии, а вкладка «В работе» до этого угадывала участие по
 * статусу задания — и показывала чужие. Здесь связь берётся из
 * task_participants по проверенному JWT.
 *
 * Возвращает и завершённые: по ним нужно поставить оценку («ожидает
 * оценки» — жёлтая метка у исполнителя).
 */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000, scope: 'tasks-mine' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, admin } = auth;

  // 1. Все задания, где я участник (кроме отменённых мной и исключений).
  const { data: parts, error: partsError } = await admin
    .from('task_participants')
    .select('task_id, status')
    .eq('user_id', userId)
    .in('status', ['joined', 'attended', 'done'])
    .order('joined_at', { ascending: false })
    .limit(200);

  if (partsError) {
    log.warn('tasks/mine participants failed:', partsError.message);
    return NextResponse.json({ error: 'Не удалось загрузить задания' }, { status: 500 });
  }

  const taskIds = (parts ?? []).map((p) => String(p.task_id));
  if (taskIds.length === 0) {
    return NextResponse.json({ tasks: [], pendingReview: [] });
  }

  // 2. Сами задания — через ту же вьюху, что и лента, чтобы карточка
  //    рисовалась одинаково (шапка заказчика, счётчик мест).
  const { data: rows, error: tasksError } = await admin
    .from('v_tasks_feed')
    .select('*')
    .in('id', taskIds)
    .order('created_at', { ascending: false });

  if (tasksError) {
    log.warn('tasks/mine tasks failed:', tasksError.message);
    return NextResponse.json({ error: 'Не удалось загрузить задания' }, { status: 500 });
  }

  // 3. Какие завершённые я ещё не оценил — для метки «ожидает оценки».
  const { data: myReviews } = await admin
    .from('resident_reviews')
    .select('task_id')
    .eq('author_id', userId)
    .in('task_id', taskIds);
  const ratedTaskIds = new Set((myReviews ?? []).map((r) => String(r.task_id)));

  const tasks = (rows ?? []).map(mapTaskRow);
  const pendingReview = tasks
    .filter((t) => t.status === 'completed' && !ratedTaskIds.has(t.id))
    .map((t) => t.id);

  return NextResponse.json({ tasks, pendingReview });
}
