import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Серверная проверка чёрного списка.
 *
 * Одно место истины для всех эндпоинтов: скрыть анкету на клиенте
 * недостаточно — заблокированный может отправить запрос напрямую, минуя
 * интерфейс. Отзывы, вопросы, комментарии и отклики на задания обязаны
 * проверять это на сервере.
 *
 * Проверка ВЗАИМНАЯ: неважно, кто кого заблокировал — писать нельзя
 * в обе стороны.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function areUsersBlocked(
  admin: SupabaseClient<any, any, any>,
  a?: string | null,
  b?: string | null,
): Promise<boolean> {
  if (!a || !b || a === b) return false;
  try {
    const { data, error } = await admin
      .from('blocked_users')
      .select('blocker_id')
      .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
      .limit(1);
    if (error) {
      // Таблицы ещё нет (миграция 32 не применена) — не блокируем
      // обычную работу приложения из-за отсутствующей функции.
      return false;
    }
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Сообщение, одинаковое во всех эндпоинтах. */
export const BLOCKED_MESSAGE = 'Действие недоступно: пользователь ограничил взаимодействие.';
