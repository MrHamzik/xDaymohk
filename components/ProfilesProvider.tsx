'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { isAdminEmail } from '@/lib/admin';
import { INITIAL_PROFILES } from '@/lib/mock-data';
import { profileUpdatesToDbRow, reviewToDbRow } from '@/lib/profile-db';
import { isAdminProfile } from '@/lib/profile-filters';
import { useNotifications } from '@/components/NotificationsProvider';
import {
  loadComplaintsFromSupabase,
  loadProfilesFromSupabase,
  loadUsersFromSupabase,
} from '@/lib/profiles/load';
import { mergeProfilesWithLocal, normalizeProfiles } from '@/lib/profiles/merge';
import { persistProfileToSupabase } from '@/lib/profiles/persist';
import { sanitizeReason } from '@/lib/validation';
import { extractPhoneDigits } from '@/lib/phone';
import { Complaint, ComplaintStatus, Profile, Review, UserSummary } from '@/lib/types';

const PROFILES_STORAGE_KEY = 'samashki-profiles';

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

function readStoredProfiles(): Profile[] | null {
  try {
    const stored = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!stored) return null;
    return normalizeProfiles(JSON.parse(stored));
  } catch {
    return null;
  }
}

function buildPersonalProfile(account: NonNullable<ReturnType<typeof useAuth>['account']>): Profile {
  return {
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
    hidePhone: true,
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
}

export default function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const { createNotification } = useNotifications();
  const [profiles, setProfiles] = useState<Profile[]>(isSupabaseConfigured ? [] : INITIAL_PROFILES);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Bootstrap: load remote + local, merge
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const storedProfiles = readStoredProfiles();
      const remoteProfiles = await loadProfilesFromSupabase();
      const remoteUsers = await loadUsersFromSupabase();
      const remoteComplaints = await loadComplaintsFromSupabase();
      const merged = mergeProfilesWithLocal(
        remoteProfiles ? normalizeProfiles(remoteProfiles) : null,
        storedProfiles
      );
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

  // Real-time + periodic refresh (real-time pushes, polling as fallback)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let cancelled = false;
    const refreshRemoteData = async () => {
      const [remoteProfiles, remoteUsers, remoteComplaints] = await Promise.all([
        loadProfilesFromSupabase(),
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

    return () => {
      cancelled = true;
      void supabase?.removeChannel(channel);
    };
  }, []);

  // Persist to localStorage whenever profiles change (after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // localStorage may be disabled; profiles still work in-memory.
    }
  }, [profiles, isHydrated]);

  useEffect(() => {
    const handleAccountDeleted = (event: Event) => {
      const ownerId = (event as CustomEvent<{ ownerId?: string }>).detail?.ownerId;
      if (!ownerId) return;
      setProfiles((current) => current.filter((profile) => profile.ownerId !== ownerId));
    };
    window.addEventListener('samashki-account-deleted', handleAccountDeleted);
    return () => window.removeEventListener('samashki-account-deleted', handleAccountDeleted);
  }, []);

  const syncAccountToQuestionnaires = useCallback((targetAccount: NonNullable<typeof account>) => {
    const phoneDigits = extractPhoneDigits(targetAccount.phone);
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
          whatsapp: isSameWhatsapp && formattedWhatsapp
            ? formattedWhatsapp
            : isSameWhatsapp
              ? undefined
              : profile.whatsapp,
          isAdmin: Boolean(targetAccount.isAdmin || profile.isAdmin),
          // NOTE: do NOT copy targetAccount.statusOverride onto every
          // profile here. Each profile keeps its own statusOverride
          // (set when the owner overrides it on that specific profile)
          // and otherwise falls back to the automatic schedule. The
          // master "working status" switch in the side menu is applied
          // per-viewer in the components that read it (e.g. the map),
          // NOT by mutating every profile of the owner.
        };
      });

      try {
        window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      } catch {
        // localStorage unavailable.
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

  // Auto-create the personal profile for the signed-in user (once per account)
  //
  // Uses a ref-based guard so the effect can run on every profile change
  // (it has to, since it depends on `profiles`) without re-creating the
  // personal profile each time. The previous version used a synchronous
  // check inside setProfiles, which raced with React's async state
  // batching and could spawn duplicate personal profiles.
  const personalCreatedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isHydrated || !account) return;
    if (personalCreatedRef.current.has(account.id)) return;
    const hasPersonal = profiles.some(
      (p) => p.ownerId === account.id && (p.isPersonal || p.id === `personal-${account.id}` || p.id.startsWith('personal-'))
    );
    if (hasPersonal) {
      personalCreatedRef.current.add(account.id);
      return;
    }

    const personalProfile = buildPersonalProfile(account);
    personalCreatedRef.current.add(account.id);
    setProfiles((cur) => [personalProfile, ...cur]);
    if (supabase) void persistProfileToSupabase(personalProfile);
  }, [isHydrated, account?.id, profiles]);

  const addProfile = useCallback((profile: Profile) => {
    const profileWithRole: Profile = {
      ...profile,
      isAdmin: Boolean(profile.isAdmin || account?.isAdmin),
    };
    setProfiles((currentProfiles) => {
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
    if (currentProfile.isPersonal && (updates.isHidden === true || updates.isBanned === true)) return;

    const adminOwnerId = account?.isAdmin ? account.id : undefined;
    if (account?.isBlocked && currentProfile.ownerId === account.id) return;
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
      void persistProfileToSupabase(nextProfile);
    }
  }, [profiles, account?.id, account?.isAdmin, account?.isBlocked, createNotification]);

  const updateUserBlocked = useCallback(async (userId: string, isBlocked: boolean) => {
    const target = users.find((user) => user.id === userId);
    const targetEmail = target?.email?.trim().toLowerCase();
    if (target?.isAdmin || (targetEmail && isAdminEmail(targetEmail)) || userId === account?.id) return;

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
      isBlocked
        ? 'Администратор заблокировал ваш аккаунт и скрыл его анкеты.'
        : 'Администратор разблокировал ваш аккаунт.',
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
    if (!target) {
      throw new Error('Анкета не найдена.');
    }
    // The canonical personal profile (`personal-<userId>`) is the
    // single protected row and cannot be deleted. Any OTHER personal
    // profile that ends up in the database (e.g. duplicates created
    // by an earlier bug) IS deletable — otherwise the user is stuck
    // with a phantom row they can neither edit nor remove.
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

        // For duplicate personal rows the RLS policy 'profiles owner
        // delete' is gated on `not is_personal`, so we bypass it via
        // the service-role-aware delete from the API. Falling back
        // to the regular client delete works for non-personal rows.
        const dbIsPersonal = Boolean(ownershipCheck.is_personal);
        if (dbIsPersonal) {
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
            throw new Error('Не удалось удалить анкету — проверьте RLS политики (см. supabase/upgrade_existing.sql).');
          }
        }
      }
      // If !ownershipCheck, the row is a LOCAL-ONLY phantom (it lives
      // in the user's localStorage but never reached Supabase, e.g.
      // because of an interrupted sync, a deleted localStorage entry,
      // or an old bug that created the profile client-side only).
      // Fall through to the local delete below — that's exactly the
      // behaviour the user expects when they click "Удалить".
    }

    const deletedProfile = profiles.find((profile) => profile.id === profileId);
    setProfiles((currentProfiles) => currentProfiles.filter((profile) => profile.id !== profileId));
    if (deletedProfile?.ownerId) {
      setUsers((currentUsers) => currentUsers.map((user) => (
        user.id === deletedProfile.ownerId ? { ...user, profileCount: Math.max(0, user.profileCount - 1) } : user
      )));
    }
  }, [profiles, account]);

  const addComplaint = useCallback(async (profileId: string, reason: string) => {
    if (!account || account.isBlocked) return;
    const sanitizedReason = sanitizeReason(reason);
    if (!sanitizedReason) return;
    const reportedProfile = profiles.find((profile) => profile.id === profileId);
    if (!reportedProfile) {
      // No local copy of the profile — the user is trying to report
      // something we don't even know about. Bail out with a clear
      // message rather than letting Postgres fail the FK constraint.
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
      // Two failure modes we have to defend against:
      //
      // 1) The reported profile lives ONLY in this browser's
      //    localStorage (it was authored client-side but the upsert
      //    was rejected by RLS — e.g. the user is reporting someone
      //    else's profile, or the original sync was interrupted).
      //    The FK `complaints_profile_id_fkey` rejects the insert.
      //
      // 2) Same as (1) but with a slight twist: the user is on a
      //    stale page where the profile has since been deleted from
      //    the database, but they can still see it locally.
      //
      // In both cases we don't want to leak the cryptic FK error to
      // the user. We do a quick existence check first; if the row is
      // missing, we route the complaint through a server endpoint
      // that runs with the service role and bridges the FK gap.
      const { data: targetRow, error: targetError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .maybeSingle();

      if (targetError) {
        throw new Error(targetError.message);
      }

      if (!targetRow) {
        // Profile is not in the database — bridge the FK gap on the server.
        if (!supabase) {
          throw new Error('Supabase не настроен — жалобу нельзя отправить.');
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          throw new Error('Сессия истекла — войдите снова.');
        }
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
              // Only display fields needed to create a placeholder
              // profile if one doesn't exist. ownerId is intentionally
              // omitted — the server reads it from the profiles row
              // itself (or stores NULL for a placeholder), which is
              // the safe default that prevents an unverified client
              // from forging a target_user_id.
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
