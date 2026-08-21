'use client';

import { useEffect, useState } from 'react';
import { Bookmark, CircleHelp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface ReadingTipModalProps {
  isOpen: boolean;
  /** Текущее значение чекбокса «Автосохранение» (из настроек). */
  autosaveDefault: boolean;
  /**
   * Закрытие окна. Флаг «подсказка показана» и выбранный чекбокс
   * уходят в настройки аккаунта (БД) — см. п.8 ТЗ Этапа 2.
   */
  onClose: (autosave: boolean) => void;
}

/**
 * Одноразовая подсказка о сохранении прогресса (п.8 ТЗ Этапа 2).
 *
 * Показывается при первом открытии любой главы любого из четырёх
 * разделов, пока у аккаунта не поднят флаг is_reading_tip_shown.
 * Внутри — объяснение кнопки «Сохранить» и чекбокс «Автосохранение»,
 * синхронизированный с одноимённой настройкой (п.9): выбор из окна и
 * тумблер в настройках — одно и то же значение.
 */
export default function ReadingTipModal({ isOpen, autosaveDefault, onClose }: ReadingTipModalProps) {
  const { t } = useI18n();
  useLockBody(isOpen);

  const [autosave, setAutosave] = useState(autosaveDefault);
  const [noteOpen, setNoteOpen] = useState(false);

  // Каждое открытие — свежие значения: окно остаётся смонтированным
  // между показами, а умолчание могло измениться в настройках.
  useEffect(() => {
    if (isOpen) {
      setAutosave(autosaveDefault);
      setNoteOpen(false);
    }
  }, [isOpen, autosaveDefault]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reading-tip-title"
    >
      <div className="smk-sheet w-full max-w-sm rounded-3xl p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <Bookmark className="h-5 w-5" />
          </div>
          <h2 id="reading-tip-title" className="min-w-0 flex-1 text-base font-bold text-slate-900 dark:text-white">
            {t.readTipTitle}
          </h2>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
          {t.readTipText}
        </p>

        {/* Чекбокс автосохранения — то же значение, что в Настройках */}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
          <input
            type="checkbox"
            checked={autosave}
            onChange={(event) => setAutosave(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
              {t.readTipAutosave}
              {/* «?» — дополнительное пояснение про поиск (п.8 ТЗ) */}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  setNoteOpen((value) => !value);
                }}
                aria-label={t.readTipAutosave}
                aria-expanded={noteOpen}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-zinc-800"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </span>
            <span className="mt-1 block text-xs leading-snug text-slate-500 dark:text-zinc-500">
              {t.readTipAutosaveHint}
            </span>
            {noteOpen && (
              <span className="mt-2 block rounded-xl bg-amber-50 px-2.5 py-2 text-xs leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {t.readTipSearchNote}
              </span>
            )}
          </span>
        </label>

        <button
          type="button"
          onClick={() => onClose(autosave)}
          className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
        >
          {t.readTipOk}
        </button>
      </div>
    </div>
  );
}
