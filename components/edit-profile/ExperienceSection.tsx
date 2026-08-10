'use client';

interface ExperienceSectionProps {
  experienceStart: string;
  setExperienceStart: (value: string) => void;
  experienceEnd: string;
  setExperienceEnd: (value: string) => void;
  experienceCurrent: boolean;
  setExperienceCurrent: (value: boolean) => void;
  onChange?: () => void;
}

export function calculateExperience(start: string, end: string, isCurrent: boolean): string {
  if (!start) return '';
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
    parts.push(
      `${years} ${years === 1 ? 'год' : years >= 2 && years <= 4 ? 'года' : 'лет'}`
    );
  }
  if (remainingMonths) {
    parts.push(
      `${remainingMonths} ${remainingMonths === 1 ? 'месяц' : remainingMonths >= 2 && remainingMonths <= 4 ? 'месяца' : 'месяцев'}`
    );
  }
  return parts.join(' ') || 'меньше месяца';
}

export default function ExperienceSection({
  experienceStart,
  setExperienceStart,
  experienceEnd,
  setExperienceEnd,
  experienceCurrent,
  setExperienceCurrent,
}: ExperienceSectionProps) {
  const experience = experienceStart ? calculateExperience(experienceStart, experienceEnd, experienceCurrent) : '';

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold text-slate-700 dark:text-zinc-400">Период работы и стаж</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500">
          С даты
          <input
            type="date"
            value={experienceStart}
            onChange={(event) => setExperienceStart(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500">
          По дату
          <input
            type="date"
            value={experienceEnd}
            disabled={experienceCurrent}
            onChange={(event) => setExperienceEnd(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
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
        Работаю здесь сейчас
      </label>
      {experience && (
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Стаж: {experience}</p>
      )}
    </div>
  );
}
