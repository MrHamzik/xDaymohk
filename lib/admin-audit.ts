import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Журнал административных действий.
 *
 * Пишется ТОЛЬКО с сервера и только клиентом на service_role: таблица
 * admin_audit_log под RLS не имеет политик на insert, поэтому запись из
 * браузера невозможна в принципе (обновление 47).
 *
 * Запись журнала никогда не должна ломать само действие. Если админ
 * заблокировал нарушителя, а лог не записался, — блокировка обязана
 * остаться в силе. Поэтому все ошибки здесь только логируются в консоль
 * сервера и наружу не поднимаются.
 */

/** Что произошло. Строки короткие и стабильные — по ним ищут в журнале. */
export type AdminAuditAction =
  | 'user_ban'
  | 'user_unban'
  | 'role_grant'
  | 'role_revoke'
  | 'profile_hide'
  | 'profile_show'
  | 'profile_delete'
  | 'complaint_resolve';

export interface AdminAuditEntry {
  /** Кто действовал: id из user_profiles. */
  actorId: string;
  /** Почта админа — снимок на момент действия, чтобы не джойнить при чтении. */
  actorEmail: string;
  action: AdminAuditAction;
  /** Над кем. Для действий без адресата (например, правки справочника) — undefined. */
  targetUserId?: string | null;
  /** Читаемая подпись цели: имя или e-mail. Переживает удаление аккаунта. */
  targetLabel?: string;
  /** Обоснование, если админ его указал. */
  reason?: string;
  /** Подробности: срок блокировки, прежнее значение права и прочее. */
  details?: Record<string, unknown>;
}

/**
 * Записать действие в журнал.
 *
 * @param admin клиент Supabase на service_role — обычный анонимный не подойдёт.
 */
export async function writeAdminAudit(
  admin: SupabaseClient,
  entry: AdminAuditEntry,
): Promise<void> {
  try {
    const { error } = await admin.from('admin_audit_log').insert({
      actor_id: entry.actorId,
      actor_email: (entry.actorEmail ?? '').trim().toLowerCase(),
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      // Обрезаем: подпись и причина приходят из интерфейса, а значит
      // могут быть какой угодно длины.
      target_label: (entry.targetLabel ?? '').slice(0, 200),
      reason: (entry.reason ?? '').slice(0, 500),
      details: entry.details ?? {},
    });
    if (error) {
      console.warn('admin audit: не удалось записать действие', entry.action, error.message);
    }
  } catch (unexpected) {
    console.warn('admin audit: сбой записи', unexpected);
  }
}
