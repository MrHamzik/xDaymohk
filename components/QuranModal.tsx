'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { QURAN_SURAHS, QuranSurahSummary } from '@/lib/islamic';
import { useI18n } from '@/lib/i18n';

interface QuranModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuranModal({ isOpen, onClose }: QuranModalProps) {
  const { language } = useI18n();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSurahs = QURAN_SURAHS.filter((s) => (
    s.nameTranslit.toLowerCase().includes(query.toLowerCase())
    || s.nameCe.toLowerCase().includes(query.toLowerCase())
    || s.nameRu.toLowerCase().includes(query.toLowerCase())
    || String(s.number).includes(query)
  ));

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quran-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl transition-all dark:bg-zinc-950">
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
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white transition hover:bg-black/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-slate-100 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/60">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={language === 'ce' ? 'Сурат лаха (масала: Йа Син, Фатихьа)...' : 'Поиск суры (например: Аль-Фатиха, Йа Син)...'}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
          </div>
        </div>

        {/* Surahs list */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
          {filteredSurahs.map((surah) => (
            <div
              key={surah.number}
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 shadow-sm transition hover:border-emerald-200 hover:bg-white dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-xs font-black text-white shadow-sm">
                  {surah.number}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {surah.nameTranslit}
                  </h3>
                  <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">
                    {language === 'ce' ? surah.nameCe : surah.nameRu}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {surah.versesCount} {language === 'ce' ? 'аят' : 'аятов'} · {surah.place}
                  </p>
                </div>
              </div>

              <div className="text-right font-serif text-lg font-bold text-slate-800 dark:text-white">
                {surah.nameArabic}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  , document.body);
}
