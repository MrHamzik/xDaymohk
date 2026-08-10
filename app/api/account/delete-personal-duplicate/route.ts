import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Delete a duplicate personal profile (a row with is_personal=true that
 * is NOT the canonical `personal-<userId>` row). The RLS policy
 * 'profiles owner delete' refuses to delete rows with is_personal=true,
 * so the client has no way to remove a phantom personal row that was
 * created by an earlier bug. This endpoint runs with the service-role
 * key, verifies the caller owns the row, refuses to touch the canonical
 * personal row, and only then deletes.
 */
export async function DELETE(request: Request) {
  const limit = rateLimit(request, { limit: 10, windowMs: 60 * 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 10 }
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

  let body: { profileId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос.' }, { status: 400 });
  }
  const profileId = String(body.profileId ?? '').trim();
  if (!profileId) {
    return NextResponse.json({ error: 'profileId обязателен.' }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна.' }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: row, error: rowError } = await adminClient
    .from('profiles')
    .select('id, owner_id, is_personal')
    .eq('id', profileId)
    .maybeSingle();

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Анкета уже удалена.' }, { status: 404 });
  }

  // Ownership: the caller must own the row.
  if (String(row.owner_id ?? '') !== userId) {
    return NextResponse.json({ error: 'Удалять можно только свои анкеты.' }, { status: 403 });
  }
  // Refuse to delete the canonical personal row.
  if (row.is_personal && profileId === `personal-${userId}`) {
    return NextResponse.json({ error: 'Личная анкета не может быть удалена.' }, { status: 400 });
  }
  // Only personal rows can be cleaned up via this endpoint.
  if (!row.is_personal) {
    return NextResponse.json({ error: 'Этот эндпоинт только для дубликатов личных анкет.' }, { status: 400 });
  }

  const { error: deleteError, count } = await adminClient
    .from('profiles')
    .delete({ count: 'exact' })
    .eq('id', profileId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  if (count === 0) {
    return NextResponse.json({ error: 'Не удалось удалить строку.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, profileId });
}
