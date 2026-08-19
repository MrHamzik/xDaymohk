'use client';

import { Clock } from 'lucide-react';
import { WEEKDAYS } from '@/lib/schedule';
import { useI18n } from '@/lib/i18n';

interface ScheduleSectionProps {
  isFlexibleSchedule: boolean;
  setIsFlexibleSchedule: (value: boolean) => void;
  workDays: string[];
  setWorkDays: (value: string[] | ((prev: string[]) => string[])) => void;
  workHoursStart: string;
  setWorkHoursStart: (value: string) => void;
  workHoursEnd: string;
  setWorkHoursEnd: (value: string) => void;
  breakStart: string;
  setBreakStart: (value: string) => void;
  breakEnd: string;
  setBreakEnd: (value: string) => void;
}

export default function ScheduleSection({
  isFlexibleSchedule,
  setIsFlexibleSchedule,
  workDays,
  setWorkDays,
  workHoursStart,
  setWorkHoursStart,
  workHoursEnd,
  setWorkHoursEnd,
  breakStart,
  setBreakStart,
  breakEnd,
  setBreakEnd,
}: ScheduleSectionProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5 border-t border-[color:var(--smk-divider)] pt-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400">{t.workScheduleTitle}</h4>
          <p className="smk-text-label text-slate-500 dark:text-zinc-500">{t.workScheduleHint}</p>
        </div>
        <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.workDaysTitle}</label>
        <div className="grid grid-cols-7 gap-1 w-full">
          {WEEKDAYS.map((day) => {
            const isSelected = workDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => {
                  setWorkDays((current) =>
                    Array.isArray(current) && current.includes(day) ? current.filter((d) => d !== day) : [...(current ?? []), day]
                  );
                }}
                className={`flex items-center justify-center rounded-xl py-1.5 text-xs font-bold transition ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border border-slate-200/70 bg-white text-slate-600 shadow-sm hover:bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-2.5 text-xs font-bold text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
        <input
          type="checkbox"
          checked={isFlexibleSchedule}
          onChange={(event) => setIsFlexibleSchedule(event.target.checked)}
          className="h-3.5 w-3.5 rounded text-sky-600 focus:ring-sky-500"
        />
        <span>
          <span className="block font-bold">{t.flexibleScheduleLabel}</span>
          <span className="block font-normal smk-text-label text-sky-700 dark:text-sky-300">
            {t.flexibleScheduleHint}
          </span>
        </span>
      </label>

      {!isFlexibleSchedule && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="work-start" className="mb-1 block smk-text-label font-semibold text-slate-700 dark:text-zinc-400">{t.workHoursStart}</label>
              <input
                id="work-start"
                type="time"
                value={workHoursStart}
                onChange={(event) => setWorkHoursStart(event.target.value)}
                className="w-full smk-field px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="work-end" className="mb-1 block smk-text-label font-semibold text-slate-700 dark:text-zinc-400">{t.workHoursEnd}</label>
              <input
                id="work-end"
                type="time"
                value={workHoursEnd}
                onChange={(event) => setWorkHoursEnd(event.target.value)}
                className="w-full smk-field px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label htmlFor="break-start" className="mb-1 block smk-text-label font-semibold text-slate-700 dark:text-zinc-400">{t.breakStart}</label>
              <input
                id="break-start"
                type="time"
                value={breakStart}
                onChange={(event) => setBreakStart(event.target.value)}
                className="w-full smk-field px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="break-end" className="mb-1 block smk-text-label font-semibold text-slate-700 dark:text-zinc-400">{t.breakEnd}</label>
              <input
                id="break-end"
                type="time"
                value={breakEnd}
                onChange={(event) => setBreakEnd(event.target.value)}
                className="w-full smk-field px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
