'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldBan, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface BlacklistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BlacklistModal({ isOpen, onClose }: BlacklistModalProps) {
  const { language } = useI18n();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (typeof document === 'undefined' || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blacklist-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl transition-all dark:bg-zinc-950 border border-slate-200/50 dark:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <ShieldBan className="h-4 w-4 shrink-0" />
            </div>
            <h2 id="blacklist-title" className="text-base font-bold text-slate-900 dark:text-white">
              {language === 'ce' ? 'Iаьржа мугIам' : 'Черный список'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-6 text-center">
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {language === 'ce' ? 'Кхузахь цкъачунна хIумма а дац.' : 'Ваш черный список пока пуст.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700"
        >
          {language === 'ce' ? 'Къовла' : 'Понятно'}
        </button>
      </div>
    </div>,
    document.body
  );
}
