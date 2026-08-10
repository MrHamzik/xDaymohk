'use client';

import { useState } from 'react';
import {
  Briefcase,
  ChevronDown,
  Filter,
  GraduationCap,
  Hammer,
  MapPin,
  Scissors,
  Search,
  ShoppingBag,
  Sprout,
  Stethoscope,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { AudienceFilter, PROFESSION_CATEGORIES } from '@/lib/types';

interface SearchFilterProps {
  searchQuery: string;
  setQuery: (query: string) => void;
  audienceFilters: AudienceFilter[];
  setAudienceFilters: (filters: AudienceFilter[]) => void;
  professionFilters: string[];
  setProfessionFilters: (filters: string[]) => void;
}

const iconMap: Record<string, typeof Briefcase> = {
  Users,
  Stethoscope,
  Hammer,
  GraduationCap,
  Wrench,
  Scissors,
  ShoppingBag,
  Sprout,
  Briefcase,
};

export default function SearchFilter({
  searchQuery,
  setQuery,
  audienceFilters,
  setAudienceFilters,
  professionFilters,
  setProfessionFilters,
}: SearchFilterProps) {
  const { t } = useI18n();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isRegionOpen, setIsRegionOpen] = useState(true);
  const [isWhoOpen, setIsWhoOpen] = useState(true);
  const [isStatusOpen, setIsStatusOpen] = useState(true);
  const [isProfessionOpen, setIsProfessionOpen] = useState(true);

  const activeFilterCount = audienceFilters.length + professionFilters.length;

  const whoOptions: { id: AudienceFilter; label: string }[] = [
    { id: 'residents', label: t.filterResidents },
    { id: 'specialists', label: t.filterSpecialists },
    { id: 'verified', label: t.filterVerifiedOnly },
    { id: 'admins', label: t.filterAdminsOnly },
  ];

  const statusFilterOptions: { id: AudienceFilter; label: string; dotColor: string }[] = [
    { id: 'open_now', label: t.statusOpenNow, dotColor: 'bg-emerald-500' },
    { id: 'break', label: t.statusOnBreak, dotColor: 'bg-amber-500' },
    { id: 'offline', label: 'Не работает', dotColor: 'bg-zinc-400' },
    { id: 'flexible', label: t.statusFlexibleSchedule, dotColor: 'bg-sky-500' },
  ];

  const categoryLabels: Record<string, string> = {
    doctor: t.catDoctor,
    builder: t.catBuilder,
    teacher: t.catTeacher,
    mechanic: t.catMechanic,
    service: t.catService,
    trade: t.catTrade,
    agriculture: t.catAgriculture,
    other: t.catOther,
  };

  const toggleAudience = (filter: AudienceFilter) => {
    setAudienceFilters(
      audienceFilters.includes(filter)
        ? audienceFilters.filter((item) => item !== filter)
        : [...audienceFilters, filter],
    );
  };

  const toggleProfession = (profession: string) => {
    setProfessionFilters(
      professionFilters.includes(profession)
        ? professionFilters.filter((item) => item !== profession)
        : [...professionFilters, profession],
    );
  };

  const resetFilters = () => {
    setAudienceFilters([]);
    setProfessionFilters([]);
    setIsFilterOpen(false);
  };

  return (
    <div className="mb-4 space-y-2">
      {/* Search Input Bar */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
          <Search className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по имени, профессии или улице…"
          className="w-full rounded-xl border border-slate-200/60 bg-white py-2.5 pl-9.5 pr-20 text-xs sm:text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-400"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Main Filter Accordion Toggle */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsFilterOpen((prev) => !prev)}
          aria-expanded={isFilterOpen}
          className="inline-flex w-full items-center justify-between rounded-xl border border-slate-200/60 bg-white px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            {t.filterButton}
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          <ChevronDown className={`h-4 w-4 transition duration-200 ${isFilterOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Full Expanded Filter Settings Drawer */}
        {isFilterOpen && (
          <div className="absolute inset-x-0 top-full z-30 mt-2  rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-800">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-zinc-800">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t.filterSettings}</h3>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500">{t.filterSettingsHint}</p>
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <X className="h-3.5 w-3.5" />
                  {t.resetAll}
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {/* Section 1: Область и населённый пункт */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/80">
                <button
                  type="button"
                  onClick={() => setIsRegionOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400"
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
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white">
                        <input
                          type="checkbox"
                          checked={true}
                          readOnly
                          className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        {t.filterRegionSamashki}
                      </label>
                      <div className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-slate-400 dark:text-zinc-500">
                        <span>{t.filterRegionOthers}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Кого искать */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/80">
                <button
                  type="button"
                  onClick={() => setIsWhoOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400"
                >
                  <span>{t.filterWho}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isWhoOpen ? 'rotate-180' : ''}`} />
                </button>
                {isWhoOpen && (
                  <div className="mt-2 grid flex flex-wrap gap-2">
                    {whoOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700 transition bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={audienceFilters.includes(option.id)}
                          onChange={() => toggleAudience(option.id)}
                          className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 3: Статус работы */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/80">
                <button
                  type="button"
                  onClick={() => setIsStatusOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400"
                >
                  <span>{t.filterWorkStatus}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isStatusOpen ? 'rotate-180' : ''}`} />
                </button>
                {isStatusOpen && (
                  <div className="mt-2 grid flex flex-wrap gap-2">
                    {statusFilterOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700 transition bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={audienceFilters.includes(option.id)}
                          onChange={() => toggleAudience(option.id)}
                          className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className={`h-2 w-2 rounded-full ${option.dotColor}`} />
                        {option.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 4: Направление деятельности */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/80">
                <button
                  type="button"
                  onClick={() => setIsProfessionOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400"
                >
                  <span>{t.filterCategory}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isProfessionOpen ? 'rotate-180' : ''}`} />
                </button>
                {isProfessionOpen && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PROFESSION_CATEGORIES.filter((category) => category.id !== 'all').map((category) => {
                      const Icon = iconMap[category.icon] || Briefcase;
                      const label = categoryLabels[category.id] || category.label;
                      const isSelected = professionFilters.includes(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => toggleProfession(category.id)}
                          className={`flex items-center gap-1.5 rounded-xl p-1.5 text-left text-xs font-semibold transition ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span className="truncate">{label}</span>
                        </button>
                      );
                    })}
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
