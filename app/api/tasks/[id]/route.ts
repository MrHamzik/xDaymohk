import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { areUsersBlocked, BLOCKED_MESSAGE } from '@/lib/blacklist';
import {
  canAcceptPayment, isPaymentMethod, payoutFieldFor, type PaymentMethod,
} from '@/lib/payments';

/** Ответ, когда у исполнителя нет реквизитов под способ оплаты. */
const PAYOUT_REQUIRED_MESSAGE =
  'Заказчик платит переводом. Заполните реквизиты в настройках, чтобы взять это задание.';
import { isAdminEmail } from '@/lib/admin';
import { log } from '@/lib/logger';
import {
  authenticateTaskRequest,
  taskAuthError,
  checkExecutorEligibility,
  countActiveTasks,
  notifyTaskEvent,
  buildMeetingLine,
  touchExecutorActivity,
  isExecutorActive,
  makeId,
  type ExecutorProfile,
} from '@/lib/tasks/server';
import {
  TASK_AUTO_CONFIRM_HOURS, TASK_CANCELLED_VISIBLE_DAYS, TASK_DISPUTE_HOURS,
  TASK_MIN_REWARD,
} from '@/lib/types';
import { checkTaskContent, moderationMessage } from '@/lib/tasks/moderation';
import { mapTaskRow } from '@/lib/tasks/map';

/**
 * Действия над заданием. Все переходы статусов только здесь, на сервере:
 * клиент присылает намерение, права и текущий статус проверяются по БД.
 *
 * POST /api/tasks/:id { action }
 *   take     — взять срочное задание (на платных — заявка на одобрение)
 *   join     — записаться на запланированное
 *   leave    — отказаться от записи
 *   approve  — заказчик одобряет заявку (только платные задания)
 *   decline  — заказчик отклоняет заявку, задание снова открыто
 *   exclude  — заказчик исключает участника (обратно не записаться)
 *   submit   — исполнитель нажал «Выполнил» (пошли 3 часа)
 *   paid     — исполнитель отметил «Оплата получена» (открывает confirm)
 *   confirm  — заказчик подтвердил (сделка закрыта)
 *   reject   — заказчик не принял (спор: 24 часа на разбор)
 *   cancel   — отмена задания
 *   attend   — отметка явки + бонус на запланированном
 */

type Action =
  | 'take' | 'join' | 'leave' | 'approve' | 'decline' | 'exclude'
  | 'submit' | 'paid' | 'confirm' | 'reject' | 'cancel' | 'attend';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Идёт ли по заданию спор, который запрещает отмену и удаление. */
function isDisputeActive(task: any): boolean {
  if (String(task?.status) !== 'disputed') return false;
  const until = task?.dispute_until ? Date.parse(task.dispute_until) : 0;
  // Срок истёк, а фоновая задача ещё не отработала — считаем свободным.
  return Boolean(until && until > Date.now());
}

/** Понятное объяснение, почему действие недоступно. */
function disputeBlockMessage(task: any): string {
  const until = task?.dispute_until ? new Date(task.dispute_until) : null;
  const when = until
    ? until.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '';
  return when
    ? `Идёт рассмотрение спора до ${when}. Отменить или удалить задание можно после этого срока.`
    : 'Идёт рассмотрение спора — отменить или удалить задание пока нельзя.';
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Требуется ли отметка исполнителя «Оплата получена», чтобы заказчик мог
 * подтвердить задание.
 *
 * Только для ПЛАТНЫХ заданий с ПЕРЕВОДОМ. На наличных деньги передаются
 * из рук в руки при встрече: там второй клик ничего не доказывает, зато
 * вешает задание, если исполнитель уже ушёл. В «ГIончалла» денег нет
 * вовсе.
 */
function needsPaymentProof(task: any): boolean {
  if (!task?.is_paid) return false;
  const method = String(task?.payment_method ?? 'cash');
  return method !== 'cash';
}

/**
 * Снята ли блокировка «Подтвердить».
 *
 * Открывает кнопку одно из двух:
 *   • исполнитель отметил получение денег (payment_received_at);
 *   • истекло окно автоподтверждения (3 ч с «Выполнил») — страховка от
 *     исполнителя, который пропал и отметку так и не поставил. Без неё
 *     задание зависло бы навсегда, а заказчик получил бы блокировку на
 *     создание новых за чужое бездействие.
 */
function canConfirmTask(task: any): boolean {
  if (!needsPaymentProof(task)) return true;
  if (task?.payment_received_at) return true;
  const submitted = task?.submitted_at ? Date.parse(task.submitted_at) : 0;
  if (!submitted) return false;
  return Date.now() - submitted >= TASK_AUTO_CONFIRM_HOURS * 3600_000;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ACTIONS: Action[] = [
  'take', 'join', 'leave', 'approve', 'decline', 'exclude',
  'submit', 'paid', 'confirm', 'reject', 'cancel', 'attend',
];

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

  // v_task_details, а не v_tasks_feed: лента скрывает архивные, но
  // карточку завершённого задания открывать нужно — по нему стороны
  // ставят взаимные оценки.
  const { data: task, error } = await client
    .from('v_task_details')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    log.warn('task read failed:', error.message);
    return NextResponse.json({ error: 'Не удалось загрузить задание' }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });

  // ВАЖНО: приводим строку вьюхи к camelCase тем же маппером, что и лента.
  // Без него наружу уходили author_name / author_avatar_url, а компонент
  // читает authorName / authorAvatarUrl — поэтому в открытой карточке
  // показывались запасные «Житель Даймохк» и иконка приложения.
  const mappedTask = mapTaskRow(task as Record<string, unknown>);

  // Читаем через вьюху: прямой JOIN к user_profiles от анонимного
  // клиента режет политика «user_profiles self select» (видна только
  // своя строка), поэтому имена исполнителей не приходили.
  const { data: participants } = await client
    .from('v_task_participants')
    .select('*')
    .eq('task_id', id)
    .order('joined_at', { ascending: true });

  return NextResponse.json({
    task: mappedTask,
    participants: (participants ?? []).map((p) => ({
      id: p.id,
      taskId: p.task_id,
      userId: p.user_id,
      status: p.status,
      attended: p.attended,
      bonusPercent: p.bonus_percent,
      joinedAt: p.joined_at,
      excludedAt: p.excluded_at,
      approvedAt: p.approved_at,
      fullName: p.full_name ?? '',
      avatarUrl: p.avatar_url ?? '',
      rating: Number(p.rating ?? 0),
      tasksDoneCount: Number(p.tasks_done_count ?? 0),
      accountDays: Number(p.account_days ?? 0),
    })),
  });
}

/**
 * DELETE /api/tasks/:id — удалить своё задание.
 *
 * Пользователь ожидает, что «удалить» убирает задание из всех списков.
 * Физически строку не стираем: на неё ссылаются участники, отзывы
 * (resident_reviews.task_id) и разбор жалоб. Поэтому помечаем
 * cancelled + is_archived — из ленты и «моих» задание исчезает, а
 * история и рейтинги остаются целыми.
 *
 * Разрешено автору и админу. Задание, по которому уже идёт работа,
 * удалить нельзя — сначала отмена (исполнитель должен узнать причину).
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000, scope: 'task-delete' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const { id } = await context.params;
  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, email, admin } = auth;
  const isAdmin = isAdminEmail(email);

  const { data: task, error } = await admin
    .from('tasks')
    .select('id, author_id, status, title, dispute_until')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    log.warn('task delete: read failed:', error.message);
    return NextResponse.json({ error: 'Не удалось загрузить задание' }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });


  if (String(task.author_id) !== userId && !isAdmin) {
    return NextResponse.json({ error: 'Можно удалять только свои задания' }, { status: 403 });
  }

  // Если кто-то уже взялся — требуем отмену, чтобы он получил уведомление.
  const { count: activeCount } = await admin
    .from('task_participants')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', id)
    .in('status', ['joined', 'attended']);
  if ((activeCount ?? 0) > 0 && !isAdmin) {
    return NextResponse.json(
      { error: 'Задание уже взято — сначала отмените его, исполнитель получит уведомление' },
      { status: 409 },
    );
  }

  // Спор идёт — удалять нельзя по той же причине, что и отменять.
  if (isDisputeActive(task) && !isAdmin) {
    return NextResponse.json({ error: disputeBlockMessage(task) }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from('tasks')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'Удалено автором',
      is_archived: true,
    })
    .eq('id', id);
  if (updateError) {
    log.warn('task delete failed:', updateError.message);
    return NextResponse.json({ error: 'Не удалось удалить задание' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/* ---------------------------------------------------------------------------
   Ограничения полей — те же, что при создании (app/api/tasks/route.ts).
   Держим списком здесь, а не импортом: роут-файлы Next.js разрешают
   экспортировать только обработчики, поэтому вынести константы в общий
   модуль без отдельного файла нельзя.
--------------------------------------------------------------------------- */
const EDIT_TITLE_MAX = 120;
const EDIT_DESCRIPTION_MAX = 2000;
const EDIT_ADDRESS_MAX = 300;
const EDIT_REWARD_MAX = 1_000_000;
const EDIT_SLOTS_MAX = 100;
const EDIT_MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * PATCH /api/tasks/:id — правка задания.
 *
 * Когда можно править
 * -------------------
 * Пока задание ОТКРЫТО и по нему нет одобренного исполнителя. После
 * одобрения человек уже рассчитывает на конкретные условия:менять ему
 * награду, адрес или срок задним числом нельзя — это то же самое, что
 * переписать договор после рукопожатия. Заявки на рассмотрении
 * (pending) правку не блокируют: заказчик ещё никого не выбрал, а
 * откликнувшийся увидит новые условия до одобрения.
 *
 * Что менять НЕЛЬЗЯ даже до одобрения
 * -----------------------------------
 *   • is_paid — раздел задания («Аренца Темщик» ↔ «ГIончалла»);
 *   • kind — срочное ↔ на дату: от него зависит весь сценарий закрытия.
 * Для этого проще удалить задание и создать заново — оно ещё никем не
 * взято, потерь нет.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000, scope: 'task-edit' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
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

  const { data: task, error: readError } = await admin
    .from('tasks')
    .select('id, author_id, status, is_paid, kind, title')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    log.warn('task edit: read failed:', readError.message);
    return NextResponse.json({ error: 'Не удалось загрузить задание' }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });

  if (String(task.author_id) !== userId && !isAdmin) {
    return NextResponse.json({ error: 'Можно менять только свои задания' }, { status: 403 });
  }

  if (String(task.status) !== 'open' && !isAdmin) {
    return NextResponse.json(
      { error: 'Менять можно только открытое задание' },
      { status: 409 },
    );
  }

  // Ключевая проверка: одобренный исполнитель закрывает правку.
  const { count: approvedCount } = await admin
    .from('task_participants')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', id)
    .in('status', ['joined', 'attended', 'done']);
  if ((approvedCount ?? 0) > 0 && !isAdmin) {
    return NextResponse.json(
      {
        error: 'Исполнитель уже одобрен — условия менять нельзя. '
          + 'Отмените задание, если договорённости изменились.',
      },
      { status: 409 },
    );
  }

  const isPaid = Boolean(task.is_paid);
  const kind = String(task.kind);

  const title = String(body.title ?? '').trim().slice(0, EDIT_TITLE_MAX);
  const description = String(body.description ?? '').trim().slice(0, EDIT_DESCRIPTION_MAX);
  const address = String(body.address ?? '').trim().slice(0, EDIT_ADDRESS_MAX);
  const category = String(body.category ?? 'other').trim().slice(0, 50) || 'other';

  if (title.length < 3) {
    return NextResponse.json(
      { error: 'Опишите задание в заголовке (минимум 3 символа)' },
      { status: 400 },
    );
  }

  // Стоп-лист: правка не должна быть лазейкой мимо модерации.
  const moderation = checkTaskContent(title, description);
  if (!moderation.allowed) {
    return NextResponse.json({ error: moderationMessage(moderation.category!) }, { status: 422 });
  }

  const reward = Math.floor(Number(body.reward) || 0);
  if (!Number.isFinite(reward) || reward < 0 || reward > EDIT_REWARD_MAX) {
    return NextResponse.json({ error: 'Некорректная награда' }, { status: 400 });
  }
  if (isPaid && reward < TASK_MIN_REWARD) {
    return NextResponse.json(
      { error: `Минимальная награда — ${TASK_MIN_REWARD} ₽` },
      { status: 400 },
    );
  }
  if (!isPaid && reward !== 0) {
    return NextResponse.json({ error: 'В «ГIончалла» задания без оплаты' }, { status: 400 });
  }

  const purchaseBudget = Math.floor(Number(body.purchaseBudget) || 0);
  if (!Number.isFinite(purchaseBudget) || purchaseBudget < 0 || purchaseBudget > EDIT_REWARD_MAX) {
    return NextResponse.json({ error: 'Некорректная сумма на закупку' }, { status: 400 });
  }
  if (purchaseBudget > 0 && !isPaid) {
    return NextResponse.json(
      { error: 'Закупка возможна только в оплачиваемых заданиях' },
      { status: 400 },
    );
  }

  const slots = Math.floor(Number(body.slots) || 1);
  if (slots < 1 || slots > EDIT_SLOTS_MAX) {
    return NextResponse.json({ error: `Мест должно быть от 1 до ${EDIT_SLOTS_MAX}` }, { status: 400 });
  }
  if (kind === 'urgent' && slots !== 1) {
    return NextResponse.json({ error: 'У срочного задания один исполнитель' }, { status: 400 });
  }

  const now = Date.now();
  const parseFutureDate = (value: unknown, field: string): string | null | { error: string } => {
    if (!value) return null;
    const time = new Date(String(value)).getTime();
    if (!Number.isFinite(time)) return { error: `Некорректная дата (${field})` };
    if (time <= now) return { error: 'Дата должна быть в будущем' };
    if (time > now + EDIT_MAX_FUTURE_MS) return { error: 'Дата слишком далеко в будущем' };
    return new Date(time).toISOString();
  };

  const deadlineRaw = parseFutureDate(body.deadlineAt, 'дедлайн');
  if (deadlineRaw && typeof deadlineRaw === 'object') {
    return NextResponse.json({ error: deadlineRaw.error }, { status: 400 });
  }
  const scheduledRaw = parseFutureDate(body.scheduledAt, 'дата работ');
  if (scheduledRaw && typeof scheduledRaw === 'object') {
    return NextResponse.json({ error: scheduledRaw.error }, { status: 400 });
  }

  const priority = ['normal', 'high', 'critical'].includes(String(body.priority))
    ? String(body.priority)
    : 'normal';

  // Способ расчёта меняем только вместе с проверкой реквизитов: иначе
  // заказчик выберет перевод, а платить будет нечем.
  const rawMethod = String(body.paymentMethod ?? 'cash');
  const paymentMethod: PaymentMethod = isPaid && isPaymentMethod(rawMethod)
    ? (rawMethod as PaymentMethod)
    : 'cash';
  if (isPaid && paymentMethod !== 'cash') {
    const { data: payout } = await admin
      .from('user_payouts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const field = payoutFieldFor(paymentMethod);
    const filled = payout?.is_enabled !== false && Boolean(field && payout?.[field]);
    if (!filled) {
      return NextResponse.json(
        { error: 'Заполните реквизиты в настройках, чтобы выбрать этот способ расчёта' },
        { status: 409 },
      );
    }
  }

  const { error: updateError } = await admin
    .from('tasks')
    .update({
      title,
      description,
      category,
      reward,
      purchase_budget: purchaseBudget,
      priority,
      slots: kind === 'scheduled' ? slots : 1,
      deadline_at: kind === 'urgent' ? (deadlineRaw as string | null) : null,
      scheduled_at: kind === 'scheduled' ? (scheduledRaw as string | null) : null,
      address,
      lat: body.lat === null || body.lat === undefined ? null : Number(body.lat),
      lng: body.lng === null || body.lng === undefined ? null : Number(body.lng),
      min_rating: Number(body.minRating) || 0,
      min_account_days: Math.floor(Number(body.minAccountDays) || 0),
      min_tasks_done: Math.floor(Number(body.minTasksDone) || 0),
      allow_newcomers: body.allowNewcomers !== false,
      payment_method: paymentMethod,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    log.warn('task edit failed:', updateError.message);
    return NextResponse.json({ error: 'Не удалось сохранить изменения' }, { status: 500 });
  }

  // Откликнувшимся сообщаем: они ждут решения по ЭТИМ условиям, и те
  // изменились до того, как заказчик кого-то выбрал.
  const { data: pending } = await admin
    .from('task_participants')
    .select('user_id')
    .eq('task_id', id)
    .eq('status', 'pending');
  for (const p of pending ?? []) {
    await notifyTaskEvent(admin, {
      recipientId: String(p.user_id),
      type: 'task_updated',
      title: 'Условия задания изменились',
      message: `«${title}» — откройте задание и проверьте новые условия.`,
      titleCe: 'ТIедилларан хьелаш хийцина',
    });
  }

  return NextResponse.json({ success: true });
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

      // Чёрный список (обновление 32): заблокированный не может взять
      // задание заказчика. Задание он и не увидит в списке, но запрос
      // можно отправить напрямую по известному id.
      if (await areUsersBlocked(admin, userId, task.author_id)) {
        return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 403 });
      }

      // Реквизиты для безналичного расчёта.
      //
      // Без них задание зависает после выполнения: заказчик готов
      // платить, а перевести некуда. Проверяем на сервере, потому что
      // кнопка на клиенте — не защита: запрос можно отправить напрямую.
      //
      // Наличные не проверяем вовсе: расчёт при встрече реквизитов не
      // требует.
      if (task.is_paid) {
        const method: PaymentMethod = isPaymentMethod(task.payment_method)
          ? task.payment_method
          : 'cash';
        const field = payoutFieldFor(method);
        if (field) {
          const { data: payoutRow } = await admin
            .from('payout_methods')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

          // is_enabled добавлен миграцией 34: на базе без неё считаем
          // согласие данным, если реквизиты заполнены.
          const payout = payoutRow ? {
            isEnabled: payoutRow.is_enabled ?? Boolean(
              payoutRow.sbp_phone || payoutRow.card_number || payoutRow.yoomoney_wallet,
            ),
            sbpPhone: payoutRow.sbp_phone ?? '',
            sbpBank: payoutRow.sbp_bank ?? '',
            cardNumber: payoutRow.card_number ?? '',
            cardBank: payoutRow.card_bank ?? '',
            yoomoneyWallet: payoutRow.yoomoney_wallet ?? '',
          } : null;

          if (!canAcceptPayment(method, payout)) {
            return NextResponse.json(
              { error: PAYOUT_REQUIRED_MESSAGE, needsPayout: method },
              { status: 409 },
            );
          }
        }
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

      // На ПЛАТНЫХ заданиях заявка сначала уходит заказчику на одобрение
      // (обновление 27): он выбирает, кому доверить работу, и может
      // отклонить до начала. В «ГIончалла» помогать может любой —
      // там заявка сразу становится участием.
      //
      // Заказчик может включить «Автоодобрение исполнителя» в настройках
      // (обновление 28) — тогда отклик принимается сразу, как раньше.
      // Настройку читаем с сервера: клиент на это влиять не должен.
      let autoApprove = false;
      if (task.is_paid) {
        const { data: authorSettings } = await admin
          .from('user_settings')
          .select('auto_approve_executor')
          .eq('user_id', String(task.author_id))
          .maybeSingle();
        autoApprove = authorSettings?.auto_approve_executor === true;
      }
      const needsApproval = Boolean(task.is_paid) && !autoApprove;

      const participantId = existing?.id ?? makeId('tp');
      const { error: upsertError } = await admin
        .from('task_participants')
        .upsert({
          id: participantId,
          task_id: id,
          user_id: userId,
          status: needsApproval ? 'pending' : 'joined',
          joined_at: new Date().toISOString(),
          excluded_at: null,
          approved_at: needsApproval ? null : new Date().toISOString(),
        }, { onConflict: 'task_id,user_id' });
      if (upsertError) {
        log.warn('task join failed:', upsertError.message);
        return NextResponse.json({ error: 'Не удалось записаться' }, { status: 500 });
      }

      // Задание уходит «в работу» только после одобрения. Пока заявка на
      // рассмотрении, оно остаётся открытым — иначе его никто другой не
      // увидит, а заказчик ещё не решил.
      if (!needsApproval && task.kind === 'urgent') {
        await admin.from('tasks').update({ status: 'in_progress' }).eq('id', id);
      }

      await notifyTaskEvent(admin, {
        recipientId: String(task.author_id),
        type: needsApproval
          ? 'task_join_request'
          : task.kind === 'urgent' ? 'task_taken' : 'task_joined',
        title: needsApproval
          ? 'Заявка на ваше задание'
          : task.kind === 'urgent' ? 'Задание взяли' : 'Новая запись на задание',
        message: needsApproval
          ? `«${task.title}» — откройте задание и одобрите исполнителя`
          : `«${task.title}»`,
        titleCe: needsApproval
          ? 'Хьан тIедилларна дехар'
          : task.kind === 'urgent' ? 'ТIедиллар схьаэцна' : 'ТIедилларна керла дIаязвар',
      });
      await touchExecutorActivity(admin, userId);

      return NextResponse.json({ success: true, pending: needsApproval });
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
      // Возвращаем задание в поиск исполнителя. Раньше условие ловило
      // только 'in_progress', поэтому после нажатия «Выполнил» (статус
      // awaiting_confirm) исключение участника оставляло задание висеть
      // в ожидании подтверждения без единого исполнителя — заказчик
      // больше не мог ни подтвердить, ни отдать задание другому.
      // submitted_at тоже сбрасываем, иначе таймер автоподтверждения
      // продолжал идти и закрыл бы задание за исключённого.
      if (task.kind === 'urgent' && ['in_progress', 'awaiting_confirm'].includes(String(task.status))) {
        await admin
          .from('tasks')
          .update({ status: 'open', submitted_at: null })
          .eq('id', id);
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
    // ---------------------------------------------------------------
    // Заказчик одобряет заявку исполнителя (только платные задания)
    // ---------------------------------------------------------------
    case 'approve': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может одобрить' }, { status: 403 });
      }
      const targetUserId = String(body.userId ?? '').trim();
      if (!targetUserId) {
        return NextResponse.json({ error: 'Не указан участник' }, { status: 400 });
      }

      const { data: candidate } = await admin
        .from('task_participants')
        .select('id, status')
        .eq('task_id', id)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (!candidate || candidate.status !== 'pending') {
        return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
      }

      // Свободные места считаем заново: пока заявка ждала, место мог
      // занять другой одобренный исполнитель.
      const { count: approved } = await admin
        .from('task_participants')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', id)
        .in('status', ['joined', 'attended', 'done']);
      if ((approved ?? 0) >= Number(task.slots ?? 1)) {
        return NextResponse.json({ error: 'Все места уже заняты' }, { status: 409 });
      }

      await admin
        .from('task_participants')
        .update({ status: 'joined', approved_at: new Date().toISOString() })
        .eq('id', candidate.id);

      if (task.kind === 'urgent' && task.status === 'open') {
        await admin.from('tasks').update({ status: 'in_progress' }).eq('id', id);
      }

      // В сообщении сразу говорим, КУДА и КОГДА. «Можно приступать» без
      // адреса и времени ничего не сообщало, а у заданий «на дату»
      // относительный отсчёт бесполезен — нужен конкретный день и час.
      const meeting = buildMeetingLine(task);
      await notifyTaskEvent(admin, {
        recipientId: targetUserId,
        type: 'task_join_approved',
        title: 'Заявка одобрена',
        message: meeting ? `«${task.title}»: ${meeting}.` : `«${task.title}»`,
        titleCe: 'Дехар тIеэцна',
      });

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Заказчик отклоняет заявку: задание снова открыто для других
    // ---------------------------------------------------------------
    case 'decline': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может отклонить заявку' }, { status: 403 });
      }
      const targetUserId = String(body.userId ?? '').trim();
      if (!targetUserId) {
        return NextResponse.json({ error: 'Не указан участник' }, { status: 400 });
      }

      const { data: candidate } = await admin
        .from('task_participants')
        .select('id, status')
        .eq('task_id', id)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (!candidate || candidate.status !== 'pending') {
        return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
      }

      // Ставим 'excluded': по требованию заказчика отклонённый не должен
      // тут же подать заявку повторно. Для остальных задание открыто.
      await admin
        .from('task_participants')
        .update({ status: 'excluded', excluded_at: new Date().toISOString() })
        .eq('id', candidate.id);

      await notifyTaskEvent(admin, {
        recipientId: targetUserId,
        type: 'task_join_rejected',
        title: 'Заявка отклонена',
        message: `«${task.title}»`,
        titleCe: 'Дехар тIе ца эцна',
      });

      return NextResponse.json({ success: true });
    }

    case 'exclude': {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json({ error: 'Только заказчик может исключать' }, { status: 403 });
      }
      const targetUserId = String(body.userId ?? '').trim();
      if (!targetUserId) {
        return NextResponse.json({ error: 'Не указан участник' }, { status: 400 });
      }

      // Исключать можно только ДО того, как исполнитель сдал работу.
      // После «Выполнил» спор решается через «Не принято» — иначе
      // заказчик мог бы забрать выполненную работу и убрать исполнителя.
      const { data: victim } = await admin
        .from('task_participants')
        .select('id, status')
        .eq('task_id', id)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (!victim) {
        return NextResponse.json({ error: 'Участник не найден' }, { status: 404 });
      }
      if (!['pending', 'joined'].includes(String(victim.status))) {
        return NextResponse.json(
          { error: 'Исполнитель уже сдал работу — используйте «Не принято»' },
          { status: 409 },
        );
      }

      const { error: excludeError } = await admin
        .from('task_participants')
        .update({ status: 'excluded', excluded_at: new Date().toISOString() })
        .eq('id', victim.id);
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
      // Запланированное задание закрывает заказчик отметкой явки —
      // «Выполнил» там не применяется. Кнопку в интерфейсе убрали, но
      // проверку дублируем: клиент менять нельзя, порядок статусов
      // должен держать сервер.
      if (task.kind === 'scheduled') {
        return NextResponse.json(
          { error: 'Задание на дату закрывает заказчик отметкой явки' },
          { status: 409 },
        );
      }
      if (String(participant?.status) === 'pending') {
        return NextResponse.json(
          { error: 'Заказчик ещё не одобрил вашу заявку' },
          { status: 409 },
        );
      }
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
    // «Оплата получена» — отметку ставит ИСПОЛНИТЕЛЬ
    //
    // Это единственный след платежа на стороне сервиса: сам он в
    // расчётах не участвует (ИП на НПД, ст. 4 ч. 2 п. 5 закона 422-ФЗ),
    // деньги идут напрямую между людьми. Отметка нужна, чтобы заказчик
    // не мог закрыть задание, не заплатив.
    // ---------------------------------------------------------------
    case 'paid': {
      const { data: participant } = await admin
        .from('task_participants')
        .select('id, status')
        .eq('task_id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!participant || !['joined', 'attended', 'done'].includes(String(participant.status))) {
        return NextResponse.json({ error: 'Вы не исполнитель этого задания' }, { status: 403 });
      }
      // Отметка имеет смысл только после сдачи работы: до этого платить
      // ещё не за что, а на закрытом задании она уже ничего не меняет.
      if (!['awaiting_confirm', 'disputed'].includes(String(task.status))) {
        return NextResponse.json(
          { error: 'Отметить оплату можно после того, как работа сдана' },
          { status: 409 },
        );
      }
      if (!needsPaymentProof(task)) {
        return NextResponse.json(
          { error: 'На этом задании расчёт наличными — отметка не нужна' },
          { status: 409 },
        );
      }
      if (task.payment_received_at) {
        // Повторный клик не ошибка: отметка уже стоит.
        return NextResponse.json({ success: true });
      }

      const { error: paidError } = await admin
        .from('tasks')
        .update({ payment_received_at: new Date().toISOString() })
        .eq('id', id);
      // Колонка появляется в миграции 38. Без неё отметку сохранить
      // некуда, но и блокировки «Подтвердить» тоже нет (см.
      // canConfirmTask) — поведение остаётся прежним, а не ломается.
      if (paidError) {
        log.warn('task paid: column missing', { message: paidError.message });
        return NextResponse.json(
          { error: 'Отметка оплаты пока недоступна: примените обновление 38' },
          { status: 503 },
        );
      }

      await notifyTaskEvent(admin, {
        recipientId: String(task.author_id),
        type: 'task_payment_received',
        title: 'Исполнитель подтвердил оплату',
        message: `«${task.title}» — теперь можно подтвердить выполнение.`,
        titleCe: 'Кхочушдийриг ахча тIеэцна ву',
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
      // Задание с ПЕРЕВОДОМ нельзя закрыть, пока исполнитель не
      // подтвердил, что деньги пришли. Иначе заказчик нажимал
      // «Подтвердить», сделка закрывалась как успешная, счётчики
      // исполнителя росли — а денег он не видел.
      //
      // Администратор исключён: он разбирает жалобы и должен уметь
      // закрыть зависшее задание вручную.
      if (!isAdmin && !canConfirmTask(task)) {
        return NextResponse.json(
          {
            error: 'Исполнитель ещё не отметил, что получил оплату. '
              + 'Переведите деньги и дождитесь его отметки.',
            needsPaymentProof: true,
          },
          { status: 409 },
        );
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

      // Задание уходит «на рассмотрение» на сутки, а не просто обратно
      // в работу. Раньше заказчик мог нажать «Не принято» и сразу
      // «Отменить» — исполнитель оставался ни с чем, и следов спора не
      // оставалось. Теперь в этом окне отмена и удаление запрещены
      // (см. cancel и DELETE), стороны договариваются или подают жалобу.
      const disputeUntil = new Date(
        Date.now() + TASK_DISPUTE_HOURS * 3600_000,
      ).toISOString();

      const { error: disputeError } = await admin
        .from('tasks')
        .update({
          status: 'disputed',
          submitted_at: null,
          dispute_until: disputeUntil,
          dispute_reason: reason || null,
        })
        .eq('id', id);

      // Колонки появляются в миграции 35: без неё возвращаемся к
      // прежнему поведению, чтобы кнопка не отказывала совсем.
      if (disputeError) {
        log.warn('task reject: dispute columns missing', { message: disputeError.message });
        await admin
          .from('tasks')
          .update({ status: 'in_progress', submitted_at: null, cancel_reason: reason || null })
          .eq('id', id);
      }

      const { data: parts } = await admin
        .from('task_participants')
        .select('user_id')
        .eq('task_id', id)
        .in('status', ['joined', 'attended']);
      for (const p of parts ?? []) {
        await notifyTaskEvent(admin, {
          recipientId: String(p.user_id),
          type: disputeError ? 'task_cancel_requested' : 'task_disputed',
          title: 'Заказчик не принял работу',
          message: reason
            ? `«${task.title}»: ${reason}`
            : `«${task.title}». У вас есть ${TASK_DISPUTE_HOURS} ч, чтобы договориться или подать жалобу.`,
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
      // Во время спора отменять нельзя: иначе «Не принято» + «Отменить»
      // подряд оставляют исполнителя ни с чем. Администратор может —
      // он и разбирает жалобы.
      const cancelBlocked = isDisputeActive(task) && !isAdmin;
      if (cancelBlocked) {
        return NextResponse.json({ error: disputeBlockMessage(task) }, { status: 409 });
      }
      const reason = String(body.reason ?? '').trim().slice(0, 500);

      // Отменённое задание НЕ прячем сразу.
      //
      // Раньше здесь стоял is_archived = true: задание мгновенно
      // выпадало из ленты у заказчика (вьюха v_tasks_feed скрывает
      // архивные), а у исполнителя продолжало висеть в «В работе» как
      // живое — он даже не понимал, что заказ отменён. Ни следа, ни
      // объяснения ни у одной стороны.
      //
      // Теперь оно остаётся видимым ОБЕИМ сторонам с пометкой
      // «Отменено» и уходит из списков через неделю (visible_until).
      // В архив его переводит обслуживание по расписанию.
      const visibleUntil = new Date(
        Date.now() + TASK_CANCELLED_VISIBLE_DAYS * 24 * 3600_000,
      ).toISOString();
      const { error: cancelError } = await admin
        .from('tasks')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason || null,
          is_archived: false,
          visible_until: visibleUntil,
        })
        .eq('id', id);

      // Колонка visible_until появляется в миграции 38. Пока её нет —
      // возвращаемся к прежнему поведению, чтобы отмена не отказывала.
      if (cancelError) {
        log.warn('task cancel: visible_until missing', { message: cancelError.message });
        await admin
          .from('tasks')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: reason || null,
            is_archived: true,
          })
          .eq('id', id);
      }

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
