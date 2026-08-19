'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { uploadImageIfStorageConfigured } from '@/lib/media';
import { isAdminEmail } from '@/lib/admin';
import { AVATAR_PRESETS, UserMasterStatus } from '@/lib/types';

const ACCOUNT_STORAGE_KEY = 'daymohk-account';

export interface Account {
  gender?: 'male' | 'female';
  birthDate?: string;
  settlement?: string;
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  phone: string;
  isAdmin?: boolean;
  isBlocked?: boolean;
  /** ISO timestamp when a temporary ban expires (undefined = no ban / permanent). */
  bannedUntil?: string;
  statusOverride?: UserMasterStatus;
}

interface AuthContextValue {
  account: Account | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  updateAccount: (updates: Partial<Pick<Account, 'fullName' | 'avatarUrl' | 'phone' | 'gender' | 'birthDate' | 'settlement'>>) => Promise<void>;
  setMasterStatus: (status: UserMasterStatus) => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Завершить сессии на ВСЕХ устройствах, а не только в этом браузере. */
  signOutEverywhere: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.startsWith('8') && digits.length === 11) digits = `7${digits.slice(1)}`;
  return `+${digits}`;
}

type AuthUser = { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> };

type StoredAccount = {
  gender?: 'male' | 'female';
  birth_date?: string;
  birth_year?: number;
  settlement?: string;
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  phone: string;
  is_admin: boolean;
  is_blocked: boolean;
  status_override?: UserMasterStatus;
};

function accountFromUser(user: AuthUser): Account {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? '',
    fullName: String(metadata.full_name ?? metadata.name ?? user.phone ?? 'Пользователь'),
    avatarUrl: String(metadata.avatar_url ?? AVATAR_PRESETS[0]),
    phone: String(metadata.phone ?? user.phone ?? ''),
    isAdmin: isAdminEmail(user.email),
    statusOverride: 'auto',
  };
}

function readLocalAccount(): Account | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(ACCOUNT_STORAGE_KEY) : null;
    if (!raw) return null;
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}

async function resolveAccount(user: AuthUser): Promise<Account> {
  const fallbackAccount = accountFromUser(user);
  const local = readLocalAccount();
  if (!isSupabaseConfigured || !supabase) {
    // В локальном режиме берём из localStorage если есть, иначе fallback
    if (local && local.id === user.id) return { ...fallbackAccount, ...local, isAdmin: isAdminEmail(local.email || fallbackAccount.email) };
    return fallbackAccount;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, avatar_url, phone, is_admin, is_blocked, status_override, gender, birth_date, birth_year, settlement')
    .eq('id', user.id)
    .maybeSingle();

  if (!error && data) {
    const stored = data as StoredAccount;
    const emailForCheck = (stored.email || fallbackAccount.email || '').toLowerCase();
    const isAdminByEmail = isAdminEmail(emailForCheck);
    // Эффективный статус: админы из списка email (всегда) + выданные админ-
    // права из БД (их можно давать/отбирать через админ-панель). НЕ сбрасываем
    // выданный статус до «false» — иначе выдача прав не работала бы.
    const effectiveIsAdmin = isAdminByEmail || Boolean(stored.is_admin);
    if (Boolean(stored.is_admin) !== effectiveIsAdmin) {
      await supabase.from('user_profiles').update({ is_admin: effectiveIsAdmin }).eq('id', user.id);
    }
    // Мержим с локальным аккаунтом, чтобы не потерять gender/birthDate/ник/аватар,
    // если в БД ещё пусто (пользователь мог сменить ник/фото локально, а Google
    // при повторном входе перезаписал бы их метаданными аккаунта).
    const localMine = local && local.id === stored.id ? local : undefined;
    const mergedGender = stored.gender || (localMine ? localMine.gender : undefined);
    const mergedBirth = stored.birth_date || (stored.birth_year ? String(stored.birth_year) : undefined) || (localMine ? localMine.birthDate : undefined);
    const mergedSettlement = stored.settlement || (localMine ? localMine.settlement : undefined);
    return {
      id: stored.id,
      email: stored.email || fallbackAccount.email,
      fullName: stored.full_name || (localMine ? localMine.fullName : undefined) || fallbackAccount.fullName,
      avatarUrl: stored.avatar_url || (localMine ? localMine.avatarUrl : undefined) || fallbackAccount.avatarUrl,
      phone: stored.phone || fallbackAccount.phone,
      gender: mergedGender,
      birthDate: mergedBirth,
      settlement: mergedSettlement,
      isAdmin: effectiveIsAdmin,
      isBlocked: Boolean(stored.is_blocked),
      bannedUntil: typeof (user as any).app_metadata?.banned_until === 'string' ? (user as any).app_metadata.banned_until : undefined,
      statusOverride: stored.status_override || 'auto',
    };
  }

  // First Google login: create the local user profile once. Later logins read it
  // instead of replacing custom name/avatar values with Google metadata.
  await supabase.from('user_profiles').upsert({
    id: fallbackAccount.id,
    email: fallbackAccount.email,
    full_name: fallbackAccount.fullName,
    avatar_url: fallbackAccount.avatarUrl,
    phone: fallbackAccount.phone,
    is_admin: Boolean(fallbackAccount.isAdmin),
  }, { onConflict: 'id' });

  return fallbackAccount;
}

function saveLocalAccount(account: Account | null) {
  if (account) {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  } else {
    window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  }
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const handleAccountStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; isBlocked?: boolean }>).detail;
      if (!detail?.userId) return;
      setAccount((current) => current && current.id === detail.userId ? { ...current, isBlocked: Boolean(detail.isBlocked) } : current);
    };
    window.addEventListener('daymohk-account-status', handleAccountStatus);

    const restoreSession = async () => {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getUser();
        if (!cancelled) {
          // Если временный бан истёк — автоматически разблокируемся и
          // показываем все анкеты (см. /api/account/self-unban).
          const bannedUntilRaw = (data.user as any)?.app_metadata?.banned_until;
          const bannedUntil = typeof bannedUntilRaw === 'string' ? new Date(bannedUntilRaw) : null;
          if (bannedUntil && Number.isFinite(bannedUntil.getTime()) && bannedUntil.getTime() <= Date.now()) {
            try {
              const session = await supabase.auth.getSession();
              const accessToken = session.data.session?.access_token;
              if (accessToken) {
                await fetch('/api/account/self-unban', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
              }
            } catch {
              // Не критично — при следующей загрузке повторим.
            }
          }
          const acc = data.user ? await resolveAccount(data.user) : null;
          setAccount(acc);
          if (acc) saveLocalAccount(acc);
          setIsLoading(false);
        }
        return;
      }

      try {
        const stored = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
        if (!cancelled && stored) setAccount(JSON.parse(stored) as Account);
      } catch {
        // Start as a visitor if local storage is unavailable.
      }

      if (!cancelled) setIsLoading(false);
    };

    void restoreSession();

    if (!supabase || !isSupabaseConfigured) {
      return () => {
        cancelled = true;
        window.removeEventListener('daymohk-account-status', handleAccountStatus);
      };
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setAccount(null);
        setIsLoading(false);
        return;
      }

      void resolveAccount(session.user).then((nextAccount) => {
        setAccount(nextAccount);
        if (nextAccount) saveLocalAccount(nextAccount);
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      window.removeEventListener('daymohk-account-status', handleAccountStatus);
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Google пока не настроен в Supabase. Добавьте Google OAuth в Authentication → Providers.');
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (error) throw new Error(error.message);
  }, []);

  const updateAccount = useCallback(async (updates: Partial<Pick<Account, 'fullName' | 'avatarUrl' | 'phone' | 'gender' | 'birthDate' | 'settlement'>>) => {
    if (!account) return;

    const normalizedPhone = updates.phone ? normalizePhone(updates.phone) : account.phone;
    const safeAvatarUrl = updates.avatarUrl
      ? await uploadImageIfStorageConfigured(updates.avatarUrl, account.id, 'avatars')
      : account.avatarUrl;
    const nextAccount: Account = {
      ...account,
      ...updates,
      avatarUrl: safeAvatarUrl,
      phone: normalizedPhone,
      gender: updates.gender !== undefined ? updates.gender : account.gender,
      birthDate: updates.birthDate !== undefined ? updates.birthDate : account.birthDate,
      settlement: updates.settlement !== undefined ? updates.settlement : account.settlement,
    };
    setAccount(nextAccount);
    saveLocalAccount(nextAccount);

    if (isSupabaseConfigured && supabase) {
      // Try to persist extended fields; fallback to base fields if columns missing
      const upsertPayload: Record<string, unknown> = {
        id: nextAccount.id,
        email: nextAccount.email,
        full_name: nextAccount.fullName,
        avatar_url: nextAccount.avatarUrl,
        phone: nextAccount.phone,
        is_admin: Boolean(nextAccount.isAdmin),
        gender: nextAccount.gender ?? null,
        birth_date: nextAccount.birthDate ?? null,
        settlement: nextAccount.settlement ?? null,
      };
      const { error } = await supabase.from('user_profiles').upsert(upsertPayload as any, { onConflict: 'id' });
      if (error) {
        console.warn('[updateAccount] upsert extended failed:', error.message);
        // Fallback for older schemas without new columns
        const { error: fallbackError } = await supabase.from('user_profiles').upsert({
          id: nextAccount.id,
          email: nextAccount.email,
          full_name: nextAccount.fullName,
          avatar_url: nextAccount.avatarUrl,
          phone: nextAccount.phone,
          is_admin: Boolean(nextAccount.isAdmin),
        } as any, { onConflict: 'id' });
        if (fallbackError) {
          console.warn('[updateAccount] upsert fallback failed:', fallbackError.message);
          throw new Error(`Не удалось сохранить профиль в БД: ${fallbackError.message}`);
        }
      }
    }

    window.dispatchEvent(new CustomEvent('daymohk-account-updated', { detail: { account: nextAccount } }));
  }, [account]);

  const setMasterStatus = useCallback(async (status: UserMasterStatus) => {
    if (!account) return;
    const nextAccount = { ...account, statusOverride: status };
    setAccount(nextAccount);
    saveLocalAccount(nextAccount);

    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('user_profiles')
        .update({ status_override: status })
        .eq('id', nextAccount.id);
    }

    window.dispatchEvent(new CustomEvent('daymohk-account-updated', { detail: { account: nextAccount } }));
  }, [account]);

  const deleteAccount = useCallback(async () => {
    if (!account) return;

    if (isSupabaseConfigured && supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Сессия Google не найдена. Войдите снова.');

      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось удалить аккаунт.');
      }

      await supabase.auth.signOut();
    }
    // No local profile cache to clean up: ProfilesProvider reads
    // everything from the database now, and the realtime channel
    // will refresh the local view on the next postgres_changes
    // event triggered by the server-side deletion.

    window.dispatchEvent(new CustomEvent('daymohk-account-deleted', { detail: { ownerId: account.id } }));
    setAccount(null);
    saveLocalAccount(null);
    // Сбрасываем локальные флаги, чтобы при повторной регистрации
    // онбординг (welcome-письмо) показался заново.
    try {
      window.localStorage.removeItem('daymohk-onboarded-v1');
    } catch {}
  }, [account]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) await supabase.auth.signOut();
    setAccount(null);
    saveLocalAccount(null);
  }, []);

  /**
   * Выход со всех устройств.
   *
   * scope: 'global' отзывает у Supabase ВСЕ refresh-токены пользователя,
   * а не только токен текущего браузера. Нужно, когда телефон потерян
   * или вход остался на чужом компьютере: обычный «Выйти» там ничего не
   * закрывает — та сессия живёт своей жизнью.
   *
   * Локальное состояние сбрасываем в любом случае, даже если запрос не
   * прошёл: держать в интерфейсе аккаунт, из которого человек только
   * что попросил выйти, нельзя.
   */
  const signOutEverywhere = useCallback(async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut({ scope: 'global' });
      }
    } finally {
      setAccount(null);
      saveLocalAccount(null);
    }
  }, []);

  const value = useMemo(
    () => ({ account, isLoading, signInWithGoogle, updateAccount, setMasterStatus, deleteAccount, signOut, signOutEverywhere }),
    [account, isLoading, signInWithGoogle, updateAccount, setMasterStatus, deleteAccount, signOut, signOutEverywhere],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
