import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isAdminEmail } from '@/lib/admin';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

async function isAdminRequest(request: Request): Promise<boolean> {
  // Only allow anonymous access in development. Production MUST have Supabase configured.
  if (!isSupabaseConfigured || !supabase) {
    return process.env.NODE_ENV === 'development';
  }
  try {
    const auth = request.headers.get('authorization');
    const token = auth?.replace('Bearer ', '').trim();
    if (!token) return false;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.email) return false;
    return isAdminEmail(data.user.email);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const limit = rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 }
    );
  }
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('house_addresses').select('*').order('created_at', { ascending: false });
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
      { ...limit, limit: 30 }
    );
  }
  try {
    // Проверка админа
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { addresses } = await request.json();
    if (!addresses || !Array.isArray(addresses)) {
      return NextResponse.json({ error: 'Неверные данные' }, { status: 400 });
    }

    const sanitized = addresses.map((a: any) => ({
      id: String(a.id || `addr-${Date.now()}`),
      street: String(a.street || '').slice(0, 100),
      houseNumber: String(a.houseNumber || '').slice(0, 20),
      fullAddress: String(a.fullAddress || `${a.street}, ${a.houseNumber}`).slice(0, 150),
      lat: Number(a.lat) || 43.288024,
      lng: Number(a.lng) || 45.298989,
      postalCode: String(a.postalCode || '366602'),
      isNotHouse: Boolean(a.isNotHouse) || false,
      category: a.category ? String(a.category).slice(0,50) : (a.isNotHouse ? 'Другое' : null),
    }));

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: existing } = await supabase.from('house_addresses').select('id');
        const existingIds = new Set((existing || []).map((r: any) => String(r.id)));
        const newIds = new Set(sanitized.map((a) => a.id));
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
        const { error: upsertError } = await supabase.from('house_addresses').upsert(rows, { onConflict: 'id' });
        if (upsertError) throw upsertError;
        const toDelete = Array.from(existingIds).filter((id) => !newIds.has(id));
        if (toDelete.length > 0) {
          await supabase.from('house_addresses').delete().in('id', toDelete);
        }
        return NextResponse.json({ success: true, count: sanitized.length, source: 'supabase' });
      } catch (e) {
        console.warn('Supabase house_addresses upsert failed', e);
        return NextResponse.json({ error: 'Supabase error: ' + String(e) }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
