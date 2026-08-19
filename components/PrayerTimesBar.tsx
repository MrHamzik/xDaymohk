'use client';

import { useState, useEffect } from 'react';
import { Calendar, Timer } from 'lucide-react';
import { getCurrentDayPrayerTimes, DEFAULT_LAT, DEFAULT_LNG } from '@/lib/islamic';
import { getUserCoords } from '@/lib/geo';
import { useI18n } from '@/lib/i18n';
import PrayerTimesModal from '@/components/PrayerTimesModal';

export default function PrayerTimesBar() {
  const { language } = useI18n();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  // Рендер счётчика только после mount — иначе new Date() на сервере и
  // клиенте различаются и Next.js падает с hydration mismatch.
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
  });
  const [data, setData] = useState(() => getCurrentDayPrayerTimes(new Date(), DEFAULT_LAT, DEFAULT_LNG));

  // Geolocation lookup per DUM RF standard
  useEffect(() => { setMounted(true); }, []);

  // Виджет живёт в боковом меню и монтируется на КАЖДОЙ странице.
  // Раньше он на каждом монтировании вызывал getCurrentPosition — Chrome
  // после нескольких проигнорированных окон блокировал разрешение и
  // засыпал консоль предупреждениями даже на /admin.
  //
  // Теперь берём координаты из общего кеша (lib/geo.ts) и НЕ показываем
  // окно запроса сами: без разрешения считаем время по Самашкам, что для
  // сельского сервиса — правильное умолчание, а не ошибка.
  useEffect(() => {
    let cancelled = false;
    void getUserCoords().then((position) => {
      if (!cancelled && position) setCoords(position);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setData(getCurrentDayPrayerTimes(new Date(), coords.lat, coords.lng));
    const timer = window.setInterval(() => {
      setData(getCurrentDayPrayerTimes(new Date(), coords.lat, coords.lng));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [coords]);

  const hoursRemaining = Math.floor(data.nextPrayer.minutesRemaining / 60);
  const minsRemaining = data.nextPrayer.minutesRemaining % 60;
  // Format strictly as "X ч Y мин", never translating abbreviations
  const countdownText = hoursRemaining > 0
    ? `${hoursRemaining} ч ${minsRemaining} мин`
    : `${minsRemaining} мин`;

  const nextPrayerName = language === 'ce' ? data.nextPrayer.item.nameCe : data.nextPrayer.item.nameRu;

  return (
    <>
      <div className="smk-panel space-y-1.5 p-2 shadow-sm" >
        {/* Countdown Header: Strictly "До [Название]" */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5 dark:border-zinc-800/60 text-xs">
          <div className="flex items-center gap-1.5 font-extrabold text-emerald-700 dark:text-emerald-400">
            <Timer className="h-3.5 w-3.5 animate-pulse text-emerald-600 dark:text-emerald-400" />
            <span>
              До {nextPrayerName}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="rounded-lg bg-emerald-100 px-2 py-0.5 font-mono smk-text-label font-black text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
              {mounted ? countdownText : '— мин'}
            </span>

            <button
              type="button"
              onClick={() => setIsCalendarOpen(true)}
              title="Открыть календарь намазов (ДУМ РФ)"
              aria-label="Календарь намазов"
              className="smk-hit flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:hover:bg-emerald-900 transition"
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Horizontal All-in-One Row (Фаджр, Восход, Зухр, Аср, Магриб, Иша strictly in one line) */}
        <div className="grid grid-cols-6 gap-1 smk-text-label sm:smk-text-label font-semibold text-center">
          {data.items.map((prayer) => {
            const isActive = prayer.id === data.activePrayer?.id;
            const name = language === 'ce' ? prayer.nameCe : prayer.nameRu;
            return (
              <div
                key={prayer.id}
                className={`flex flex-col items-center justify-center rounded-lg py-1 px-0.5 transition ${
                  isActive
                    ? 'bg-emerald-600 text-white font-black shadow-sm'
                    : 'bg-slate-50 text-slate-700 dark:bg-zinc-900 dark:text-zinc-400'
                }`}
              >
                <span className="smk-text-label sm:smk-text-label leading-tight truncate w-full opacity-90">{name}</span>
                <span className="font-mono smk-text-label sm:text-xs leading-tight">{prayer.time}</span>
              </div>
            );
          })}
        </div>
      </div>

      <PrayerTimesModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
      />
    </>
  );
}
