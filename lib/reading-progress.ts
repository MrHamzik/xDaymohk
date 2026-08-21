import type { ReadingSection } from '@/lib/reading-sections';

/**
 * Локальная закладка чтения — хранилище для ГОСТЕЙ и запасной канал до
 * входа в аккаунт.
 *
 * У вошедших пользователей истина живёт в таблице
 * user_reading_progress (см. lib/reading-progress-db.ts). Локальные
 * закладки гостя переносятся в базу после входа (п.3 ТЗ Этапа 2 —
 * решение «локально + перенос при входе»).
 */
export interface ReadingBookmark {
  section: ReadingSection;
  articleId: string;
  titleRu: string;
  titleCe: string;
  chapterNumber: string;
  /** Позиция остановки внутри главы, процент 0..100. */
  scroll: number;
  /** Метка времени появления закладки (для переноса в БД). */
  updatedAt: string;
}

function key(section: string) {
  return `daymohk-read-${section}`;
}

function clampPercent(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, num));
}

export function saveReadingProgress(mark: ReadingBookmark): void {
  try {
    window.localStorage.setItem(key(mark.section), JSON.stringify(mark));
  } catch {
    /* private mode */
  }
}

export function loadReadingProgress(section: ReadingSection): ReadingBookmark | null {
  try {
    const raw = window.localStorage.getItem(key(section));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReadingBookmark>;
    if (!parsed.articleId) return null;
    return {
      section,
      articleId: String(parsed.articleId),
      titleRu: String(parsed.titleRu ?? ''),
      titleCe: String(parsed.titleCe ?? ''),
      chapterNumber: String(parsed.chapterNumber ?? ''),
      scroll: clampPercent(parsed.scroll),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

export function removeReadingProgress(section: ReadingSection): void {
  try {
    window.localStorage.removeItem(key(section));
  } catch {
    /* private mode */
  }
}
