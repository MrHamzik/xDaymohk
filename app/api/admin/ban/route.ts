import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { isAdminEmail, isDevEmail } from '@/lib/admin';
import { writeAdminAudit } from '@/lib/admin-audit';

/**
 * Temporary / permanent user ban for admins.
 *
 *   POST /api/admin/ban    { userId, hours?: number } — hours = null/undefined
 *                          means a permanent ban (banned_until = null, is_blocked).
 *   DELETE /api/admin/ban  { userId } — unban (clear banned_until, unblock).
 *
 * A ban does three things:
 *   1. sets auth.users.app_metadata.banned_until (ISO timestamp) — the
 *      /api/reviews and /api/profile-questions handlers check this and
 *      reject with 403 while it is in the future;
 *   2. flips public.user_profiles.is_blocked = true;
 *   (Ankets are NOT auto-hidden — hiding an анкета is a separate moderation action.)
 * Unban reverses all three.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Сессия не найдена' }, { status: 401 });
  }

  let body: { userId?: string; hours?: number | null; reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }
  const userId = String(body.userId ?? '').trim();
  if (!userId) {
    return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });
  }

  // Step 1: verify the caller is an admin.
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller, error: callerError } = await anon.auth.getUser(accessToken);
  if (callerError || !caller.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }
  if (!isAdminEmail(caller.user.email)) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }
  if (caller.user.id === userId) {
    return NextResponse.json({ error: 'Нельзя заблокировать самого себя' }, { status: 400 });
  }

  // Step 2: do the work with the service-role client.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Невидимый разработчик: блокировка «доходит» (уведомление отправляет UI),
  // но НЕ применяется — на него блокировки не действуют.
  const { data: targetUser, error: targetLookupError } = await admin
    .from('user_profiles')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (!targetLookupError && targetUser && isDevEmail(targetUser.email)) {
    return NextResponse.json({ success: true, userId, bannedUntil: null, blocked: false, skipped: true });
  }

  const hours = body.hours == null ? null : Number(body.hours);
  const bannedUntil = hours != null && Number.isFinite(hours) && hours > 0
    ? new Date(Date.now() + hours * 3600_000).toISOString()
    : null;

  // Update auth metadata (the source of truth for temporary bans).
  const { data: target, error: metaError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...(bannedUntil ? { banned_until: bannedUntil } : { banned_until: null }) },
  });
  if (metaError) {
    return NextResponse.json({ error: metaError.message }, { status: 500 });
  }

  const { error: userProfilesError } = await admin
    .from('user_profiles')
    .update({ is_blocked: true })
    .eq('id', userId);
  if (userProfilesError) {
    return NextResponse.json({ error: userProfilesError.message }, { status: 500 });
  }

  // Блокировка пользователя = скрыть все его анкеты и снять метку
  // проверенности (галочка пропадает — нужно заново отправлять на проверку).
  const { error: profilesError } = await admin
    .from('profiles')
    .update({ is_hidden: true, is_verified: false, verification_status: 'none' })
    .eq('owner_id', userId);
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  // Журнал (обновление 47). Пишем ПОСЛЕ успешного действия: запись о
  // блокировке, которой не случилось, хуже её отсутствия.
  await writeAdminAudit(admin, {
    actorId: caller.user.id,
    actorEmail: caller.user.email ?? '',
    action: 'user_ban',
    targetUserId: userId,
    targetLabel: targetUser?.full_name || targetUser?.email || '',
    reason: String(body.reason ?? '').trim(),
    details: { bannedUntil, permanent: bannedUntil === null, hours: hours ?? null },
  });

  return NextResponse.json({
    success: true,
    userId,
    bannedUntil,
    blocked: true,
  });
}

export async function DELETE(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Сессия не найдена' }, { status: 401 });
  }

  let body: { userId?: string; reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }
  const userId = String(body.userId ?? '').trim();
  if (!userId) {
    return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller, error: callerError } = await anon.auth.getUser(accessToken);
  if (callerError || !caller.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }
  if (!isAdminEmail(caller.user.email)) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Невидимый разработчик не блокируется (см. POST).
  const { data: targetUser, error: targetLookupError } = await admin
    .from('user_profiles')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (!targetLookupError && targetUser && isDevEmail(targetUser.email)) {
    return NextResponse.json({ success: true, userId, blocked: false, skipped: true });
  }

  const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { banned_until: null },
  });
  if (metaError) {
    return NextResponse.json({ error: metaError.message }, { status: 500 });
  }

  const { error: userProfilesError } = await admin
    .from('user_profiles')
    .update({ is_blocked: false })
    .eq('id', userId);
  if (userProfilesError) {
    return NextResponse.json({ error: userProfilesError.message }, { status: 500 });
  }

  // Разблокировка админом: показываем только личную анкету (это и есть
  // профиль пользователя); остальные анкеты админ вернёт вручную.
  const { error: profilesError } = await admin
    .from('profiles')
    .update({ is_hidden: false })
    .eq('owner_id', userId)
    .like('id', 'personal-%');
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  await writeAdminAudit(admin, {
    actorId: caller.user.id,
    actorEmail: caller.user.email ?? '',
    action: 'user_unban',
    targetUserId: userId,
    targetLabel: targetUser?.full_name || targetUser?.email || '',
    reason: String(body.reason ?? '').trim(),
  });

  return NextResponse.json({ success: true, userId, blocked: false });
}
