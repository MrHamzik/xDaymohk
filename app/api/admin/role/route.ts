import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { authenticateAdmin } from '@/lib/auth';
import { isDevEmail } from '@/lib/admin';
import { writeAdminAudit } from '@/lib/admin-audit';

/**
 * POST /api/admin/role   { userId, makeAdmin: boolean }
 * Выдаёт или отбирает права администратора у пользователя.
 *
 * Доступно ТОЛЬКО невидимому разработчику (mr.hamzik1026@gmail.com) —
 * единственному, кто управляет админ-правами. Самого разработчика
 * понизить нельзя.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isDevEmail(auth.email)) {
    return NextResponse.json({ error: 'Только владелец проекта может управлять админ-правами' }, { status: 403 });
  }

  let body: { userId?: string; makeAdmin?: boolean } = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }
  const userId = String(body.userId ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });
  const makeAdmin = Boolean(body.makeAdmin);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Цель: нельзя менять права самого разработчика.
  const { data: targetUser, error: targetError } = await admin
    .from('user_profiles')
    .select('email, full_name, is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!targetUser) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
  if (isDevEmail(targetUser.email)) {
    return NextResponse.json({ error: 'Нельзя изменить права владельца проекта' }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from('user_profiles')
    .update({ is_admin: makeAdmin })
    .eq('id', userId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Журнал (обновление 47): выдача и снятие прав — самое чувствительное
  // из административных действий, след обязателен.
  await writeAdminAudit(admin, {
    actorId: auth.userId,
    actorEmail: auth.email,
    action: makeAdmin ? 'role_grant' : 'role_revoke',
    targetUserId: userId,
    targetLabel: targetUser.full_name || targetUser.email || '',
    details: { was: Boolean(targetUser.is_admin), now: makeAdmin },
  });

  return NextResponse.json({ success: true, userId, makeAdmin });
}
