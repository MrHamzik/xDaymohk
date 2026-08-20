import type { ArticleSection } from '@/lib/articles';

export interface ReadingBookmark {
  section: ArticleSection;
  articleId: string;
  titleRu: string;
  titleCe: string;
  index: number;
}

function key(section: string) {
  return `daymohk-read-${section}`;
}

export function saveReadingProgress(mark: ReadingBookmark): void {
  try {
    window.localStorage.setItem(key(mark.section), JSON.stringify(mark));
  } catch {
    /* private mode */
  }
}

export function loadReadingProgress(section: ArticleSection): ReadingBookmark | null {
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
      index: Number(parsed.index) || 0,
    };
  } catch {
    return null;
  }
}
