/**
 * Серверные помощники раздела заданий: аутентификация, проверка допуска
 * исполнителя, уведомления, работа с «протухающим» статусом активности.
 *
 * Всё, что здесь, выполняется ТОЛЬКО на сервере под service-role ключом.
 * Клиенту нельзя доверять ни рейтинг, ни возраст аккаунта, ни счётчики —
 * они читаются из БД по проверенному JWT.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { TASK_MIN_EXECUTOR_AGE, TASK_MAX_ACTIVE_PER_USER, type NotificationType } from '@/lib/types';
import { notificationGroup } from '@/lib/settings/types';
import { calculateAge } from '@/lib/text';
import { log } from '@/lib/logger';

/** Сколько «Активен» держится без действий пользователя. */
export const EXECUTOR_ACTIVE_MINUTES = 30;

export interface TaskAuthContext {
  userId: string;
  email: string;
  admin: SupabaseClient;
}

/**
 * Проверяет Bearer-токен и возвращает service-role клиент.
 * author_id / user_id ВСЕГДА берём отсюда, а не из тела запроса —
 * иначе можно было бы подделать автора.
 */
export async function authenticateTaskRequest(
  request: Request,
): Promise<TaskAuthContext | { error: string; status: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: 'Supabase not configured', status: 503 };
  }

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return { error: 'Сессия не найдена', status: 401 };

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.getUser(accessToken);
  if (error || !data.user?.email) return { error: 'Сессия недействительна', status: 401 };

  const bannedUntilRaw = data.user.app_metadata?.banned_until;
  if (bannedUntilRaw) {
    const bannedUntil = new Date(String(bannedUntilRaw));
    if (Number.isFinite(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now()) {
      return { error: 'Ваш аккаунт временно заблокирован', status: 403 };
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { userId: data.user.id, email: data.user.email, admin };
}

export function taskAuthError(result: { error: string; status: number }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export interface ExecutorProfile {
  id: string;
  resident_rating: number;
  tasks_done_count: number;
  tasks_blocked_until: string | null;
  is_blocked: boolean;
  birth_date: string | null;
  created_at: string;
}

/** Возраст аккаунта в днях — одно из требований заказчика. */
export function accountDays(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

export interface EligibilityCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Может ли пользователь взять это задание.
 *
 * Порядок проверок — от «блокирующих» к «мягким», чтобы сообщение было
 * самым точным. Все данные берутся из БД, не из клиента.
 */
export function checkExecutorEligibility(
  profile: ExecutorProfile,
  task: {
    author_id: string;
    is_paid: boolean;
    min_rating: number;
    min_account_days: number;
    min_tasks_done: number;
    allow_newcomers: boolean;
  },
  activeTaskCount: number,
): EligibilityCheck {
  if (profile.is_blocked) {
    return { ok: false, reason: 'Ваш аккаунт заблокирован' };
  }
  if (profile.id === task.author_id) {
    return { ok: false, reason: 'Нельзя взять собственное задание' };
  }

  // Оплачиваемая подработка — с 14 лет (422-ФЗ / ТК РФ). Безвозмездная
  // помощь в «ГIончалла» доступна всем.
  if (task.is_paid) {
    const age = calculateAge(profile.birth_date);
    if (age === null) {
      return {
        ok: false,
        reason: 'Укажите дату рождения в профиле — оплачиваемые задания доступны с 14 лет',
      };
    }
    if (age < TASK_MIN_EXECUTOR_AGE) {
      return {
        ok: false,
        reason: `Оплачиваемые задания доступны с ${TASK_MIN_EXECUTOR_AGE} лет. Помогать можно в разделе «ГIончалла»`,
      };
    }
  }

  if (activeTaskCount >= TASK_MAX_ACTIVE_PER_USER) {
    return {
      ok: false,
      reason: `Нельзя вести больше ${TASK_MAX_ACTIVE_PER_USER} заданий одновременно`,
    };
  }

  // Новичок — тот, кто ещё ничего не выполнил. Если заказчик разрешил
  // новичков, пороги рейтинга/стажа к нему не применяются: иначе человек
  // с нулём никогда бы не начал.
  const isNewcomer = Number(profile.tasks_done_count ?? 0) === 0;
  if (isNewcomer) {
    if (!task.allow_newcomers) {
      return { ok: false, reason: 'Заказчик не принимает новичков на это задание' };
    }
    return { ok: true };
  }

  const rating = Number(profile.resident_rating ?? 0);
  if (rating < Number(task.min_rating ?? 0)) {
    return { ok: false, reason: `Требуется рейтинг не ниже ${task.min_rating}` };
  }
  if (accountDays(profile.created_at) < Number(task.min_account_days ?? 0)) {
    return { ok: false, reason: `Требуется аккаунт старше ${task.min_account_days} дн.` };
  }
  if (Number(profile.tasks_done_count ?? 0) < Number(task.min_tasks_done ?? 0)) {
    return { ok: false, reason: `Требуется выполненных заданий: ${task.min_tasks_done}` };
  }

  return { ok: true };
}

/** Сколько заданий пользователь уже ведёт (для лимита в 5). */
export async function countActiveTasks(admin: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('task_participants')
    .select('id, tasks!inner(status)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['joined', 'attended'])
    .in('tasks.status', ['open', 'in_progress', 'awaiting_confirm']);

  if (error) {
    log.warn('countActiveTasks failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

/** Не заблокирован ли пользователь за неподтверждение оплаты. */
export function isTaskCreationBlocked(blockedUntil: string | null): boolean {
  if (!blockedUntil) return false;
  const until = new Date(blockedUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

interface NotifyInput {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  titleCe?: string;
  messageCe?: string;
}

/**
 * Уведомление под service-role. Ошибка доставки НЕ роняет основную
 * операцию: задание важнее, чем запись в колокольчике.
 *
 * Уважает настройки получателя (обновление 28): если человек отключил
 * группу «Задания», запись вообще не создаётся. Фильтровать на клиенте
 * было нельзя — БД копила бы невидимый мусор, а счётчик непрочитанных
 * показывал бы то, чего пользователь никогда не увидит.
 */
export async function notifyTaskEvent(admin: SupabaseClient, input: NotifyInput): Promise<void> {
  try {
    // Группу берём из типа. Ошибку чтения настроек трактуем как
    // «показывать»: молчащее уведомление хуже лишнего.
    const group = notificationGroup(input.type as NotificationType);
    const { data: allowed, error: prefError } = await admin
      .rpc('notifications_enabled', { target: input.recipientId, group_key: group });
    if (!prefError && allowed === false) return;

    const id = `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await admin.from('notifications').insert({
      id,
      recipient_id: input.recipientId,
      type: input.type,
      title: input.title,
      title_ce: input.titleCe ?? null,
      message: input.message,
      message_ce: input.messageCe ?? null,
      sender: 'Даймохк',
    });
    if (error) log.warn('notifyTaskEvent failed:', error.message);
  } catch (e) {
    log.warn('notifyTaskEvent threw:', String(e));
  }
}

/**
 * Продлевает «Активен» скользящим окном: любое действие в разделе
 * отодвигает active_until. Так не нужен фоновый процесс — протухшая
 * активность просто не проходит фильтр at-read-time.
 */
export async function touchExecutorActivity(admin: SupabaseClient, userId: string): Promise<void> {
  try {
    const activeUntil = new Date(Date.now() + EXECUTOR_ACTIVE_MINUTES * 60_000).toISOString();
    const { data } = await admin
      .from('executor_status')
      .select('is_active, active_until')
      .eq('user_id', userId)
      .maybeSingle();
    // Продлеваем только ДЕЙСТВУЮЩУЮ активность. Раньше проверялся
    // лишь флаг is_active, а он остаётся true и после истечения срока:
    // человек включался вчера, сегодня заходил — и любое действие
    // молча воскрешало статус. Теперь протухший статус так и остаётся
    // выключенным, пока пользователь не включит его сам.
    if (!isExecutorActive(data)) return;
    await admin
      .from('executor_status')
      .update({ active_until: activeUntil })
      .eq('user_id', userId);
  } catch (e) {
    log.warn('touchExecutorActivity failed:', String(e));
  }
}

/** Активен ли исполнитель прямо сейчас (с учётом протухания). */
export function isExecutorActive(row: { is_active?: boolean; active_until?: string | null } | null): boolean {
  if (!row?.is_active) return false;
  if (!row.active_until) return false;
  const until = new Date(row.active_until).getTime();
  return Number.isFinite(until) && until > Date.now();
}

/** Генератор id в стиле проекта (`task-…`, `tp-…`, `rr-…`). */
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
