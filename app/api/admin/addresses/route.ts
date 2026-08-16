import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export async function GET() {
  // GET is intentionally public (the /map page reads the same data
  // and we want zero-auth browsing to work). The public-read RLS
  // policy on public.house_addresses allows it.
  try {
    if (isSupabaseConfigured && supabase) {
      // Supabase (PostgREST) режет выборку на db-max-rows (по умолчанию 1000)
      // независимо от .limit(). Поэтому идём страницами по 1000 через .range(),
      // пока не соберём все адреса — лимит на количество домов отсутствует.
      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('house_addresses')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) {
          log.warn('Supabase house_addresses page failed', error);
          break;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (all.length > 0) {
        const mapped = all.map((row: any) => ({
          id: String(row.id),
          street: row.street,
          houseNumber: row.house_number,
          fullAddress: row.full_address,
          lat: Number(row.lat),
          lng: Number(row.lng),
          postalCode: row.postal_code || '366602',
          isNotHouse: row.is_not_house || undefined,
          category: row.category || undefined,
        }));
        return NextResponse.json({ addresses: mapped, source: 'supabase', count: mapped.length });
      }
    }
    return NextResponse.json({ addresses: [], source: 'empty' });
  } catch (e) {
    return NextResponse.json({ addresses: [], source: 'fallback', error: String(e) });
  }
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  // Step 1: authenticate the caller and verify they are an admin.
  // The anon client (supabase) is fine for getUser() — that call
  // goes through PostgREST's auth API and validates the bearer JWT
  // server-side. We do NOT use the anon client to write data,
  // because every write would run as the `authenticator` role with
  // no JWT attached, and RLS would refuse it (this is what the
  // previous version of this file hit: 42501 row-level security
  // policy violation).
  const authResult = await authenticateAdmin(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  // Step 2: parse the payload.
  let body: { addresses?: unknown; deleteIds?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.addresses)) {
    return NextResponse.json({ error: 'Неверные данные: ожидается { addresses: [...] }' }, { status: 400 });
  }
  // Явный список id на удаление (из pendingDeletes админки). Удаляем РОВНО их,
  // а не «всё, чего нет в payload» — так удаление не зависит от лимитов и
  // от совпадения id между локальным состоянием и БД.
  const deleteIds = Array.isArray(body.deleteIds)
    ? body.deleteIds.map((x) => String(x)).filter(Boolean)
    : [];

  const sanitized = (body.addresses as any[]).map((a) => ({
    id: String(a?.id || `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    street: String(a?.street || '').slice(0, 100),
    houseNumber: String(a?.houseNumber || '').slice(0, 20),
    fullAddress: String(a?.fullAddress || `${a?.street}, ${a?.houseNumber}`).slice(0, 150),
    lat: Number(a?.lat) || 43.288024,
    lng: Number(a?.lng) || 45.298989,
    postalCode: String(a?.postalCode || '366602'),
    isNotHouse: Boolean(a?.isNotHouse) || false,
    category: a?.category ? String(a.category).slice(0, 50) : (a?.isNotHouse ? 'Другое' : null),
  }));

  // Step 3: use the service-role client for the actual write.
  // Service-role bypasses RLS by design, which is what we want here
  // because we've ALREADY verified the caller is an admin.
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase service-role client not configured' }, { status: 503 });
  }

  try {
    // Upsert is safer than plain INSERT here: it covers both add and
    // edit-in-place in one round-trip, and the conflict target is
    // the primary key. Большие payload бьём на чанки (лимит запроса).
    const CHUNK = 1000;
    const rows = sanitized.map((a) => ({
      id: a.id,
      street: a.street,
      house_number: a.houseNumber,
      full_address: a.fullAddress,
      lat: a.lat,
      lng: a.lng,
      postal_code: a.postalCode,
      is_not_house: a.isNotHouse,
      category: a.category,
    }));
    log.warn('addresses:POST', `rows=${rows.length} deleteIds=${deleteIds.length}`);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      log.warn('addresses:POST', `upsert chunk ${i / CHUNK + 1} size=${chunk.length}`);
      const { error: upsertError } = await admin
        .from('house_addresses')
        .upsert(chunk, { onConflict: 'id' });
      if (upsertError) {
        log.warn('[addresses:POST] upsert ERROR', upsertError);
        throw upsertError;
      }
    }

    // Удаляем РОВНО те id, что прислал клиент (помеченные в админке).
    // Без пагинации чтения existingIds — никаких «осталось >1000» багов.
    let deletedCount = 0;
    for (let i = 0; i < deleteIds.length; i += CHUNK) {
      const chunk = deleteIds.slice(i, i + CHUNK);
      log.warn('addresses:POST', `delete chunk ${i / CHUNK + 1} size=${chunk.length}`);
      const { error: deleteError, count } = await admin
        .from('house_addresses')
        .delete({ count: 'exact' })
        .in('id', chunk);
      if (deleteError) {
        log.warn('[addresses:POST] delete ERROR', deleteError);
        throw deleteError;
      }
      deletedCount += count ?? chunk.length;
    }

    log.warn('addresses:POST', `OK deleted=${deletedCount}`);
    return NextResponse.json({ success: true, count: sanitized.length, deletedCount, source: 'supabase' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn('Supabase house_addresses upsert failed', e);
    return NextResponse.json({ error: `Supabase error: ${message}` }, { status: 500 });
  }
}
