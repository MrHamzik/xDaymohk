/** Разделы, у которых содержимое хранится в таблице articles. */
export const ARTICLE_SECTIONS = ['sira', 'nohchalla', 'guide'] as const;

export type ArticleSection = (typeof ARTICLE_SECTIONS)[number];

export function isArticleSection(value: unknown): value is ArticleSection {
  return typeof value === 'string' && (ARTICLE_SECTIONS as readonly string[]).includes(value);
}

/** Глава страницы-чтения. */
export interface Article {
  id: string;
  section: ArticleSection;
  sortOrder: number;
  titleRu: string;
  titleCe: string;
  leadRu: string;
  leadCe: string;
  bodyRu: string;
  bodyCe: string;
  isPublished: boolean;
  updatedAt: string;
}

/** Предел длины тела главы — защита от «вставили книгу целиком». */
export const ARTICLE_BODY_LIMIT = 60_000;
export const ARTICLE_TITLE_LIMIT = 200;
export const ARTICLE_LEAD_LIMIT = 500;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapArticleRow(row: any): Article {
  return {
    id: String(row.id),
    section: row.section,
    sortOrder: Number(row.sort_order ?? 0),
    titleRu: row.title_ru ?? '',
    titleCe: row.title_ce ?? '',
    leadRu: row.lead_ru ?? '',
    leadCe: row.lead_ce ?? '',
    bodyRu: row.body_ru ?? '',
    bodyCe: row.body_ce ?? '',
    isPublished: row.is_published === true,
    updatedAt: row.updated_at ?? '',
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
