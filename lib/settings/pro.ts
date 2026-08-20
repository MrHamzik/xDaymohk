import type { UserSettings } from '@/lib/settings/types';
import { isDevEmail } from '@/lib/admin';

export const PRO_TIERS = ['none', 'bronze', 'silver', 'gold', 'platinum'] as const;
export type ProTier = (typeof PRO_TIERS)[number];

const RANK: Record<ProTier, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export const PRO_PRICES: Record<Exclude<ProTier, 'none'>, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
};

export const FREE_THEME_IDS = new Set(['light', 'dark']);

export function isProTier(value: unknown): value is ProTier {
  return typeof value === 'string' && (PRO_TIERS as readonly string[]).includes(value);
}

/**
 * Действующий уровень подписки с учётом срока.
 *
 * Зеркало SQL-функции effective_pro_tier из миграции 61. Истёкший
 * уровень равен 'none': проверять дату в каждом месте отдельно нельзя —
 * правило разъедется по копиям, и где-нибудь просроченная подписка
 * останется рабочей.
 *
 * null в proUntil означает БЕССРОЧНО (владелец проекта, ручная выдача).
 */
export function activeProTier(
  settings: Pick<UserSettings, 'proTier'> & Partial<Pick<UserSettings, 'proUntil'>>,
): ProTier {
  if (settings.proTier === 'none') return 'none';
  const until = settings.proUntil;
  if (!until) return settings.proTier;
  const deadline = Date.parse(until);
  // Неразбираемая дата — считаем подписку недействующей: безопаснее
  // не дать лишнего, чем раздать платное по испорченной записи.
  if (!Number.isFinite(deadline)) return 'none';
  return deadline > Date.now() ? settings.proTier : 'none';
}

/** Хватает ли уровня подписки. Истёкшая подписка не считается. */
export function hasPro(
  settings: Pick<UserSettings, 'proTier'> & Partial<Pick<UserSettings, 'proUntil'>>,
  need: Exclude<ProTier, 'none'>,
): boolean {
  return RANK[activeProTier(settings)] >= RANK[need];
}

export function normalizeProTier(raw: unknown): ProTier {
  return isProTier(raw) ? raw : 'none';
}

/**
 * Владелец проекта всегда на платинуме — без срока (п.25/32).
 *
 * Это ТОЛЬКО отображение: функция правит объект настроек в браузере,
 * чтобы интерфейс сразу показывал платиновые возможности и не ждал
 * ответа базы. Полагаться на неё как на защиту нельзя — любая проверка
 * в браузере обходится за десять секунд.
 *
 * Настоящий запрет живёт в базе: триггер guard_pro_tier
 * (supabase/update/60-pro-tier-server-guard.sql) держит владельцу
 * 'platinum' и не даёт обычному пользователю выписать себе платный
 * уровень запросом из консоли.
 */
export function forceOwnerPlatinum<
  T extends Pick<UserSettings, 'proTier'> & Partial<Pick<UserSettings, 'proUntil'>>,
>(
  settings: T,
  email?: string | null,
): T {
  if (!isDevEmail(email)) return settings;
  // Владельцу платина без срока: иначе истёкшее proUntil из старой
  // записи погасило бы его же уровень в activeProTier.
  if (settings.proTier === 'platinum' && !settings.proUntil) return settings;
  return { ...settings, proTier: 'platinum', proUntil: null };
}
