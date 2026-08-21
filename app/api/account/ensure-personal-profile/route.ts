import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { profileFromDb } from '@/lib/profile-db';

/**
 * Idempotent: ensure the canonical personal profile exists for the
 * calling user. Calls the public.ensure_personal_profile() RPC we
 * created in supabase/steps/11-profiles-rls-and-count.sql.
 *
 * Why an RPC and not a direct client-side insert:
 *   The old code created the personal profile in React state and then
 *   pushed it into localStorage. That gave us:
 *     - a phantom "Администратор Даймохк" mock row when the database
 *       was empty and localStorage was wiped;
 *     - duplicate personal rows when the user reloaded quickly;
 *     - cross-user leakage where one browser's localStorage held
 *       someone else's profile.
 *   The RPC creates the row directly in the database, atomically, and
 *   is the only place that can mint a personal row. The function is
 *   idempotent — calling it twice for the same user returns the same
 *   row instead of creating a duplicate.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 10, windowMs: 60_000 , scope: 'account-ensure' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 10 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Сессия не найдена' }, { status: 401 });
  }

  // Step 1: verify the caller and pull display fields from their
  // bearer JWT. The anon client is fine for this; it forwards the
  // JWT to PostgREST's auth.getUser() endpoint, which validates
  // the signature server-side.
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }

  // Step 2: call the RPC. We use the service-role client so the
  // SECURITY DEFINER function has full INSERT permission (regular
  // RLS would also let the user insert their own row, but the RPC
  // is a single, idempotent call — no race, no duplicate).
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc('ensure_personal_profile', {
    p_full_name: userData.user.user_metadata?.full_name ?? userData.user.user_metadata?.name ?? '',
    p_avatar_url: userData.user.user_metadata?.avatar_url ?? '',
    p_phone: userData.user.phone ?? '',
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The RPC returns a single profiles row. Shape it like the rest
  // of the app expects so the client can just splat it into state.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return NextResponse.json({ error: 'RPC returned no row' }, { status: 500 });
  }
  return NextResponse.json({ profile: profileFromDb(row as Record<string, unknown>) });
}
