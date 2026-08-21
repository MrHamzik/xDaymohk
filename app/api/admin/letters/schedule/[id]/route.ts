import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * PATCH /api/admin/letters/schedule/[id]
 * body: { runAt?: ISO, letter?: { id, title_ru, title_ce, message_ru, message_ce, sender, recipients } }
 * Редактирует запись в очереди: время отправки и/или текст письма (шаблон
 * в letters обновляется тем же id). Карандаш в «Архиве» → «Очередь».
 *
 * DELETE /api/admin/letters/schedule/[id]
 * Удаляет письмо из очереди (красная корзина).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 , scope: 'admin-letter-sched-id' });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 });

  let body: { runAt?: string; letter?: any } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Неверный JSON' }, { status: 400 }); }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  // 1) Обновляем письмо-шаблон (если переданы поля текста).
  const letter = body.letter;
  if (letter && (letter.id || letter.title_ru || letter.message_ru)) {
    const { data: existing, error: findError } = await admin.from('letters').select('*').eq('id', letter.id).maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    const base = existing ?? {};
    const payload = {
      id: String(letter.id || base.id || `letter-${Date.now()}`),
      key: letter.key ?? base.key ?? null,
      letter_type: letter.letter_type ?? base.letter_type ?? 'custom',
      title_ru: String(letter.title_ru ?? base.title_ru ?? '').slice(0, 200),
      title_ce: String(letter.title_ce ?? base.title_ce ?? '').slice(0, 200),
      message_ru: String(letter.message_ru ?? base.message_ru ?? '').slice(0, 4000),
      message_ce: String(letter.message_ce ?? base.message_ce ?? '').slice(0, 4000),
      sender: String(letter.sender ?? base.sender ?? 'Даймохк').slice(0, 60),
      preset: ['green', 'yellow', 'red', 'custom'].includes(String(letter.preset ?? base.preset)) ? String(letter.preset ?? base.preset) : 'green',
      color: (letter.color ?? base.color) ? String(letter.color ?? base.color).slice(0, 20) : null,
      icon: String(letter.icon ?? base.icon ?? '📩').slice(0, 10),
      recipients: letter.recipients === 'selected' ? 'selected' : (base.recipients ?? 'all'),
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await admin.from('letters').upsert(payload, { onConflict: 'id' });
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // 2) Обновляем время отправки (если передано).
  let runAt: string | null = null;
  if (body.runAt) {
    const parsed = new Date(body.runAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Неверное время отправки' }, { status: 400 });
    }
    runAt = parsed.toISOString();
    const { error: updateError } = await admin
      .from('letter_schedule')
      .update({ run_at: runAt })
      .eq('id', id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, runAt });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 , scope: 'admin-letter-sched-id' });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const { error } = await admin.from('letter_schedule').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
