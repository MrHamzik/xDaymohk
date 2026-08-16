import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { authenticateAdmin, authError } from '@/lib/auth';
import { log } from '@/lib/logger';
import { makeId } from '@/lib/tasks/server';

/**
 * Справочник фильтров, управляемый из админки (раздел «Фильтры»).
 * scope: tasks — категории заданий, catalog — сферы каталога,
 * map — категории объектов на карте.
 *
 * Чтение публичное (фильтры видит любой), запись — только админ.
 */

const SCOPES = ['tasks', 'catalog', 'map'] as const;
type Scope = (typeof SCOPES)[number];

export async function GET(request: Request) {
  const limit = await rateLimit(request, { limit: 120, windowMs: 60_000, scope: 'filters-read' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 120 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ filters: [] });

  const scopeParam = new URL(request.url).searchParams.get('scope');
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = client
    .from('app_filters')
    .select('id, scope, value, label_ru, label_ce, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (scopeParam && SCOPES.includes(scopeParam as Scope)) {
    query = query.eq('scope', scopeParam);
  }

  const { data, error } = await query;
  if (error) {
    log.warn('filters read failed:', error.message);
    return NextResponse.json({ filters: [] });
  }

  return NextResponse.json({
    filters: (data ?? []).map((f) => ({
      id: f.id,
      scope: f.scope,
      value: f.value,
      labelRu: f.label_ru,
      labelCe: f.label_ce,
      sortOrder: f.sort_order,
      isActive: f.is_active,
    })),
  });
}

/** POST — создать/обновить фильтр (только админ). */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000, scope: 'filters-write' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const auth = await authenticateAdmin(request);
  if ('error' in auth) return authError(auth);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const scope = String(body.scope ?? '') as Scope;
  if (!SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'Некорректный раздел фильтра' }, { status: 400 });
  }
  // value уходит в URL и сравнения — оставляем только безопасный слаг.
  const value = String(body.value ?? '').trim().toLowerCase().slice(0, 50);
  if (!/^[a-z0-9_-]+$/.test(value)) {
    return NextResponse.json(
      { error: 'Значение: латиница, цифры, дефис и подчёркивание' },
      { status: 400 },
    );
  }
  const labelRu = String(body.labelRu ?? '').trim().slice(0, 100);
  if (!labelRu) return NextResponse.json({ error: 'Укажите название' }, { status: 400 });
  const labelCe = String(body.labelCe ?? '').trim().slice(0, 100) || null;
  const sortOrder = Math.min(Math.max(Math.floor(Number(body.sortOrder) || 0), 0), 10_000);
  const isActive = body.isActive !== false;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const id = String(body.id ?? '').trim() || makeId('flt');
  const { error } = await admin.from('app_filters').upsert(
    {
      id,
      scope,
      value,
      label_ru: labelRu,
      label_ce: labelCe,
      sort_order: sortOrder,
      is_active: isActive,
    },
    { onConflict: 'scope,value' },
  );
  if (error) {
    log.warn('filters upsert failed:', error.message);
    return NextResponse.json({ error: 'Не удалось сохранить фильтр' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}

/** DELETE ?id= — мягкое отключение (is_active=false), чтобы не осиротить данные. */
export async function DELETE(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000, scope: 'filters-delete' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 },
    );
  }

  const auth = await authenticateAdmin(request);
  if ('error' in auth) return authError(auth);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Не удаляем физически: у существующих заданий останется ссылка на
  // категорию, и они не должны «потерять» свой фильтр.
  const { error } = await admin.from('app_filters').update({ is_active: false }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'Не удалось удалить фильтр' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
