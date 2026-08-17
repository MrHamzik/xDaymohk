'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { isAdminEmail, isDevEmail } from '@/lib/admin';
import { profileUpdatesToDbRow } from '@/lib/profile-db';
import { isAdminProfile } from '@/lib/profile-filters';
import { useNotifications } from '@/components/NotificationsProvider';
import {
  loadComplaintsFromSupabase,
  loadProfilesFromSupabase,
  loadUsersFromSupabase,
} from '@/lib/profiles/load';
import { persistProfileToSupabase } from '@/lib/profiles/persist';
import { fetchResidentReputationMap, type ResidentReputation } from '@/lib/reputation';
import { sanitizeReason } from '@/lib/validation';
import { extractPhoneDigits } from '@/lib/phone';
import { Complaint, ComplaintStatus, NotificationType, Profile, Review, UserSummary } from '@/lib/types';

interface ProfilesContextValue {
  profiles: Profile[];
  users: UserSummary[];
  /** Публичная репутация по заданиям: userId → рейтинг и счётчики. */
  reputation: Record<string, ResidentReputation>;
  complaints: Complaint[];
  isCurrentUserAdmin: boolean;
  isProfileAdmin: (profile: Profile) => boolean;
  addProfile: (profile: Profile) => void;
  updateProfile: (profileId: string, updates: Partial<Profile>) => void;
  updateUserBlocked: (userId: string, isBlocked: boolean) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  addComplaint: (profileId: string, reason: string) => Promise<void>;
  updateComplaint: (complaintId: string, status: ComplaintStatus) => Promise<void>;
  addReview: (profileId: string, review: Omit<Review, 'id' | 'createdAt'>) => Promise<void>;
  /** Send a system notification to a user (used by the admin panel). */
  createNotification: (recipientId: string, type: NotificationType, title: string, message: string, ceTitle?: string, ceMessage?: string, sender?: string) => Promise<void>;
  /** Reload profiles/users/complaints from Supabase. */
  refreshRemoteData: () => Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextValue | undefined>(undefined);

export default function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const { createNotification } = useNotifications();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  // Репутация грузится отдельным запросом к публичной вьюхе:
  // v_users_with_profile_count из-за RLS отдаёт только свою строку,
  // поэтому чужие рейтинги оттуда взять нельзя.
  const [reputation, setReputation] = useState<Record<string, ResidentReputation>>({});
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  /**
   * Fetch all remote data and reconcile the local view. The database
   * is the single source of truth; we don't keep a separate
   * localStorage cache for profiles anymore. (localStorage was the
   * source of "phantom" rows that leaked across users and sessions.)
   */
  const refreshRemoteData = useCallback(async () => {
    const [remoteProfiles, remoteUsers, remoteComplaints] = await Promise.all([
      loadProfilesFromSupabase(),
      loadUsersFromSupabase(),
      loadComplaintsFromSupabase(),
    ]);
    if (remoteProfiles !== null) {
      setProfiles(remoteProfiles);
    }
    setUsers(remoteUsers);
    setComplaints(remoteComplaints);

    // Репутация — отдельным запросом к публичной вьюхе: рейтинг нужен
    // для ЧУЖИХ карточек, а v_users_with_profile_count под RLS отдаёт
    // только собственную строку.
    const ownerIds = (remoteProfiles ?? [])
      .map((p) => p.ownerId)
      .filter((id): id is string => Boolean(id));
    if (ownerIds.length > 0) {
      try {
        setReputation(await fetchResidentReputationMap(ownerIds));
      } catch {
        // не критично: карточки просто не покажут рейтинг
      }
    }
  }, []);

  // Initial bootstrap + realtime + refresh hook.
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        await refreshRemoteData();
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    };
    void bootstrap();

    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (isSupabaseConfigured && supabase) {
      channel = supabase
        .channel('daymohk-live-data')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          void refreshRemoteData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => {
          void refreshRemoteData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => {
          void refreshRemoteData();
        })
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [refreshRemoteData]);

  useEffect(() => {
    const handleAccountDeleted = (event: Event) => {
      const ownerId = (event as CustomEvent<{ ownerId?: string }>).detail?.ownerId;
      if (!ownerId) return;
      // No local cache to clean up; just refetch so the deleted
      // user's profiles disappear from the UI on the next render.
      void refreshRemoteData();
    };
    window.addEventListener('daymohk-account-deleted', handleAccountDeleted);
    return () => window.removeEventListener('daymohk-account-deleted', handleAccountDeleted);
  }, [refreshRemoteData]);

  /**
   * Make sure the calling user has a canonical personal profile in
   * the database. The on_auth_user_created trigger (defined in
   * supabase/steps/12-onboarding-trigger.sql) creates the row
   * server-side at signup, so for normal Google-OAuth users this
   * effect is a no-op — the profile already exists. We only fall
   * back to the RPC when the row is somehow missing (e.g. the
   * trigger hadn't been added yet, or the user was created via the
   * Supabase dashboard directly).
   */
  const personalEnsuredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isHydrated || !account) return;
    if (personalEnsuredRef.current.has(account.id)) return;

    const localAlreadyHas = profiles.some(
      (p) => p.ownerId === account.id && p.id === `personal-${account.id}`,
    );
    if (localAlreadyHas) {
      personalEnsuredRef.current.add(account.id);
      return;
    }

    personalEnsuredRef.current.add(account.id);
    void (async () => {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;
      try {
        const response = await fetch('/api/account/ensure-personal-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (response.ok) {
          await refreshRemoteData();
        }
      } catch (ensureError) {
        console.warn('Не удалось создать личную анкету на сервере:', ensureError);
      }
    })();
  }, [isHydrated, account?.id, profiles, refreshRemoteData, supabase]);

  const syncAccountToQuestionnaires = useCallback(async (targetAccount: NonNullable<typeof account>) => {
    if (!supabase) return;
    const phoneDigits = extractPhoneDigits(targetAccount.phone);
    const formattedWhatsapp = phoneDigits ? `7${phoneDigits}` : undefined;

    // Apply display changes optimistically in the local snapshot.
    setProfiles((currentProfiles) =>
      currentProfiles.map((profile) => {
        if (profile.ownerId !== targetAccount.id) return profile;
        const isSameWhatsapp = profile.sameAsPhoneWhatsapp === true;
        return {
          ...profile,
          fullName: targetAccount.fullName,
          avatarUrl: targetAccount.avatarUrl,
          phone: targetAccount.phone || profile.phone,
          whatsapp: isSameWhatsapp && formattedWhatsapp
            ? formattedWhatsapp
            : isSameWhatsapp
              ? undefined
              : profile.whatsapp,
          isAdmin: Boolean(targetAccount.isAdmin || profile.isAdmin),
        };
      }),
    );

    // Persist to the server. We do this in the background and
    // refetch on completion so the local snapshot matches the
    // canonical DB state.
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: targetAccount.fullName,
        avatar_url: targetAccount.avatarUrl,
        phone: targetAccount.phone,
        is_admin: Boolean(targetAccount.isAdmin),
      })
      .eq('owner_id', targetAccount.id);
    if (!error) {
      await refreshRemoteData();
    }
  }, [refreshRemoteData]);

  useEffect(() => {
    const handleAccountUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ account?: NonNullable<typeof account> }>).detail;
      if (detail?.account) {
        void syncAccountToQuestionnaires(detail.account);
      }
    };
    window.addEventListener('daymohk-account-updated', handleAccountUpdated);
    return () => window.removeEventListener('daymohk-account-updated', handleAccountUpdated);
  }, [syncAccountToQuestionnaires]);

  useEffect(() => {
    if (!isHydrated || !account) return;
    void syncAccountToQuestionnaires(account);
  }, [account?.id, account?.fullName, account?.avatarUrl, account?.phone, account?.isAdmin, isHydrated, syncAccountToQuestionnaires]);

  const addProfile = useCallback((profile: Profile) => {
    const profileWithRole: Profile = {
      ...profile,
      isAdmin: Boolean(profile.isAdmin || account?.isAdmin),
    };
    // Optimistic update so the UI reflects the new profile
    // immediately; the server-side insert follows in the background.
    setProfiles((currentProfiles) => {
      const personals = currentProfiles.filter((p) => p.isPersonal && p.ownerId === profileWithRole.ownerId);
      const others = currentProfiles.filter((p) => !(p.isPersonal && p.ownerId === profileWithRole.ownerId));
      if (personals.length > 0) {
        return [...personals, profileWithRole, ...others];
      }
      return [profileWithRole, ...others];
    });
    if (supabase) {
      void persistProfileToSupabase(profileWithRole).then(() => {
        void refreshRemoteData();
      });
    }
    if (profileWithRole.ownerId && profileWithRole.ownerId === account?.id) {
      void createNotification(profileWithRole.ownerId, 'system', 'Анкета сохранена', 'Ваша анкета добавлена в каталог.', 'Анкета дIаязйина', 'Хьан анкета могIаме тIетоьхна.');
    }
  }, [account?.id, account?.isAdmin, createNotification, refreshRemoteData]);

  const updateProfile = useCallback((profileId: string, updates: Partial<Profile>) => {
    const currentProfile = profiles.find((profile) => profile.id === profileId);
    if (!currentProfile) return;
    if (currentProfile.isPersonal && (updates.isHidden === true || updates.isBanned === true)) return;

    const adminOwnerId = account?.isAdmin ? account.id : undefined;
    if (account?.isBlocked && currentProfile.ownerId === account.id) return;
    // Невидимый разработчик: его анкеты нельзя скрыть/забанить (как и его
    // самого — см. /api/admin/ban). Жалобы при этом работают.
    const owner = users.find((u) => u.id === currentProfile.ownerId);
    if ((updates.isHidden === true || updates.isBanned === true) && owner && isDevEmail(owner.email)) return;
    if (updates.isHidden === true && isAdminProfile(currentProfile, adminOwnerId)) return;

    const nextProfile: Profile = {
      ...currentProfile,
      ...updates,
      isAdmin: updates.isAdmin !== undefined
        ? Boolean(updates.isAdmin)
        : Boolean(currentProfile.isAdmin || account?.isAdmin),
    };
    const wasHidden = Boolean(currentProfile.isHidden || currentProfile.isBanned);
    const isNowHidden = Boolean(nextProfile.isHidden || nextProfile.isBanned);
    if (currentProfile.ownerId && currentProfile.ownerId !== account?.id && wasHidden !== isNowHidden) {
      void createNotification(
        currentProfile.ownerId,
        isNowHidden ? 'profile_hidden' : 'profile_visible',
        isNowHidden ? 'Анкета скрыта' : 'Анкета снова опубликована',
        isNowHidden
          ? 'Администратор скрыл вашу анкету. Откройте профиль и проверьте причину.'
          : 'Администратор снова сделал вашу анкету видимой в каталоге.',
        isNowHidden ? 'Анкета къайлайаьккхина' : 'Анкета юха зорбане яьккхина',
        isNowHidden
          ? 'Администраторо хьан анкета къайлайаьккхина. Профиль схьаелла, бахьана хьажа.'
          : 'Администраторо хьан анкета могIаме юха гайтина.',
      );
    }
    if (currentProfile.ownerId && currentProfile.ownerId !== account?.id && updates.verificationStatus === 'verified') {
      void createNotification(currentProfile.ownerId, 'system', 'Анкета проверена', 'Администратор подтвердил анкету. Рядом с именем появится галочка.', 'Анкета теллина', 'Администраторо анкета тIечIагIдина. ЦIерна уллохь билгало хир ю.');
    }

    setProfiles((currentProfiles) => currentProfiles.map((profile) => (
      profile.id === profileId ? nextProfile : profile
    )));

    if (supabase) {
      // Модерационные поля (скрыть/показать/проверка) админ меняет у ЧУЖИХ
      // анкет — upsert требует INSERT-RLS (только владелец), поэтому падало
      // с 403. Для таких полей делаем прямой UPDATE (RLS "profiles admin
      // update" разрешает). Остальные изменения — обычный persist (upsert).
      const modFields = ['isHidden', 'isBanned', 'isVerified', 'verificationStatus', 'isAdmin'];
      const onlyModeration = Object.keys(updates).every((key) => modFields.includes(key));
      if (onlyModeration && Object.keys(updates).length > 0) {
        const modRow = profileUpdatesToDbRow(updates);
        void (async () => {
          await supabase.from('profiles').update(modRow).eq('id', profileId);
          void refreshRemoteData();
        })();
      } else {
        const row = profileUpdatesToDbRow(nextProfile);
        if (Object.keys(row).length > 0) {
          void persistProfileToSupabase(nextProfile).then(() => {
            void refreshRemoteData();
          });
        }
      }
    }
  }, [profiles, users, account?.id, account?.isAdmin, account?.isBlocked, createNotification, refreshRemoteData]);

  const updateUserBlocked = useCallback(async (userId: string, isBlocked: boolean) => {
    const target = users.find((user) => user.id === userId);
    const targetEmail = target?.email?.trim().toLowerCase();
    if (target?.isAdmin || (targetEmail && isAdminEmail(targetEmail)) || userId === account?.id) return;

    // Оптимистичное обновление UI — статус меняется сразу, без перезагрузки.
    setUsers((cur) => cur.map((u) => (u.id === userId ? { ...u, isBlocked } : u)));

    if (supabase) {
      const { error: userError } = await supabase
        .from('user_profiles')
        .update({ is_blocked: isBlocked })
        .eq('id', userId);
      if (userError) console.warn('updateUserBlocked: user_profiles', userError.message);

      try {
        if (isBlocked) {
          // Блокировка пользователя = скрыть ВСЕ его анкеты + снять метку
          // проверенности.
          const { error: hideError } = await supabase
            .from('profiles')
            .update({ is_hidden: true, is_verified: false, verification_status: 'none' })
            .eq('owner_id', userId);
          if (hideError) console.warn('updateUserBlocked: hide profiles', hideError.message);
        } else {
          // Ручная разблокировка админом: показываем ТОЛЬКО личную анкету.
          const { error: showPersonalError } = await supabase
            .from('profiles')
            .update({ is_hidden: false })
            .eq('owner_id', userId)
            .like('id', 'personal-%');
          if (showPersonalError) console.warn('updateUserBlocked: show personal', showPersonalError.message);
        }
      } catch (e) {
        console.warn('updateUserBlocked: profiles update failed', e);
      }
    }

    // Письмо + realtime-событие через /api/notifications (service role):
    // тип user_blocked/user_unblocked заставляет NotificationsProvider
    // обновить account.isBlocked у получателя (мини-профиль, меню).
    try {
      const session = await supabase?.auth.getSession();
      const accessToken = session?.data.session?.access_token;
      if (accessToken) {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            recipientId: userId,
            type: isBlocked ? 'user_blocked' : 'user_unblocked',
            title: isBlocked ? 'Аккаунт заблокирован' : 'Аккаунт разблокирован',
            message: isBlocked
              ? 'Администратор заблокировал ваш аккаунт и скрыл его анкеты.'
              : 'Администратор разблокировал ваш аккаунт.',
            ceTitle: isBlocked ? 'Аккаунт билсена яьлла' : 'Аккаунт дIаяьккхина',
            ceMessage: isBlocked
              ? 'Администраторо хьан аккаунт билсена а, цуьнан анкеташ къайлайаьхна а.'
              : 'Администраторо хьан аккаунт дIаяьккхина.',
            sender: 'Даймохк',
          }),
        });
      }
    } catch (e) {
      console.warn('updateUserBlocked: letter failed', e);
    }
    await refreshRemoteData();
  }, [users, account?.id, supabase, refreshRemoteData]);

  const deleteProfile = useCallback(async (profileId: string) => {
    const target = profiles.find((p) => p.id === profileId);
    if (!target) {
      throw new Error('Анкета не найдена.');
    }
    // Only the canonical personal profile (personal-<userId>) is
    // protected from deletion. If the user has duplicate personal
    // rows (created by an earlier bug), they ARE deletable — the
    // API endpoint at /api/account/delete-personal-duplicate handles
    // the service-role cleanup.
    const isCanonicalPersonal = target.isPersonal
      && target.id === `personal-${target.ownerId}`;
    if (isCanonicalPersonal) {
      throw new Error('Личная анкета не может быть удалена.');
    }

    if (supabase && account) {
      // Pre-check ownership so we can give a precise error.
      const { data: ownershipCheck, error: ownershipError } = await supabase
        .from('profiles')
        .select('id, owner_id, is_personal')
        .eq('id', profileId)
        .maybeSingle();
      if (ownershipError) throw new Error(ownershipError.message);

      if (ownershipCheck) {
        const ownerIdText = String(ownershipCheck.owner_id ?? '');
        if (ownerIdText !== account.id) {
          throw new Error('Удалять можно только свои анкеты.');
        }
        if (Boolean(ownershipCheck.is_personal)) {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            throw new Error('Сессия истекла — войдите снова.');
          }
          const response = await fetch('/api/account/delete-personal-duplicate', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ profileId }),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => null);
            throw new Error(result?.error ?? 'Не удалось удалить дубликат личной анкеты.');
          }
        } else {
          const { error: deleteError, count } = await supabase
            .from('profiles')
            .delete({ count: 'exact' })
            .eq('id', profileId);
          if (deleteError) throw new Error(deleteError.message);
          if (count === 0) {
            throw new Error('Не удалось удалить анкету.');
          }
        }
      }
      // If !ownershipCheck the row was already gone from the DB
      // (deleted by another tab or an admin); we still want to
      // remove it from the local snapshot, which happens below.
    }

    // Remove from the local snapshot optimistically. The realtime
    // channel will replace this with the server's truth on the
    // next refresh.
    setProfiles((currentProfiles) => currentProfiles.filter((profile) => profile.id !== profileId));
    void refreshRemoteData();
  }, [profiles, account, refreshRemoteData]);

  const addComplaint = useCallback(async (profileId: string, reason: string) => {
    if (!account || account.isBlocked) return;
    const sanitizedReason = sanitizeReason(reason);
    if (!sanitizedReason) return;
    const reportedProfile = profiles.find((profile) => profile.id === profileId);
    if (!reportedProfile) {
      throw new Error('Анкета не найдена. Откройте её заново и повторите попытку.');
    }
    const complaint: Complaint = {
      id: `complaint-${Date.now()}`,
      profileId,
      targetUserId: reportedProfile?.ownerId,
      authorId: account.id,
      authorName: account.fullName,
      reason: sanitizedReason,
      status: 'open',
      createdAt: new Date().toISOString().split('T')[0],
    };

    if (supabase) {
      // The server is the only thing that knows whether the
      // profile exists. If it does, we just insert. If it
      // doesn't, the server endpoint /api/complaints/attach-target
      // creates a placeholder so the FK doesn't fail.
      const { data: targetRow, error: targetError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .maybeSingle();
      if (targetError) throw new Error(targetError.message);

      if (!targetRow) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('Сессия истекла — войдите снова.');
        const response = await fetch('/api/complaints/attach-target', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            profileId,
            reason: sanitizedReason,
            target: {
              fullName: reportedProfile.fullName,
              isSpecialist: reportedProfile.isSpecialist,
              isPersonal: reportedProfile.isPersonal,
            },
          }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error ?? 'Не удалось отправить жалобу.');
        }
        setComplaints((current) => [complaint, ...current]);
        return;
      }

      // Normal path: profile exists in DB, just insert the complaint.
      // target_user_id is intentionally null on this client; the FK
      // is set to null on delete of the target user, so the
      // complaint can be filed even when the target has been
      // removed or has no user_profiles row.
      const { error } = await supabase.from('complaints').insert({
        id: complaint.id,
        profile_id: complaint.profileId,
        target_user_id: null,
        author_id: complaint.authorId,
        author_name: complaint.authorName,
        reason: complaint.reason,
        status: complaint.status,
        created_at: complaint.createdAt,
      });
      if (error) throw new Error(error.message);
    }
    setComplaints((current) => [complaint, ...current]);
  }, [account, profiles]);

  const updateComplaint = useCallback(async (complaintId: string, status: ComplaintStatus) => {
    if (supabase) {
      const { error } = await supabase.from('complaints').update({ status }).eq('id', complaintId);
      if (error) throw new Error(error.message);
    }
    setComplaints((current) => current.map((complaint) => (
      complaint.id === complaintId ? { ...complaint, status } : complaint
    )));
  }, []);

  const addReview = useCallback(async (profileId: string, reviewData: Omit<Review, 'id' | 'createdAt'>) => {
    if (account?.isBlocked) return;
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;

    // The server endpoint /api/reviews is the single place that
    // can atomically insert a review AND bump the rolling rating,
    // because the "profiles owner update" RLS policy would block a
    // direct client-side update from a reviewer who doesn't own
    // the target profile. We send the rating + text and let the
    // server fill in author_id / author_name from the verified JWT.
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('Сессия истекла — войдите снова.');
    }
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        profileId,
        rating: reviewData.rating,
        text: reviewData.text,
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error ?? 'Не удалось отправить отзыв.');
    }
    await refreshRemoteData();
    if (profile.ownerId && profile.ownerId !== account?.id) {
      void createNotification(
        profile.ownerId,
        'review_received',
        'Новый отзыв',
        `${account?.fullName || 'Кто-то'} оставил отзыв на вашей анкете «${profile.fullName}».`,
        'Керла хастам',
        `${account?.fullName || 'Цхьаммо'} хьан «${profile.fullName}» анкетана хастам йаздина.`,
      );
    }
  }, [account?.id, account?.isBlocked, profiles, refreshRemoteData, supabase, createNotification]);

  const isCurrentUserAdmin = Boolean(account?.isAdmin);
  const isProfileAdmin = useCallback(
    (profile: Profile) => isAdminProfile(profile, account?.isAdmin ? account.id : undefined, users),
    [account?.id, account?.isAdmin, users],
  );

  const value = useMemo(
    () => ({ profiles, users, reputation, complaints, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, updateUserBlocked, deleteProfile, addComplaint, updateComplaint, addReview, createNotification, refreshRemoteData }),
    [profiles, users, reputation, complaints, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, updateUserBlocked, deleteProfile, addComplaint, updateComplaint, addReview, createNotification, refreshRemoteData],
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
