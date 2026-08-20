'use client';

/**
 * Справочник сур: поиск + список.
 *
 * Вынесен из QuranModal, чтобы одна и та же разметка обслуживала и
 * модальное окно, и страницу /quran. Раньше список жил только внутри
 * модала, а страница отдавала заглушку «в разработке» — при доработке
 * раздела пришлось бы править вёрстку в двух местах и они бы разошлись.
 *
 * Компонент презентационный: своего состояния, кроме строки поиска, не
 * держит и ничего не грузит. Источник данных — QURAN_SURAHS.
 */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { QURAN_SURAHS } from '@/lib/islamic';
import { useI18n } from '@/lib/i18n';

interface QuranSurahListProps {
  /** Отступы списка: в модале плотнее, на странице свободнее. */
  className?: string;
}

export default function QuranSurahList({ className = '' }: QuranSurahListProps) {
  const { language } = useI18n();
  const [query, setQuery] = useState('');

  // Поиск по всем написаниям сразу: транслит, чеченское, русское и номер.
  // Нормализуем один раз за ввод, а не на каждую суру в цикле.
  const filteredSurahs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return QURAN_SURAHS;
    return QURAN_SURAHS.filter((surah) => (
      surah.nameTranslit.toLowerCase().includes(needle)
      || surah.nameCe.toLowerCase().includes(needle)
      || surah.nameRu.toLowerCase().includes(needle)
      || String(surah.number).includes(needle)
    ));
  }, [query]);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="border-b border-slate-100 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/60">
        <div className="relative">
          <Search className="smk-ico pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={language === 'ce' ? 'Сурат лаха' : 'Поиск суры'}
            placeholder={language === 'ce'
              ? 'Сурат лаха (масала: Йа Син, Фатихьа)...'
              : 'Поиск суры (например: Аль-Фатиха, Йа Син)...'}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
          />
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5 no-scrollbar">
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
                <p className="smk-text-label text-slate-400">
                  {surah.versesCount} {language === 'ce' ? 'аят' : 'аятов'} · {surah.place}
                </p>
              </div>
            </div>

            <div className="text-right font-serif text-lg font-bold text-slate-800 dark:text-white">
              {surah.nameArabic}
            </div>
          </div>
        ))}

        {filteredSurahs.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
            {language === 'ce' ? 'Цкъа а карийна дац.' : 'Ничего не найдено.'}
          </p>
        )}
      </div>
    </div>
  );
}
