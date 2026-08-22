import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * Карточка таксиста.
 *
 *   GET — моя карточка (или null, если ещё не таксист) + активные
 *     поездки в роли таксиста.
 *   PUT — правка СВОЕЙ карточки: анкета авто, мои тарифы, онлайн.
 *     Служебные поля (is_verified, rating, ride_count) триггер БД
 *     восстанавливает — клиент их не подменит.
 *
 * Онлайн не включается без заполненной машины: пассажир должен
 * видеть, кто и на чём приедет.
 */

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:driver:get', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await getUserFromRequest(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ driver: null, rides: [] });

  const { data: driver } = await admin.from('taxi_drivers')
    .select('*').eq('user_id', auth.user.id).maybeSingle();

  const { data: rides } = await admin.from('taxi_rides')
    .select('*')
    .eq('driver_id', auth.user.id)
    .in('status', ['assigned', 'to_pickup', 'in_ride'])
    .order('created_at', { ascending: false });

  return withRateLimitHeaders(NextResponse.json({
    driver: driver ? mapDriver(driver) : null,
    rides: rides ?? [],
  }), { ...limit, limit: 60 });
}

export async function PUT(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:driver:put', limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 20 });
  }
  const auth = await getUserFromRequest(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Пустое тело запроса' }, { status: 400 });

  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');

  const patch: Record<string, unknown> = {};
  if ('carModel' in body) patch.car_model = text(body.carModel, 80);
  if ('carColor' in body) patch.car_color = text(body.carColor, 40);
  if ('carPlate' in body) patch.car_plate = text(body.carPlate, 20).toUpperCase();
  if ('yearsDriving' in body) patch.years_driving = Math.max(0, Math.min(70, Number(body.yearsDriving) || 0));
  if ('tariffs' in body) {
    const list = Array.isArray(body.tariffs)
      ? body.tariffs.filter((t: unknown): t is string => typeof t === 'string')
      : [];
    if (list.length === 0) return NextResponse.json({ error: 'Выберите хотя бы один тариф' }, { status: 400 });
    patch.tariffs = list;
  }

  const wantOnline = typeof body.isOnline === 'boolean' ? body.isOnline : null;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const { data: current } = await admin.from('taxi_drivers')
    .select('*').eq('user_id', auth.user.id).maybeSingle();

  const merged = {
    car_model: String((patch.car_model ?? current?.car_model) ?? ''),
    car_plate: String((patch.car_plate ?? current?.car_plate) ?? ''),
  };

  // Онлайн — только с заполненной машиной (и хотя бы одним тарифом).
  if (wantOnline === true && (!merged.car_model || !merged.car_plate)) {
    return NextResponse.json({ error: 'Заполните модель и номер машины, чтобы выйти на линию' }, { status: 400 });
  }
  if (wantOnline !== null) patch.is_online = wantOnline;

  if (!current) {
    if (wantOnline === true && (!merged.car_model || !merged.car_plate)) {
      return NextResponse.json({ error: 'Заполните модель и номер машины, чтобы выйти на линию' }, { status: 400 });
    }
    const { error } = await admin.from('taxi_drivers').insert({
      user_id: auth.user.id,
      ...patch,
    });
    if (error) {
      log.warn('taxi:driver:PUT', 'insert failed', { message: error.message });
      return NextResponse.json({ error: 'Не удалось сохранить анкету таксиста' }, { status: 500 });
    }
  } else {
    const { error } = await admin.from('taxi_drivers')
      .update(patch).eq('user_id', auth.user.id);
    if (error) {
      log.warn('taxi:driver:PUT', 'update failed', { message: error.message });
      return NextResponse.json({ error: 'Не удалось сохранить анкету таксиста' }, { status: 500 });
    }
  }

  const { data: fresh } = await admin.from('taxi_drivers')
    .select('*').eq('user_id', auth.user.id).maybeSingle();

  return withRateLimitHeaders(NextResponse.json({ driver: fresh ? mapDriver(fresh) : null }), { ...limit, limit: 20 });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDriver(row: any) {
  return {
    userId: String(row.user_id),
    isOnline: row.is_online === true,
    carModel: row.car_model ?? '',
    carColor: row.car_color ?? '',
    carPlate: row.car_plate ?? '',
    yearsDriving: Number(row.years_driving ?? 0),
    tariffs: Array.isArray(row.tariffs) ? row.tariffs : [],
    isVerified: row.is_verified === true,
    rating: Number(row.rating ?? 0),
    rideCount: Number(row.ride_count ?? 0),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
