import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * POST /api/taxi/rides/<id>/rate — взаимная оценка после поездки
 * (как в Яндексе: оба видят оценки после завершения).
 *
 *   { to: 'driver' | 'rider', stars: 1..5 }
 *
 * Ставит только участник завершённой поездки; одна строка на поездку
 * (upsert по ride_id). Оценка пассажира пересчитывает рейтинг
 * таксиста триггером БД.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limit = await rateLimit(request, { scope: 'taxi:rate', limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 20 });
  }
  const auth = await getUserFromRequest(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const stars = Math.trunc(Number(body?.stars));
  const to = body?.to === 'driver' ? 'rider_to_driver' : body?.to === 'rider' ? 'driver_to_rider' : null;
  if (!to || !Number.isFinite(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: 'Оценка — от 1 до 5' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const { data: ride } = await admin.from('taxi_rides')
    .select('*').eq('id', id).maybeSingle();
  if (!ride) return NextResponse.json({ error: 'Поездка не найдена' }, { status: 404 });
  if (ride.status !== 'completed') {
    return NextResponse.json({ error: 'Оценка доступна после завершения' }, { status: 400 });
  }

  const isRider = String(ride.rider_id) === auth.user.id;
  const isDriver = ride.driver_id ? String(ride.driver_id) === auth.user.id : false;
  if ((to === 'rider_to_driver' && !isRider) || (to === 'driver_to_rider' && !isDriver)) {
    return NextResponse.json({ error: 'Оценивать может только участник поездки' }, { status: 403 });
  }

  const { error } = await admin.from('taxi_ratings')
    .upsert({ ride_id: id, [to]: stars }, { onConflict: 'ride_id' });
  if (error) {
    log.warn('taxi:rate', 'upsert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось сохранить оценку' }, { status: 500 });
  }

  return withRateLimitHeaders(NextResponse.json({ ok: true }), { ...limit, limit: 20 });
}
