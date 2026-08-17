'use client';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { UserMasterStatus } from '@/lib/types';

/**
 * Публичная репутация жителей по заданиям.
 *
 * Читается из v_resident_reputation, а НЕ из v_users_with_profile_count:
 * та вьюха идёт с security_invoker = true, и политика «user_profiles
 * self select» отдаёт читающему только его собственную строку. Из-за
 * этого каждый видел лишь свой рейтинг, а рейтинг собеседника — нет.
 *
 * Публичная вьюха содержит только безопасные поля (имя, аватар,
 * рейтинг, счётчики) — без e-mail и контактов.
 */
export interface ResidentReputation {
  rating: number;
  reviewCount: number;
  tasksDone: number;
  accountDays: number;
  /**
   * Режим работы ЧЕЛОВЕКА (тумблер в боковом меню). Применяется ко всем
   * его анкетам специалиста и виден всем зрителям, а не только владельцу.
   * undefined / 'auto' — считать по расписанию анкеты.
   */
  statusOverride?: UserMasterStatus;
}

/** Значение из БД — свободный text, поэтому сужаем до известных вариантов. */
function normalizeMasterStatus(value: unknown): UserMasterStatus | undefined {
  return value === 'active' || value === 'break' || value === 'offline' || value === 'auto'
    ? value
    : undefined;
}

export async function fetchResidentReputationMap(
  userIds: string[],
): Promise<Record<string, ResidentReputation>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0 || !supabase || !isSupabaseConfigured) return {};

  const { data, error } = await supabase
    .from('v_resident_reputation')
    .select('id, resident_rating, resident_review_count, tasks_done_count, account_days, status_override')
    .in('id', ids);
  if (error || !data) return {};

  const result: Record<string, ResidentReputation> = {};
  for (const row of data) {
    result[String(row.id)] = {
      rating: Number(row.resident_rating ?? 0),
      reviewCount: Number(row.resident_review_count ?? 0),
      tasksDone: Number(row.tasks_done_count ?? 0),
      accountDays: Number(row.account_days ?? 0),
      statusOverride: normalizeMasterStatus(row.status_override),
    };
  }
  return result;
}
