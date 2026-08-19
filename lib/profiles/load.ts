import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isDevEmail } from '@/lib/admin';
import { profileFromDb } from '@/lib/profile-db';
import { isDemoProfile } from '@/lib/profiles/admin';
import { Complaint, Profile, UserSummary } from '@/lib/types';

type DbRow = Record<string, any>;

export async function loadProfilesFromSupabase(): Promise<Profile[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  // Читаем через v_profiles, а не напрямую из таблицы (обновление 47):
  // вьюха отдаёт телефон, WhatsApp и Telegram только вошедшим, а гостям
  // — пустые значения плюс признак contacts_locked. Права на строки при
  // этом те же: у вьюхи security_invoker = true, RLS таблицы работает
  // как работал, скрытые и забаненные анкеты остаются скрытыми.
  const { data: profileRows, error } = await supabase
    .from('v_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !profileRows) {
    console.warn('Supabase profiles are unavailable:', error?.message);
    return null;
  }

  // Empty remote table is a valid state; do not seed demo rows.
  if (profileRows.length === 0) return [];

  const profileIds = profileRows.map((row) => row.id);
  const [{ data: certificateRows }, { data: reviewRows }] = await Promise.all([
    supabase.from('certificates').select('*').in('profile_id', profileIds),
    // Read reviews through v_reviews so the live author /
    // author_avatar_url come from user_profiles, not from a
    // snapshot stored at insert time. profileFromDb() maps the
    // view's `author` / `author_avatar_url` columns straight into
    // the same `author` / `authorAvatarUrl` fields on the Review
    // type that the UI has always used.
    // created_at is a DATE, so reviews posted the same day would
    // come back in arbitrary order — tie-break by id (millisecond
    // timestamp) so the newest review is always first.
    supabase.from('v_reviews').select('*').in('profile_id', profileIds).order('created_at', { ascending: false }).order('id', { ascending: false }),
  ]);

  return profileRows
    .map((row) =>
      profileFromDb(
        row as DbRow,
        ((certificateRows ?? []).filter((certificate) => certificate.profile_id === row.id) as DbRow[]) ?? [],
        ((reviewRows ?? []).filter((review) => review.profile_id === row.id) as DbRow[]) ?? []
      )
    )
    .filter((profile) => !isDemoProfile(profile));
}

export async function loadUsersFromSupabase(): Promise<UserSummary[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  // Read from the v_users_with_profile_count view (defined in
  // supabase/steps/11-profiles-rls-and-count.sql). The view returns
  // user_profiles joined with a server-computed count of their
  // profiles, including personal ones. Regular users will only see
  // their own row through user_profiles RLS, which is exactly what
  // we want — the admin panel reads the view through the anon
  // client too, but the admin email check happens elsewhere
  // (AdminPage already gates the whole page on isCurrentUserAdmin).
  const { data, error } = await supabase
    .from('v_users_with_profile_count')
    .select('id, email, full_name, avatar_url, is_admin, is_blocked, profile_count, hidden_count, gender, birth_date')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data
    .filter((row) => row.email && typeof row.email === 'string' && row.email.trim().length > 0 && row.email.includes('@'))
    .map((row) => ({
      id: String(row.id),
      email: row.email.trim(),
      fullName: row.full_name ?? 'Пользователь',
      avatarUrl: row.avatar_url ?? '',
      // Видимый админ-статус: из БД (можно давать/отбирать), но невидимый
      // разработчик всегда показывается как обычный житель.
      isAdmin: Boolean(row.is_admin) && !isDevEmail(row.email),
      isBlocked: Boolean(row.is_blocked),
      profileCount: Number(row.profile_count ?? 0),
      // Пол/дата рождения (колонки добавлены во вью обновлением
      // supabase/update/17-gender-birth-sync.sql) — личная анкета берёт их
      // отсюда с фолбэком на profiles.gender/birth_date (синхронизация
      // триггером trg_user_profiles_demographics).
      gender: row.gender === 'male' || row.gender === 'female' ? row.gender : undefined,
      birthDate: row.birth_date ? String(row.birth_date) : undefined,
    }));
}

export async function loadComplaintsFromSupabase(): Promise<Complaint[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    profileId: String(row.profile_id),
    targetUserId: row.target_user_id ?? undefined,
    authorId: String(row.author_id),
    authorName: row.author_name ?? 'Пользователь',
    reason: row.reason ?? '',
    status: row.status ?? 'open',
    createdAt: row.created_at ?? '',
  }));
}
