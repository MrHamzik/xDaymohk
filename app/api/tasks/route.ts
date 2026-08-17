import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import {
  authenticateTaskRequest,
  taskAuthError,
  isTaskCreationBlocked,
  touchExecutorActivity,
  makeId,
} from '@/lib/tasks/server';
import { checkTaskContent, moderationMessage } from '@/lib/tasks/moderation';
import { mapTaskRow } from '@/lib/tasks/map';
import { TASK_MIN_REWARD, type TaskKind, type TaskPriority } from '@/lib/types';

/** Ограничения полей — чтобы не улетело в БД что попало. */
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const ADDRESS_MAX = 300;
const REWARD_MAX = 1_000_000;
const SLOTS_MAX = 100;
/** Дедлайн дальше года — почти всегда опечатка в дате. */
const MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

const KINDS: TaskKind[] = ['urgent', 'scheduled'];
const PRIORITIES: TaskPriority[] = ['normal', 'high', 'critical'];

/**
 * GET /api/tasks — лента заданий.
 *
 * Публичный (как каталог): гость видит список, но взять задание не может.
 * Чтение идёт через вьюху v_tasks_feed — она уже отдаёт данные заказчика
 * для шапки карточки (рейтинг, возраст аккаунта, число заданий) и
 * счётчик занятых мест, без N+1 запросов с клиента.
 *
 * Параметры: ?paid=1|0 &kind= &category= &status= &authorId= &limit= &offset=
 */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000, scope: 'tasks-list' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ tasks: [] });
  }

  const url = new URL(request.url);
  const paid = url.searchParams.get('paid');
  const kind = url.searchParams.get('kind');
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  const authorId = url.searchParams.get('authorId');
  // Пагинация обязательна: без потолка лента однажды положит и клиент, и БД.
  const pageLimit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Фильтр архива теперь внутри вьюхи (см. 20-tasks-feed-fix.sql),
  // здесь дублировать не нужно.
  let query = client
    .from('v_tasks_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageLimit - 1);

  if (paid === '1') query = query.eq('is_paid', true);
  if (paid === '0') query = query.eq('is_paid', false);
  if (kind && KINDS.includes(kind as TaskKind)) query = query.eq('kind', kind);
  if (category) query = query.eq('category', category);
  if (authorId) query = query.eq('author_id', authorId);
  // По умолчанию лента — «Активные» и «В процессе»; завершённые скрыты,
  // но остаются в БД ради счётчиков, рейтинга и разбора жалоб.
  if (status) {
    query = query.in('status', status.split(',').map((s) => s.trim()).filter(Boolean));
  } else {
    query = query.in('status', ['open', 'in_progress', 'awaiting_confirm']);
  }

  const { data, error } = await query;
  if (error) {
    log.warn('tasks list failed:', error.message);
    return NextResponse.json({ error: 'Не удалось загрузить задания' }, { status: 500 });
  }

  return NextResponse.json({ tasks: (data ?? []).map(mapTaskRow) });
}

/**
 * POST /api/tasks — создать задание.
 *
 * Проверяем на сервере: авторство (из JWT), стоп-лист, блокировку за
 * неподтверждение оплаты, корректность дат и числовых диапазонов.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 20, windowMs: 60_000, scope: 'tasks-create' });
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

  const title = String(body.title ?? '').trim().slice(0, TITLE_MAX);
  const description = String(body.description ?? '').trim().slice(0, DESCRIPTION_MAX);
  const address = String(body.address ?? '').trim().slice(0, ADDRESS_MAX);
  const category = String(body.category ?? 'other').trim().slice(0, 50) || 'other';
  const isPaid = body.isPaid !== false;
  const kind: TaskKind = KINDS.includes(body.kind as TaskKind) ? (body.kind as TaskKind) : 'urgent';
  const priority: TaskPriority = PRIORITIES.includes(body.priority as TaskPriority)
    ? (body.priority as TaskPriority)
    : 'normal';

  if (title.length < 3) {
    return NextResponse.json({ error: 'Опишите задание в заголовке (минимум 3 символа)' }, { status: 400 });
  }

  // Стоп-лист: закон РФ + нормы шариата.
  const moderation = checkTaskContent(title, description);
  if (!moderation.allowed) {
    return NextResponse.json({ error: moderationMessage(moderation.category!) }, { status: 422 });
  }

  const reward = Math.floor(Number(body.reward) || 0);
  if (!Number.isFinite(reward) || reward < 0 || reward > REWARD_MAX) {
    return NextResponse.json({ error: 'Некорректная награда' }, { status: 400 });
  }
  // «Аренца Темщик» — раздел оплачиваемых заданий; без награды это ГIончалла.
  if (isPaid && reward <= 0) {
    return NextResponse.json(
      { error: 'Укажите награду или опубликуйте задание в разделе «ГIончалла»' },
      { status: 400 },
    );
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

  // Бюджет на закупку: исполнитель тратит свои деньги и получает их
  // обратно вместе с наградой. Не доход, поэтому считается отдельно.
  const purchaseBudget = Math.floor(Number(body.purchaseBudget) || 0);
  if (!Number.isFinite(purchaseBudget) || purchaseBudget < 0 || purchaseBudget > REWARD_MAX) {
    return NextResponse.json({ error: 'Некорректная сумма на закупку' }, { status: 400 });
  }
  if (purchaseBudget > 0 && !isPaid) {
    return NextResponse.json(
      { error: 'Закупка возможна только в оплачиваемых заданиях' },
      { status: 400 },
    );
  }

  const slots = Math.floor(Number(body.slots) || 1);
  if (slots < 1 || slots > SLOTS_MAX) {
    return NextResponse.json({ error: `Мест должно быть от 1 до ${SLOTS_MAX}` }, { status: 400 });
  }
  // Срочное задание — один исполнитель по определению («первый забирает»).
  if (kind === 'urgent' && slots !== 1) {
    return NextResponse.json({ error: 'У срочного задания один исполнитель' }, { status: 400 });
  }

  const now = Date.now();
  const parseFutureDate = (value: unknown, field: string): string | null | { error: string } => {
    if (!value) return null;
    const time = new Date(String(value)).getTime();
    if (!Number.isFinite(time)) return { error: `Некорректная дата (${field})` };
    if (time <= now) return { error: 'Дата должна быть в будущем' };
    if (time > now + MAX_FUTURE_MS) return { error: 'Дата слишком далеко в будущем' };
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
  const deadlineAt = deadlineRaw as string | null;
  const scheduledAt = scheduledRaw as string | null;

  // Зеркалит CHECK-ограничение tasks_kind_dates_chk, но с внятной ошибкой.
  if (kind === 'urgent' && !deadlineAt) {
    return NextResponse.json({ error: 'Укажите, до какого времени нужно выполнить' }, { status: 400 });
  }
  if (kind === 'scheduled' && !scheduledAt) {
    return NextResponse.json({ error: 'Укажите дату и время работ' }, { status: 400 });
  }

  const latRaw = body.lat === null || body.lat === undefined ? null : Number(body.lat);
  const lngRaw = body.lng === null || body.lng === undefined ? null : Number(body.lng);
  const hasCoords = latRaw !== null && lngRaw !== null;
  if (hasCoords) {
    if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)
      || Math.abs(latRaw!) > 90 || Math.abs(lngRaw!) > 180) {
      return NextResponse.json({ error: 'Некорректные координаты' }, { status: 400 });
    }
  }

  const minRating = Math.min(Math.max(Number(body.minRating) || 0, 0), 5);
  const minAccountDays = Math.min(Math.max(Math.floor(Number(body.minAccountDays) || 0), 0), 3650);
  const minTasksDone = Math.min(Math.max(Math.floor(Number(body.minTasksDone) || 0), 0), 10_000);
  const allowNewcomers = body.allowNewcomers !== false;

  // Блокировка за неподтверждение оплаты (6 часов).
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, is_blocked, tasks_blocked_until, tasks_created_count')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    log.warn('tasks create: profile read failed:', profileError.message);
    return NextResponse.json({ error: 'Не удалось проверить профиль' }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 });
  }
  if (profile.is_blocked) {
    return NextResponse.json({ error: 'Ваш аккаунт заблокирован' }, { status: 403 });
  }
  if (isTaskCreationBlocked(profile.tasks_blocked_until)) {
    const until = new Date(profile.tasks_blocked_until!);
    return NextResponse.json(
      { error: `Создание заданий заблокировано до ${until.toLocaleString('ru-RU')}` },
      { status: 403 },
    );
  }

  const id = makeId('task');
  const { data: created, error: insertError } = await admin
    .from('tasks')
    .insert({
      id,
      author_id: userId,
      is_paid: isPaid,
      kind,
      title,
      description,
      category,
      reward,
      purchase_budget: purchaseBudget,
      priority,
      slots,
      deadline_at: deadlineAt,
      scheduled_at: scheduledAt,
      address,
      lat: hasCoords ? latRaw : null,
      lng: hasCoords ? lngRaw : null,
      min_rating: minRating,
      min_account_days: minAccountDays,
      min_tasks_done: minTasksDone,
      allow_newcomers: allowNewcomers,
      status: 'open',
      payment_status: 'offline',
    })
    .select('id')
    .maybeSingle();

  if (insertError) {
    log.warn('tasks create failed:', insertError.message);
    return NextResponse.json({ error: 'Не удалось создать задание' }, { status: 500 });
  }

  // Счётчик опубликованных — он показывается в шапке карточки, по нему
  // исполнитель судит о заказчике.
  await admin
    .from('user_profiles')
    .update({ tasks_created_count: Number(profile.tasks_created_count ?? 0) + 1 })
    .eq('id', userId);

  await touchExecutorActivity(admin, userId);

  return NextResponse.json({ success: true, id: created?.id ?? id }, { status: 201 });
}
