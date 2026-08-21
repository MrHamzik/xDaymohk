'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ShieldBan, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useI18n } from '@/lib/i18n';
import { useBlacklist } from '@/components/BlacklistProvider';
import EmptyState from '@/components/ui/EmptyState';
import { useSheetSwipe } from '@/lib/hooks/useSheetSwipe';
import { ListSkeleton } from '@/components/ui/FeedSkeleton';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface BlacklistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Чёрный список пользователя.
 *
 * Раньше это была заглушка с текстом «список пуст» — блокировки не
 * существовало вовсе. Теперь показывает реальные записи из
 * blocked_users (обновление 32) и позволяет снять блокировку.
 *
 * Показываем ТОЛЬКО тех, кого заблокировал сам пользователь. Кто
 * заблокировал его — он не видит и знать не должен: иначе чёрный
 * список превращается в инструмент выяснения отношений.
 */
export default function BlacklistModal({ isOpen, onClose }: BlacklistModalProps) {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const { list, unblock, isLoading } = useBlacklist();
  const swipe = useSheetSwipe(onClose);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useLockBody(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined' || !isOpen) return null;

  const handleUnblock = async (userId: string) => {
    setBusyId(userId);
    setError('');
    try {
      await unblock(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : L('Не удалось снять блокировку', 'Блоки дIаяккха ца делира'));
    } finally {
      setBusyId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-zinc-950/70 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blacklist-title"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="smk-sheet-head flex items-center justify-between gap-2 px-4 pb-3 pt-4"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <ShieldBan className="h-4 w-4" />
            </div>
            <h2 id="blacklist-title" className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
              {L('Чёрный список', 'IаьржамогIам')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={L('Закрыть', 'ДIакъовла')}
            className="smk-act rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <p className="smk-meta mb-3 smk-text-label leading-relaxed">
            {L(
              'Вы не видите анкеты этих людей, а они — ваши. Они не могут оставлять отзывы и вопросы у вас и откликаться на ваши задания.',
              'Ахьа хIокху нехан анкеташ ца го, цара хьан а. Цара хьуна хастамаш, хаттарш яздан а, хьан тIедилларш тIеэца а ца ло.',
            )}
          </p>

          {error && (
            <p className="smk-note smk-note-danger mb-2 px-3 py-2">
              {error}
            </p>
          )}

          {isLoading && list.length === 0 && <ListSkeleton count={3} />}

          {!isLoading && list.length === 0 && (
            <EmptyState
              title={L('Список пуст', 'МогIам баьржина бац')}
              hint={L('Ваш чёрный список пуст.', 'Хьан IаьржамогIам баьржина бац.')}
            />
          )}

          <div className="space-y-1.5">
            {list.map((person) => (
              <div key={person.userId} className="smk-sheet-row flex items-center gap-2.5 p-2.5">
                <Avatar src={person.avatarUrl} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                    {person.fullName || L('Житель', 'Бахархо')}
                  </p>
                  {person.reason && (
                    <p className="smk-meta truncate smk-text-label">{person.reason}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(person.userId)}
                  disabled={busyId === person.userId}
                  className="shrink-0 rounded-lg px-2.5 py-1 smk-text-label font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                >
                  {busyId === person.userId
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : L('Разблокировать', 'Схьаяккха')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
