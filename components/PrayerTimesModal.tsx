'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getMonthlyPrayerSchedule, MONTH_NAMES_CE, MONTH_NAMES_RU } from '@/lib/islamic';
import { useI18n } from '@/lib/i18n';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface PrayerTimesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrayerTimesModal({ isOpen, onClose }: PrayerTimesModalProps) {
  const { language } = useI18n();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const todayDate = new Date().getDate();
  const isCurrentMonth = currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();

  useLockBody(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isYearPickerOpen) setIsYearPickerOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isYearPickerOpen]);

  if (!isOpen) return null;

  const schedule = getMonthlyPrayerSchedule(currentYear, currentMonth);
  const monthName = language === 'ce' ? MONTH_NAMES_CE[currentMonth] : MONTH_NAMES_RU[currentMonth];

  const handlePrevMonth = () => {
    setCurrentMonth((m) => {
      if (m === 0) {
        setCurrentYear(y => y - 1);
        return 11;
      }
      return m - 1;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth((m) => {
      if (m === 11) {
        setCurrentYear(y => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  // Year picker range: 10 years before, current year in the middle, 10 after
  const yearPickerYears = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/75 p-2 sm:p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prayer-calendar-title"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 px-4 py-3 text-white dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 shadow-sm">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h2 id="prayer-calendar-title" className="text-sm font-bold sm:text-base">
                {language === 'ce' ? 'Ламазан рузма (ДУМ ЧР)' : 'Расписание намазов (ДУМ ЧР)'}
              </h2>
              <p className="smk-text-label text-emerald-100">
                {language === 'ce' ? 'Даймохк, Нохчийн Республика' : 'Даймохк, Чеченская Республика (UTC+3)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="smk-hit flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 text-white transition hover:bg-black/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-zinc-800/60 dark:bg-zinc-800/60">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="smk-hit flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 dark:bg-zinc-700 dark:text-zinc-300"
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsYearPickerOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold text-slate-900 hover:bg-white dark:text-white dark:hover:bg-zinc-700"
            aria-label="Выбрать год"
            aria-expanded={isYearPickerOpen}
          >
            <span>{monthName}</span>
            <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 smk-text-label font-black text-white">{currentYear}</span>
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            className="smk-hit flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 dark:bg-zinc-700 dark:text-zinc-300"
            aria-label="Следующий месяц"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Year picker popover */}
        {isYearPickerOpen && (
          <div className="border-b border-slate-100 bg-white px-4 py-3 dark:border-zinc-800/60 dark:bg-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentYear(y => y - 21)}
                className="rounded-lg bg-slate-100 px-2.5 py-1 smk-text-label font-bold text-slate-700 hover:bg-slate-200 dark:bg-zinc-700 dark:text-zinc-300"
              >
                ◀ −21
              </button>
              <span className="smk-text-label font-bold text-slate-500 dark:text-zinc-500">
                {currentYear - 10} — {currentYear + 10}
              </span>
              <button
                type="button"
                onClick={() => setCurrentYear(y => y + 21)}
                className="rounded-lg bg-slate-100 px-2.5 py-1 smk-text-label font-bold text-slate-700 hover:bg-slate-200 dark:bg-zinc-700 dark:text-zinc-300"
              >
                +21 ▶
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
              {yearPickerYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setCurrentYear(y);
                    setIsYearPickerOpen(false);
                  }}
                  className={`rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                    y === currentYear
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : y === new Date().getFullYear()
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timetable Table with fixed width and auto fitting */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 no-scrollbar">
          <table className="w-full table-fixed text-center text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-zinc-800 dark:text-zinc-500">
                <th className="w-[12%] pb-2 text-center smk-text-label sm:text-xs font-bold">{language === 'ce' ? 'Де' : 'Число'}</th>
                <th className="w-[14%] pb-2 text-center smk-text-label sm:text-xs font-bold leading-tight truncate">{language === 'ce' ? 'Iуьйра' : 'Фаджр'}</th>
                <th className="w-[15%] pb-2 text-center smk-text-label sm:text-xs font-bold leading-tight truncate">{language === 'ce' ? 'Малхбала' : 'Восход'}</th>
                <th className="w-[14%] pb-2 text-center smk-text-label sm:text-xs font-bold leading-tight truncate">{language === 'ce' ? 'Делкъа' : 'Зухр'}</th>
                <th className="w-[15%] pb-2 text-center smk-text-label sm:text-xs font-bold leading-tight truncate">{language === 'ce' ? 'Малхбуза' : 'Аср'}</th>
                <th className="w-[15%] pb-2 text-center smk-text-label sm:text-xs font-bold leading-tight truncate">{language === 'ce' ? 'Маьрккажа' : 'Магриб'}</th>
                <th className="w-[15%] pb-2 text-center smk-text-label sm:text-xs font-bold leading-tight truncate">{language === 'ce' ? 'Пхьуьйра' : 'Иша'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono smk-text-label sm:text-xs dark:divide-zinc-800/60">
              {schedule.map((row) => {
                const isToday = isCurrentMonth && row.day === todayDate;
                return (
                  <tr
                    key={row.day}
                    className={`transition ${
                      isToday
                        ? 'bg-emerald-50 font-bold text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <td className="py-2 font-sans font-extrabold">
                      <span className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 ${isToday ? 'bg-emerald-600 text-white' : ''}`}>
                        {row.day}
                      </span>
                    </td>
                    <td className="py-2 text-center">{row.fajr}</td>
                    <td className="py-2 text-center text-amber-600 dark:text-amber-400">{row.sunrise}</td>
                    <td className="py-2 text-center">{row.dhuhr}</td>
                    <td className="py-2 text-center">{row.asr}</td>
                    <td className="py-2 text-center">{row.maghrib}</td>
                    <td className="py-2 text-center">{row.isha}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  , document.body);
}
