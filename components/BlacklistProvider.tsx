'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

export interface BlockedPerson {
  userId: string;
  fullName: string;
  avatarUrl: string;
  reason: string;
  createdAt: string;
}

interface BlacklistValue {
  /** Кого заблокировал я — этих можно разблокировать. */
  list: BlockedPerson[];
  /** Кого мне не показывать: и мои блокировки, и те, кто заблокировал меня. */
  hiddenIds: Set<string>;
  /** Скрыт ли конкретный владелец анкеты. */
  isHidden: (ownerId?: string) => boolean;
  block: (userId: string, reason?: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  isLoading: boolean;
}

const BlacklistContext = createContext<BlacklistValue | null>(null);

/**
 * Чёрный список: единый источник правды о том, кого скрывать.
 *
 * Живёт провайдером, а не локальным состоянием каждой страницы: список
 * нужен каталогу, карте, анкете и заданиям одновременно. Иначе каждая
 * страница тянула бы его сама, и они разъезжались бы после блокировки.
 *
 * Скрытие ВЗАИМНОЕ, поэтому hiddenIds шире, чем list: в него входят и
 * те, кто заблокировал меня. Различить эти два случая на клиенте
 * нельзя — и это сделано намеренно, чтобы человек не узнал, что его
 * заблокировали.
 */
export function BlacklistProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const [list, setList] = useState<BlockedPerson[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const token = useCallback(async () => {
    if (!supabase) return '';
    const session = await supabase.auth.getSession();
    return session.data.session?.access_token || '';
  }, []);

  const refresh = useCallback(async () => {
    if (!account) {
      setList([]);
      setHiddenIds(new Set());
      return;
    }
    setIsLoading(true);
    try {
      const accessToken = await token();
      if (!accessToken) return;
      const res = await fetch('/api/blacklist', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setList(Array.isArray(data.list) ? data.list : []);
      setHiddenIds(new Set(Array.isArray(data.hiddenIds) ? data.hiddenIds : []));
    } catch {
      // Сеть моргнула — оставляем прежний список. Показать лишнюю
      // анкету не так плохо, как уронить каталог.
    } finally {
      setIsLoading(false);
    }
  }, [account, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const block = useCallback(async (userId: string, reason = '') => {
    const accessToken = await token();
    const res = await fetch('/api/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId, reason }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'Не удалось заблокировать');
    await refresh();
  }, [token, refresh]);

  const unblock = useCallback(async (userId: string) => {
    const accessToken = await token();
    const res = await fetch(`/api/blacklist?id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'Не удалось разблокировать');
    await refresh();
  }, [token, refresh]);

  const isHidden = useCallback(
    (ownerId?: string) => Boolean(ownerId && hiddenIds.has(ownerId)),
    [hiddenIds],
  );

  const value = useMemo(
    () => ({ list, hiddenIds, isHidden, block, unblock, isLoading }),
    [list, hiddenIds, isHidden, block, unblock, isLoading],
  );

  return <BlacklistContext.Provider value={value}>{children}</BlacklistContext.Provider>;
}

export function useBlacklist(): BlacklistValue {
  const context = useContext(BlacklistContext);
  // Возвращаем безопасную заглушку вместо исключения: провайдер стоит
  // в корне, но компоненты вроде модалок могут рендериться в порталах
  // и в тестах — падать из-за чёрного списка они не должны.
  return context ?? {
    list: [],
    hiddenIds: new Set<string>(),
    isHidden: () => false,
    block: async () => {},
    unblock: async () => {},
    isLoading: false,
  };
}
