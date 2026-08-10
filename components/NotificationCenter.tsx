'use client';

import { createPortal } from 'react-dom';
import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useNotifications } from '@/components/NotificationsProvider';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function NotificationCenter() {
  const { account } = useAuth();
  const { language } = useI18n();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={hasUnread ? (language === 'ce' ? `Хаамаш: ${unreadCount} керланиг` : `Уведомления: ${unreadCount} новых`) : (language === 'ce' ? 'Хаамаш' : 'Уведомления')}
        aria-expanded={isOpen}
        title={hasUnread ? (language === 'ce' ? `Хаамаш: ${unreadCount} керланиг` : `Уведомления: ${unreadCount} новых`) : (language === 'ce' ? 'Хаамаш' : 'Уведомления')}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-95 shadow-sm ${
          hasUnread
            ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/30'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
        }`}
      >
        <Bell className="h-5 w-5" />
        {hasUnread && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white border-2 border-white dark:border-zinc-900 shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Fullscreen Notification Window */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col bg-white p-4 shadow-2xl dark:bg-zinc-950 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={language === 'ce' ? 'Хаамаш' : 'Уведомления'}
        >
          {/* Fullscreen Header */}
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between border-b border-slate-100 pb-3 dark:border-zinc-800/60">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">
                {language === 'ce' ? 'Хаамаш' : 'Уведомления'}
              </h2>
              {!account && (
                <p className="text-xs text-slate-500 dark:text-zinc-500">
                  {language === 'ce' ? 'Системин хаамаш ган чугIо.' : 'Войдите, чтобы получать системные сообщения.'}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 transition"
                  aria-label={language === 'ce' ? 'Дерриг дешна аьлла билгалдаккха' : 'Отметить всё прочитанным'}
                  title={language === 'ce' ? 'Дерриг дешна аьлла билгалдаккха' : 'Отметить всё прочитанным'}
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {language === 'ce' ? 'Дерриг дешна' : 'Прочитать всё'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
                aria-label={language === 'ce' ? 'ДIакъовла' : 'Закрыть'}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Fullscreen Notifications List */}
          <div className="mx-auto flex-1 w-full max-w-2xl overflow-y-auto py-3">
            {!account ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-zinc-500">
                {language === 'ce'
                  ? 'Системин хаамаш ган чугIо.'
                  : 'После входа здесь будут системные уведомления.'}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-zinc-500">
                {language === 'ce' ? 'Керла хаамаш бац.' : 'Новых уведомлений нет.'}
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void markRead(notification.id)}
                    className={`w-full rounded-xl p-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-zinc-800/80 ${
                      notification.isRead
                        ? 'border border-slate-100 bg-slate-50/50 dark:border-zinc-800 dark:bg-zinc-800/30'
                        : 'border border-orange-200 bg-orange-50/70 dark:border-orange-900/50 dark:bg-orange-950/20'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!notification.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                      )}
                      <span className="min-w-0 flex-1">
                        <strong className="block text-xs font-bold text-slate-900 dark:text-white">
                          {notification.title}
                        </strong>
                        <span className="mt-1 block break-words text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                          {notification.message}
                        </span>
                        <time className="mt-1 block text-[10px] text-slate-400 dark:text-zinc-500">
                          {formatDate(notification.createdAt)}
                        </time>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      , document.body)}
    </div>
  );
}
