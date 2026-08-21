'use client';

import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { BookOpen, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import QuranSurahList from '@/components/QuranSurahList';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface QuranModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuranModal({ isOpen, onClose }: QuranModalProps) {
  const { language } = useI18n();

  useLockBody(isOpen);

  // Escape закрывает окно: модал перекрывает страницу целиком, и без
  // клавиатурного выхода он недоступен тем, кто не пользуется мышью.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quran-title"
    >
      <div className="smk-sheet flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl shadow-2xl transition-all">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 p-5 text-white dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 id="quran-title" className="text-base font-bold sm:text-lg">
                {language === 'ce' ? 'Сийлахь Къуръан' : 'Священный Коран'}
              </h2>
              <p className="text-xs text-emerald-100">
                {language === 'ce' ? 'Сураташ а, церан маьIнаш а' : 'Суры, аяты и переводы'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={language === 'ce' ? 'ДIакъовла' : 'Закрыть'}
            className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white transition hover:bg-black/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <QuranSurahList className="min-h-0 flex-1" />
      </div>
    </div>
  , document.body);
}
