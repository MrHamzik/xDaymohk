import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  chapterOpenAction, autosaveAllowed, clampPercent, articleScrollPercent,
  scrollToPercent, buildSnippet, escapeLikePattern, formatSavedHint,
} from '@/lib/reading-rules';
import {
  READING_SECTIONS, articleToReading, readingToArticle, isReadingSection,
  READING_HREFS, READING_MENU_IDS,
} from '@/lib/reading-sections';
import { ARTICLE_SECTIONS, isArticleSection, mapArticleRow } from '@/lib/articles';
import { normalizeSettings, settingsFromDb, settingsToDb } from '@/lib/settings/defaults';

/**
 * Этап 2 разделов чтения: правила поведения (модалка п.6, режим
 * исследования, автосохранение п.9), маппинг разделов, гостевые
 * закладки, миграция 71 и новые поля настроек.
 */

describe('маппинг разделов чтения и таблицы глав', () => {
  it('разделы прогресса — ровно четыре из ТЗ', () => {
    expect([...READING_SECTIONS]).toEqual(['quran', 'nochchalma', 'guide', 'sira']);
  });

  it('Коран добавлен в разделы таблицы articles', () => {
    expect(ARTICLE_SECTIONS).toContain('quran');
    expect(isArticleSection('quran')).toBe(true);
    expect(isArticleSection('nohchalla')).toBe(true);
    expect(isArticleSection('unknown')).toBe(false);
  });

  it('nochchalma ↔ nohchalla ходит в обе стороны, остальные — сами в себя', () => {
    expect(readingToArticle('nochchalma')).toBe('nohchalla');
    expect(articleToReading('nohchalla')).toBe('nochchalma');
    for (const section of ['quran', 'guide', 'sira'] as const) {
      expect(readingToArticle(section)).toBe(section);
      expect(articleToReading(section)).toBe(section);
    }
    // Полный цикл: из прогресса в статьи и обратно — тот же раздел.
    for (const section of READING_SECTIONS) {
      expect(articleToReading(readingToArticle(section))).toBe(section);
    }
  });

  it('у каждого раздела есть маршрут и пункт меню', () => {
    for (const section of READING_SECTIONS) {
      expect(READING_HREFS[section]).toMatch(/^\//);
      expect(READING_MENU_IDS[section]).toBeTruthy();
      expect(isReadingSection(section)).toBe(true);
    }
    expect(isReadingSection('nohchalla')).toBe(false); // это имя статей
  });

  it('mapArticleRow читает номер главы и прощает его отсутствие', () => {
    expect(mapArticleRow({ id: 'x', section: 'quran', chapter_number: '2:255' }).chapterNumber)
      .toBe('2:255');
    expect(mapArticleRow({ id: 'x', section: 'quran' }).chapterNumber).toBe('');
  });
});

describe('открытие главы: модалка п.6 и исключения п.7', () => {
  const saved = 'chapter-saved';

  it('прогресса нет — любая глава открывается без вопросов', () => {
    expect(chapterOpenAction(null, 'any', 'toc')).toBe('open');
    expect(chapterOpenAction(null, 'any', 'next')).toBe('open');
  });

  it('сохранённая глава открывается с восстановлением позиции', () => {
    expect(chapterOpenAction(saved, saved, 'toc')).toBe('restore-scroll');
    expect(chapterOpenAction(saved, saved, 'next')).toBe('restore-scroll');
  });

  it('другая глава из оглавления и «Следующая» — модалка', () => {
    expect(chapterOpenAction(saved, 'other', 'toc')).toBe('modal');
    expect(chapterOpenAction(saved, 'other', 'next')).toBe('modal');
  });

  it('поиск — всегда режим исследования, без модалки (п.7)', () => {
    expect(chapterOpenAction(saved, 'other', 'search')).toBe('open');
    expect(chapterOpenAction(saved, saved, 'search')).toBe('open');
    expect(chapterOpenAction(null, 'any', 'search')).toBe('open');
  });

  it('баннер и главная ведут к сохранённой главе — без модалки', () => {
    expect(chapterOpenAction(saved, saved, 'banner')).toBe('restore-scroll');
    expect(chapterOpenAction(saved, saved, 'home')).toBe('restore-scroll');
  });
});

describe('автосохранение (п.9)', () => {
  it('обычное чтение + включённый чекбокс — сохраняется', () => {
    expect(autosaveAllowed('normal', true, false)).toBe(true);
  });

  it('режим исследования не пишет прогресс никогда', () => {
    expect(autosaveAllowed('explore', true, false)).toBe(false);
    expect(autosaveAllowed('explore', true, true)).toBe(false);
  });

  it('выключенный чекбокс отключает автосохранение', () => {
    expect(autosaveAllowed('normal', false, false)).toBe(false);
  });

  it('гость сохраняет локально всегда при обычном чтении', () => {
    expect(autosaveAllowed('normal', false, true)).toBe(true);
    expect(autosaveAllowed('explore', false, true)).toBe(false);
  });
});

describe('процент прокрутки', () => {
  it('зажат в 0..100 и устойчив к мусору', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
  });

  it('середина экрана в начале главы — около нуля, в конце — 100', () => {
    // Глава: верх 1000, высота 2000, окно 800.
    expect(articleScrollPercent(1000, 2000, 0, 800)).toBe(0); // 400 < 1000
    expect(articleScrollPercent(1000, 2000, 2600, 800)).toBe(100);
    const middle = articleScrollPercent(1000, 2000, 1600, 800);
    expect(middle).toBe(50); // (1600+400-1000)/2000
  });

  it('обратное восстановление симметрично', () => {
    const top = 1000;
    const height = 2000;
    const viewport = 800;
    for (const pct of [0, 25, 50, 75, 100]) {
      const scrollY = scrollToPercent(top, height, pct, viewport);
      expect(articleScrollPercent(top, height, scrollY, viewport)).toBeCloseTo(pct, 5);
    }
  });

  it('нулевая высота не роняет расчёт', () => {
    expect(articleScrollPercent(0, 0, 100, 800)).toBe(0);
  });
});

describe('фрагменты поиска и маски', () => {
  it('находит без учёта регистра и режет контекст', () => {
    const text = 'Скажи: «Он — Аллах Единый» — начало суры Ихляс';
    const snippet = buildSnippet(text, 'АЛЛАХ');
    expect(snippet).not.toBeNull();
    expect(snippet!.match).toBe('Аллах');
    expect(snippet!.before.endsWith('Он — ')).toBe(true);
    expect(snippet!.after.startsWith(' Единый')).toBe(true);
  });

  it('нет совпадения — нет фрагмента', () => {
    expect(buildSnippet('текст', 'запрос')).toBeNull();
    expect(buildSnippet('', 'запрос')).toBeNull();
    expect(buildSnippet('текст', '')).toBeNull();
  });

  it('длинный текст обрезается многоточиями', () => {
    const text = `${'абзац '.repeat(60)}иголка ${'абзац '.repeat(60)}`;
    const snippet = buildSnippet(text, 'иголка')!;
    expect(snippet.before.startsWith('…')).toBe(true);
    expect(snippet.after.endsWith('…')).toBe(true);
  });

  it('символы маски LIKE экранируются', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('а_б')).toBe('а\\_б');
    expect(escapeLikePattern('обычный запрос')).toBe('обычный запрос');
  });
});

describe('подсказка «где остановились»', () => {
  const mark = { titleRu: 'Аль-Фатиха', titleCe: 'Аль-Фатихьа', chapterNumber: '1' };

  it('номер + заголовок по ТЗ («Глава 1. Аль-Фатиха»)', () => {
    expect(formatSavedHint(mark, 'ru', 'Глава')).toBe('Глава 1. Аль-Фатиха');
    expect(formatSavedHint(mark, 'ce', 'Дийцар')).toBe('Дийцар 1. Аль-Фатихьа');
  });

  it('без номера остаётся заголовок', () => {
    expect(formatSavedHint({ ...mark, chapterNumber: ' ' }, 'ru', 'Глава'))
      .toBe('Аль-Фатиха');
  });

  it('пустой заголовок активного языка заменяется вторым', () => {
    expect(formatSavedHint({ ...mark, titleCe: '' }, 'ce', 'Глава'))
      .toBe('Глава 1. Аль-Фатиха');
  });
});

describe('гостевые закладки (localStorage)', () => {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
  };

  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    // lib/reading-progress читает через window.localStorage.
    (globalThis as Record<string, unknown>).window = { localStorage: localStorageMock };
  });

  it('закладка сохраняется и читается с позицией и номером', async () => {
    const { saveReadingProgress, loadReadingProgress } = await import('@/lib/reading-progress');
    saveReadingProgress({
      section: 'sira',
      articleId: 'chapter-1',
      titleRu: 'Глава первая',
      titleCe: 'Хьалхара дийцар',
      chapterNumber: '3',
      scroll: 55.25,
      updatedAt: '2026-08-21T00:00:00.000Z',
    });
    const loaded = loadReadingProgress('sira');
    expect(loaded).not.toBeNull();
    expect(loaded!.articleId).toBe('chapter-1');
    expect(loaded!.scroll).toBe(55.25);
    expect(loaded!.chapterNumber).toBe('3');
  });

  it('старая закладка без новых полей читается с нулевой позицией', async () => {
    store.set('daymohk-read-guide', JSON.stringify({ articleId: 'old', titleRu: 'Старая' }));
    const { loadReadingProgress } = await import('@/lib/reading-progress');
    const loaded = loadReadingProgress('guide')!;
    expect(loaded.scroll).toBe(0);
    expect(loaded.chapterNumber).toBe('');
  });

  it('мусор в хранилище не роняет чтение', async () => {
    store.set('daymohk-read-quran', '{не json');
    const { loadReadingProgress } = await import('@/lib/reading-progress');
    expect(loadReadingProgress('quran')).toBeNull();
  });
});

describe('настройки: автосохранение и флаг подсказки', () => {
  it('умолчания: автосохранение ВКЛ, подсказка не показана', () => {
    const settings = normalizeSettings({});
    expect(settings.readingAutosave).toBe(true);
    expect(settings.readingTipShown).toBe(false);
  });

  it('нормализация принимает только явные значения', () => {
    expect(normalizeSettings({ readingAutosave: false }).readingAutosave).toBe(false);
    expect(normalizeSettings({ readingAutosave: 'мусор' }).readingAutosave).toBe(true);
    expect(normalizeSettings({ readingTipShown: true }).readingTipShown).toBe(true);
    expect(normalizeSettings({ readingTipShown: 'мусор' }).readingTipShown).toBe(false);
  });

  it('строка БД и настройки ходят в обе стороны', () => {
    const row = {
      is_reading_tip_shown: true,
      reading_autosave: false,
    };
    const settings = settingsFromDb(row);
    expect(settings.readingTipShown).toBe(true);
    expect(settings.readingAutosave).toBe(false);

    const back = settingsToDb(settings);
    expect(back.is_reading_tip_shown).toBe(true);
    expect(back.reading_autosave).toBe(false);
  });

  it('старая строка БД без новых колонок — умолчания', () => {
    const settings = settingsFromDb({});
    expect(settings.readingAutosave).toBe(true);
    expect(settings.readingTipShown).toBe(false);
  });
});

describe('миграция 71: структура и защита', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/update/71-reading-stage2.sql'), 'utf8');

  it('таблица прогресса: ключ по пользователю и разделу, набор разделов из ТЗ', () => {
    expect(sql).toContain('create table if not exists public.user_reading_progress');
    expect(sql).toContain('primary key (user_id, section_type)');
    expect(sql).toContain("check (section_type in ('quran', 'nochchalma', 'guide', 'sira'))");
    expect(sql).toContain('check (scroll_position >= 0 and scroll_position <= 100)');
    expect(sql).toContain('references public.articles(id) on delete cascade');
    expect(sql).toContain('references public.user_profiles(id) on delete cascade');
  });

  it('RLS: только свои строки, все четыре операции', () => {
    expect(sql).toContain('alter table public.user_reading_progress enable row level security');
    for (const op of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toContain(`reading progress self ${op}`);
    }
    expect(sql).toContain('using (auth.uid() = user_id)');
  });

  it('Коран в общем списке разделов, поле номера добавлено', () => {
    expect(sql).toContain("check (section in ('sira', 'nohchalla', 'guide', 'quran'))");
    expect(sql).toContain('add column if not exists chapter_number text');
  });

  it('флаги настроек добавлены', () => {
    expect(sql).toContain('add column if not exists is_reading_tip_shown boolean');
    expect(sql).toContain('add column if not exists reading_autosave boolean');
  });

  it('поиск: функция с параметрами и лимитами, индексы', () => {
    expect(sql).toContain('create or replace function public.search_articles');
    expect(sql).toContain('length(btrim(p_query)) >= 2');
    expect(sql).toContain('limit greatest(1, least(p_limit, 30))');
    expect(sql).toContain('create extension if not exists pg_trgm');
    expect(sql).toContain('articles_body_ru_trgm_idx');
  });

  it('сид Корана вставляется только в пустой раздел', () => {
    expect(sql).toContain("where not exists (");
    expect(sql).toContain("select 1 from public.articles where section = 'quran'");
    // Все девять сур прежнего справочника на месте.
    for (const number of ['1', '2', '3', '36', '55', '67', '112', '113', '114']) {
      expect(sql).toContain(`'${number}'`);
    }
  });
});
