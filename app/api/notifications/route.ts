import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { isAdminEmail } from '@/lib/admin';
import { NotificationType } from '@/lib/types';

/**
 * Создание уведомления (service role — надёжно, не зависит от RLS и
 * наличия колонок в схеме: INSERT от имени сервиса).
 *
 * Используется админкой (итоги жалоб, блокировки) и другими местами,
 * где письмо должно гарантированно дойти до получателя.
 *
 * POST { recipientId, type, title, message, ceTitle?, ceMessage?, sender? }
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000 , scope: 'notifications' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 },
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

  let body: {
    recipientId?: string;
    type?: NotificationType;
    title?: string;
    message?: string;
    ceTitle?: string;
    ceMessage?: string;
    sender?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const recipientId = String(body.recipientId ?? '').trim();
  const title = String(body.title ?? 'Уведомление').trim();
  const message = String(body.message ?? '').trim();
  const type = String(body.type ?? 'system') as NotificationType;
  if (!recipientId) {
    return NextResponse.json({ error: 'recipientId обязателен' }, { status: 400 });
  }

  // Проверка: вызывающий — админ (письма от администрации). Можно отправлять
  // только адресату, чьи данные подтверждены; для простоты разрешаем админу.
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller, error: callerError } = await anon.auth.getUser(accessToken);
  if (callerError || !caller.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }
  if (!isAdminEmail(caller.user.email) && recipientId !== caller.user.id) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const notification = {
    id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recipient_id: recipientId,
    type,
    title,
    message,
    title_ce: body.ceTitle?.trim() || null,
    message_ce: body.ceMessage?.trim() || null,
    sender: body.sender?.trim() || 'Даймохк',
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const { error } = await admin.from('notifications').insert(notification);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: notification.id });
}
