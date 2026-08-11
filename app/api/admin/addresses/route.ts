import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminEmail } from '@/lib/admin';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Verify the caller's bearer JWT and confirm they are an admin.
 * Returns the email on success, or null on any failure (with a
 * human-readable error message for the response).
 */
async function authenticateAdmin(request: Request): Promise<{ email: string; userId: string } | { error: string; status: number }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured', status: 500 };
  }
  const auth = request.headers.get('authorization');
  const token = auth?.replace('Bearer ', '').trim();
  if (!token) {
    return { error: 'Сессия не найдена', status: 401 };
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.email) {
    return { error: 'Сессия недействительна', status: 401 };
  }
  if (!isAdminEmail(data.user.email)) {
    return { error: 'Forbidden: admin only', status: 403 };
  }
  return { email: data.user.email, userId: data.user.id };
}

export async function GET() {
  // GET is intentionally public (the /map page reads the same data
  // and we want zero-auth browsing to work). The public-read RLS
  // policy on public.house_addresses allows it.
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('house_addresses')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const mapped = data.map((row: any) => ({
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
  const limit = rateLimit(request, { limit: 30, windowMs: 60_000 });
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
  let body: { addresses?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.addresses)) {
    return NextResponse.json({ error: 'Неверные данные: ожидается { addresses: [...] }' }, { status: 400 });
  }

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
    const { data: existing, error: existingError } = await admin
      .from('house_addresses')
      .select('id');
    if (existingError) throw existingError;
    const existingIds = new Set((existing || []).map((r: any) => String(r.id)));
    const newIds = new Set(sanitized.map((a) => a.id));

    // Upsert is safer than plain INSERT here: it covers both add and
    // edit-in-place in one round-trip, and the conflict target is
    // the primary key.
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
    const { error: upsertError } = await admin
      .from('house_addresses')
      .upsert(rows, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    // Soft-deleted rows in the UI mean "delete from DB": any row
    // that was in the table but is not in the new payload gets
    // physically removed.
    const toDelete = Array.from(existingIds).filter((id) => !newIds.has(id));
    if (toDelete.length > 0) {
      const { error: deleteError } = await admin
        .from('house_addresses')
        .delete()
        .in('id', toDelete);
      if (deleteError) throw deleteError;
    }

    return NextResponse.json({ success: true, count: sanitized.length, source: 'supabase' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('Supabase house_addresses upsert failed', e);
    return NextResponse.json({ error: `Supabase error: ${message}` }, { status: 500 });
  }
}
