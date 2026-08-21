import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { rateLimit, resetRateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

const DELETE_LIMIT = { limit: 5, windowMs: 60 * 60_000, scope: 'account-delete' } as const;

export async function DELETE(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Удаление аккаунта не настроено на сервере.' }, { status: 503 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Сессия не найдена.' }, { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна.' }, { status: 401 });
  }

  // Лимит считаем ПОСЛЕ проверки сессии и по id пользователя, а не по IP (п.16).
  //
  // Два прежних изъяна выдавали «Too many requests» тому, кто удаляет
  // аккаунт впервые:
  //  1) счёт шёл по IP — за домашним роутером или мобильным NAT все
  //     сидят под одним адресом и тратили общие 5 попыток в час;
  //  2) слот списывался до всякой проверки, поэтому его жгли и запросы
  //     без сессии, и повторные нажатия кнопки.
  // Теперь у каждого человека свои 5 попыток, а по завершении удаления
  // счётчик обнуляется (см. resetRateLimit ниже).
  const limit = await rateLimit(request, { ...DELETE_LIMIT, identifier: userData.user.id });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: 'Слишком много попыток удаления. Попробуйте через час.' },
        { status: 429 },
      ),
      { ...limit, limit: DELETE_LIMIT.limit },
    );
  }

  for (const folder of ['avatars', 'documents']) {
    const { data: files } = await adminClient.storage.from('profile-media').list(folder);
    const uid = userData.user.id;
    const ownedFiles = (files ?? [])
      // Новые аватары: <uuid>.webp (без дефиса); старые: <uuid>-<ts>.webp.
      .filter((file) => file.name === `${uid}.webp` || file.name.startsWith(`${uid}-`))
      .map((file) => `${folder}/${file.name}`);

    if (ownedFiles.length > 0) {
      await adminClient.storage.from('profile-media').remove(ownedFiles);
    }
  }

  const { error: profilesError } = await adminClient
    .from('profiles')
    .delete()
    .eq('owner_id', userData.user.id);

  if (profilesError) {
    return NextResponse.json({ error: `Не удалось удалить анкеты: ${profilesError.message}` }, { status: 500 });
  }

  const { error: accountError } = await adminClient
    .from('user_profiles')
    .delete()
    .eq('id', userData.user.id);

  if (accountError) {
    return NextResponse.json({ error: `Не удалось удалить данные профиля: ${accountError.message}` }, { status: 500 });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return NextResponse.json({ error: `Не удалось удалить аккаунт: ${deleteError.message}` }, { status: 500 });
  }

  // Аккаунта больше нет — держать на его id счётчик незачем. Если
  // человек зарегистрируется заново, он начнёт с чистого лимита.
  await resetRateLimit(request, { scope: DELETE_LIMIT.scope, identifier: userData.user.id });

  return NextResponse.json({ ok: true });
}
