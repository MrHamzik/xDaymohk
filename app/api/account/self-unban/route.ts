import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Автоматическая разблокировка при истечении временного бана.
 *
 * Когда истекает banned_until (временная блокировка), пользователь сам
 * вызывает этот endpoint при загрузке приложения: снимается is_blocked
 * и ВСЕ его анкеты снова становятся видимыми (временный бан скрывал их
 * целиком; по истечении всё возвращается).
 *
 * Примечание: ручная разблокировка админом отличается — она показывает
 * ТОЛЬКО личную анкету (см. /api/admin/ban DELETE).
 */
export async function POST(request: Request) {
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

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }

  const bannedUntilRaw = (userData.user as any).app_metadata?.banned_until;
  const bannedUntil = typeof bannedUntilRaw === 'string' ? new Date(bannedUntilRaw) : null;
  if (!bannedUntil || !Number.isFinite(bannedUntil.getTime()) || bannedUntil.getTime() > Date.now()) {
    // Бана нет или он ещё действует — ничего не делаем.
    return NextResponse.json({ success: false, reason: 'not_expired' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: metaError } = await admin.auth.admin.updateUserById(userData.user.id, {
    app_metadata: { banned_until: null },
  });
  if (metaError) {
    return NextResponse.json({ error: metaError.message }, { status: 500 });
  }

  const { error: userProfilesError } = await admin
    .from('user_profiles')
    .update({ is_blocked: false })
    .eq('id', userData.user.id);
  if (userProfilesError) {
    return NextResponse.json({ error: userProfilesError.message }, { status: 500 });
  }

  // По истечении временного бана показываем ВСЕ анкеты (они были скрыты
  // целиком во время блокировки).
  const { error: profilesError } = await admin
    .from('profiles')
    .update({ is_hidden: false })
    .eq('owner_id', userData.user.id);
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, unblocked: true });
}
