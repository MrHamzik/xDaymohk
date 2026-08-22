import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * Справочник машин таксиста (п.3 замечаний 23.08).
 *
 *   GET  ?q= — подсказки марок для анкеты таксиста (публично).
 *   POST — «моей машины нет в списке»: ручной ввод уходит в
 *     предложения; админ видит их в «Такси → Марки» и добавляет в базу.
 */

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:cars:get', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ cars: [] });

  let query = admin.from('car_brands').select('name').eq('is_active', true);
  if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, '\\$&')}%`);
  const { data, error } = await query.order('name', { ascending: true }).limit(12);
  if (error) {
    log.warn('taxi:cars:GET', 'query failed', { message: error.message });
    return NextResponse.json({ cars: [] });
  }
  return withRateLimitHeaders(
    NextResponse.json({ cars: (data ?? []).map((row) => row.name) }),
    { ...limit, limit: 60 },
  );
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:cars:post', limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 10 });
  }
  const auth = await getUserFromRequest(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (name.length < 3) return NextResponse.json({ error: 'Укажите марку и модель' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  // Уже в базе — предложение не нужно.
  const { data: exists } = await admin.from('car_brands')
    .select('id').ilike('name', name).maybeSingle();
  if (exists) return NextResponse.json({ ok: true, inBase: true });

  const { error } = await admin.from('car_brand_suggestions').insert({
    name,
    driver_id: auth.user.id,
  });
  if (error) {
    log.warn('taxi:cars:POST', 'insert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось отправить предложение' }, { status: 500 });
  }
  return withRateLimitHeaders(NextResponse.json({ ok: true, inBase: false }), { ...limit, limit: 10 });
}
