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

  // Группы «Такси» в админке: таксисты, марки, предложения марок.
  const [suggestions, brands] = await Promise.all([
    admin.from('car_brand_suggestions').select('*, user_profiles(full_name)')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    admin.from('car_brands').select('id, name, is_active').order('name', { ascending: true }).limit(500),
  ]);

  return NextResponse.json({
    drivers: data ?? [],
    suggestions: suggestions.data ?? [],
    brands: brands.data ?? [],
  });
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
      const patch: Record<string, unknown> = { multiplier };
      for (const key of ['baseFare', 'perKm', 'perMin'] as const) {
        if (key in body) {
          const col = key === 'baseFare' ? 'base_fare' : key === 'perKm' ? 'per_km' : 'per_min';
          const value = Number(body[key]);
          patch[col] = body[key] === null || body[key] === '' || !Number.isFinite(value) ? null : Math.max(0, value);
        }
      }
      const { error } = await admin.from('taxi_tariffs')
        .update(patch).eq('id', String(body.tariffId ?? ''));
      if (error) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 });
      break;
    }
    case 'requirement': {
      const model = String(body.model ?? '').trim();
      if (!model) return NextResponse.json({ error: 'Не указана модель' }, { status: 400 });
      const year = (v: unknown) => {
        const n = Number(v);
        return v === null || v === '' || !Number.isFinite(n) ? null : Math.min(2035, Math.max(1980, Math.trunc(n)));
      };
      const { error } = await admin.from('car_requirements').upsert({
        model,
        year_economy: year(body.yearEconomy),
        year_comfort: year(body.yearComfort),
        year_business: year(body.yearBusiness),
        is_minivan: body.isMinivan === true,
      }, { onConflict: 'model' });
      if (error) return NextResponse.json({ error: 'Не удалось сохранить требования' }, { status: 500 });
      break;
    }
    case 'brand_add': {
      const name = String(body.name ?? '').trim().slice(0, 80);
      if (name.length < 3) return NextResponse.json({ error: 'Укажите марку и модель' }, { status: 400 });
      const { error } = await admin.from('car_brands').insert({ name });
      if (error && !/duplicate/i.test(error.message)) {
        return NextResponse.json({ error: 'Не удалось добавить' }, { status: 500 });
      }
      break;
    }
    case 'brand_approve': {
      const id = Number(body.suggestionId);
      if (!Number.isFinite(id)) return NextResponse.json({ error: 'Не указано предложение' }, { status: 400 });
      const { data: sug } = await admin.from('car_brand_suggestions').select('*').eq('id', id).maybeSingle();
      if (!sug) return NextResponse.json({ error: 'Предложение не найдено' }, { status: 404 });
      await admin.from('car_brands').insert({ name: sug.name });
      await admin.from('car_brand_suggestions').update({ status: 'approved' }).eq('id', id);
      break;
    }
    case 'brand_reject': {
      const id = Number(body.suggestionId);
      if (!Number.isFinite(id)) return NextResponse.json({ error: 'Не указано предложение' }, { status: 400 });
      await admin.from('car_brand_suggestions').update({ status: 'rejected' }).eq('id', id);
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
