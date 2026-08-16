import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import {
  authenticateTaskRequest,
  taskAuthError,
  isExecutorActive,
  EXECUTOR_ACTIVE_MINUTES,
} from '@/lib/tasks/server';

/**
 * Тумблер «Активен/Неактивен» в разделе заданий.
 *
 * Почему active_until, а не фоновый сброс: гасить статус по таймеру
 * пришлось бы pg_cron'ом на всех пользователях сразу. Вместо этого
 * пишем «активен до» и считаем протухший статус выключенным при чтении —
 * ноль фоновых задач. Любое действие в разделе продлевает окно
 * (touchExecutorActivity), поэтому листающий ленту не «отваливается».
 */

/** GET — свой статус + счётчик активных исполнителей. */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000, scope: 'exec-status-read' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, admin } = auth;

  const { data } = await admin
    .from('executor_status')
    .select('is_active, active_until')
    .eq('user_id', userId)
    .maybeSingle();

  const { count } = await admin
    .from('executor_status')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_active', true)
    .gt('active_until', new Date().toISOString());

  return NextResponse.json({
    isActive: isExecutorActive(data),
    activeUntil: data?.active_until ?? null,
    activeExecutors: count ?? 0,
  });
}

/** POST { isActive } — включить/выключить, либо продлить окно. */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000, scope: 'exec-status-write' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const { userId, admin } = auth;

  let body: { isActive?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const isActive = body.isActive === true;
  const activeUntil = isActive
    ? new Date(Date.now() + EXECUTOR_ACTIVE_MINUTES * 60_000).toISOString()
    : null;

  const { error } = await admin
    .from('executor_status')
    .upsert(
      { user_id: userId, is_active: isActive, active_until: activeUntil },
      { onConflict: 'user_id' },
    );
  if (error) {
    log.warn('executor status update failed:', error.message);
    return NextResponse.json({ error: 'Не удалось изменить статус' }, { status: 500 });
  }

  return NextResponse.json({ success: true, isActive, activeUntil });
}
