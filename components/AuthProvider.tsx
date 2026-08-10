'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { uploadImageIfStorageConfigured } from '@/lib/media';
import { isAdminEmail } from '@/lib/admin';
import { AVATAR_PRESETS, UserMasterStatus } from '@/lib/types';

const ACCOUNT_STORAGE_KEY = 'samashki-account';

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
    if (Boolean(stored.is_admin) !== isAdminByEmail) {
      await supabase.from('user_profiles').update({ is_admin: isAdminByEmail }).eq('id', user.id);
    }
    // Мержим с локальным аккаунтом, чтобы не потерять gender/birthDate если колонки ещё не в БД
    const mergedGender = stored.gender || (local && local.id === stored.id ? local.gender : undefined);
    const mergedBirth = stored.birth_date || (stored.birth_year ? String(stored.birth_year) : undefined) || (local && local.id === stored.id ? local.birthDate : undefined);
    const mergedSettlement = stored.settlement || (local && local.id === stored.id ? local.settlement : undefined);
    return {
      id: stored.id,
      email: stored.email || fallbackAccount.email,
      fullName: stored.full_name || fallbackAccount.fullName,
      avatarUrl: stored.avatar_url || fallbackAccount.avatarUrl,
      phone: stored.phone || fallbackAccount.phone,
      gender: mergedGender,
      birthDate: mergedBirth,
      settlement: mergedSettlement,
      isAdmin: isAdminByEmail,
      isBlocked: Boolean(stored.is_blocked),
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
    window.addEventListener('samashki-account-status', handleAccountStatus);

    const restoreSession = async () => {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getUser();
        if (!cancelled) {
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
        window.removeEventListener('samashki-account-status', handleAccountStatus);
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
      window.removeEventListener('samashki-account-status', handleAccountStatus);
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
        // Fallback for older schemas without new columns
        const { error: fallbackError } = await supabase.from('user_profiles').upsert({
          id: nextAccount.id,
          email: nextAccount.email,
          full_name: nextAccount.fullName,
          avatar_url: nextAccount.avatarUrl,
          phone: nextAccount.phone,
          is_admin: Boolean(nextAccount.isAdmin),
        } as any, { onConflict: 'id' });
        if (fallbackError) throw new Error(fallbackError.message);
      }
    }

    window.dispatchEvent(new CustomEvent('samashki-account-updated', { detail: { account: nextAccount } }));
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

    window.dispatchEvent(new CustomEvent('samashki-account-updated', { detail: { account: nextAccount } }));
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
    } else {
      const storedProfiles = window.localStorage.getItem('samashki-profiles');
      if (storedProfiles) {
        try {
          const profiles = JSON.parse(storedProfiles) as Array<{ ownerId?: string }>;
          window.localStorage.setItem('samashki-profiles', JSON.stringify(profiles.filter((profile) => profile.ownerId !== account.id)));
        } catch {
          // Continue with local account removal.
        }
      }
    }

    window.dispatchEvent(new CustomEvent('samashki-account-deleted', { detail: { ownerId: account.id } }));
    setAccount(null);
    saveLocalAccount(null);
  }, [account]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) await supabase.auth.signOut();
    setAccount(null);
    saveLocalAccount(null);
  }, []);

  const value = useMemo(
    () => ({ account, isLoading, signInWithGoogle, updateAccount, setMasterStatus, deleteAccount, signOut }),
    [account, isLoading, signInWithGoogle, updateAccount, setMasterStatus, deleteAccount, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
