import type { PaymentMethod } from '@/lib/payments';
'use client';

/**
 * Клиентский слой раздела заданий: обёртки над /api/tasks.
 *
 * Каждый изменяющий запрос идёт с Bearer-токеном текущей сессии —
 * сервер берёт из него автора/исполнителя и не доверяет телу запроса.
 */

import { supabase } from '@/lib/supabase';
import type { Task, TaskParticipant, ResidentReview, AppFilter } from '@/lib/types';

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) throw new Error('Supabase не настроен — войдите снова.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Сессия истекла — войдите снова.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/** Единый разбор ответа: вытаскиваем текст ошибки от API, а не «500». */
async function parse<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // тело может быть пустым — не критично
  }
  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error;
    throw new Error(message || 'Не удалось выполнить запрос');
  }
  return payload as T;
}

export interface TaskListFilters {
  paid?: boolean;
  kind?: 'urgent' | 'scheduled';
  category?: string;
  authorId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function fetchTasks(filters: TaskListFilters = {}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters.paid !== undefined) params.set('paid', filters.paid ? '1' : '0');
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.category) params.set('category', filters.category);
  if (filters.authorId) params.set('authorId', filters.authorId);
  if (filters.status) params.set('status', filters.status);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));

  const response = await fetch(`/api/tasks?${params.toString()}`, { cache: 'no-store' });
  const data = await parse<{ tasks: Task[] }>(response);
  return data.tasks ?? [];
}

export async function fetchTask(id: string): Promise<{ task: Task; participants: TaskParticipant[] }> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { cache: 'no-store' });
  return parse<{ task: Task; participants: TaskParticipant[] }>(response);
}

/**
 * Задания, где я исполнитель (вкладка «В работе»).
 * pendingReview — завершённые, которые я ещё не оценил: по ним в
 * интерфейсе горит жёлтая метка «ожидает оценки».
 */
export async function fetchMyTasks(): Promise<{
  tasks: Task[];
  pendingReview: string[];
  /** Задания, где условия изменились и ждут моего согласия. */
  needsConsent: string[];
}> {
  const response = await fetch('/api/tasks/mine', {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  const data = await parse<{
    tasks: Task[]; pendingReview: string[]; needsConsent?: string[];
  }>(response);
  return { ...data, needsConsent: data.needsConsent ?? [] };
}

export interface CreateTaskInput {
  isPaid: boolean;
  kind: 'urgent' | 'scheduled';
  title: string;
  description: string;
  category: string;
  reward: number;
  purchaseBudget: number;
  priority: 'normal' | 'high' | 'critical';
  slots: number;
  deadlineAt?: string | null;
  scheduledAt?: string | null;
  address: string;
  lat?: number | null;
  lng?: number | null;
  minRating: number;
  minAccountDays: number;
  minTasksDone: number;
  allowNewcomers: boolean;
  /** Как заказчик рассчитается: наличные, СБП, карта, ЮMoney. */
  paymentMethod: PaymentMethod;
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  const data = await parse<{ id: string }>(response);
  return data.id;
}

/**
 * Правка задания. Доступна автору, пока задание открыто и по нему нет
 * одобренного исполнителя — сервер проверяет это же условие.
 */
export async function updateTask(
  taskId: string,
  input: Omit<CreateTaskInput, 'isPaid' | 'kind'>,
): Promise<void> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  await parse(response);
}

export type TaskAction =
  | 'take' | 'join' | 'leave' | 'exclude'
  // 'accept' — исполнитель принимает изменённые условия (обновление 42).
  | 'accept'
  // Одобрение исполнителя заказчиком на платных заданиях (обновление 27).
  | 'approve' | 'decline'
  // 'paid' — отметка ИСПОЛНИТЕЛЯ «Оплата получена»: без неё заказчик
  // не может подтвердить задание с переводом (обновление 38).
  | 'submit' | 'paid' | 'confirm' | 'reject' | 'cancel' | 'attend';

export interface TaskActionPayload {
  userId?: string;
  reason?: string;
  attendance?: Array<{ userId: string; attended: boolean; bonusPercent: number }>;
}

export async function runTaskAction(
  taskId: string,
  action: TaskAction,
  payload: TaskActionPayload = {},
): Promise<void> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action, ...payload }),
  });
  await parse(response);
}

/** Удалить своё задание (мягко: уходит в архив, история сохраняется). */
export async function deleteTask(taskId: string): Promise<void> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await parse(response);
}

export async function fetchExecutorStatus(): Promise<{
  isActive: boolean;
  activeUntil: string | null;
  activeExecutors: number;
}> {
  const response = await fetch('/api/tasks/status', {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return parse(response);
}

export async function setExecutorStatus(isActive: boolean): Promise<void> {
  const response = await fetch('/api/tasks/status', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ isActive }),
  });
  await parse(response);
}

export async function fetchResidentReviews(userId: string): Promise<ResidentReview[]> {
  const response = await fetch(`/api/tasks/reviews?userId=${encodeURIComponent(userId)}`, {
    cache: 'no-store',
  });
  const data = await parse<{ reviews: ResidentReview[] }>(response);
  return data.reviews ?? [];
}

export async function submitResidentReview(input: {
  taskId: string;
  targetId: string;
  rating: number;
  text: string;
}): Promise<void> {
  const response = await fetch('/api/tasks/reviews', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  await parse(response);
}

export async function fetchTaskFilters(scope: 'tasks' | 'catalog' | 'map' = 'tasks'): Promise<AppFilter[]> {
  const response = await fetch(`/api/tasks/filters?scope=${scope}`, { cache: 'no-store' });
  const data = await parse<{ filters: AppFilter[] }>(response);
  return data.filters ?? [];
}

/**
 * Тихий запуск обслуживания (автоподтверждение через 3 ч, просрочка).
 * Вызывается при открытии раздела — как «Письма» в админке. Ошибки
 * глушим: это фоновая задача, пользователю о ней знать незачем.
 */
export async function runTaskMaintenance(): Promise<void> {
  try {
    // Таймаут обязателен: раздел ждёт эту уборку перед загрузкой
    // ленты, и зависший запрос повесил бы пустой экран. Три секунды —
    // с запасом на обычный прогон; если не успели, лента покажется
    // как есть, а уборку доделает pg_cron.
    await fetch('/api/tasks/maintenance', {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // намеренно тихо
  }
}

/**
 * Расстояние между точками по формуле гаверсинуса, метры.
 * Нужно для вкладки «Близко» (1 км от текущей позиции).
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** «через 2 ч 15 мин» / «просрочено» — подпись дедлайна на карточке. */
/**
 * Подписи единиц времени. Функция чистая и вызывается вне React, поэтому
 * язык приходит параметром, а не из useI18n: иначе пришлось бы тянуть
 * хук в утилиту и терять возможность звать её из тестов.
 */
export interface TimeLeftLabels {
  overdue: string;
  min: string;
  hour: string;
  day: string;
}

const RU_TIME_LABELS: TimeLeftLabels = {
  overdue: 'просрочено',
  min: 'мин',
  hour: 'ч',
  day: 'дн',
};

/**
 * Дата и время начала для заданий «на дату».
 *
 * Обратный отсчёт («через 3 дня») там бесполезен: исполнителю нужен
 * конкретный день и час, чтобы прийти вовремя. Время местное —
 * Europe/Moscow, село живёт по нему.
 */
export function formatTaskDateTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatTimeLeft(
  iso?: string | null,
  labels: TimeLeftLabels = RU_TIME_LABELS,
): string {
  if (!iso) return '';
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return '';
  const diff = target - Date.now();
  if (diff <= 0) return labels.overdue;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} ${labels.min}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} ${labels.hour} ${rest} ${labels.min}` : `${hours} ${labels.hour}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${labels.day}`;
}
