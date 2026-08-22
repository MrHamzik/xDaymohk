import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { surgeAt } from '@/lib/taxi/pricing';

/**
 * GET /api/taxi/summary — публичная сводка для главной и /taxi:
 * сколько таксистов онлайн, текущий множитель спроса, тарифы и
 * параметры цены. Позволяет показать «в разное время разные ценники»
 * без входа в аккаунт.
 */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:summary', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ onlineDrivers: 0, surge: 1, tariffs: [], fare: null });
  }

  const [drivers, tariffs, slots, fare] = await Promise.all([
    admin.from('taxi_drivers').select('user_id, is_online, rating, ride_count, is_verified')
      .eq('is_online', true),
    admin.from('taxi_tariffs').select('id, label_ru, label_ce, multiplier, sort_order, is_active, base_fare, per_km, per_min')
      .order('sort_order', { ascending: true }),
    admin.from('taxi_multiplier_schedule').select('start_hour, end_hour, multiplier'),
    admin.from('taxi_fare').select('*').eq('id', 1).maybeSingle(),
  ]);

  if (drivers.error || tariffs.error) {
    // Миграция 75 не применена — такси показывает заглушку.
    log.warn('taxi:summary', 'query failed', { message: drivers.error?.message ?? tariffs.error?.message });
    return NextResponse.json({ onlineDrivers: 0, surge: 1, tariffs: [], fare: null });
  }

  const nowHour = new Date().getHours();
  const surge = surgeAt((slots.data ?? []).map((s) => ({
    startHour: Number(s.start_hour),
    endHour: Number(s.end_hour),
    multiplier: Number(s.multiplier),
  })), nowHour);

  return withRateLimitHeaders(NextResponse.json({
    onlineDrivers: (drivers.data ?? []).length,
    surge,
    // Слоты нужны клиенту, чтобы показывать цену С множителем
    // «на берегу» (п.12 замечаний 22.08).
    slots: (slots.data ?? []).map((s) => ({
      startHour: Number(s.start_hour),
      endHour: Number(s.end_hour),
      multiplier: Number(s.multiplier),
    })),
    tariffs: (tariffs.data ?? []).filter((t) => t.is_active).map((t) => ({
      id: t.id,
      labelRu: t.label_ru,
      labelCe: t.label_ce,
      multiplier: Number(t.multiplier),
      sortOrder: Number(t.sort_order),
      isActive: t.is_active === true,
      baseFare: t.base_fare != null ? Number(t.base_fare) : null,
      perKm: t.per_km != null ? Number(t.per_km) : null,
      perMin: t.per_min != null ? Number(t.per_min) : null,
    })),
    fare: fare.data ? {
      baseFare: Number(fare.data.base_fare),
      perKm: Number(fare.data.per_km),
      perMin: Number(fare.data.per_min),
      minFare: Number(fare.data.min_fare),
      roadFactor: Number(fare.data.road_factor),
      childSeatFee: Number(fare.data.child_seat_fee ?? 50),
      intercityFromKm: Number(fare.data.intercity_from_km ?? 30),
      intercityPerKm: Number(fare.data.intercity_per_km ?? 25),
      cancelFee: Number(fare.data.cancel_fee ?? 100),
    } : null,
  }), { ...limit, limit: 60 });
}
