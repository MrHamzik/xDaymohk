import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { authenticateTaskRequest, taskAuthError } from '@/lib/tasks/server';
import { isPaymentMethod, moscowMonthBounds } from '@/lib/payments';
import { taskTotalReward, type TaskPriority } from '@/lib/types';

/**
 * GET /api/payout/history?month=YYYY-MM
 *
 * История отмеченных сторонами расчётов. Это НЕ платёжный документ:
 * сервис деньги не принимал и не переводил (422-ФЗ, ст. 4 ч. 2 п. 5).
 * В итог месяца входят только те строки, где расчёт отметили сами
 * (наличные — закрытие задания, перевод — «Оплата получена»).
 */

interface TaskRow {
  id: string;
  title: string;
  author_id: string;
  reward: number;
  purchase_budget: number | null;
  priority: string;
  payment_method: string | null;
  payment_received_at: string | null;
  completed_at: string | null;
  kind: string;
}

interface PartRow {
  task_id: string;
  user_id: string;
  status: string;
  bonus_percent: number | null;
  attended: boolean | null;
}

function isPriority(value: string): value is TaskPriority {
  return value === 'normal' || value === 'high' || value === 'critical';
}

function rowAmount(task: TaskRow, bonusPercent: number): number {
  const reward = Number(task.reward ?? 0);
  const budget = Number(task.purchase_budget ?? 0);
  const priority = isPriority(task.priority) ? task.priority : 'normal';
  const base = taskTotalReward(reward, priority) + Math.max(0, Math.round(budget));
  const bonus = Math.max(0, Math.min(20, Math.round(bonusPercent)));
  return Math.round(base * (1 + bonus / 100));
}

function isMarked(task: TaskRow): boolean {
  const method = isPaymentMethod(task.payment_method) ? task.payment_method : 'cash';
  if (method === 'cash') return true;
  return Boolean(task.payment_received_at);
}

function tookPart(part: PartRow): boolean {
  if (!['joined', 'attended', 'done'].includes(part.status)) return false;
  if (part.attended === false) return false;
  return true;
}

export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000, scope: 'payout-history' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, admin } = auth;

  const month = new URL(request.url).searchParams.get('month') ?? '';
  const bounds = moscowMonthBounds(month);
  if (!bounds) {
    return NextResponse.json({ error: 'Укажите месяц в формате YYYY-MM' }, { status: 400 });
  }

  const taskFields = 'id, title, author_id, reward, purchase_budget, priority, payment_method, payment_received_at, completed_at, kind';

  const { data: asAuthor, error: authorError } = await admin
    .from('tasks')
    .select(taskFields)
    .eq('author_id', userId)
    .eq('is_paid', true)
    .eq('status', 'completed')
    .gte('completed_at', bounds.from)
    .lt('completed_at', bounds.to)
    .order('completed_at', { ascending: false })
    .limit(200);

  if (authorError) {
    log.warn('payout/history author', authorError.message);
    return NextResponse.json({ error: 'Не удалось загрузить историю' }, { status: 500 });
  }

  const { data: asExecutor, error: execError } = await admin
    .from('tasks')
    .select(`${taskFields}, task_participants!inner(user_id, status, bonus_percent, attended)`)
    .eq('is_paid', true)
    .eq('status', 'completed')
    .eq('task_participants.user_id', userId)
    .in('task_participants.status', ['joined', 'attended', 'done'])
    .gte('completed_at', bounds.from)
    .lt('completed_at', bounds.to)
    .order('completed_at', { ascending: false })
    .limit(200);

  if (execError) {
    log.warn('payout/history executor', execError.message);
    return NextResponse.json({ error: 'Не удалось загрузить историю' }, { status: 500 });
  }

  const authorTasks = (asAuthor ?? []) as TaskRow[];
  const authorIds = authorTasks.map((task) => task.id);

  let authorParts: PartRow[] = [];
  if (authorIds.length > 0) {
    const { data, error } = await admin
      .from('task_participants')
      .select('task_id, user_id, status, bonus_percent, attended')
      .in('task_id', authorIds)
      .in('status', ['joined', 'attended', 'done']);
    if (error) {
      log.warn('payout/history parts', error.message);
      return NextResponse.json({ error: 'Не удалось загрузить историю' }, { status: 500 });
    }
    authorParts = (data ?? []) as PartRow[];
  }

  const counterpartIds = new Set<string>();
  for (const part of authorParts) {
    if (part.user_id !== userId) counterpartIds.add(part.user_id);
  }

  type ExecJoin = TaskRow & { task_participants: PartRow[] | PartRow };
  const execRows = (asExecutor ?? []) as ExecJoin[];
  for (const task of execRows) {
    if (task.author_id && task.author_id !== userId) counterpartIds.add(task.author_id);
  }

  const names = new Map<string, string>();
  const idList = [...counterpartIds];
  if (idList.length > 0) {
    const { data } = await admin
      .from('user_profiles')
      .select('id, full_name')
      .in('id', idList);
    for (const row of data ?? []) {
      names.set(String(row.id), String(row.full_name || '').trim());
    }
  }

  const items: Array<{
    id: string;
    taskId: string;
    title: string;
    role: 'customer' | 'executor';
    counterpartId: string;
    counterpartName: string;
    amount: number;
    method: string;
    completedAt: string;
    marked: boolean;
  }> = [];

  const seen = new Set<string>();

  for (const task of authorTasks) {
    const parts = authorParts.filter((part) => part.task_id === task.id && tookPart(part));
    for (const part of parts) {
      if (part.user_id === userId) continue;
      const key = `${task.id}:${part.user_id}:customer`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: key,
        taskId: task.id,
        title: String(task.title ?? ''),
        role: 'customer',
        counterpartId: part.user_id,
        counterpartName: names.get(part.user_id) || '',
        amount: rowAmount(task, Number(part.bonus_percent ?? 0)),
        method: isPaymentMethod(task.payment_method) ? task.payment_method : 'cash',
        completedAt: task.completed_at ?? '',
        marked: isMarked(task),
      });
    }
  }

  for (const task of execRows) {
    if (task.author_id === userId) continue;
    const parts = Array.isArray(task.task_participants)
      ? task.task_participants
      : task.task_participants
        ? [task.task_participants]
        : [];
    const mine = parts.find((part) => part.user_id === userId && tookPart(part));
    if (!mine) continue;
    const key = `${task.id}:${userId}:executor`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: key,
      taskId: task.id,
      title: String(task.title ?? ''),
      role: 'executor',
      counterpartId: task.author_id,
      counterpartName: names.get(task.author_id) || '',
      amount: rowAmount(task, Number(mine.bonus_percent ?? 0)),
      method: isPaymentMethod(task.payment_method) ? task.payment_method : 'cash',
      completedAt: task.completed_at ?? '',
      marked: isMarked(task),
    });
  }

  items.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

  let received = 0;
  let paid = 0;
  let unmarked = 0;
  for (const item of items) {
    if (!item.marked) {
      unmarked += item.amount;
      continue;
    }
    if (item.role === 'executor') received += item.amount;
    else paid += item.amount;
  }

  return NextResponse.json({
    month,
    received,
    paid,
    unmarked,
    items,
  });
}
