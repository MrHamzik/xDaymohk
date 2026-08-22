'use client';

import { useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  GEO_CITIES, GEO_DISTRICTS, GEO_VILLAGES,
  geoSelectionIsEmpty, type GeoSelection,
} from '@/lib/geo-dictionary';

/**
 * ЕДИНЫЙ гео-фильтр «Область и населённый пункт» (модуль, п.11/14
 * замечаний 23.08): сверху «Даймохк — Чеченская Республика» (включен
 * по умолчанию, охватывает всё, несовместим с частными выборами),
 * ниже — «Города / Районы / Сёла». Используется в фильтрах каталога,
 * карты и Темщика — везде один и тот же компонент.
 */
export default function GeoFilter({
  value, onChange,
}: {
  value: GeoSelection;
  onChange: (next: GeoSelection) => void;
}) {
  const { t } = useI18n();
  const [openGroup, setOpenGroup] = useState<'cities' | 'districts' | 'villages' | null>(null);
  const allActive = geoSelectionIsEmpty(value);

  const toggle = (group: 'cities' | 'districts' | 'villages', name: string) => {
    const list = value[group];
    onChange({
      ...value,
      [group]: list.includes(name) ? list.filter((x) => x !== name) : [...list, name],
    });
  };

  const groups: Array<{ id: 'cities' | 'districts' | 'villages'; label: string; items: { value: string; label: string }[] }> = [
    { id: 'cities', label: t.geoCities, items: GEO_CITIES.map((n) => ({ value: n, label: n })) },
    { id: 'districts', label: t.geoDistricts, items: GEO_DISTRICTS.map((d) => ({ value: d.id, label: d.name })) },
    { id: 'villages', label: t.geoVillages, items: GEO_VILLAGES.map((n) => ({ value: n, label: n })) },
  ];

  return (
    <div className="space-y-1">
      {/* Весь охват: включен, пока ничего частного не выбрано. */}
      <button
        type="button"
        onClick={() => onChange({ cities: [], districts: [], villages: [] })}
        aria-pressed={allActive}
        className={`flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
          allActive
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
        }`}
      >
        <MapPin className="h-3.5 w-3.5" />
        {t.geoAll}
      </button>

      {groups.map((group) => {
        const selected = value[group.id];
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left smk-text-label font-bold text-slate-600 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <span>
                {group.label}
                {selected.length > 0 && (
                  <span className="ml-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-white smk-text-label">
                    {selected.length}
                  </span>
                )}
              </span>
              <ChevronDown className={`h-3 w-3 transition ${openGroup === group.id ? 'rotate-180' : ''}`} />
            </button>
            {openGroup === group.id && (
              <div className="mt-1 flex flex-wrap gap-1.5 pb-1">
                {group.items.map((item) => {
                  const on = selected.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(group.id, item.value)}
                      className={`rounded-[calc(1.25rem*var(--smk-radius-scale,1))] px-2 py-1 text-xs font-semibold transition ${
                        on
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
