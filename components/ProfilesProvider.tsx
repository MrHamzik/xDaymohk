'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { INITIAL_PROFILES } from '@/lib/mock-data';
import { certificateToDbRow, profileFromDb, profileToDbRow, profileUpdatesToDbRow, reviewToDbRow } from '@/lib/profile-db';
import { isAdminProfile } from '@/lib/profile-filters';
import { useNotifications } from '@/components/NotificationsProvider';
import { Complaint, ComplaintStatus, Profile, Review, UserSummary } from '@/lib/types';

const PROFILES_STORAGE_KEY = 'samashki-profiles';

type DbRow = Record<string, any>;

interface ProfilesContextValue {
  profiles: Profile[];
  users: UserSummary[];
  complaints: Complaint[];
  isCurrentUserAdmin: boolean;
  isProfileAdmin: (profile: Profile) => boolean;
  addProfile: (profile: Profile) => void;
  updateProfile: (profileId: string, updates: Partial<Profile>) => void;
  updateUserBlocked: (userId: string, isBlocked: boolean) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  addComplaint: (profileId: string, reason: string) => Promise<void>;
  updateComplaint: (complaintId: string, status: ComplaintStatus) => Promise<void>;
  addReview: (profileId: string, review: Omit<Review, 'id' | 'createdAt'>) => void;
}

const ProfilesContext = createContext<ProfilesContextValue | undefined>(undefined);

function normalizeProfiles(value: unknown): Profile[] | null {
  if (!Array.isArray(value)) return null;

  const profiles = value as Profile[];
  return profiles
    .filter((p) => !isDemoProfile(p as any))
    .map((profile) => ({
      ...profile,
      isAdmin: Boolean(profile.isAdmin),
    }));
}

function readStoredProfiles() {
  try {
    const stored = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!stored) return null;
    return normalizeProfiles(JSON.parse(stored));
  } catch {
    return null;
  }
}

async function persistProfileToSupabase(profile: Profile) {
  if (!supabase) return;

  const row = profileToDbRow(profile);
  const { error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'id' });
  if (error) {
    // If a new column (such as work_days or same_as_phone_whatsapp) has not been added yet in Supabase:
    // Fall back to base columns so saving succeeds on older schemas without throwing a dev overlay crash.
    const baseRow: Record<string, unknown> = {
      id: profile.id,
      owner_id: profile.ownerId ?? null,
      full_name: profile.fullName,
      avatar_url: profile.avatarUrl,
      photos: profile.photos,
      is_specialist: profile.isSpecialist,
      profession_category: profile.professionCategory ?? null,
      profession_title: profile.professionTitle ?? null,
      experience: profile.experience ?? null,
      experience_start: profile.experienceStart ?? null,
      experience_end: profile.experienceEnd ?? null,
      experience_current: profile.experienceCurrent ?? false,
      bio: profile.bio,
      workplace_address: profile.workplaceAddress,
      workplace_coords: profile.workplaceCoords,
      rating: profile.rating,
      review_count: profile.reviewCount,
      phone: profile.phone,
      hide_phone: profile.hidePhone ?? false,
      same_as_phone_whatsapp: profile.sameAsPhoneWhatsapp ?? true,
      is_verified: profile.isVerified ?? false,
      verification_status: profile.verificationStatus ?? 'none',
      is_admin: Boolean(profile.isAdmin),
      is_banned: profile.isBanned ?? false,
      telegram: profile.telegram ?? null,
      whatsapp: profile.whatsapp ?? null,
      video_url: profile.videoUrl ?? null,
      work_days: profile.workDays ?? null,
      work_hours_start: profile.workHoursStart ?? null,
      work_hours_end: profile.workHoursEnd ?? null,
      break_start: profile.breakStart ?? null,
      break_end: profile.breakEnd ?? null,
      is_flexible_schedule: profile.isFlexibleSchedule ?? false,
      gender: profile.gender ?? null,
      birth_date: (profile as any).birthDate ?? null,
      settlement: (profile as any).settlement ?? null,
      created_at: profile.createdAt,
    };
    const { error: retryError } = await supabase.from('profiles').upsert(baseRow, { onConflict: 'id' });
    if (retryError) {
      console.warn('Не удалось сохранить анкету в Supabase:', retryError.message);
      return;
    }
  }

  if (profile.isHidden === false) {
    const { error: visibilityError } = await supabase.from('profiles').update({ is_hidden: false }).eq('id', profile.id);
    if (visibilityError) console.warn('Не удалось обновить видимость анкеты:', visibilityError.message);
  }

  const certificateRows = profile.certificates.map((certificate) => certificateToDbRow(profile.id, certificate));
  if (certificateRows.length > 0) {
    const { error: certificateError } = await supabase
      .from('certificates')
      .upsert(certificateRows, { onConflict: 'id' });
    if (certificateError) console.warn('Не удалось сохранить документы анкеты:', certificateError.message);
  }

  // Editing a questionnaire can remove a document. Delete only the old
  // children that are no longer present, then upsert the current collection.
  const { data: existingCertificates, error: existingCertificatesError } = await supabase
    .from('certificates')
    .select('id')
    .eq('profile_id', profile.id);
  if (!existingCertificatesError && existingCertificates) {
    const currentCertificateIds = new Set(certificateRows.map((certificate) => certificate.id));
    const removedCertificateIds = existingCertificates
      .map((certificate) => String(certificate.id))
      .filter((id) => !currentCertificateIds.has(id));
    if (removedCertificateIds.length > 0) {
      const { error: deleteCertificateError } = await supabase
        .from('certificates')
        .delete()
        .in('id', removedCertificateIds);
      if (deleteCertificateError) console.warn('Не удалось удалить документы анкеты:', deleteCertificateError.message);
    }
  }

  if ((profile.reviews ?? []).length > 0) {
    const { error: reviewError } = await supabase
      .from('reviews')
      .upsert((profile.reviews ?? []).map((review) => reviewToDbRow(profile.id, review)), { onConflict: 'id' });
    if (reviewError) console.warn('Не удалось сохранить отзывы анкеты:', reviewError.message);
  }
}

async function loadFromSupabase(): Promise<Profile[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: profileRows, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !profileRows) {
    console.warn('Supabase profiles are unavailable:', error?.message);
    return null;
  }

  // An empty remote table is a valid state. Do not seed demo rows here:
  // otherwise deleting the last questionnaire would make it reappear after a reload.
  if (profileRows.length === 0) return [];

  const profileIds = profileRows.map((row) => row.id);
  const [{ data: certificateRows }, { data: reviewRows }] = await Promise.all([
    supabase.from('certificates').select('*').in('profile_id', profileIds),
    supabase.from('reviews').select('*').in('profile_id', profileIds).order('created_at', { ascending: false }),
  ]);

  const allProfiles = profileRows.map((row) => profileFromDb(
    row as DbRow,
    (certificateRows ?? []).filter((certificate) => certificate.profile_id === row.id) as DbRow[],
    (reviewRows ?? []).filter((review) => review.profile_id === row.id) as DbRow[],
  ));
  // Удаляем демо-карточки подчистую
  return allProfiles.filter((p) => !isDemoProfile(p));
}

const ADMIN_EMAILS_LIST = ['mr.hamzik1026@gmail.com', 'nabis95@gmail.com'];

const DEMO_PROFILE_NAMES = ['Лёма Сатуев', 'Хеди Межидова', 'Ризван Эдильсултанов', 'Зарема Дадаева', 'Асланбек Хатуев', 'Магомед Ибрагимов'];
const DEMO_PROFILE_IDS = ['sam-1','sam-2','sam-3','sam-4','sam-5','sam-6'];

function isDemoProfile(p: Profile): boolean {
  if (DEMO_PROFILE_IDS.includes(p.id)) return true;
  return DEMO_PROFILE_NAMES.some((name) => p.fullName.includes(name) || name.includes(p.fullName));
}

async function loadUsersFromSupabase(): Promise<UserSummary[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, avatar_url, is_admin, is_blocked')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data
    .filter((row) => row.email && typeof row.email === 'string' && row.email.trim().length > 0 && row.email.includes('@'))
    .map((row) => ({
      id: String(row.id),
      email: row.email.trim(),
      fullName: row.full_name ?? 'Пользователь',
      avatarUrl: row.avatar_url ?? '',
      // Админы только по email списку, флаг is_admin в БД игнорируется для остальных
      isAdmin: ADMIN_EMAILS_LIST.includes(String(row.email ?? '').trim().toLowerCase()),
      isBlocked: Boolean(row.is_blocked),
      profileCount: 0,
    }));
}

async function loadComplaintsFromSupabase(): Promise<Complaint[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });
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

function extractDigits(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 10 && (digits.startsWith('7') || digits.startsWith('8'))) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export default function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const { createNotification } = useNotifications();
  const [profiles, setProfiles] = useState<Profile[]>(isSupabaseConfigured ? [] : INITIAL_PROFILES);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  function mergeProfilesWithLocal(remote: Profile[] | null, local: Profile[] | null): Profile[] | null {
    if (!remote) return local;
    if (!local) return remote;
    if (remote.length === 0 && local.length > 0) return local; // не затираем локальные данные пустым удалённым
    const localMap = new Map(local.map((p) => [p.id, p]));
    const mergedRemote = remote.map((r) => {
      const l = localMap.get(r.id);
      if (!l) return r;
      const sameAs = l.sameAsPhoneWhatsapp === false ? false : (r.sameAsPhoneWhatsapp ?? l.sameAsPhoneWhatsapp ?? true);
      return {
        ...r,
        whatsapp: sameAs === false ? (l.whatsapp ?? r.whatsapp) : (r.whatsapp ?? l.whatsapp),
        telegram: l.telegram ?? r.telegram,
        sameAsPhoneWhatsapp: sameAs,
        hidePhone: l.hidePhone ?? r.hidePhone,
        phone: r.phone || l.phone,
      };
    });
    // Добавляем локальные профили которых нет в remote (например созданы оффлайн)
    const remoteIds = new Set(remote.map((p) => p.id));
    const extraLocal = local.filter((p) => !remoteIds.has(p.id));
    return [...mergedRemote, ...extraLocal];
  }

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const storedProfiles = readStoredProfiles();
      const remoteProfiles = await loadFromSupabase();
      const remoteUsers = await loadUsersFromSupabase();
      const remoteComplaints = await loadComplaintsFromSupabase();
      const merged = mergeProfilesWithLocal(remoteProfiles ? normalizeProfiles(remoteProfiles) : null, storedProfiles);
      const nextProfiles = merged ?? normalizeProfiles(storedProfiles ?? INITIAL_PROFILES) ?? INITIAL_PROFILES;
      const nextUsers = remoteUsers.map((user) => ({
        ...user,
        profileCount: nextProfiles.filter((profile) => profile.ownerId === user.id).length,
      }));

      if (!cancelled) {
        setProfiles(nextProfiles);
        setUsers(nextUsers);
        setComplaints(remoteComplaints);
        setIsHydrated(true);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let cancelled = false;
    const refreshRemoteData = async () => {
      const [remoteProfiles, remoteUsers, remoteComplaints] = await Promise.all([
        loadFromSupabase(),
        loadUsersFromSupabase(),
        loadComplaintsFromSupabase(),
      ]);
      if (cancelled) return;
      if (remoteProfiles !== null) {
        const stored = readStoredProfiles();
        const normalizedRemote = normalizeProfiles(remoteProfiles) ?? [];
        const merged = stored ? mergeProfilesWithLocal(normalizedRemote, stored) ?? normalizedRemote : normalizedRemote;
        setProfiles(merged);
        setUsers(remoteUsers.map((user) => ({
          ...user,
          profileCount: merged.filter((profile) => profile.ownerId === user.id).length,
        })));
      }
      setComplaints(remoteComplaints);
    };

    const channel = supabase
      .channel('samashki-live-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void refreshRemoteData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => { void refreshRemoteData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => { void refreshRemoteData(); })
      .subscribe();
    const interval = window.setInterval(() => { void refreshRemoteData(); }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void supabase?.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // Profiles still work for the current session if storage is unavailable.
    }
  }, [profiles, isHydrated]);

  useEffect(() => {
    const handleAccountDeleted = (event: Event) => {
      const ownerId = (event as CustomEvent<{ ownerId?: string }>).detail?.ownerId;
      if (!ownerId) return;
      setProfiles((currentProfiles) => currentProfiles.filter((profile) => profile.ownerId !== ownerId));
    };

    window.addEventListener('samashki-account-deleted', handleAccountDeleted);
    return () => window.removeEventListener('samashki-account-deleted', handleAccountDeleted);
  }, []);

  const syncAccountToQuestionnaires = useCallback((targetAccount: NonNullable<typeof account>) => {
    const phoneDigits = extractDigits(targetAccount.phone);
    const formattedWhatsapp = phoneDigits ? `7${phoneDigits}` : undefined;

    setProfiles((currentProfiles) => {
      const updatedProfiles = currentProfiles.map((profile) => {
        if (profile.ownerId !== targetAccount.id) return profile;
        const isSameWhatsapp = profile.sameAsPhoneWhatsapp === true;
        return {
          ...profile,
          fullName: targetAccount.fullName,
          avatarUrl: targetAccount.avatarUrl,
          phone: targetAccount.phone || profile.phone,
          whatsapp: isSameWhatsapp && formattedWhatsapp ? formattedWhatsapp : (isSameWhatsapp ? undefined : profile.whatsapp),
          isAdmin: Boolean(targetAccount.isAdmin || profile.isAdmin),
          statusOverride: targetAccount.statusOverride,
        };
      });

      try {
        window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      } catch {
        // Fallback for storage restrictions.
      }
      return updatedProfiles;
    });

    setUsers((currentUsers) => {
      const existingUser = currentUsers.find((user) => user.id === targetAccount.id);
      const updatedUser: UserSummary = {
        id: targetAccount.id,
        email: targetAccount.email,
        fullName: targetAccount.fullName,
        avatarUrl: targetAccount.avatarUrl,
        isAdmin: Boolean(targetAccount.isAdmin),
        isBlocked: Boolean(targetAccount.isBlocked),
        profileCount: existingUser?.profileCount ?? 0,
      };
      return currentUsers.some((user) => user.id === targetAccount.id)
        ? currentUsers.map((user) => user.id === targetAccount.id ? { ...updatedUser, profileCount: user.profileCount } : user)
        : [updatedUser, ...currentUsers];
    });

    if (supabase) {
      void (async () => {
        await supabase
          .from('profiles')
          .update({
            full_name: targetAccount.fullName,
            avatar_url: targetAccount.avatarUrl,
            phone: targetAccount.phone,
            is_admin: Boolean(targetAccount.isAdmin),
          })
          .eq('owner_id', targetAccount.id);

        if (formattedWhatsapp) {
          await supabase
            .from('profiles')
            .update({ whatsapp: formattedWhatsapp })
            .eq('owner_id', targetAccount.id)
            .or('same_as_phone_whatsapp.is.null,same_as_phone_whatsapp.eq.true');
        }
      })();
    }
  }, []);

  useEffect(() => {
    const handleAccountUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ account?: NonNullable<typeof account> }>).detail;
      if (detail?.account) {
        syncAccountToQuestionnaires(detail.account);
      }
    };

    window.addEventListener('samashki-account-updated', handleAccountUpdated);
    return () => window.removeEventListener('samashki-account-updated', handleAccountUpdated);
  }, [syncAccountToQuestionnaires]);

  useEffect(() => {
    if (!isHydrated || !account) return;
    syncAccountToQuestionnaires(account);
  }, [account?.id, account?.fullName, account?.avatarUrl, account?.phone, account?.isAdmin, isHydrated, syncAccountToQuestionnaires]);

  // Автоматическое создание личной анкеты для каждого пользователя
  useEffect(() => {
    if (!isHydrated || !account) return;
    const hasPersonal = profiles.some((p) => p.ownerId === account.id && (p.isPersonal || p.id === `personal-${account.id}` || p.id.startsWith('personal-')));
    if (hasPersonal) return;

    const personalProfile: Profile = {
      id: `personal-${account.id}`,
      ownerId: account.id,
      fullName: account.fullName,
      avatarUrl: account.avatarUrl,
      photos: [],
      isSpecialist: false,
      isPersonal: true,
      bio: 'Житель Даймохк. Личная анкета.',
      workplaceAddress: 'Даймохк',
      workplaceCoords: { lat: 43.288024, lng: 45.298989 },
      rating: 0,
      reviewCount: 0,
      reviews: [],
      certificates: [],
      phone: account.phone || '',
      hidePhone: true, // в личной анкете не видно номеров
      sameAsPhoneWhatsapp: false,
      whatsapp: undefined,
      telegram: undefined,
      isVerified: false,
      verificationStatus: 'none',
      isAdmin: Boolean(account.isAdmin),
      isHidden: false,
      isBanned: false,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setProfiles((cur) => [personalProfile, ...cur]);
    if (supabase) void persistProfileToSupabase(personalProfile);
  }, [isHydrated, account?.id]);

  const addProfile = useCallback((profile: Profile) => {
    const profileWithRole: Profile = {
      ...profile,
      isAdmin: Boolean(profile.isAdmin || account?.isAdmin),
    };
    setProfiles((currentProfiles) => {
      // Личная всегда индекс 0
      const personals = currentProfiles.filter((p) => p.isPersonal && p.ownerId === profileWithRole.ownerId);
      const others = currentProfiles.filter((p) => !(p.isPersonal && p.ownerId === profileWithRole.ownerId));
      if (personals.length > 0) {
        return [...personals, profileWithRole, ...others];
      }
      return [profileWithRole, ...others];
    });
    if (profileWithRole.ownerId) {
      setUsers((currentUsers) => currentUsers.map((user) => (
        user.id === profileWithRole.ownerId ? { ...user, profileCount: user.profileCount + 1 } : user
      )));
    }
    if (supabase) {
      void persistProfileToSupabase(profileWithRole);
    }
    if (profileWithRole.ownerId && profileWithRole.ownerId === account?.id) {
      void createNotification(profileWithRole.ownerId, 'system', 'Анкета сохранена', 'Ваша анкета добавлена в каталог.');
    }
  }, [account?.id, account?.isAdmin, createNotification]);

  const updateProfile = useCallback((profileId: string, updates: Partial<Profile>) => {
    const currentProfile = profiles.find((profile) => profile.id === profileId);
    if (!currentProfile) return;

    // Личную анкету нельзя скрыть
    if (currentProfile.isPersonal && (updates.isHidden === true || updates.isBanned === true)) return;

    const adminOwnerId = account?.isAdmin ? account.id : undefined;
    if (account?.isBlocked && currentProfile.ownerId === account.id) return;
    if (updates.isHidden === true && isAdminProfile(currentProfile, adminOwnerId)) return;

    const nextProfile: Profile = {
      ...currentProfile,
      ...updates,
      isAdmin: updates.isAdmin !== undefined ? Boolean(updates.isAdmin) : Boolean(currentProfile.isAdmin || account?.isAdmin),
    };
    const wasHidden = Boolean(currentProfile.isHidden || currentProfile.isBanned);
    const isNowHidden = Boolean(nextProfile.isHidden || nextProfile.isBanned);
    if (currentProfile.ownerId && currentProfile.ownerId !== account?.id && wasHidden !== isNowHidden) {
      void createNotification(
        currentProfile.ownerId,
        isNowHidden ? 'profile_hidden' : 'profile_visible',
        isNowHidden ? 'Анкета скрыта' : 'Анкета снова опубликована',
        isNowHidden ? 'Администратор скрыл вашу анкету. Откройте профиль и проверьте причину.' : 'Администратор снова сделал вашу анкету видимой в каталоге.',
      );
    }
    if (currentProfile.ownerId && currentProfile.ownerId !== account?.id && updates.verificationStatus === 'verified') {
      void createNotification(currentProfile.ownerId, 'system', 'Анкета проверена', 'Администратор подтвердил анкету. Рядом с именем появилась галочка.');
    }
    setProfiles((currentProfiles) => currentProfiles.map((profile) => (
      profile.id === profileId ? nextProfile : profile
    )));

    const row = profileUpdatesToDbRow(nextProfile);
    if (supabase && Object.keys(row).length > 0) {
      // Persist the complete questionnaire as well as the changed columns so
      // document additions/removals survive a page reload.
      void persistProfileToSupabase(nextProfile);
    }
  }, [profiles, account?.id, account?.isAdmin, account?.isBlocked, createNotification]);

  const updateUserBlocked = useCallback(async (userId: string, isBlocked: boolean) => {
    const target = users.find((user) => user.id === userId);
    const targetEmail = target?.email?.trim().toLowerCase();
    if (target?.isAdmin || (targetEmail && ADMIN_EMAILS_LIST.includes(targetEmail)) || userId === account?.id) return;

    if (supabase) {
      const { error: userError } = await supabase
        .from('user_profiles')
        .update({ is_blocked: isBlocked })
        .eq('id', userId);
      if (userError) throw new Error(userError.message);

      const { error: profilesError } = await supabase
        .from('profiles')
        .update({ is_hidden: isBlocked })
        .eq('owner_id', userId);
      if (profilesError) throw new Error(profilesError.message);
    }

    void createNotification(
      userId,
      isBlocked ? 'user_blocked' : 'user_unblocked',
      isBlocked ? 'Аккаунт заблокирован' : 'Аккаунт разблокирован',
      isBlocked ? 'Администратор заблокировал ваш аккаунт и скрыл его анкеты.' : 'Администратор разблокировал ваш аккаунт.',
    );
    setUsers((currentUsers) => currentUsers.map((user) => (
      user.id === userId ? { ...user, isBlocked } : user
    )));
    setProfiles((currentProfiles) => currentProfiles.map((profile) => (
      profile.ownerId === userId ? { ...profile, isHidden: isBlocked } : profile
    )));
  }, [users, account?.id, createNotification]);

  const deleteProfile = useCallback(async (profileId: string) => {
    const target = profiles.find((p) => p.id === profileId);
    if (target?.isPersonal) return; // личную нельзя удалить
    if (supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profileId)
        .select('id');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error('Анкета не удалена. Примените политики DELETE из supabase/upgrade_existing.sql и повторите попытку.');
      }
    }
    const deletedProfile = profiles.find((profile) => profile.id === profileId);
    setProfiles((currentProfiles) => currentProfiles.filter((profile) => profile.id !== profileId));
    if (deletedProfile?.ownerId) {
      setUsers((currentUsers) => currentUsers.map((user) => (
        user.id === deletedProfile.ownerId ? { ...user, profileCount: Math.max(0, user.profileCount - 1) } : user
      )));
    }
  }, [profiles]);

  const addComplaint = useCallback(async (profileId: string, reason: string) => {
    if (!account || account.isBlocked || !reason.trim()) return;
    const reportedProfile = profiles.find((profile) => profile.id === profileId);
    const complaint: Complaint = {
      id: `complaint-${Date.now()}`,
      profileId,
      targetUserId: reportedProfile?.ownerId,
      authorId: account.id,
      authorName: account.fullName,
      reason: reason.trim().slice(0, 500),
      status: 'open',
      createdAt: new Date().toISOString().split('T')[0],
    };

    if (supabase) {
      const { error } = await supabase.from('complaints').insert({
        id: complaint.id,
        profile_id: complaint.profileId,
        target_user_id: complaint.targetUserId ?? null,
        author_id: complaint.authorId,
        author_name: complaint.authorName,
        reason: complaint.reason,
        status: complaint.status,
        created_at: complaint.createdAt,
      });
      if (error) throw new Error(error.message);
    }
    setComplaints((currentComplaints) => [complaint, ...currentComplaints]);
  }, [account, profiles]);

  const updateComplaint = useCallback(async (complaintId: string, status: ComplaintStatus) => {
    if (supabase) {
      const { error } = await supabase.from('complaints').update({ status }).eq('id', complaintId);
      if (error) throw new Error(error.message);
    }
    setComplaints((currentComplaints) => currentComplaints.map((complaint) => (
      complaint.id === complaintId ? { ...complaint, status } : complaint
    )));
  }, []);

  const addReview = useCallback((profileId: string, reviewData: Omit<Review, 'id' | 'createdAt'>) => {
    if (account?.isBlocked) return;
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;

    const previousCount = profile.reviewCount;
    const nextCount = previousCount + 1;
    const nextRating = previousCount > 0
      ? Number(((profile.rating * previousCount + reviewData.rating) / nextCount).toFixed(1))
      : reviewData.rating;
    const review: Review = {
      ...reviewData,
      id: `review-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setProfiles((currentProfiles) => currentProfiles.map((item) => (
      item.id === profileId
        ? { ...item, rating: nextRating, reviewCount: nextCount, reviews: [review, ...(item.reviews ?? [])] }
        : item
    )));

    if (supabase) {
      void Promise.all([
        supabase.from('reviews').insert(reviewToDbRow(profileId, review)),
        supabase.from('profiles').update({ rating: nextRating, review_count: nextCount }).eq('id', profileId),
      ]);
    }
  }, [profiles, account?.isBlocked]);

  // Administration is an account status, visible on all questionnaires created by administrators.
  const isCurrentUserAdmin = Boolean(account?.isAdmin);
  const isProfileAdmin = useCallback(
    (profile: Profile) => isAdminProfile(profile, account?.isAdmin ? account.id : undefined, users),
    [account?.id, account?.isAdmin, users],
  );

  const value = useMemo(
    () => ({ profiles, users, complaints, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, updateUserBlocked, deleteProfile, addComplaint, updateComplaint, addReview }),
    [profiles, users, complaints, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, updateUserBlocked, deleteProfile, addComplaint, updateComplaint, addReview],
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles() {
  const context = useContext(ProfilesContext);

  if (!context) {
    throw new Error('useProfiles must be used inside ProfilesProvider');
  }

  return context;
}
