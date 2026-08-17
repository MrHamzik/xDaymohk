/**
 * Категории объектов карты («Другое»).
 *
 * Единый источник для карты, анкет и заданий. Раньше каждый экран
 * собирал список сам — только из адресов, у которых уже проставлена
 * категория. Если объектов ещё нет, список получался пустым, и в
 * фильтре оставалась одна кнопка «Все».
 *
 * Теперь берём то же, что показывает админка в разделе
 * «Адреса» → «Поиск и категории»:
 *   1. базовый набор (DEFAULT_MAP_CATEGORIES);
 *   2. добавленные админом (localStorage, ключ samashki-custom-categories);
 *   3. фактически встречающиеся у адресов — на случай, если категорию
 *      завели раньше, чем появился этот механизм.
 */

/** Ключ, под которым админка хранит свои категории. */
export const CUSTOM_CATEGORIES_KEY = 'samashki-custom-categories';

/** Базовый набор — зеркало DEFAULT_ADDRESS_CATEGORIES в админке. */
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

/** Категории, добавленные админом вручную. */
export function getCustomMapCategories(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
}

/**
 * Итоговый список для фильтра «Другое».
 * `used` — категории, встречающиеся у уже загруженных адресов.
 * «Дома» исключены: это не объект, а обычный жилой дом.
 */
export function getMapCategories(used: Array<string | undefined | null> = []): string[] {
  const set = new Set<string>();
  for (const c of DEFAULT_MAP_CATEGORIES) set.add(c);
  for (const c of getCustomMapCategories()) set.add(c);
  for (const c of used) {
    if (typeof c === 'string' && c.trim()) set.add(c.trim());
  }
  set.delete('Дома');
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
}
