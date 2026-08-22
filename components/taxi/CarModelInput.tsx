'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Марка машины таксиста: подсказки из справочника БД; галочка «моей
 * машины нет в списке» включает ручной ввод — он уйдёт админам в
 * «Такси → Марки» (п.3 замечаний 23.08).
 */
export default function CarModelInput({
  value, onChange, notInList, onNotInList,
}: {
  value: string;
  onChange: (v: string) => void;
  notInList: boolean;
  onNotInList: (v: boolean) => void;
}) {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (notInList) return;
    const q = value.trim();
    const handle = window.setTimeout(() => {
      void fetch(`/api/taxi/cars?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { cars: [] }))
        .then((d) => setSugs(Array.isArray(d?.cars) ? d.cars : []))
        .catch(() => setSugs([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [value, notInList]);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={L('Марка и модель: Lada Granta', 'Марка а, модель а: Lada Granta')}
        className="smk-field w-full px-2.5 py-2 text-xs text-slate-900 dark:text-white"
      />
      {!notInList && open && sugs.length > 0 && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          {sugs.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(name); setOpen(false); }}
              className="block w-full px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-emerald-50 dark:text-zinc-300 dark:hover:bg-emerald-950/40"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={notInList}
          onChange={(e) => onNotInList(e.target.checked)}
          className="h-3.5 w-3.5 accent-emerald-600"
        />
        {L('Моей машины нет в списке', 'Сан машина спискехь яц')}
      </label>
    </div>
  );
}
