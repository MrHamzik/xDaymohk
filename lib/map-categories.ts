'use client';

/**
 * Категории объектов карты («Другое»).
 *
 * Единый источник для страницы «Карта», карты в анкете и в заданиях.
 *
 * Раньше список собирался двумя разными способами и оба были неполными:
 *   * из адресов, где категория уже проставлена — пока таких объектов
 *     нет, оставалась одна кнопка «Все»;
 *   * из localStorage админки — значит только на том устройстве, где
 *     категорию завели.
 *
 * Теперь справочник лежит в БД (app_filters, scope='map', миграция 22)
 * и одинаков для всех. Локальный кэш используется только как мгновенный
 * ответ до прихода сети и как запасной вариант офлайн.
 */

const CACHE_KEY = 'daymohk-map-categories-cache';
/** Старый ключ админки — читаем для совместимости со старыми браузерами. */
const LEGACY_KEY = 'daymohk-custom-categories';

/**
 * Базовый набор на случай, если БД недоступна.
 * Держать в согласии с миграцией 22 и DEFAULT_ADDRESS_CATEGORIES в админке.
 */
export const DEFAULT_MAP_CATEGORIES = [
  'Другое',
  'Автосервис',
  'Магазины',
  'Торговля',
  'Школа',
  'Образование',
  'Мечеть',
  'Администрация',
  'Почта',
  'Спорткомплекс',
  'Здравоохранение',
];

function readCache(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
}

/** Синхронный список: кэш + база + встречающиеся у адресов. */
export function getMapCategories(used: Array<string | undefined | null> = []): string[] {
  const set = new Set<string>();
  const cached = readCache(CACHE_KEY);
  // Пока сеть не ответила, показываем последнее известное состояние;
  // если кэша нет вовсе — базовый набор, чтобы список не был пустым.
  for (const c of cached.length > 0 ? cached : DEFAULT_MAP_CATEGORIES) set.add(c);
  for (const c of readCache(LEGACY_KEY)) set.add(c);
  for (const c of used) {
    if (typeof c === 'string' && c.trim()) set.add(c.trim());
  }
  set.delete('Дома');
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
}

/**
 * Актуальный список из БД. Результат кладём в кэш, чтобы следующий
 * рендер был мгновенным. При ошибке сети возвращаем синхронный вариант.
 */
export async function fetchMapCategories(
  used: Array<string | undefined | null> = [],
): Promise<string[]> {
  try {
    const response = await fetch('/api/tasks/filters?scope=map', { cache: 'no-store' });
    if (!response.ok) throw new Error('bad status');
    const data = await response.json();
    const fromDb: string[] = (data.filters ?? [])
      .map((f: { labelRu?: string }) => String(f.labelRu ?? '').trim())
      .filter(Boolean);

    if (fromDb.length > 0) {
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(fromDb));
      } catch {
        // приватный режим — просто без кэша
      }
    }

    const set = new Set<string>(fromDb.length > 0 ? fromDb : DEFAULT_MAP_CATEGORIES);
    for (const c of used) {
      if (typeof c === 'string' && c.trim()) set.add(c.trim());
    }
    set.delete('Дома');
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  } catch {
    return getMapCategories(used);
  }
}
