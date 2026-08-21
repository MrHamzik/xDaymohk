import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Submit a complaint while making sure the target profile actually
 * exists in the database.
 *
 * Why this endpoint exists:
 *   The catalog mixes remote (Supabase) and local-only rows; when a
 *   user files a complaint about a profile that lives only in their
 *   localStorage (e.g. it was authored client-side but the original
 *   upsert was rejected by RLS — they don't own the row, or the
 *   original sync was interrupted), the FK `complaints_profile_id_fkey`
 *   rejects the insert with the cryptic "violates foreign key
 *   constraint" error.
 *
 * Why we use the service role here:
 *   The caller is the auth.uid() of the complaint's author; they
 *   have NO write permission on someone else's profile row, so the
 *   placeholder upsert would be rejected by RLS. We bridge that gap
 *   with the service-role client (which bypasses RLS by design)
 *   AFTER verifying the caller's bearer JWT.
 *
 * Why we never accept target_user_id from the client:
 *   The client doesn't have to know (or be trusted to know) the
 *   target profile's owner. The server looks up `owner_id` itself
 *   from the profiles table. If the target profile has no owner
 *   (e.g. it was created as a placeholder by a previous call to
 *   this endpoint), target_user_id is simply left NULL — the column
 *   is nullable, the FK is `on delete set null`, so the complaint
 *   still inserts cleanly.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000 , scope: 'complaint-attach' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Service-role client not configured.' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Сессия не найдена.' }, { status: 401 });
  }

  let body: {
    profileId?: string;
    reason?: string;
    target?: Record<string, unknown>;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос.' }, { status: 400 });
  }

  const profileId = String(body.profileId ?? '').trim();
  const reason = String(body.reason ?? '').trim();
  if (!profileId) {
    return NextResponse.json({ error: 'profileId обязателен.' }, { status: 400 });
  }
  if (!reason || reason.length > 500) {
    return NextResponse.json({ error: 'Причина жалобы должна быть от 1 до 500 символов.' }, { status: 400 });
  }

  // Step 1: validate the bearer JWT with the anon client.
  // getUser() goes through PostgREST's auth API and verifies the
  // signature + expiry server-side. The anon client is fine for
  // this; we only switch to service-role for the actual write.
  const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна.' }, { status: 401 });
  }
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? '';

  // Step 2: switch to service-role for the actual data work.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 3: bridge the FK gap if needed. If the target profile is
  // already in the database we leave it alone — we don't want to
  // overwrite a fuller record authored by the real owner.
  const { data: existing, error: existingError } = await admin
    .from('profiles')
    .select('id, owner_id')
    .eq('id', profileId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  let targetOwnerId: string | null = null;
  if (existing) {
    targetOwnerId = existing.owner_id ?? null;
  } else {
    // Create a minimal placeholder row so the FK on complaints is
    // satisfied. We intentionally do NOT copy owner_id from the
    // client — the client cannot be trusted to know or report the
    // real owner. The placeholder is owned by no one (NULL), and
    // target_user_id will also be NULL in the complaint row.
    const target = body.target ?? {};
    const placeholderFullName = typeof target.fullName === 'string' && target.fullName.length > 0
      ? String(target.fullName).slice(0, 200)
      : 'Неизвестный пользователь';
    const placeholderRow: Record<string, unknown> = {
      id: profileId,
      owner_id: null,
      full_name: placeholderFullName,
      is_specialist: Boolean(target.isSpecialist),
      is_personal: Boolean(target.isPersonal) || profileId.startsWith('personal-'),
    };
    const { error: insertError } = await admin
      .from('profiles')
      .upsert(placeholderRow, { onConflict: 'id' });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Step 4: insert the complaint. target_user_id is null when the
  // target profile has no owner (placeholder or genuine standalone
  // row), which is the safe default — admins can still resolve
  // complaints without knowing who the target user is.
  const complaintId = `complaint-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  const { error: complaintError } = await admin.from('complaints').insert({
    id: complaintId,
    profile_id: profileId,
    target_user_id: targetOwnerId,
    author_id: userId,
    author_name: userEmail,
    reason,
    status: 'open',
    created_at: today,
  });
  if (complaintError) {
    return NextResponse.json({ error: complaintError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    complaint: {
      id: complaintId,
      profileId,
      reason,
      status: 'open',
      createdAt: today,
    },
  });
}
