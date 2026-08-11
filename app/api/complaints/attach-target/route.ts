import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Submit a complaint while making sure the target profile actually
 * exists in the database. The catalog mixes remote (Supabase) and
 * local-only rows; when a user files a complaint about a profile that
 * lives only in their localStorage (e.g. because the original upsert
 * was rejected by RLS — they don't own the row, or it never made it
 * to the server), the FK `complaints_profile_id_fkey` rejects the
 * insert with the cryptic "violates foreign key constraint" error.
 *
 * This endpoint runs with the service-role key and:
 *   1. Verifies the caller is authenticated.
 *   2. Upserts a minimal row into public.profiles if it doesn't exist
 *      yet (so the FK on complaints.profile_id is satisfied). The row
 *      is populated from whatever the client sends; if the row already
 *      exists we DO NOT overwrite it (we just confirm it does).
 *   3. Inserts the complaint itself.
 *
 * We intentionally keep this small: the goal is just to bridge the
 * FK gap, not to give the user a way to forge or modify profiles
 * they don't own. The caller is the auth.uid() of the complaint's
 * author; the target profile is the row the user is reporting.
 */
export async function POST(request: Request) {
  const limit = rateLimit(request, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!serviceRoleKey || !supabaseUrl) {
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

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authenticate the caller.
  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна.' }, { status: 401 });
  }
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? '';

  // Check whether the target profile already exists.
  const { data: existing, error: existingError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    // Bridge the FK gap: insert a minimal placeholder row so the
    // complaints row has something to point at. We DO NOT overwrite
    // an existing row (it might already be a fuller record authored
    // by the real owner). The minimal row is enough to satisfy the
    // schema defaults — every required field has a DEFAULT in
    // public.profiles, so an empty insert is valid.
    const target = body.target ?? {};
    const placeholderOwner = typeof target.ownerId === 'string' && target.ownerId.length > 0
      ? target.ownerId
      : null;
    const placeholderFullName = typeof target.fullName === 'string' && target.fullName.length > 0
      ? String(target.fullName).slice(0, 200)
      : 'Неизвестный пользователь';
    const placeholderRow: Record<string, unknown> = {
      id: profileId,
      owner_id: placeholderOwner,
      full_name: placeholderFullName,
      is_specialist: Boolean(target.isSpecialist),
      is_personal: Boolean(target.isPersonal) || profileId.startsWith('personal-'),
    };
    const { error: insertError } = await adminClient
      .from('profiles')
      .upsert(placeholderRow, { onConflict: 'id' });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Now insert the complaint.
  const complaintId = `complaint-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  const targetUserId = typeof body.target?.ownerId === 'string' && body.target.ownerId.length > 0
    ? String(body.target.ownerId)
    : null;
  const { error: complaintError } = await adminClient.from('complaints').insert({
    id: complaintId,
    profile_id: profileId,
    target_user_id: targetUserId,
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
