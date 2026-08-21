import type { ArticleSection } from '@/lib/articles';

/**
 * Разделы чтения с точки зрения прогресса (п.3 ТЗ Этапа 2).
 *
 * Имена — ровно как в ТЗ: 'quran', 'nochchalma', 'guide', 'sira'.
 * В таблице articles раздел «Нохчалла» исторически называется
 * 'nohchalla'; соответствие между двумя написаниями поддерживают
 * маппинги ниже и триггер миграции 71. Нигде больше разница имен не
 * видна.
 */
export const READING_SECTIONS = ['quran', 'nochchalma', 'guide', 'sira'] as const;

export type ReadingSection = (typeof READING_SECTIONS)[number];

export function isReadingSection(value: unknown): value is ReadingSection {
  return typeof value === 'string'
    && (READING_SECTIONS as readonly string[]).includes(value);
}

/** Раздел прогресса → раздел таблицы articles. */
export function readingToArticle(section: ReadingSection): ArticleSection {
  return section === 'nochchalma' ? 'nohchalla' : section;
}

/** Раздел таблицы articles → раздел прогресса. */
export function articleToReading(section: ArticleSection): ReadingSection {
  return section === 'nohchalla' ? 'nochchalma' : section;
}

/** Маршруты страниц-чтения. */
export const READING_HREFS: Record<ReadingSection, string> = {
  quran: '/quran',
  nochchalma: '/vaynakh',
  guide: '/guide',
  sira: '/sira',
};

/**
 * Идентификаторы пунктов бокового меню (Режим редактирования).
 * Блок раздела на главной показывается, только если пункт меню не
 * скрыт (п.1 ТЗ Этапа 2).
 */
export const READING_MENU_IDS: Record<ReadingSection, string> = {
  quran: 'quran',
  nochchalma: 'vaynakh',
  guide: 'guide',
  sira: 'sira',
};
