'use client';

import { ArrowLeft, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useSheetSwipe } from '@/lib/hooks/useSheetSwipe';
import PayoutSettings from '@/components/settings/PayoutSettings';

interface PayoutPeekSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Реквизиты поверх формы задания: окно задания не закрываем. */
export default function PayoutPeekSheet({ isOpen, onClose }: PayoutPeekSheetProps) {
  const { t } = useI18n();
  const swipe = useSheetSwipe(onClose);
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="smk-sheet-head flex items-center justify-between px-4 pb-3 pt-4"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
          <button
            type="button"
            onClick={onClose}
            className="smk-act flex h-11 items-center gap-1.5 rounded-xl px-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="smk-text-label font-bold">{t.tasksBack}</span>
          </button>
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">{t.payoutSection}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="smk-act rounded-lg p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <PayoutSettings />
        </div>
      </div>
    </div>
  );
}
