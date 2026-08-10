'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { AppNotification, NotificationType } from '@/lib/types';

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  createNotification: (recipientId: string, type: NotificationType, title: string, message: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function fromDbRow(row: Record<string, any>): AppNotification {
  return {
    id: String(row.id),
    recipientId: String(row.recipient_id),
    type: row.type ?? 'system',
    title: row.title ?? 'Уведомление',
    message: row.message ?? '',
    isRead: Boolean(row.is_read),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function localKey(accountId: string) {
  return `samashki-notifications-${accountId}`;
}

function readLocal(accountId: string) {
  try {
    const value = window.localStorage.getItem(localKey(accountId));
    return value ? JSON.parse(value) as AppNotification[] : [];
  } catch {
    return [];
  }
}

export default function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!account) {
        setNotifications([]);
        return;
      }

      let next = readLocal(account.id);
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', account.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!error && data) next = data.map((row) => fromDbRow(row));
      }

      if (!cancelled) setNotifications(next);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [account?.id]);

  useEffect(() => {
    if (!account || !supabase || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`samashki-notifications-${account.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${account.id}`,
      }, (payload) => {
        const nextNotification = fromDbRow(payload.new as Record<string, any>);
        if (nextNotification.type === 'user_blocked' || nextNotification.type === 'user_unblocked') {
          window.dispatchEvent(new CustomEvent('samashki-account-status', { detail: { userId: account.id, isBlocked: nextNotification.type === 'user_blocked' } }));
        }
        setNotifications((current) => [nextNotification, ...current.filter((item) => item.id !== nextNotification.id)].slice(0, 50));
      })
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [account?.id]);

  useEffect(() => {
    if (!account) return;
    try {
      window.localStorage.setItem(localKey(account.id), JSON.stringify(notifications));
    } catch {
      // Notifications still work from Supabase while the current page is open.
    }
  }, [account?.id, notifications]);

  const markRead = useCallback(async (notificationId: string) => {
    if (supabase && isSupabaseConfigured) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
    }
    setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item));
  }, []);

  const markAllRead = useCallback(async () => {
    if (account && supabase && isSupabaseConfigured) {
      await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', account.id);
    }
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
  }, [account?.id]);

  const createNotification = useCallback(async (recipientId: string, type: NotificationType, title: string, message: string) => {
    const notification: AppNotification = {
      id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recipientId,
      type,
      title,
      message,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    if (supabase && isSupabaseConfigured) {
      const { error } = await supabase.from('notifications').insert({
        id: notification.id,
        recipient_id: notification.recipientId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        is_read: false,
        created_at: notification.createdAt,
      });
      if (error) {
        console.warn('Не удалось сохранить уведомление:', error.message);
      }
    }

    if (account?.id === recipientId) {
      if (type === 'user_blocked' || type === 'user_unblocked') {
        window.dispatchEvent(new CustomEvent('samashki-account-status', { detail: { userId: recipientId, isBlocked: type === 'user_blocked' } }));
      }
      setNotifications((current) => [notification, ...current].slice(0, 50));
    }
  }, [account?.id]);

  const value = useMemo(() => ({
    notifications,
    unreadCount: notifications.filter((item) => !item.isRead).length,
    markRead,
    markAllRead,
    createNotification,
  }), [notifications, markRead, markAllRead, createNotification]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider');
  return context;
}
