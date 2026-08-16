import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';


/**
 * POST /api/admin/letters/send
 * body: { letter: { title_ru, title_ce, message_ru, message_ce, sender, preset, color, icon },
 *         recipients: 'all' | string[] }
 * Отправляет письмо ВСЕМ пользователям (или выбранным) через notifications
 * (service role), пишет в letter_log.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { letter?: any; recipients?: 'all' | string[] } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Неверный JSON' }, { status: 400 }); }

  const letter = body.letter || {};
  const titleRu = String(letter.title_ru || '').slice(0, 200);
  const messageRu = String(letter.message_ru || '').slice(0, 4000);
  const titleCe = String(letter.title_ce || '').slice(0, 200);
  const messageCe = String(letter.message_ce || '').slice(0, 4000);
  if (!titleRu || !messageRu) {
    return NextResponse.json({ error: 'Заполните заголовок и текст письма (ru)' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  // 1) Определяем получателей.
  let recipientIds: string[] = [];
  if (body.recipients === 'all' || !Array.isArray(body.recipients)) {
    const { data, error } = await admin.from('user_profiles').select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    recipientIds = (data || []).map((r: any) => String(r.id));
  } else {
    recipientIds = body.recipients.map(String).filter(Boolean);
  }
  if (recipientIds.length === 0) {
    return NextResponse.json({ error: 'Нет получателей' }, { status: 400 });
  }

  // 2) Создаём уведомления чанками (service role обходит RLS).
  const sender = String(letter.sender || 'Даймохк').slice(0, 60);
  const preset = ['green', 'yellow', 'red', 'custom'].includes(String(letter.preset)) ? String(letter.preset) : 'green';
  const color = letter.color ? String(letter.color).slice(0, 20) : null;
  const icon = String(letter.icon || '📩').slice(0, 10);
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < recipientIds.length; i += CHUNK) {
    const chunk = recipientIds.slice(i, i + CHUNK);
    const rows = chunk.map((uid) => ({
      id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      recipient_id: uid,
      type: 'system',
      title: titleRu,
      message: messageRu,
      title_ce: titleCe || null,
      message_ce: messageCe || null,
      sender,
      is_read: false,
      created_at: new Date().toISOString(),
    }));
    const { error } = await admin.from('notifications').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted += rows.length;
  }

  // 3) Пишем в журнал.
  const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await admin.from('letter_log').insert({
    id: logId,
    letter_id: letter.id ?? null,
    title_ru: titleRu,
    title_ce: titleCe || null,
    message_ru: messageRu,
    message_ce: messageCe || null,
    sender,
    preset,
    color,
    icon,
    recipient_ids: recipientIds,
    count: inserted,
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, count: inserted });
}
