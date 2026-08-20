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

export function hasPro(settings: Pick<UserSettings, 'proTier'>, need: Exclude<ProTier, 'none'>): boolean {
  return RANK[settings.proTier] >= RANK[need];
}

export function normalizeProTier(raw: unknown): ProTier {
  return isProTier(raw) ? raw : 'none';
}

/** Владелец проекта всегда на платинуме — без срока. */
export function forceOwnerPlatinum<T extends Pick<UserSettings, 'proTier'>>(
  settings: T,
  email?: string | null,
): T {
  if (!isDevEmail(email)) return settings;
  return settings.proTier === 'platinum' ? settings : { ...settings, proTier: 'platinum' };
}
