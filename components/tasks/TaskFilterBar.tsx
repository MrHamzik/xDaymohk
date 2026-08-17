'use client';

import { useState } from 'react';
import { Search, Filter, ChevronDown, X } from 'lucide-react';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import type { AppFilter } from '@/lib/types';

interface TaskFilterBarProps {
  query: string;
  setQuery: (value: string) => void;
  tab: string;
  setTab: (value: string) => void;
  tabs: Array<{ value: string; label: string; count?: number }>;
  categories: AppFilter[];
  category: string;
  setCategory: (value: string) => void;
  /** Акцентный цвет: emerald для «Аренца Темщик», teal для «ГIончалла». */
  accent?: 'emerald' | 'teal';
}

/**
 * Поиск и фильтры раздела заданий.
 *
 * Оформление намеренно повторяет SearchFilter из каталога: строка
 * поиска со сбросом и сворачиваемый блок «Фильтры» со счётчиком
 * активных. Так разделы выглядят частями одного приложения, а не
 * набором разных экранов.
 */
export default function TaskFilterBar({
  query,
  setQuery,
  tab,
  setTab,
  tabs,
  categories,
  category,
  setCategory,
  accent = 'emerald',
}: TaskFilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = category ? 1 : 0;

  const chipActive = accent === 'teal'
    ? 'bg-teal-600 text-white shadow-sm'
    : 'bg-emerald-600 text-white shadow-sm';
  const chipIdle =
    'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700';
  const accentText = accent === 'teal'
    ? 'text-teal-600 dark:text-teal-400'
    : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className="mb-4 space-y-2">
      {/* Вкладки ленты */}
      <MapSegmentedControl
        ariaLabel="Лента заданий"
        active={[tab]}
        onSelect={setTab}
        options={tabs.map((t) => ({ value: t.value, label: t.label, count: t.count }))}
        className="w-full"
      />

      {/* Поиск */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
          <Search className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по заданиям…"
          aria-label="Поиск по заданиям"
          className="w-full rounded-xl border border-slate-200/60 bg-white py-2.5 pl-9.5 pr-20 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-400 sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-semibold text-slate-400 transition hover:text-slate-600 dark:hover:text-zinc-200"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Фильтры — как в каталоге */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          className="inline-flex w-full items-center justify-between rounded-xl border border-slate-200/60 bg-white px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <span className="inline-flex items-center gap-2">
            <Filter className={`h-3.5 w-3.5 ${accentText}`} />
            Фильтры
            {activeCount > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black text-white ${
                accent === 'teal' ? 'bg-teal-600' : 'bg-emerald-600'
              }`}>
                {activeCount}
              </span>
            )}
          </span>
          <ChevronDown className={`h-4 w-4 transition duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-800">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-zinc-700">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Категория</p>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                  Выберите тип задания
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Закрыть фильтры"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory('')}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                  category === '' ? chipActive : chipIdle
                }`}
              >
                Все
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                    category === c.value ? chipActive : chipIdle
                  }`}
                >
                  {c.labelRu}
                </button>
              ))}
            </div>

            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => { setCategory(''); setIsOpen(false); }}
                className="mt-3 w-full rounded-lg border-t border-slate-100 pt-2.5 text-[11px] font-bold text-slate-500 transition hover:text-slate-800 dark:border-zinc-700 dark:hover:text-zinc-200"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
