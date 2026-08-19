import { getCurrentDayPrayerTimes } from '@/lib/islamic';

/**
 * Тихие часы: ночь 22:00–07:00 по Москве и окно намаза (20 минут
 * после начала, без восхода — это не молитва).
 */
export function isQuietNow(at = new Date()): boolean {
  const moscow = at.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Moscow',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [hour, minute] = moscow.split(':').map(Number);
  const mins = hour * 60 + minute;
  if (mins >= 22 * 60 || mins < 7 * 60) return true;

  const { items } = getCurrentDayPrayerTimes(at);
  for (const item of items) {
    if (item.id === 'sunrise') continue;
    const [ph, pm] = item.time.split(':').map(Number);
    const start = ph * 60 + pm;
    if (mins >= start && mins < start + 20) return true;
  }
  return false;
}
