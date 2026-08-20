'use client';

/**
 * /quran — «Священный Коран»: справочник сур.
 *
 * Раньше страница отдавала заглушку ComingSoonPage, хотя готовый список
 * сур уже лежал в components/QuranModal.tsx и никуда не был подключён.
 * Теперь и страница, и модальное окно рисуют один компонент
 * QuranSurahList — расходиться им больше негде.
 *
 * ВАЖНО: в lib/islamic.ts сейчас 9 сур из 114 — это выборка самых
 * читаемых, а не полный мусхаф. Текстов аятов и переводов в проекте нет,
 * поэтому раздел честно назван справочником, без обещания полного
 * текста.
 */

import { BookOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import QuranSurahList from '@/components/QuranSurahList';

export default function QuranPage() {
  const { language } = useI18n();

  return (
    <main className="flex-1 min-w-0 max-w-3xl p-4 pt-20 pb-24 sm:p-6 sm:pt-24">
      <header className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
            {language === 'ce' ? 'Сийлахь Къуръан' : 'Священный Коран'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-zinc-400">
            {language === 'ce' ? 'Сурашан справочник' : 'Справочник сур'}
          </p>
        </div>
      </header>

      <div className="smk-lux overflow-hidden rounded-3xl border border-slate-100 shadow-sm dark:border-zinc-800">
        <QuranSurahList />
      </div>

      <p className="mt-3 text-center text-xs text-slate-500 dark:text-zinc-400">
        {language === 'ce'
          ? 'Хlинца дуькъал сураш ю. Аятийн текст а, гочдарш а тlаьхьа хир ду.'
          : 'Пока доступны основные суры. Тексты аятов и переводы появятся позже.'}
      </p>
    </main>
  );
}
