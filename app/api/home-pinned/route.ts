import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authenticateAdmin } from '@/lib/auth';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Закреплённые блоки главной (продолжение «скрепки», обновление 74).
 *
 *   GET    /api/home-pinned — публично: закреплённые анкеты/задания
 *     для блоков на главной (гости тоже видят главную).
 *   POST   /api/home-pinned — админ: закрепить предложенное.
 *   DELETE /api/home-pinned?targetType=…&targetId=… — админ: открепить.
 */

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'home-pinned:get', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ pinned: [] });

  const { data, error } = await admin
    .from('home_pinned')
    .select('id, target_type, target_id, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    // Миграция 74 могла быть не применена — главная просто без блоков.
    log.warn('home-pinned:GET', 'query failed', { message: error.message });
    return NextResponse.json({ pinned: [] });
  }

  return withRateLimitHeaders(NextResponse.json({ pinned: data ?? [] }), { ...limit, limit: 60 });
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const targetType = body?.targetType === 'profile' ? 'profile' : body?.targetType === 'task' ? 'task' : null;
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : '';
  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'Не указан объект' }, { status: 400 });
  }

  // Закрепляем только существующее.
  const table = targetType === 'profile' ? 'profiles' : 'tasks';
  const { data: target } = await admin.from(table).select('id').eq('id', targetId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 });

  const { error } = await admin.from('home_pinned').upsert(
    { target_type: targetType, target_id: targetId, pinned_by: auth.userId },
    { onConflict: 'target_type,target_id' },
  );
  if (error) {
    log.warn('home-pinned:POST', 'upsert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось закрепить' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const url = new URL(request.url);
  const targetType = url.searchParams.get('targetType');
  const targetId = url.searchParams.get('targetId') ?? '';
  if ((targetType !== 'profile' && targetType !== 'task') || !targetId) {
    return NextResponse.json({ error: 'Не указан объект' }, { status: 400 });
  }

  const { error } = await admin.from('home_pinned')
    .delete()
    .eq('target_type', targetType)
    .eq('target_id', targetId);
  if (error) {
    log.warn('home-pinned:DELETE', 'delete failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось открепить' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
