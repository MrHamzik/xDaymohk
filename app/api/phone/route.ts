import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { authenticateTaskRequest, taskAuthError, makeId } from '@/lib/tasks/server';
import { log } from '@/lib/logger';
import { digitsOnly, normalizePhone } from '@/lib/payments';
import { sendSmsRu } from '@/lib/sms/smsru';
import {
  codesMatch, hashSmsCode, makeSmsCode, smsExpiresAt,
  SMS_DAILY_SEND_LIMIT, SMS_MAX_ATTEMPTS, SMS_RESEND_MS,
} from '@/lib/sms/challenge';

/**
 * GET  /api/phone          — подтверждён ли номер
 * POST /api/phone {phone}  — выслать код
 * PUT  /api/phone {phone,code} — проверить код
 *
 * Код в ответе не возвращаем. Без SMSRU_API_ID отправка честно
 * отказывается: это не тестовый режим.
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
    verified: Boolean(data?.phone_verified_at),
    phone: data?.phone ?? '',
  });
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 5, windowMs: 15 * 60_000, scope: 'phone-send' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Подождите.', code: 'limit' }, { status: 429 }),
      { ...limit, limit: 5 },
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

  const sinceDay = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: dayCount } = await admin
    .from('sms_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', sinceDay);
  if ((dayCount ?? 0) >= SMS_DAILY_SEND_LIMIT) {
    return NextResponse.json({ error: 'Слишком много попыток. Попробуйте завтра.', code: 'limit' }, { status: 429 });
  }

  const { data: last } = await admin
    .from('sms_challenges')
    .select('sent_at')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.sent_at && Date.now() - Date.parse(last.sent_at) < SMS_RESEND_MS) {
    return NextResponse.json({ error: 'Подождите минуту перед повторной отправкой.', code: 'cooldown' }, { status: 429 });
  }

  const code = makeSmsCode();
  const hash = hashSmsCode(userId, phone, code);

  const { error: insertError } = await admin.from('sms_challenges').insert({
    id: makeId('sms'),
    user_id: userId,
    phone,
    code_hash: hash,
    expires_at: smsExpiresAt(),
    attempts: 0,
  });
  if (insertError) {
    log.warn('phone:send insert', insertError.message);
    if (/sms_challenges/i.test(insertError.message)) {
      return NextResponse.json({ error: 'Примените обновление 49 в Supabase.', code: 'need_migration' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Не удалось создать код' }, { status: 500 });
  }

  const sent = await sendSmsRu(digitsOnly(phone), `Даймохк: код ${code}. Никому не сообщайте.`);
  if (!sent.ok) {
    const message = sent.reason === 'no_provider'
      ? 'Отправка SMS ещё не подключена. Добавьте ключ SMS.RU в настройки сервера.'
      : 'Не удалось отправить SMS. Попробуйте позже.';
    return NextResponse.json({ error: message, code: sent.reason }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const limit = await rateLimit(request, { limit: 20, windowMs: 15 * 60_000, scope: 'phone-check' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много попыток.', code: 'limit' }, { status: 429 }),
      { ...limit, limit: 20 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, admin } = auth;

  const body = await request.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ''));
  const code = digitsOnly(String(body?.code ?? ''));
  if (!phone || code.length !== 6) {
    return NextResponse.json({ error: 'Введите номер и шестизначный код' }, { status: 400 });
  }

  const { data: row, error } = await admin
    .from('sms_challenges')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('user_id', userId)
    .eq('phone', phone)
    .is('consumed_at', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'Сначала вышлите код.', code: 'missing' }, { status: 400 });
  }
  if (row.consumed_at) {
    return NextResponse.json({ error: 'Код уже использован. Вышлите новый.', code: 'used' }, { status: 400 });
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    return NextResponse.json({ error: 'Код устарел. Вышлите новый.', code: 'expired' }, { status: 400 });
  }
  if (Number(row.attempts) >= SMS_MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Слишком много попыток. Вышлите новый код.', code: 'limit' }, { status: 429 });
  }

  const expected = hashSmsCode(userId, phone, code);
  if (!codesMatch(expected, String(row.code_hash))) {
    await admin.from('sms_challenges')
      .update({ attempts: Number(row.attempts) + 1 })
      .eq('id', row.id);
    return NextResponse.json({ error: 'Неверный код.', code: 'wrong' }, { status: 400 });
  }

  const now = new Date().toISOString();
  await admin.from('sms_challenges').update({ consumed_at: now }).eq('id', row.id);

  const { error: stampError } = await admin
    .from('user_profiles')
    .update({ phone, phone_verified_at: now })
    .eq('id', userId);
  if (stampError) {
    log.warn('phone:verify stamp', stampError.message);
    return NextResponse.json({ error: 'Не удалось сохранить подтверждение' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone });
}
