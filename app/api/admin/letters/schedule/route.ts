import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';


/**
 * POST /api/admin/letters/schedule
 * body: { letter: {...}, scheduleAt: ISO, repeat: 'once'|'daily'|'n_days',
 *         days?: number, count?: number }
 * Сохраняет шаблон (с полями планирования) и создаёт очередь запусков.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { letter?: any; scheduleAt?: string; repeat?: string; days?: number; count?: number } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Неверный JSON' }, { status: 400 }); }

  const letter = body.letter || {};
  if (!String(letter.title_ru || '').trim() || !String(letter.message_ru || '').trim()) {
    return NextResponse.json({ error: 'Заполните заголовок и текст письма (ru)' }, { status: 400 });
  }
  const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : new Date();
  if (Number.isNaN(scheduleAt.getTime())) {
    return NextResponse.json({ error: 'Неверное время отправки' }, { status: 400 });
  }
  const repeat = ['once', 'daily', 'n_days'].includes(String(body.repeat)) ? String(body.repeat) : 'once';
  const days = Math.max(1, Math.min(365, Number(body.days) || 1));
  const count = Math.max(0, Number(body.count) || 0); // 0 = безлимит

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const id = String(letter.id || `letter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const payload = {
    id,
    key: letter.key ?? null,
    letter_type: letter.letter_type ?? 'custom',
    title_ru: String(letter.title_ru || '').slice(0, 200),
    title_ce: String(letter.title_ce || '').slice(0, 200),
    message_ru: String(letter.message_ru || '').slice(0, 4000),
    message_ce: String(letter.message_ce || '').slice(0, 4000),
    sender: String(letter.sender || 'Даймохк').slice(0, 60),
    preset: ['green', 'yellow', 'red', 'custom'].includes(String(letter.preset)) ? String(letter.preset) : 'green',
    color: letter.color ? String(letter.color).slice(0, 20) : null,
    icon: String(letter.icon || '📩').slice(0, 10),
    recipients: letter.recipients === 'selected' ? 'selected' : 'all',
    schedule_enabled: true,
    schedule_at: scheduleAt.toISOString(),
    schedule_repeat: repeat,
    schedule_days: days,
    schedule_count: count,
    schedule_sent: 0,
    updated_at: new Date().toISOString(),
  };
  const { error: upsertError } = await admin.from('letters').upsert(payload, { onConflict: 'id' });
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  // Очередь: первый запуск.
  const schedId = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { error: schedError } = await admin.from('letter_schedule').insert({
    id: schedId,
    letter_id: id,
    run_at: scheduleAt.toISOString(),
    processed: false,
  });
  if (schedError) return NextResponse.json({ error: schedError.message }, { status: 500 });

  return NextResponse.json({ success: true, letterId: id, scheduleId: schedId, runAt: scheduleAt.toISOString() });
}
