import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { authenticateTaskRequest, taskAuthError } from '@/lib/tasks/server';
import { log } from '@/lib/logger';

/** GET /api/favorites — мои избранные анкеты. POST/DELETE — добавить/убрать. */

export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000, scope: 'fav-get' });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);

  const { data, error } = await auth.admin
    .from('favorite_profiles')
    .select('profile_id')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    if (/favorite_profiles/i.test(error.message)) {
      return NextResponse.json({ ids: [], needMigration: true });
    }
    log.warn('favorites:GET', error.message);
    return NextResponse.json({ error: 'Не удалось загрузить избранное' }, { status: 500 });
  }
  return NextResponse.json({ ids: (data ?? []).map((row) => String(row.profile_id)) });
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 40, windowMs: 60_000, scope: 'fav-write' });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), { ...limit, limit: 40 });
  }
  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);

  const body = await request.json().catch(() => null);
  const profileId = String(body?.profileId ?? '').trim();
  if (!profileId) return NextResponse.json({ error: 'Нет анкеты' }, { status: 400 });

  const { error } = await auth.admin.from('favorite_profiles').upsert(
    { user_id: auth.userId, profile_id: profileId },
    { onConflict: 'user_id,profile_id' },
  );
  if (error) {
    log.warn('favorites:POST', error.message);
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authenticateTaskRequest(request);
  if ('error' in auth) return taskAuthError(auth);
  const profileId = new URL(request.url).searchParams.get('profileId') ?? '';
  if (!profileId) return NextResponse.json({ error: 'Нет анкеты' }, { status: 400 });

  const { error } = await auth.admin
    .from('favorite_profiles')
    .delete()
    .eq('user_id', auth.userId)
    .eq('profile_id', profileId);
  if (error) {
    log.warn('favorites:DELETE', error.message);
    return NextResponse.json({ error: 'Не удалось удалить' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
