import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Чёрный список: взаимное скрытие между жителями.
 *
 *   GET    /api/blacklist            — мой список + id, скрытые от меня
 *   POST   /api/blacklist            — заблокировать пользователя
 *   DELETE /api/blacklist?id=…       — снять блокировку
 *
 * Скрытие ВЗАИМНОЕ: если A заблокировал B, они перестают видеть друг
 * друга. Поэтому GET отдаёт два поля: `list` (кого заблокировал я —
 * его можно разблокировать) и `hiddenIds` (все, кого мне не показывать,
 * включая тех, кто заблокировал меня).
 *
 * Тот, кого заблокировали, НЕ должен об этом узнать: в `list` он чужие
 * записи не увидит, а `hiddenIds` не различает направление.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function caller(request: Request): Promise<{ id: string } | null> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

export async function GET(request: Request) {
  const me = await caller(request);
  if (!me) return NextResponse.json({ list: [], hiddenIds: [] });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ list: [], hiddenIds: [] });

  try {
    // Обе стороны отношения одним запросом: строки, где я блокирующий,
    // и строки, где заблокировали меня.
    const { data, error } = await admin
      .from('blocked_users')
      .select('blocker_id, blocked_id, reason, created_at')
      .or(`blocker_id.eq.${me.id},blocked_id.eq.${me.id}`);

    if (error) {
      // Миграция 32 могла быть не применена — интерфейс обязан
      // открыться пустым, а не упасть.
      log.warn('blacklist:GET', 'query failed', { message: error.message });
      return NextResponse.json({ list: [], hiddenIds: [] });
    }

    const rows = data ?? [];
    const mine = rows.filter((r) => r.blocker_id === me.id);
    const hiddenIds = Array.from(new Set(
      rows.map((r) => (r.blocker_id === me.id ? r.blocked_id : r.blocker_id)),
    ));

    // Имена и аватары — для списка в модалке. Отдаём только по СВОИМ
    // блокировкам: чужие записи наружу не выходят.
    let people: Record<string, { fullName: string; avatarUrl: string }> = {};
    if (mine.length > 0) {
      const { data: profiles } = await admin
        .from('user_profiles')
        .select('id, full_name, avatar_url')
        .in('id', mine.map((r) => r.blocked_id));
      people = Object.fromEntries((profiles ?? []).map((p) => [
        String(p.id),
        { fullName: p.full_name ?? '', avatarUrl: p.avatar_url ?? '' },
      ]));
    }

    return NextResponse.json({
      list: mine.map((r) => ({
        userId: r.blocked_id,
        fullName: people[r.blocked_id]?.fullName ?? '',
        avatarUrl: people[r.blocked_id]?.avatarUrl ?? '',
        reason: r.reason ?? '',
        createdAt: r.created_at ?? '',
      })),
      hiddenIds,
    });
  } catch (e) {
    log.warn('blacklist:GET', 'unexpected', { message: String(e) });
    return NextResponse.json({ list: [], hiddenIds: [] });
  }
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { scope: 'blacklist:add', limit: 30, windowMs: 600_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много действий подряд' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Войдите, чтобы продолжить' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const targetId = typeof body?.userId === 'string' ? body.userId : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 300) : '';

  if (!targetId) return NextResponse.json({ error: 'Не указан пользователь' }, { status: 400 });
  if (targetId === me.id) {
    return NextResponse.json({ error: 'Нельзя заблокировать самого себя' }, { status: 400 });
  }

  // Администратора заблокировать нельзя: иначе человек сам отрежет себе
  // разбор жалоб и поддержку.
  const { data: target } = await admin
    .from('user_profiles').select('id, is_admin').eq('id', targetId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
  if (target.is_admin) {
    return NextResponse.json({ error: 'Администратора заблокировать нельзя' }, { status: 403 });
  }

  const { error } = await admin.from('blocked_users').upsert(
    { blocker_id: me.id, blocked_id: targetId, reason },
    { onConflict: 'blocker_id,blocked_id' },
  );

  if (error) {
    log.warn('blacklist:POST', 'insert failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось заблокировать' }, { status: 500 });
  }

  // Уведомление заблокированному НЕ отправляем намеренно: чёрный список
  // нужен, чтобы прекратить общение, а не чтобы начать конфликт.
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Войдите, чтобы продолжить' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const targetId = new URL(request.url).searchParams.get('id') ?? '';
  if (!targetId) return NextResponse.json({ error: 'Не указан пользователь' }, { status: 400 });

  // Условие по blocker_id обязательно: без него можно было бы снять
  // ЧУЖУЮ блокировку, передав любой id.
  const { error } = await admin.from('blocked_users')
    .delete().eq('blocker_id', me.id).eq('blocked_id', targetId);

  if (error) {
    log.warn('blacklist:DELETE', 'delete failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось разблокировать' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
