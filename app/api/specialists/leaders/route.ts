import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Специалист дня / недели / месяца.
 *
 * Считаем по отзывам за срок: средняя оценка × число отзывов.
 * Без отзывов за срок берём общий рейтинг анкеты — иначе блок
 * был бы пустым, пока кто-то не оставит отзыв сегодня.
 */

type Period = 'day' | 'week' | 'month';

interface Leader {
  id: string;
  fullName: string;
  avatarUrl: string;
  professionTitle: string;
  nickname?: string;
  showNickname?: boolean;
  isPersonal?: boolean;
  rating: number;
  reviewCount: number;
  periodReviews: number;
  periodAvg: number;
}

function moscowDate(offsetDays = 0): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const local = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return local.toISOString().slice(0, 10);
}

function score(avg: number, count: number): number {
  if (count <= 0 || avg <= 0) return 0;
  return avg * count;
}

function pick(
  rows: Array<{ profile_id: string; rating: number; created_at: string }>,
  since: string,
  profiles: Map<string, Record<string, unknown>>,
): Leader | null {
  const byProfile = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (row.created_at < since) continue;
    const current = byProfile.get(row.profile_id) ?? { sum: 0, count: 0 };
    current.sum += Number(row.rating) || 0;
    current.count += 1;
    byProfile.set(row.profile_id, current);
  }

  let bestId = '';
  let bestScore = 0;
  let bestAvg = 0;
  let bestCount = 0;
  for (const [id, stat] of byProfile) {
    if (!profiles.has(id)) continue;
    const avg = stat.count > 0 ? stat.sum / stat.count : 0;
    const next = score(avg, stat.count);
    if (next > bestScore) {
      bestScore = next;
      bestId = id;
      bestAvg = avg;
      bestCount = stat.count;
    }
  }

  if (!bestId) {
    for (const [id, profile] of profiles) {
      const next = score(Number(profile.rating) || 0, Number(profile.review_count) || 0);
      if (next > bestScore) {
        bestScore = next;
        bestId = id;
        bestAvg = Number(profile.rating) || 0;
        bestCount = 0;
      }
    }
  }

  const profile = bestId ? profiles.get(bestId) : undefined;
  if (!profile) return null;
  return {
    id: String(profile.id),
    fullName: String(profile.full_name ?? ''),
    avatarUrl: String(profile.avatar_url ?? ''),
    professionTitle: String(profile.profession_title ?? ''),
    nickname: profile.nickname ? String(profile.nickname) : undefined,
    showNickname: Boolean(profile.show_nickname),
    isPersonal: Boolean(profile.is_personal),
    rating: Number(profile.rating) || 0,
    reviewCount: Number(profile.review_count) || 0,
    periodReviews: bestCount,
    periodAvg: Number(bestAvg.toFixed(1)),
  };
}

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'specialists:leaders', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const empty = { day: null, week: null, month: null } as Record<Period, Leader | null>;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(empty);
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const monthStart = moscowDate(-29);
  const [{ data: reviewRows, error: reviewError }, { data: profileRows, error: profileError }] = await Promise.all([
    client
      .from('reviews')
      .select('profile_id, rating, created_at')
      .gte('created_at', monthStart),
    client
      .from('profiles')
      .select('id, full_name, avatar_url, profession_title, nickname, show_nickname, is_personal, rating, review_count, is_specialist, is_hidden, is_banned')
      .eq('is_specialist', true)
      .eq('is_hidden', false)
      .eq('is_banned', false),
  ]);

  if (reviewError || profileError) {
    return NextResponse.json(empty);
  }

  const profiles = new Map<string, Record<string, unknown>>();
  for (const row of profileRows ?? []) {
    profiles.set(String(row.id), row as Record<string, unknown>);
  }

  const reviews = (reviewRows ?? []) as Array<{ profile_id: string; rating: number; created_at: string }>;
  const result = {
    day: pick(reviews, moscowDate(0), profiles),
    week: pick(reviews, moscowDate(-6), profiles),
    month: pick(reviews, monthStart, profiles),
  };

  return withRateLimitHeaders(NextResponse.json(result), { ...limit, limit: 60 });
}
