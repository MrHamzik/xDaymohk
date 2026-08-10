'use client';

import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { Calendar, Moon, Sparkles, X } from 'lucide-react';
import { ISLAMIC_SPECIAL_DAYS } from '@/lib/islamic';
import { useI18n } from '@/lib/i18n';

interface SpecialDaysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpecialDaysModal({ isOpen, onClose }: SpecialDaysModalProps) {
  const { language } = useI18n();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="special-days-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl transition-all dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 p-5 text-white dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shadow-sm">
              <Moon className="h-5 w-5" />
            </div>
            <div>
              <h2 id="special-days-title" className="text-base font-bold sm:text-lg">
                {language === 'ce' ? 'Исламан сийлахь денош' : 'Особые исламские дни'}
              </h2>
              <p className="text-xs text-emerald-100">
                {language === 'ce' ? 'Хьиджрин а, григорианан а рузманца' : 'Даты по календарю Хиджры и григорианскому стилю'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white transition hover:bg-black/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {ISLAMIC_SPECIAL_DAYS.map((item) => (
            <div
              key={item.id}
              className="space-y-1.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm transition hover:border-emerald-200 hover:bg-white dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:bg-zinc-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'ce' ? item.nameCe : item.nameRu}
                </h3>
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                  {item.hijriDate}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>{item.gregorianDate}</span>
              </div>

              <p className="text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                {language === 'ce' ? item.descriptionCe : item.descriptionRu}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  , document.body);
}
