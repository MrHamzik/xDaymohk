import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { authenticateTaskRequest, taskAuthError } from '@/lib/tasks/server';
import { log } from '@/lib/logger';
import { normalizePhone } from '@/lib/payments';

/**
 * GET  /api/phone         — какой номер сохранён
 * POST /api/phone {phone} — сохранить номер без SMS
 */

export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000, scope: 'phone-status' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);

  const { data, error } = await auth.admin
    .from('user_profiles')
    .select('phone, phone_verified_at')
    .eq('id', auth.userId)
    .maybeSingle();

  if (error && /phone_verified_at/i.test(error.message)) {
    return NextResponse.json({ verified: false, phone: '', needMigration: true });
  }
  if (error) {
    log.warn('phone:GET', error.message);
    return NextResponse.json({ error: 'Не удалось проверить номер' }, { status: 500 });
  }

  return NextResponse.json({
    verified: Boolean(data?.phone),
    phone: data?.phone ?? '',
  });
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 20, windowMs: 60_000, scope: 'phone-save' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Подождите.', code: 'limit' }, { status: 429 }),
      { ...limit, limit: 20 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, admin } = auth;

  const body = await request.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ''));
  if (!phone) {
    return NextResponse.json({ error: 'Проверьте номер телефона' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('user_profiles')
    .update({ phone, phone_verified_at: now })
    .eq('id', userId);
  if (error) {
    log.warn('phone:save', error.message);
    return NextResponse.json({ error: 'Не удалось сохранить номер' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone });
}
