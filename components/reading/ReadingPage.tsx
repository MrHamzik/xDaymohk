'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Bookmark, Check, ChevronRight, List, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import Prose from '@/components/reading/Prose';
import ReadingSearch from '@/components/reading/ReadingSearch';
import ChapterSwitchModal from '@/components/reading/ChapterSwitchModal';
import ReadingTipModal from '@/components/reading/ReadingTipModal';
import EmptyState from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/FeedSkeleton';
import type { Article, ArticleSection } from '@/lib/articles';
import { articleToReading } from '@/lib/reading-sections';
import {
  loadReadingProgress, saveReadingProgress,
} from '@/lib/reading-progress';
import {
  fetchMyProgress, findProgress, migrateLocalBookmarks, saveMyProgress,
} from '@/lib/reading-progress-db';
import {
  articleScrollPercent, autosaveAllowed, chapterOpenAction, formatSavedHint,
  scrollToPercent, type ChapterOpenSource, type ReadingMode, type SavedMark,
} from '@/lib/reading-rules';

interface ReadingPageProps {
  section: ArticleSection;
  icon: LucideIcon;
  title: string;
  titleCe: string;
  subtitle: string;
  subtitleCe: string;
  /** Показать, пока в разделе нет ни одной опубликованной главы. */
  emptyHint?: string;
  emptyHintCe?: string;
}

/**
 * Макет страницы для чтения: шапка, поиск, оглавление, текст главы.
 *
 * Один компонент на все страницы-чтения («Коран», «Нохчалла»,
 * «Руководство», «Сира»): они отличаются только разделом и заголовком.
 *
 * Этап 2 добавил сюда поведение вокруг сохранённого места чтения:
 *
 *  · баннер «Вы остановились на главе…» при входе через меню (п.5 ТЗ);
 *  · модальное окно при попытке открыть НЕ сохранённую главу (п.6) —
 *    «Продолжить чтение» возвращает к сохранённой, «Режим исследования»
 *    открывает выбранную без записи прогресса;
 *  · поиск по разделу (п.7): переход по результату — всегда режим
 *    исследования, без модалки и без автосохранения;
 *  · одноразовая подсказка о сохранении прогресса (п.8);
 *  · автосохранение позиции в реальном времени (п.9) плюс ручная
 *    кнопка «Сохранить», работающая всегда.
 *
 * Прогресс вошедшего пользователя живёт в таблице
 * user_reading_progress, гостя — в браузере; после входа гостевые
 * закладки один раз переносятся в базу.
 */
export default function ReadingPage({
  section, icon: Icon, title, titleCe, subtitle, subtitleCe, emptyHint, emptyHintCe,
}: ReadingPageProps) {
  const { t, language } = useI18n();
  const ce = language === 'ce';
  const { account } = useAuth();
  const { settings, update, isLoading: settingsLoading } = useSettings();

  const readingSection = articleToReading(section);

  const [articles, setArticles] = useState<Article[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** normal — обычное чтение (прогресс пишется), explore — исследование. */
  const [mode, setMode] = useState<ReadingMode>('normal');
  /** Сохранённая точка чтения этого раздела (БД или локальная). */
  const [saved, setSaved] = useState<SavedMark | null>(null);
  const [savedLoaded, setSavedLoaded] = useState(false);
  /** Глава, которую пользователь хочет открыть вопреки сохранению (п.6). */
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  /** Запрос, к совпадению с которым нужно прокрутить главу (п.7). */
  const [findQuery, setFindQuery] = useState<string | null>(null);
  /** Отклик кнопки «Сохранить»: сохранено / не удалось. */
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle');

  const articleRef = useRef<HTMLElement | null>(null);
  /** Процент, к которому надо прокрутить главу сразу после рендера. */
  const pendingRestoreRef = useRef<number | null>(null);
  /** Подсказка (п.8) за сеанс показывается не больше одного раза. */
  const tipTriggeredRef = useRef(false);
  const scrollTimerRef = useRef<number | null>(null);
  const lastAutoSaveRef = useRef(0);
  const savedRef = useRef<SavedMark | null>(null);
  /** Восстановление позиции по сохранённой точке уже выполнено. */
  const deepRestoredRef = useRef(false);

  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { deepRestoredRef.current = false; }, [activeId]);

  // ── Главы раздела ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/articles?section=${section}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => {
        if (cancelled) return;
        const list: Article[] = Array.isArray(d.articles) ? d.articles : [];
        setArticles(list);
        try {
          const wanted = new URLSearchParams(window.location.search).get('chapter');
          if (wanted && list.some((item) => item.id === wanted)) setActiveId(wanted);
        } catch { /* private */ }
      })
      .catch(() => { if (!cancelled) setArticles([]); });
    return () => { cancelled = true; };
  }, [section]);

  // ── Сохранённая точка: БД для вошедших, браузер для гостей ──────
  useEffect(() => {
    let cancelled = false;
    setSavedLoaded(false);

    if (account) {
      void (async () => {
        // Гостевые закладки этого аккаунта — в базу (однократно).
        await migrateLocalBookmarks(account.id);
        const list = await fetchMyProgress();
        if (cancelled) return;
        const mark = findProgress(list, readingSection);
        setSaved(mark
          ? {
            chapterId: mark.chapterId,
            scroll: mark.scroll,
            titleRu: mark.titleRu,
            titleCe: mark.titleCe,
            chapterNumber: mark.chapterNumber,
          }
          : null);
        setSavedLoaded(true);
      })();
    } else {
      const local = loadReadingProgress(readingSection);
      setSaved(local
        ? {
          chapterId: local.articleId,
          scroll: local.scroll,
          titleRu: local.titleRu,
          titleCe: local.titleCe,
          chapterNumber: local.chapterNumber,
        }
        : null);
      setSavedLoaded(true);
    }

    return () => { cancelled = true; };
  }, [account?.id, readingSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Открытая глава. Пока ничего не выбрано — показываем оглавление:
  // у длинного текста это правильная точка входа, а не первая глава.
  const active = useMemo(
    () => articles?.find((a) => a.id === activeId) ?? null,
    [articles, activeId],
  );
  const activeIndex = useMemo(
    () => (articles && active ? articles.indexOf(active) : -1),
    [articles, active],
  );

  // ── Запись прогресса ─────────────────────────────────────────────
  /** Пишет точку чтения: вошедшим — в БД, гостям — в браузер. */
  const persist = useCallback(async (chapterId: string, scroll: number): Promise<boolean> => {
    const article = articles?.find((a) => a.id === chapterId);
    if (!article) return false;

    const mark: SavedMark = {
      chapterId,
      scroll,
      titleRu: article.titleRu,
      titleCe: article.titleCe,
      chapterNumber: article.chapterNumber,
    };

    if (account) {
      const ok = await saveMyProgress(readingSection, chapterId, scroll);
      // При сетевой неудаче дублируем локально: закладка лучше, чем
      // потерянное место. После удачного входа перенесётся в базу.
      if (!ok) {
        saveReadingProgress({
          section: readingSection, articleId: chapterId,
          titleRu: article.titleRu, titleCe: article.titleCe,
          chapterNumber: article.chapterNumber, scroll,
          updatedAt: new Date().toISOString(),
        });
      }
      setSaved(mark);
      return ok;
    }

    saveReadingProgress({
      section: readingSection, articleId: chapterId,
      titleRu: article.titleRu, titleCe: article.titleCe,
      chapterNumber: article.chapterNumber, scroll,
      updatedAt: new Date().toISOString(),
    });
    setSaved(mark);
    return true;
  }, [account, articles, readingSection]);

  const computePercent = useCallback((): number | null => {
    const el = articleRef.current;
    if (!el) return null;
    const top = el.getBoundingClientRect().top + window.scrollY;
    return articleScrollPercent(top, el.offsetHeight, window.scrollY, window.innerHeight);
  }, []);

  const restoreToPercent = useCallback((pct: number) => {
    const el = articleRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: scrollToPercent(top, el.offsetHeight, pct, window.innerHeight) });
  }, []);

  /** Ручное сохранение (п.9): работает всегда, независимо от настроек. */
  const saveNow = useCallback(async () => {
    if (!active) return;
    const pct = computePercent() ?? 0;
    const ok = await persist(active.id, pct);
    // Явное сохранение — осознанное действие: режим исследования
    // завершается, дальше это снова обычное чтение.
    if (ok) setMode('normal');
    setSaveState(ok ? 'saved' : 'failed');
    window.setTimeout(() => setSaveState('idle'), 2200);
  }, [active, computePercent, persist]);

  // ── Открытие главы: единая точка входа ──────────────────────────
  const openChapter = useCallback((id: string, source: ChapterOpenSource, find?: string) => {
    if (!articles || !articles.some((a) => a.id === id)) return;

    // Переход из поиска (п.7): режим исследования, без модалки.
    if (source === 'search') {
      setMode('explore');
      setFindQuery(find ?? null);
      pendingRestoreRef.current = null;
      setActiveId(id);
      window.scrollTo({ top: 0 });
      return;
    }

    const action = chapterOpenAction(saved?.chapterId ?? null, id, source);
    if (action === 'modal') {
      setSwitchTarget(id);
      return;
    }

    setMode('normal');
    pendingRestoreRef.current = action === 'restore-scroll' ? (saved?.scroll ?? 0) : null;
    setActiveId(id);
    window.scrollTo({ top: 0 });
  }, [articles, saved]);

  // ── Реакция на смену главы ───────────────────────────────────────
  // Одноразовая подсказка (п.8): первое открытие любой главы при
  // опущенном флаге. Флаг поднимется при закрытии окна.
  useEffect(() => {
    if (!active) return;
    if (account && !settingsLoading && !settings.readingTipShown && !tipTriggeredRef.current) {
      tipTriggeredRef.current = true;
      setTipOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  // Восстановление позиции, запрошенное при открытии главы.
  useEffect(() => {
    if (!active) return undefined;
    const restore = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    if (restore == null) return undefined;
    const pct = restore;
    const handle = window.setTimeout(() => restoreToPercent(pct), 90);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  // п.3: состояние формируется первым открытием главы — запись
  // создаётся при обычном чтении, исследование ничего не
  // перезаписывает (п.6).
  //
  // До загрузки сохранённой точки (savedLoaded) писать НЕЛЬЗЯ:
  // переход «Продолжить чтение» с главной указывает на сохранённую
  // главу, а прогресс ещё едет из базы — преждевременная запись
  // обнулила бы позицию. Поэтому создание отложено до момента, когда
  // правда о прогрессе известна.
  useEffect(() => {
    if (!active || !articles || !savedLoaded) return;
    if (mode !== 'normal') return;
    if (savedRef.current?.chapterId === active.id) return;

    if (savedRef.current) {
      // Клик по оглавлению успел раньше, чем прогресс доехал из базы:
      // открыта НЕ сохранённая глава. По п.6 положена модалка — она
      // появляется сейчас, запись не создаётся.
      setSwitchTarget(active.id);
      return;
    }

    void persist(active.id, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, savedLoaded]);

  // Позиция сохранённой главы догнала страницу: переходы с главной и
  // по баннеру указывают на неё, а прогресс доезжает из БД асинхронно.
  useEffect(() => {
    if (!savedLoaded || !active || !saved) return;
    if (active.id !== saved.chapterId) return;
    if (deepRestoredRef.current) return;
    deepRestoredRef.current = true;
    const pct = saved.scroll;
    const handle = window.setTimeout(() => restoreToPercent(pct), 120);
    return () => window.clearTimeout(handle);
  }, [savedLoaded, active, saved, restoreToPercent]);

  // Прокрутка к найденному месту (п.7): ищем первый блок текста,
  // содержащий запрос, и подводим его к середине экрана.
  useEffect(() => {
    if (!active || !findQuery) return;
    const lower = findQuery.toLowerCase();
    const handle = window.setTimeout(() => {
      const el = articleRef.current;
      if (el) {
        const blocks = Array.from(el.querySelectorAll('h2, h3, h4, p, li, blockquote, td, th'));
        const hit = blocks.find((block) => (block.textContent ?? '').toLowerCase().includes(lower));
        if (hit) hit.scrollIntoView({ block: 'center' });
      }
      setFindQuery(null);
    }, 90);
    return () => window.clearTimeout(handle);
  }, [active?.id, findQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Автосохранение при чтении (п.9) ──────────────────────────────
  // Пишем при остановке скролла (1.2 с тишины) и страховочно каждые
  // 8 с непрерывной прокрутки. Режим исследования и переходы из
  // поиска здесь не оказываются — у них режим 'explore'.
  useEffect(() => {
    // savedLoaded — гейт той же гонки, что у создания записи: пока
    // сохранённая точка не доехала из базы, автосохранение не пишет.
    if (!active || !savedLoaded) return undefined;

    const flush = () => {
      if (!autosaveAllowed(mode, settings.readingAutosave, !account)) return;
      const pct = computePercent();
      if (pct == null) return;
      const current = savedRef.current;
      // Чужая глава (например, модалку п.6 закрыли и остались на
      // несохранённой) автосохранением не перезаписывается.
      if (current && current.chapterId !== active.id) return;
      if (current?.chapterId === active.id && Math.abs(current.scroll - pct) < 0.5) return;
      lastAutoSaveRef.current = Date.now();
      void persist(active.id, pct);
    };

    const onScroll = () => {
      if (!autosaveAllowed(mode, settings.readingAutosave, !account)) return;
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(flush, 1200);
      if (Date.now() - lastAutoSaveRef.current > 8000) {
        if (scrollTimerRef.current) {
          window.clearTimeout(scrollTimerRef.current);
          scrollTimerRef.current = null;
        }
        flush();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    };
  }, [active?.id, mode, savedLoaded, settings.readingAutosave, account, persist, computePercent]); // eslint-disable-line react-hooks/exhaustive-deps

  const heading = (a: Article) => (ce ? a.titleCe : a.titleRu) || a.titleRu || a.titleCe;
  const lead = (a: Article) => (ce ? a.leadCe : a.leadRu);
  const body = (a: Article) => (ce ? a.bodyCe : a.bodyRu) || a.bodyRu || a.bodyCe;
  const numberLabel = (a: Article, index: number) => a.chapterNumber.trim() || String(index + 1);

  const savedVisible = savedLoaded && saved
    && Boolean(articles?.some((a) => a.id === saved.chapterId));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        {active ? (
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="smk-solid inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
          >
            <List className="h-3.5 w-3.5" />
            {ce ? 'Дийцарш' : 'Оглавление'}
          </button>
        ) : (
          <Link href="/" className="smk-solid inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold">
            <ArrowLeft className="h-3.5 w-3.5" />
            {ce ? 'ЦIа' : 'Назад'}
          </Link>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hero-gradient text-white shadow-lg">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="smk-title truncate text-xl font-black text-slate-900 dark:text-white">
            {ce ? titleCe : title}
          </h1>
          <p className="truncate text-xs text-slate-500 dark:text-zinc-400">
            {ce ? subtitleCe : subtitle}
          </p>
        </div>
      </div>

      {/* Поиск по разделу — вверху страницы (п.7 ТЗ) */}
      <div className="mb-4">
        <ReadingSearch
          section={section}
          onJump={(chapterId, query) => openChapter(chapterId, 'search', query)}
        />
      </div>

      <hr className="smk-orn mb-4" />

      {/* Баннер сохранённого прогресса (п.5): вход через меню, глава
          ещё не открыта. Кнопка «Продолжить» возвращает к месту
          остановки. */}
      {!active && savedVisible && saved && (
        <div className="smk-sheet-row mb-4 flex items-center gap-3 p-3">
          <Bookmark className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="smk-text-label font-semibold text-slate-500 dark:text-zinc-400">
              {t.readBannerStopped}
            </p>
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {formatSavedHint(saved, language, t.readChapter)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openChapter(saved.chapterId, 'banner')}
            className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            {t.homeContinueOpen}
          </button>
        </div>
      )}

      {articles === null && <ListSkeleton count={4} />}

      {articles !== null && articles.length === 0 && (
        <EmptyState
          title={ce ? 'Дийцарш дац' : 'Глав пока нет'}
          hint={ce
            ? (emptyHintCe ?? 'Дийцарш кечдина дац.')
            : (emptyHint ?? 'Материалы готовятся.')}
        />
      )}

      {/* Оглавление */}
      {articles !== null && articles.length > 0 && !active && (
        <div className="smk-rows">
          {articles.map((a, index) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openChapter(a.id, 'toc')}
              className="flex w-full items-center gap-3 py-3 text-left transition hover:brightness-95 dark:hover:brightness-110"
            >
              <span className="smk-read-num">{numberLabel(a, index)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">
                  {heading(a)}
                </span>
                {lead(a) && (
                  <span className="smk-meta mt-0.5 block line-clamp-2 smk-text-label leading-snug">
                    {lead(a)}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 smk-arrow" />
            </button>
          ))}
        </div>
      )}

      {/* Глава */}
      {active && (
        <article className="smk-read" ref={articleRef}>
          {/* Панель главы: номер, режим, ручное сохранение */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="smk-read-num">{numberLabel(active, Math.max(activeIndex, 0))}</span>
            {mode === 'explore' && (
              <span className="smk-chip smk-note-warn">{t.readExploreChip}</span>
            )}
            <button
              type="button"
              onClick={() => void saveNow()}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                saveState === 'saved'
                  ? 'bg-emerald-600 text-white'
                  : 'smk-solid'
              }`}
            >
              {saveState === 'saved'
                ? <Check className="h-3.5 w-3.5" />
                : <Bookmark className="h-3.5 w-3.5" />}
              {saveState === 'saved' ? t.readSaved : saveState === 'failed' ? t.readSaveFailed : t.readSave}
            </button>
          </div>

          <h2 className="smk-read-h1">{heading(active)}</h2>
          {lead(active) && (
            <p className="mb-3 smk-text-body italic leading-relaxed text-slate-500 dark:text-zinc-400">
              {lead(active)}
            </p>
          )}
          <Prose text={body(active)} />

          {/* Переход к следующей главе: читатель дочитал — и следующий
              шаг у него под рукой, возвращаться в оглавление не нужно. */}
          {articles && activeIndex >= 0 && activeIndex < articles.length - 1 && (
            <>
              <hr className="smk-orn my-6" />
              <button
                type="button"
                onClick={() => openChapter(articles[activeIndex + 1].id, 'next')}
                className="smk-sheet-row flex w-full items-center gap-3 p-3 text-left transition hover:brightness-95 dark:hover:brightness-110"
              >
                <span className="min-w-0 flex-1">
                  <span className="smk-sheet-label smk-sheet-label--plain block">
                    {ce ? 'ТIаьхьара дийцар' : 'Следующая глава'}
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-bold text-slate-900 dark:text-white">
                    {heading(articles[activeIndex + 1])}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 smk-arrow" />
              </button>
            </>
          )}
        </article>
      )}

      {/* п.6: попытка открыть не сохранённую главу. Пока показывается
          одноразовая подсказка (п.8) — окно ждёт очереди: два модальных
          окна одновременно не показываются (п.10). */}
      <ChapterSwitchModal
        isOpen={switchTarget != null && !tipOpen}
        savedHint={saved ? formatSavedHint(saved, language, t.readChapter) : ''}
        onContinueSaved={() => {
          const target = saved?.chapterId;
          setSwitchTarget(null);
          if (target) openChapter(target, 'banner');
        }}
        onExplore={() => {
          const target = switchTarget;
          setSwitchTarget(null);
          if (target) {
            setMode('explore');
            pendingRestoreRef.current = null;
            setActiveId(target);
            window.scrollTo({ top: 0 });
          }
        }}
        onClose={() => setSwitchTarget(null)}
      />

      {/* п.8: одноразовая подсказка о сохранении прогресса */}
      <ReadingTipModal
        isOpen={tipOpen}
        onClose={() => {
          setTipOpen(false);
          // Тумблеры модалка пишет в настройки сама; здесь только
          // флаг «подсказка показана» — один раз за всё время.
          update({ readingTipShown: true });
        }}
      />
    </div>
  );
}
