'use client';

import { BookOpen, Compass, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface ChapterSwitchModalProps {
  /** Открыто ли окно. */
  isOpen: boolean;
  /** Название сохранённой главы (подсказка под кнопкой «Продолжить чтение»). */
  savedHint: string;
  /** «Продолжить чтение» — вернуться к сохранённой главе и позиции. */
  onContinueSaved: () => void;
  /** «Режим исследования» — открыть выбранную главу без записи прогресса. */
  onExplore: () => void;
  /** Закрыть окно — остаться на текущей странице, ничего не менять. */
  onClose: () => void;
}

/**
 * Модальное окно п.6 ТЗ Этапа 2: пользователь пытается открыть главу,
 * которая не является сохранённой для этого раздела.
 *
 * Три исхода — ровно по ТЗ:
 *  1. «Продолжить чтение» → возврат к сохранённой главе и позиции;
 *  2. «Режим исследования» → выбранная глава открывается, но прогресс
 *     НЕ перезаписывается (старое сохранение остаётся нетронутым);
 *  3. закрыть окно → ничего не меняется.
 */
export default function ChapterSwitchModal({
  isOpen, savedHint, onContinueSaved, onExplore, onClose,
}: ChapterSwitchModalProps) {
  const { t } = useI18n();
  useLockBody(isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reading-switch-title"
    >
      <div className="smk-sheet w-full max-w-sm rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="reading-switch-title" className="text-sm font-bold text-slate-900 dark:text-white">
              {t.readSwitchTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-500">
              {t.readSwitchText}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          <button
            type="button"
            onClick={onContinueSaved}
            className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-left transition hover:bg-emerald-700"
          >
            <span className="block text-xs font-bold text-white">{t.readSwitchContinue}</span>
            <span className="mt-0.5 block smk-text-label leading-snug text-emerald-100">
              {t.readSwitchContinueHint}{savedHint ? `: ${savedHint}` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={onExplore}
            className="flex w-full items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
          >
            <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-800 dark:text-zinc-200">
                {t.readSwitchExplore}
              </span>
              <span className="mt-0.5 block smk-text-label leading-snug text-slate-500 dark:text-zinc-500">
                {t.readSwitchExploreHint}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
