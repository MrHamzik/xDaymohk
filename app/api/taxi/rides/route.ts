import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { estimateRide } from '@/lib/taxi/pricing';

/**
 * Поездки ВайТакси.
 *
 *   GET  ?role=rider  — мои поездки (активные + история).
 *   GET  ?role=driver — лента заказов (searching по моим тарифам)
 *     и мои активные поездки.
 *   POST — заказ: сервер считает дистанцию и цену (подача + км + мин
 *     × тариф × спрос), цена фиксируется в заказе. Онлайн-таксистам
 *     подходящих тарифов уходит уведомление.
 */

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:rides:get', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await getUserFromRequest(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const role = new URL(request.url).searchParams.get('role');
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ rides: [] });

  if (role === 'driver') {
    const { data: driver } = await admin.from('taxi_drivers')
      .select('*').eq('user_id', auth.user.id).maybeSingle();
    if (!driver) return NextResponse.json({ rides: [], online: false });

    const tariffs: string[] = Array.isArray(driver.tariffs) ? driver.tariffs : [];
    const selectWithRider = '*, user_profiles(full_name), taxi_events(event_type, actor, created_at)';
    const { data: open } = await admin.from('taxi_rides')
      .select(selectWithRider)
      .eq('status', 'searching')
      .in('tariff_id', tariffs.length > 0 ? tariffs : ['__none__'])
      .order('created_at', { ascending: true })
      .limit(20);
    const { data: mine } = await admin.from('taxi_rides')
      .select(selectWithRider)
      .eq('driver_id', auth.user.id)
      .in('status', ['assigned', 'to_pickup', 'in_ride'])
      .order('created_at', { ascending: false });

    return withRateLimitHeaders(NextResponse.json({
      rides: [...(mine ?? []), ...(open ?? [])],
      online: driver.is_online === true,
    }), { ...limit, limit: 60 });
  }

  const { data: rides } = await admin.from('taxi_rides')
    .select('*, taxi_drivers(car_model, car_color, car_plate, rating, is_verified, show_gender, show_age, user_profiles(full_name, gender, birth_date)), taxi_events(event_type, actor, created_at)')
    .eq('rider_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return withRateLimitHeaders(NextResponse.json({ rides: rides ?? [] }), { ...limit, limit: 60 });
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:rides:post', limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 10 });
  }
  const auth = await getUserFromRequest(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Пустое тело запроса' }, { status: 400 });

  const fromLabel = typeof body.fromLabel === 'string' ? body.fromLabel.trim().slice(0, 200) : '';
  const toLabel = typeof body.toLabel === 'string' ? body.toLabel.trim().slice(0, 200) : '';
  const fromLat = num(body.fromLat);
  const fromLng = num(body.fromLng);
  const toLat = num(body.toLat);
  const toLng = num(body.toLng);
  const tariffId = typeof body.tariffId === 'string' ? body.tariffId : '';
  const comment = typeof body.comment === 'string' ? body.comment.slice(0, 500) : '';
  // Предпочтения пассажира (п.11): пол таксиста и минимальный возраст.
  const prefGender = body.prefGender === 'male' || body.prefGender === 'female' ? body.prefGender : 'any';
  const prefMinAge = Math.min(99, Math.max(16, Math.trunc(Number(body.prefMinAge)) || 18));
  const RIDE_OPTIONS = ['animals', 'cargo', 'child_seat'];
  const options = Array.isArray(body.options)
    ? body.options.filter((o: unknown): o is string => typeof o === 'string' && RIDE_OPTIONS.includes(o))
    : [];

  if (!fromLabel || !toLabel) {
    return NextResponse.json({ error: 'Укажите, откуда и куда ехать' }, { status: 400 });
  }
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    return NextResponse.json({ error: 'Выберите адреса из подсказок или точку на карте' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const [fareRow, tariffRow, slots] = await Promise.all([
    admin.from('taxi_fare').select('*').eq('id', 1).maybeSingle(),
    admin.from('taxi_tariffs').select('*').eq('id', tariffId).eq('is_active', true).maybeSingle(),
    admin.from('taxi_multiplier_schedule').select('start_hour, end_hour, multiplier'),
  ]);
  if (!fareRow.data || !tariffRow.data) {
    return NextResponse.json({ error: 'Такси ещё настраивается, загляните позже' }, { status: 503 });
  }

  const estimate = estimateRide(
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng },
    {
      baseFare: Number(fareRow.data.base_fare),
      perKm: Number(fareRow.data.per_km),
      perMin: Number(fareRow.data.per_min),
      minFare: Number(fareRow.data.min_fare),
      roadFactor: Number(fareRow.data.road_factor),
    },
    Number(tariffRow.data.multiplier),
    (slots.data ?? []).map((s) => ({
      startHour: Number(s.start_hour), endHour: Number(s.end_hour), multiplier: Number(s.multiplier),
    })),
    new Date(),
  );

  const { data: ride, error } = await admin.from('taxi_rides').insert({
    rider_id: auth.user.id,
    tariff_id: tariffId,
    from_label: fromLabel,
    from_lat: fromLat,
    from_lng: fromLng,
    to_label: toLabel,
    to_lat: toLat,
    to_lng: toLng,
    distance_km: estimate.distanceKm,
    price: estimate.price,
    multiplier: estimate.surge * Number(tariffRow.data.multiplier),
    comment,
    pref_gender: prefGender,
    pref_min_age: prefMinAge,
    options,
  }).select('*').single();

  if (error) {
    log.warn('taxi:rides:POST', 'insert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось создать заказ' }, { status: 500 });
  }

  // Уведомляем онлайн-таксистов подходящего тарифа.
  const { data: drivers } = await admin.from('taxi_drivers')
    .select('user_id, tariffs')
    .eq('is_online', true)
    .neq('user_id', auth.user.id);
  const targets = (drivers ?? [])
    .filter((d) => Array.isArray(d.tariffs) && d.tariffs.includes(tariffId));

  for (const target of targets) {
    await admin.from('notifications').insert({
      recipient_id: target.user_id,
      type: 'taxi_request',
      title: `Новый заказ: ${fromLabel} → ${toLabel}`,
      message: `${estimate.distanceKm} км, цена ${estimate.price} ₽. Примите заказ в Такси.`,
      sender: 'Такси',
    });
  }

  // Событие для ленты раздела такси (п.13).
  await admin.from('taxi_events').insert({
    ride_id: ride.id,
    event_type: 'created',
    actor: 'rider',
    note: `${fromLabel} → ${toLabel}`,
  });

  return withRateLimitHeaders(NextResponse.json({ ride }), { ...limit, limit: 10 });
}
