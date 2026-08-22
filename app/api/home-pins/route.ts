import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin, getUserFromRequest } from '@/lib/auth';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * «Скрепка» — предложения на главную (Этап 2-каталог, п.6).
 *
 *   POST /api/home-pins — вошедший пользователь предлагает анкету или
 *     задание на главную. Не чаще одного раза в день (сброс в 00:00):
 *     сервер сверяет календарную дату, БД дополнительно страхует
 *     уникальным ключом (user_id, proposed_date).
 *   GET  /api/home-pins — администрация: список предложений.
 *
 * Пишет только сервер от имени сессии; напрямую из клиента в таблицу
 * вставить нельзя (RLS — только чтение).
 */

export async function POST(request: Request) {
  const limit = await rateLimit(request, { scope: 'home-pins:post', limit: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 5 },
    );
  }

  const auth = await getUserFromRequest(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const userId = auth.user.id;

  const body = await request.json().catch(() => null);
  const targetType = body?.targetType === 'profile' ? 'profile' : body?.targetType === 'task' ? 'task' : null;
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : '';
  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'Не указан объект предложения' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  // Объект обязан существовать: скрепка на удалённой анкете не должна
  // плодить пустые предложения.
  if (targetType === 'profile') {
    const { data } = await admin.from('profiles').select('id').eq('id', targetId).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Анкета не найдена' }, { status: 404 });
  } else {
    const { data } = await admin.from('tasks').select('id').eq('id', targetId).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });
  }

  // Раз в день на аккаунт — по календарной дате сервера (сброс в 00:00).
  const { data: today } = await admin
    .from('home_pin_proposals')
    .select('id')
    .eq('user_id', userId)
    .eq('proposed_date', new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (today) {
    return NextResponse.json({ error: 'Сегодня вы уже предлагали' }, { status: 409 });
  }

  const { error } = await admin.from('home_pin_proposals').insert({
    user_id: userId,
    target_type: targetType,
    target_id: targetId,
  });
  if (error) {
    // Уникальный ключ (user_id, proposed_date) — последняя страховка
    // от двойного предложения в один день.
    if (/home_pin_once_per_day/i.test(error.message ?? '')) {
      return NextResponse.json({ error: 'Сегодня вы уже предлагали' }, { status: 409 });
    }
    log.warn('home-pins:POST', 'insert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось отправить предложение' }, { status: 500 });
  }

  return withRateLimitHeaders(NextResponse.json({ ok: true }), { ...limit, limit: 5 });
}

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'home-pins:get', limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const auth = await authenticateAdmin(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ proposals: [] });

  const { data, error } = await admin
    .from('home_pin_proposals')
    .select('id, user_id, target_type, target_id, proposed_date, created_at, user_profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    // Миграция 73 могла быть не применена — админка показывает пусто.
    log.warn('home-pins:GET', 'query failed', { message: error.message });
    return NextResponse.json({ proposals: [] });
  }

  return withRateLimitHeaders(NextResponse.json({ proposals: data ?? [] }), { ...limit, limit: 30 });
}
