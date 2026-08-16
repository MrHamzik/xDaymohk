/**
 * Single source of truth for administrative accounts.
 * Used both client-side (UI gates) and server-side (API authorization).
 *
 * IMPORTANT: keep this list in sync with the `is_admin_email()` function
 * defined in supabase/migrations/20260101000000_init.sql. RLS policies on
 * the Supabase side use that SQL function to authorise admin writes.
 */
export const ADMIN_EMAILS = ['mr.hamzik1026@gmail.com', 'nabis95@gmail.com'].map((e) =>
  e.toLowerCase()
);

export const ADMIN_EMAIL_SET = new Set(ADMIN_EMAILS);

/**
 * «Невидимый разработчик» (владелец проекта).
 * Имеет полный админ-доступ (входит в ADMIN_EMAILS), но ВЕЗДЕ показывается
 * как обычный житель: без бейджа «Админ» (в каталоге, в админ-панели, у
 * других админов). Только он может давать/отбирать админ-права.
 * Блокировки на него «приходят» (уведомление доходит), но не действуют.
 */
export const DEV_EMAIL = 'mr.hamzik1026@gmail.com';

/** Является ли email адресом невидимого разработчика. */
export function isDevEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === DEV_EMAIL;
}

/** Настоящий админ для авторизации (включая невидимого разработчика). */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAIL_SET.has(email.trim().toLowerCase());
}

/** «Видимый» админ для интерфейса: разработчик скрыт (выглядит жителем). */
export function isVisibleAdminEmail(email: string | undefined | null): boolean {
  return isAdminEmail(email) && !isDevEmail(email);
}
