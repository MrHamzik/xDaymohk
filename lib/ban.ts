/**
 * Помощники для отображения временной блокировки аккаунта.
 * bannedUntil — ISO-строка из auth.users.app_metadata.banned_until
 * (устанавливается /api/admin/ban).
 */

export function banRemainingMs(bannedUntil?: string | null, now = Date.now()): number {
  if (!bannedUntil) return 0;
  const until = new Date(bannedUntil).getTime();
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - now);
}

/** «Осталось 3 ч 25 мин» / «Осталось 5 мин»; null — блокировка не активна. */
export function banRemainingLabel(
  bannedUntil?: string | null,
  language: 'ru' | 'ce' = 'ru',
  now = Date.now(),
): string | null {
  const ms = banRemainingMs(bannedUntil, now);
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (language === 'ce') {
    return hours > 0
      ? `Билсена яьлла: ${hours} сахьт, ${minutes} минот`
      : `Билсена яьлла: ${Math.max(1, minutes)} минот`;
  }
  return hours > 0
    ? `Осталось ${hours} ч ${minutes} мин`
    : `Осталось ${Math.max(1, minutes)} мин`;
}
