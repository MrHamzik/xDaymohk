import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  READING_SECTIONS, readingToArticle, type ReadingSection,
} from '@/lib/reading-sections';
import {
  loadReadingProgress, removeReadingProgress, type ReadingBookmark,
} from '@/lib/reading-progress';
import { clampPercent } from '@/lib/reading-rules';

/**
 * Прогресс чтения вошедшего пользователя (п.3 ТЗ Этапа 2).
 *
 * Записи живут в таблице user_reading_progress (по одной на раздел),
 * защита — RLS «только свои строки» (миграция 71), поэтому клиент
 * пишет напрямую через Supabase: сервисный ключ не нужен, чужой
 * прогресс недоступен ни на чтение, ни на запись.
 */
export interface DbProgress {
  section: ReadingSection;
  chapterId: string;
  scroll: number;
  updatedAt: string;
  titleRu: string;
  titleCe: string;
  chapterNumber: string;
}

interface ProgressArticle {
  title_ru: string;
  title_ce: string;
  chapter_number: string;
  section: string;
}

interface ProgressRow {
  section_type: string;
  chapter_id: string;
  scroll_position: number | string;
  updated_at: string;
  /**
   * Внешний ключ 1:1 — приходит объектом, но типы supabase-js без
   * подсказки `.single()` видят массив; принимаем оба варианта.
   */
  articles?: ProgressArticle | ProgressArticle[] | null;
}

/**
 * Все сохранённые точки пользователя с заголовками глав.
 *
 * Возвращает:
 *  - список (возможно пустой) — у вошедшего пользователя;
 *  - null — гостю, при ненастроенном Supabase и при ошибке:
 *    интерфейс в этом случае просто не показывает «Продолжить чтение».
 */
export async function fetchMyProgress(): Promise<DbProgress[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  // Глава подтягивается внешним ключом: заголовки приезжают одним
  // запросом вместе с прогрессом. Удалённая каскадом глава просто не
  // вернётся — строка прогресса к тому моменту уже удалена тоже.
  const { data, error } = await supabase
    .from('user_reading_progress')
    .select('section_type, chapter_id, scroll_position, updated_at, articles(title_ru, title_ce, chapter_number, section)')
    .eq('user_id', userId);

  if (error || !Array.isArray(data)) return null;

  const out: DbProgress[] = [];
  for (const raw of data as ProgressRow[]) {
    const section = raw.section_type as ReadingSection;
    if (!READING_SECTIONS.includes(section)) continue;
    const article = Array.isArray(raw.articles) ? raw.articles[0] : raw.articles;
    if (!article) continue;
    // Триггер БД это и так гарантирует, но клиент чужим данным не верит.
    if (readingToArticle(section) !== article.section) continue;
    out.push({
      section,
      chapterId: String(raw.chapter_id),
      scroll: clampPercent(Number(raw.scroll_position)),
      updatedAt: String(raw.updated_at ?? ''),
      titleRu: article.title_ru ?? '',
      titleCe: article.title_ce ?? '',
      chapterNumber: article.chapter_number ?? '',
    });
  }
  return out;
}

/**
 * Сохранить точку чтения. Создаёт запись при первом открытии главы и
 * обновляет позицию при дальнейшем чтении. Возвращает успех операции —
 * на неудачу интерфейс ответит тихим «не сохранено», а не падением.
 */
export async function saveMyProgress(
  section: ReadingSection,
  chapterId: string,
  scroll: number,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;

  const { error } = await supabase
    .from('user_reading_progress')
    .upsert({
      user_id: userId,
      section_type: section,
      chapter_id: chapterId,
      scroll_position: Math.round(clampPercent(scroll) * 100) / 100,
    }, { onConflict: 'user_id,section_type' });

  return !error;
}

/**
 * Перенос гостевых закладок в базу после входа.
 *
 * Гость читал без аккаунта — закладки лежат в браузере. После входа
 * они один раз переносятся в user_reading_progress (если по разделу
 * ещё нет записи в базе — серверная истина приоритетнее) и удаляются
 * из localStorage: два источника быстро разошлись бы.
 *
 * Защита от повторных прогонов — метка в том же localStorage.
 */
export async function migrateLocalBookmarks(userId: string): Promise<void> {
  if (!userId || !isSupabaseConfigured || !supabase) return;

  const flagKey = `daymohk-read-synced-${userId}`;
  try {
    if (window.localStorage.getItem(flagKey)) return;
  } catch { return; }

  const locals: ReadingBookmark[] = [];
  for (const section of READING_SECTIONS) {
    const mark = loadReadingProgress(section);
    if (mark) locals.push(mark);
  }
  if (locals.length === 0) {
    try { window.localStorage.setItem(flagKey, '1'); } catch { /* private mode */ }
    return;
  }

  // Главы закладок обязаны существовать и быть опубликованными:
  // удалённую или снятую с публикации главу переносить некуда.
  const ids = locals.map((mark) => mark.articleId);
  const { data: chapters, error: chaptersError } = await supabase
    .from('articles')
    .select('id, section')
    .in('id', ids)
    .eq('is_published', true);
  if (chaptersError || !chapters) return;

  const valid = new Map(
    chapters.map((chapter) => [String(chapter.id), String(chapter.section)]),
  );

  const { data: existing, error: existingError } = await supabase
    .from('user_reading_progress')
    .select('section_type')
    .eq('user_id', userId);
  if (existingError || !existing) return;
  const have = new Set(existing.map((row) => String(row.section_type)));

  const inserts = locals.filter((mark) => {
    const chapterSection = valid.get(mark.articleId);
    // Раздел главы обязан совпасть с разделом закладки — иначе
    // триггер БД отклонит строку, а клиент не должен даже пробовать.
    return chapterSection === readingToArticle(mark.section) && !have.has(mark.section);
  });

  for (const mark of inserts) {
    const ok = await saveMyProgress(mark.section, mark.articleId, mark.scroll);
    if (!ok) return; // сеть/права — попробует при следующем входе
    removeReadingProgress(mark.section);
    have.add(mark.section);
  }

  // Неперенесённые закладки (глава исчезла) тоже убираем: ссылаться
  // им больше не на что.
  for (const mark of locals) {
    if (!valid.has(mark.articleId)) removeReadingProgress(mark.section);
  }

  try { window.localStorage.setItem(flagKey, '1'); } catch { /* private mode */ }
}

/** Точка раздела из списка, собранного для главной страницы. */
export function findProgress(
  list: DbProgress[] | null,
  section: ReadingSection,
): DbProgress | null {
  return list?.find((item) => item.section === section) ?? null;
}
