'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, List, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import Prose from '@/components/reading/Prose';
import type { Article, ArticleSection } from '@/lib/articles';

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
 * Макет страницы для чтения: шапка, оглавление, текст главы.
 *
 * Один компонент на все такие страницы («Сира», «Нохчалла»,
 * «Руководство»): они отличаются только разделом и заголовком, а
 * поведение — оглавление, выбор главы, переход к следующей — одинаково.
 * Три копии этого файла разъехались бы после первой же правки.
 */
export default function ReadingPage({
  section, icon: Icon, title, titleCe, subtitle, subtitleCe, emptyHint, emptyHintCe,
}: ReadingPageProps) {
  const { language } = useI18n();
  const ce = language === 'ce';

  const [articles, setArticles] = useState<Article[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/articles?section=${section}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => { if (!cancelled) setArticles(Array.isArray(d.articles) ? d.articles : []); })
      .catch(() => { if (!cancelled) setArticles([]); });
    return () => { cancelled = true; };
  }, [section]);

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

  const heading = (a: Article) => (ce ? a.titleCe : a.titleRu) || a.titleRu || a.titleCe;
  const lead = (a: Article) => (ce ? a.leadCe : a.leadRu);
  const body = (a: Article) => (ce ? a.bodyCe : a.bodyRu) || a.bodyRu || a.bodyCe;

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

      <hr className="smk-orn mb-4" />

      {articles === null && (
        <p className="smk-meta py-8 text-center text-xs">
          {ce ? 'Чуоьцуш ду…' : 'Загружаем…'}
        </p>
      )}

      {articles !== null && articles.length === 0 && (
        <p className="smk-dashed p-4 text-center text-xs text-slate-500 dark:text-zinc-500">
          {ce
            ? (emptyHintCe ?? 'Дийцарш кечдина дац.')
            : (emptyHint ?? 'Материалы готовятся.')}
        </p>
      )}

      {/* Оглавление */}
      {articles !== null && articles.length > 0 && !active && (
        <div className="smk-rows">
          {articles.map((a, index) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { setActiveId(a.id); window.scrollTo({ top: 0 }); }}
              className="flex w-full items-center gap-3 py-3 text-left transition hover:brightness-95 dark:hover:brightness-110"
            >
              <span className="smk-read-num">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">
                  {heading(a)}
                </span>
                {lead(a) && (
                  <span className="smk-meta mt-0.5 block line-clamp-2 text-[11px] leading-snug">
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
        <article className="smk-read">
          <h2 className="smk-read-h1">{heading(active)}</h2>
          {lead(active) && (
            <p className="mb-3 text-[13px] italic leading-relaxed text-slate-500 dark:text-zinc-400">
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
                onClick={() => {
                  setActiveId(articles[activeIndex + 1].id);
                  window.scrollTo({ top: 0 });
                }}
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
    </div>
  );
}
