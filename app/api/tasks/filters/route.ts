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

// 'map' — категории объектов карты. Раньше они жили в localStorage
// админки, то есть были видны только на одном устройстве; теперь общий
// справочник в БД (миграция 22).
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
  // Читаем и неактивные тоже, если запросила админка (?all=1): иначе
  // отключённый фильтр исчезал из списка и вернуть его было нельзя.
  const includeInactive = new URL(request.url).searchParams.get('all') === '1';
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = client
    .from('app_filters')
    .select('id, scope, value, label_ru, label_ce, icon, sort_order, is_active')
    .order('sort_order', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
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
      icon: f.icon,
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
  // Иконка — имя из набора lucide-react. Ограничиваем латиницей, чтобы
  // в разметку не попало произвольное значение из запроса.
  const iconRaw = String(body.icon ?? '').trim().slice(0, 40);
  const icon = /^[A-Za-z0-9]+$/.test(iconRaw) ? iconRaw : null;
  const sortOrder = Math.min(Math.max(Math.floor(Number(body.sortOrder) || 0), 0), 10_000);
  const isActive = body.isActive !== false;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const providedId = String(body.id ?? '').trim();
  const payload = {
    scope,
    value,
    label_ru: labelRu,
    label_ce: labelCe,
    icon,
    sort_order: sortOrder,
    is_active: isActive,
  };

  // Правка существующего — строго по id. Раньше здесь был upsert по
  // (scope, value): при переименовании кода фильтра совпадения не было,
  // и вместо обновления создавалась вторая запись.
  if (providedId) {
    const { error } = await admin.from('app_filters').update(payload).eq('id', providedId);
    if (error) {
      log.warn('filters update failed:', error.message);
      return NextResponse.json({ error: 'Не удалось сохранить фильтр' }, { status: 500 });
    }
    return NextResponse.json({ success: true, id: providedId });
  }

  // Новый фильтр: пара (scope, value) уникальна — сообщаем понятно,
  // вместо сырой ошибки БД про нарушение индекса.
  const { data: duplicate } = await admin
    .from('app_filters')
    .select('id')
    .eq('scope', scope)
    .eq('value', value)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json(
      { error: `Фильтр с кодом «${value}» уже есть в этом разделе` },
      { status: 409 },
    );
  }

  const id = makeId('flt');
  const { error } = await admin.from('app_filters').insert({ id, ...payload });
  if (error) {
    log.warn('filters insert failed:', error.message);
    return NextResponse.json({ error: 'Не удалось создать фильтр' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}

/**
 * PATCH — сохранить новый порядок после перетаскивания.
 * Принимает { ids: string[] } в нужной последовательности и
 * проставляет sort_order с шагом 10 (запас для вставок между).
 */
export async function PATCH(request: Request) {
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000, scope: 'filters-order' });
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

  let body: { ids?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((v) => String(v)).filter(Boolean).slice(0, 200)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Пустой список' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (let i = 0; i < ids.length; i += 1) {
    const { error } = await admin
      .from('app_filters')
      .update({ sort_order: (i + 1) * 10 })
      .eq('id', ids[i]);
    if (error) {
      log.warn('filters reorder failed:', error.message);
      return NextResponse.json({ error: 'Не удалось сохранить порядок' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
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
