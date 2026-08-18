'use client';

import { useState } from 'react';
import { Banknote, Search, Filter, ChevronDown, X, MapPin, Layers, Zap, Wallet } from 'lucide-react';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { useI18n } from '@/lib/i18n';
import { PAYMENT_METHODS } from '@/lib/payments';
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
  /** Фильтр по срочности: пусто = любая. */
  priority: string;
  setPriority: (value: string) => void;
  /** Минимальная награда ИСПОЛНИТЕЛЮ (без надбавок и закупки), ₽. */
  minReward: number;
  setMinReward: (value: number) => void;
  /** Фильтр по способу расчёта: пусто = любой. */
  payment: string;
  setPayment: (value: string) => void;
  /** Акцентный цвет: emerald для «Аренца Темщик», teal для «ГIончалла». */
  accent?: 'emerald' | 'teal';
}

/**
 * Поиск и фильтры раздела заданий.
 *
 * Структура намеренно повторяет SearchFilter из каталога: строка поиска
 * со сбросом, кнопка «Фильтры» со счётчиком и выпадающая панель с
 * сворачиваемыми секциями — «Область и населённый пункт» и
 * «Направление и сфера». Так разделы выглядят частями одного
 * приложения, а не набором разных экранов.
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
  priority,
  setPriority,
  minReward,
  setMinReward,
  payment,
  setPayment,
  accent = 'emerald',
}: TaskFilterBarProps) {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [isSphereOpen, setIsSphereOpen] = useState(true);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  // Село пока одно, поэтому чекбоксы региона визуальные — как в каталоге.
  const [regionAll, setRegionAll] = useState(true);
  const [regionSamashki, setRegionSamashki] = useState(true);
  const [isRewardOpen, setIsRewardOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const activeCount = (category ? 1 : 0) + (priority ? 1 : 0) + (minReward > 0 ? 1 : 0) + (payment ? 1 : 0);

  const resetAll = () => {
    setCategory('');
    setPriority('');
    setMinReward(0);
    setIsOpen(false);
  };

  const isTeal = accent === 'teal';
  // Размеры, скругления и заливки один в один как в SearchFilter
  // каталога: круглые чипы, px-3 py-1.5, font-semibold.
  // Размеры и скругления один в один как у чипов региона в каталоге:
  // rounded-xl, px-2.5 py-1.5, font-bold, shadow-sm.
  const chipBase =
    'flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold shadow-sm transition';
  const chipActive = isTeal ? 'bg-teal-600 text-white' : 'bg-emerald-600 text-white';
  const chipIdle =
    'bg-white text-slate-900 hover:bg-slate-50 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700';
  const accentText = isTeal ? 'text-teal-600 dark:text-teal-400' : 'text-emerald-600 dark:text-emerald-400';

  const sectionClass =
    'rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/80';
  // Тот же класс, что у заголовков секций в SearchFilter каталога.
  const sectionHeadClass =
    'flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400';

  return (
    <div className="mb-4 space-y-2">
      {/* Вкладки ленты */}
      <MapSegmentedControl
        ariaLabel={t.tasksFeedAria}
        active={[tab]}
        onSelect={setTab}
        options={tabs.map((item) => ({ value: item.value, label: item.label, count: item.count }))}
        className="w-full"
      />

      {/* Поиск */}
      <div className="relative">
        <span className="smk-ico pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.tasksSearchPlaceholder}
          aria-label={t.tasksSearchPlaceholder}
          className="w-full rounded-xl border border-slate-200/60 bg-white py-2.5 pl-9.5 pr-20 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-400 sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-semibold text-slate-400 transition hover:text-slate-600 dark:hover:text-zinc-200"
          >
            {t.reset}
          </button>
        )}
      </div>

      {/* Фильтры */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          className="inline-flex w-full items-center justify-between rounded-xl border border-slate-200/60 bg-white px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span className="inline-flex items-center gap-2">
            <Filter className={`h-3.5 w-3.5 ${accentText}`} />
            {t.tasksFilterButton}
            {activeCount > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black text-white ${
                isTeal ? 'bg-teal-600' : 'bg-emerald-600'
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
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t.filterSettings}</h3>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500">{t.filterSettingsHint}</p>
              </div>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={resetAll}
                  className={`inline-flex items-center gap-1 text-xs font-bold hover:underline ${accentText}`}
                >
                  <X className="h-3.5 w-3.5" />
                  {t.resetAll}
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {/* Секция 1: Область и населённый пункт.
                  Разметка скопирована из SearchFilter каталога один в один. */}
              <div className={sectionClass}>
                <button
                  type="button"
                  onClick={() => setIsRegionOpen((v) => !v)}
                  className={sectionHeadClass}
                >
                  <span>{t.filterRegion}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isRegionOpen ? 'rotate-180' : ''}`} />
                </button>
                {isRegionOpen && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                      <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                        {t.filterRegionChr}
                      </span>
                      <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-slate-700 dark:bg-zinc-700 dark:text-zinc-300">
                        {t.filterRegionDistrict}
                      </span>
                    </div>
                    <div className="grid flex flex-wrap gap-2">
                      <label className={`flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white shadow-sm ${
                        isTeal ? 'bg-teal-600' : 'bg-emerald-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={regionAll}
                          onChange={(e) => setRegionAll(e.target.checked)}
                          className="h-3.5 w-3.5 rounded text-white focus:ring-emerald-500"
                        />
                        <MapPin className="h-3.5 w-3.5" />
                        {t.filterRegionAll}
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white">
                        <input
                          type="checkbox"
                          checked={regionSamashki}
                          onChange={(e) => setRegionSamashki(e.target.checked)}
                          className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <MapPin className={`h-3.5 w-3.5 ${accentText}`} />
                        {t.filterRegionSamashki}
                      </label>
                      <div className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-slate-400 dark:text-zinc-500">
                        <span>{t.filterRegionOthers}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Секция 2: минимальная награда исполнителю */}
              <div className={sectionClass}>
                <button
                  type="button"
                  onClick={() => setIsRewardOpen((v) => !v)}
                  className={sectionHeadClass}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" />
                    {t.tasksRewardFrom}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isRewardOpen ? 'rotate-180' : ''}`} />
                </button>
                {isRewardOpen && (
                  <div className="mt-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {minReward > 0 ? `${t.tasksRewardFromPrefix} ${minReward} ₽` : t.tasksRewardAny}
                      </span>
                      {minReward > 0 && (
                        <button
                          type="button"
                          onClick={() => setMinReward(0)}
                          className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                        >
                          {t.reset}
                        </button>
                      )}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5000}
                      step={50}
                      value={minReward}
                      onChange={(e) => setMinReward(Number(e.target.value))}
                      aria-label={t.tasksRewardAria}
                      className={`w-full ${isTeal ? 'accent-teal-600' : 'accent-emerald-600'}`}
                    />
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {t.tasksRewardHint}
                    </p>
                  </div>
                )}
              </div>
              {/* Секция 3: срочность */}
              <div className={sectionClass}>
                <button
                  type="button"
                  onClick={() => setIsPriorityOpen((v) => !v)}
                  className={sectionHeadClass}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    {t.tasksUrgency}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isPriorityOpen ? 'rotate-180' : ''}`} />
                </button>
                {isPriorityOpen && (
                  <div className="mt-2 grid flex flex-wrap gap-2">
                    {[
                      ['', t.tasksUrgencyAny],
                      ['normal', t.tasksUrgencyNormal],
                      ['high', `🟡 ${t.tasksUrgencyHigh}`],
                      ['critical', `🔴 ${t.tasksUrgencyCritical}`],
                    ].map(([value, label]) => (
                      <button
                        key={value || 'any'}
                        type="button"
                        onClick={() => setPriority(value)}
                        className={`${chipBase} ${priority === value ? chipActive : chipIdle}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Секция: способ расчёта.
                  Для исполнителя это не косметика: без заполненных
                  реквизитов он не сможет взять задание с переводом,
                  поэтому возможность отсеять их сразу экономит время. */}
              <div className={sectionClass}>
                <button
                  type="button"
                  onClick={() => setIsPaymentOpen((v) => !v)}
                  aria-expanded={isPaymentOpen}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-zinc-300">
                    <Banknote className="h-3.5 w-3.5" />
                    {t.taskPaymentMethod}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isPaymentOpen ? 'rotate-180' : ''}`} />
                </button>
                {isPaymentOpen && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      ['', t.tasksPaymentAny],
                      ...PAYMENT_METHODS.map((method) => [
                        method,
                        t[`taskPay_${method}` as keyof typeof t] as string,
                      ]),
                    ].map(([value, label]) => (
                      <button
                        key={value || 'any'}
                        type="button"
                        onClick={() => setPayment(value)}
                        className={`${chipBase} ${payment === value ? chipActive : chipIdle}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Секция 4: направление и сфера */}
              <div className={sectionClass}>
                <button
                  type="button"
                  onClick={() => setIsSphereOpen((v) => !v)}
                  className={sectionHeadClass}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    {t.tasksSphere}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isSphereOpen ? 'rotate-180' : ''}`} />
                </button>
                {isSphereOpen && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCategory('')}
                      className={`${chipBase} min-w-0 ${category === '' ? chipActive : chipIdle}`}
                    >
                      <span className="truncate">{t.tasksSphereAll}</span>
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        className={`${chipBase} min-w-0 ${category === c.value ? chipActive : chipIdle}`}
                      >
                        {/* Чеченская подпись, если админ её задал; иначе русская */}
                        <span className="truncate">
                          {(language === 'ce' && c.labelCe) || c.labelRu}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
