'use client';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

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
}

export async function fetchResidentReputationMap(
  userIds: string[],
): Promise<Record<string, ResidentReputation>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0 || !supabase || !isSupabaseConfigured) return {};

  const { data, error } = await supabase
    .from('v_resident_reputation')
    .select('id, resident_rating, resident_review_count, tasks_done_count, account_days')
    .in('id', ids);
  if (error || !data) return {};

  const result: Record<string, ResidentReputation> = {};
  for (const row of data) {
    result[String(row.id)] = {
      rating: Number(row.resident_rating ?? 0),
      reviewCount: Number(row.resident_review_count ?? 0),
      tasksDone: Number(row.tasks_done_count ?? 0),
      accountDays: Number(row.account_days ?? 0),
    };
  }
  return result;
}
