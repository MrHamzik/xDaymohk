import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

  for (const folder of ['avatars', 'documents']) {
    const { data: files } = await adminClient.storage.from('profile-media').list(folder);
    const ownedFiles = (files ?? [])
      .filter((file) => file.name.startsWith(`${userData.user.id}-`))
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

  return NextResponse.json({ ok: true });
}
