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

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAIL_SET.has(email.trim().toLowerCase());
}
