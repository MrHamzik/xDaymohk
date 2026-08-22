import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * Администрирование ВайТакси.
 *
 *   GET — список таксистов (для раздела «Такси» в админке).
 *   PUT — действия по типу:
 *     { type: 'verify', userId, verified }      — значок проверки;
 *     { type: 'fare', ...параметры }            — подача/км/мин/минималка;
 *     { type: 'tariff', tariffId, multiplier }  — множитель тарифа;
 *     { type: 'surge', slots: [{startHour,endHour,multiplier}] } — слоты спроса.
 */

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ drivers: [] });

  const { data, error } = await admin.from('taxi_drivers')
    .select('*, user_profiles(full_name)')
    .order('updated_at', { ascending: false });
  if (error) {
    log.warn('taxi:admin:GET', 'query failed', { message: error.message });
    return NextResponse.json({ drivers: [] });
  }
  return NextResponse.json({ drivers: data ?? [] });
}

export async function PUT(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:admin:put', limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 30 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  switch (body?.type) {
    case 'verify': {
      const { error } = await admin.from('taxi_drivers')
        .update({ is_verified: body.verified === true })
        .eq('user_id', String(body.userId ?? ''));
      if (error) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 });
      break;
    }
    case 'fare': {
      const patch: Record<string, unknown> = {};
      for (const key of ['baseFare', 'perKm', 'perMin', 'minFare', 'roadFactor'] as const) {
        if (key in body) {
          const col = key === 'baseFare' ? 'base_fare' : key === 'perKm' ? 'per_km'
            : key === 'perMin' ? 'per_min' : key === 'minFare' ? 'min_fare' : 'road_factor';
          const value = Number(body[key]);
          if (!Number.isFinite(value) || value < 0) {
            return NextResponse.json({ error: 'Некорректное число' }, { status: 400 });
          }
          patch[col] = value;
        }
      }
      const { error } = await admin.from('taxi_fare').update(patch).eq('id', 1);
      if (error) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 });
      break;
    }
    case 'tariff': {
      const multiplier = Number(body.multiplier);
      if (!Number.isFinite(multiplier) || multiplier < 0.5 || multiplier > 5) {
        return NextResponse.json({ error: 'Множитель — от 0.5 до 5' }, { status: 400 });
      }
      const { error } = await admin.from('taxi_tariffs')
        .update({ multiplier }).eq('id', String(body.tariffId ?? ''));
      if (error) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 });
      break;
    }
    case 'surge': {
      const slots = Array.isArray(body.slots) ? body.slots : [];
      for (const s of slots) {
        const start = Number(s.startHour);
        const end = Number(s.endHour);
        const m = Number(s.multiplier);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || start >= end
          || !Number.isFinite(m) || m < 0.5 || m > 5) {
          return NextResponse.json({ error: 'Некорректный слот' }, { status: 400 });
        }
      }
      await admin.from('taxi_multiplier_schedule').delete().not('id', 'is', null);
      if (slots.length > 0) {
        const { error } = await admin.from('taxi_multiplier_schedule').insert(
          slots.map((s: { startHour: number; endHour: number; multiplier: number }) => ({
            start_hour: Math.trunc(s.startHour),
            end_hour: Math.trunc(s.endHour),
            multiplier: s.multiplier,
          })),
        );
        if (error) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 });
      }
      break;
    }
    default:
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  }

  return withRateLimitHeaders(NextResponse.json({ ok: true }), { ...limit, limit: 30 });
}
