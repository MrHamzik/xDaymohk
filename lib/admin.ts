/**
 * Single source of truth for administrative accounts.
 * Used both client-side (UI gates) and server-side (API authorization).
 */
export const ADMIN_EMAILS = ['mr.hamzik1026@gmail.com', 'nabis95@gmail.com'].map((e) =>
  e.toLowerCase()
);

export const ADMIN_EMAIL_SET = new Set(ADMIN_EMAILS);

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAIL_SET.has(email.trim().toLowerCase());
}
