'use client';

import { useI18n } from '@/lib/i18n';

interface ExperienceSectionProps {
  experienceStart: string;
  setExperienceStart: (value: string) => void;
  experienceEnd: string;
  setExperienceEnd: (value: string) => void;
  experienceCurrent: boolean;
  setExperienceCurrent: (value: boolean) => void;
  onChange?: () => void;
}

export function calculateExperience(start: string, end: string, isCurrent: boolean, t?: Record<string, string>): string {
  if (!start) return '';
  const units = t ?? {
    yearUnit1: 'год', yearUnitFew: 'года', yearUnitMany: 'лет',
    monthUnit1: 'месяц', monthUnitFew: 'месяца', monthUnitMany: 'месяцев',
    lessThanMonth: 'меньше месяца',
  };
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(
    `${isCurrent || !end ? new Date().toISOString().slice(0, 10) : end}T12:00:00`
  );
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return '';
  }

  let months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    endDate.getMonth() -
    startDate.getMonth();
  if (endDate.getDate() < startDate.getDate()) months = Math.max(0, months - 1);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts: string[] = [];
  if (years) {
    const unit = years === 1 ? units.yearUnit1 : years >= 2 && years <= 4 ? units.yearUnitFew : units.yearUnitMany;
    parts.push(`${years} ${unit}`);
  }
  if (remainingMonths) {
    const unit = remainingMonths === 1 ? units.monthUnit1 : remainingMonths >= 2 && remainingMonths <= 4 ? units.monthUnitFew : units.monthUnitMany;
    parts.push(`${remainingMonths} ${unit}`);
  }
  return parts.join(' ') || units.lessThanMonth;
}

export default function ExperienceSection({
  experienceStart,
  setExperienceStart,
  experienceEnd,
  setExperienceEnd,
  experienceCurrent,
  setExperienceCurrent,
}: ExperienceSectionProps) {
  const { t } = useI18n();
  const experience = experienceStart ? calculateExperience(experienceStart, experienceEnd, experienceCurrent, {
    yearUnit1: t.yearUnit1, yearUnitFew: t.yearUnitFew, yearUnitMany: t.yearUnitMany,
    monthUnit1: t.monthUnit1, monthUnitFew: t.monthUnitFew, monthUnitMany: t.monthUnitMany,
    lessThanMonth: t.lessThanMonth,
  }) : '';

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold text-slate-700 dark:text-zinc-400">{t.workExperience}</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500">
          {t.workDateFrom}
          <input
            type="date"
            value={experienceStart}
            onChange={(event) => setExperienceStart(event.target.value)}
            className="mt-1 w-full smk-field px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500">
          {t.workDateTo}
          <input
            type="date"
            value={experienceEnd}
            disabled={experienceCurrent}
            onChange={(event) => setExperienceEnd(event.target.value)}
            className="mt-1 w-full smk-field px-3 py-2.5 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
          />
        </label>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={experienceCurrent}
          onChange={(event) => {
            setExperienceCurrent(event.target.checked);
            if (event.target.checked) setExperienceEnd('');
          }}
          className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
        />
        {t.workCurrently}
      </label>
      {experience && (
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t.experienceBadge}{experience}</p>
      )}
    </div>
  );
}
