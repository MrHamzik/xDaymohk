'use client';

import { useState } from 'react';
import { Bookmark, CircleHelp, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import { useLockBody } from '@/lib/hooks/useLockBody';
import { GUIDE_TOGGLES } from '@/lib/settings/guide-toggles';

/**
 * Одноразовая подсказка о сохранении прогресса (п.8 ТЗ Этапа 2).
 *
 * Тумблеры НЕ зашиты: список берётся из автореестра GUIDE_TOGGLES
 * (п.4 замечаний 23.08) — новый тумблер появляется здесь и в шаге
 * гида автоматически. Значения пишутся прямо в настройки аккаунта.
 */
export default function ReadingTipModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  useLockBody(isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reading-tip-title"
    >
      <div className="smk-sheet max-h-[85dvh] w-full max-w-xs space-y-2.5 overflow-y-auto rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <Bookmark className="h-4 w-4" />
          </div>
          <h2 id="reading-tip-title" className="min-w-0 flex-1 text-sm font-bold text-slate-900 dark:text-white">
            {t.readTipTitle}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
          {t.readTipText}
        </p>

        {/* Тумблеры из автореестра (п.4 замечаний 23.08). */}
        {GUIDE_TOGGLES.map((toggle) => (
          <label key={toggle.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-2.5 transition hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
            <input
              type="checkbox"
              checked={Boolean(settings[toggle.id])}
              onChange={(e) => update({ [toggle.id]: e.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 accent-emerald-600"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white">
                {t[toggle.labelKey]}
                {toggle.noteKey && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setNoteOpen((v) => ({ ...v, [toggle.id]: !v[toggle.id] }));
                    }}
                    aria-expanded={Boolean(noteOpen[toggle.id])}
                    aria-label={t[toggle.labelKey]}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-zinc-800"
                  >
                    <CircleHelp className="h-3 w-3" />
                  </button>
                )}
              </span>
              <span className="mt-0.5 block smk-text-label leading-snug text-slate-500 dark:text-zinc-500">
                {t[toggle.hintKey]}
              </span>
              {toggle.noteKey && noteOpen[toggle.id] && (
                <span className="mt-1.5 block rounded-lg bg-amber-50 px-2 py-1.5 smk-text-label leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {t[toggle.noteKey]}
                </span>
              )}
            </span>
          </label>
        ))}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
        >
          {t.readTipOk}
        </button>
      </div>
    </div>
  );
}
