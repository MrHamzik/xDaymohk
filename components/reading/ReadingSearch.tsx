'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ArticleSection } from '@/lib/articles';
import { buildSnippet } from '@/lib/reading-rules';

interface ReadingSearchProps {
  section: ArticleSection;
  /**
   * Переход к найденному месту. Вызывается с идентификатором главы и
   * запросом — страница откроет главу в режиме исследования и
   * прокрутит к совпадению (п.7 ТЗ: без модалки и без записи
   * прогресса).
   */
  onJump: (chapterId: string, query: string) => void;
}

interface Hit {
  chapterId: string;
  chapterNumber: string;
  titleRu: string;
  titleCe: string;
  snippet: string;
}

/**
 * Поисковая строка раздела чтения (п.7 ТЗ Этапа 2).
 *
 * Ищет на сервере (/api/articles/search → SQL-функция миграции 71)
 * по всем текстовым полям раздела: заголовки, подводки, номера и тело
 * глав. Результаты — список под строкой: название главы, фрагмент с
 * подсвеченным совпадением и кнопка «Перейти».
 */
export default function ReadingSearch({ section, onJump }: ReadingSearchProps) {
  const { t, language } = useI18n();
  const ce = language === 'ce';

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Смена раздела — новый поиск с нуля.
  useEffect(() => {
    setQuery('');
    setHits(null);
    setError('');
  }, [section]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setHits(null);
      setError('');
      setIsSearching(false);
      return undefined;
    }

    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/articles/search?section=${encodeURIComponent(section)}&q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const data = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok) {
          // «Минимум два символа» и подобные сообщения сервера.
          setError(typeof data?.error === 'string' ? data.error : '');
          setHits(null);
          return;
        }
        setError('');
        setHits(Array.isArray(data?.results) ? data.results : []);
      } catch {
        if (!controller.signal.aborted) {
          setError('');
          setHits([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 350);

    return () => window.clearTimeout(handle);
  }, [query, section]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const jump = (hit: Hit) => {
    onJump(hit.chapterId, query.trim());
    // Результаты остаются видимыми: вдруг человек вернётся к списку.
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="smk-ico pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t.readSearchPlaceholder}
          placeholder={t.readSearchPlaceholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
        />
        {(query || isSearching) && (
          <button
            type="button"
            onClick={() => { setQuery(''); setHits(null); setError(''); }}
            aria-label={t.close}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            {isSearching && !query ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Выпадающий блок результатов */}
      {query.trim().length > 0 && (hits !== null || error) && (
        <div className="smk-lux absolute left-0 right-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto rounded-2xl shadow-lg">
          {error && (
            <p className="px-3.5 py-3 text-xs text-slate-500 dark:text-zinc-400">{error}</p>
          )}
          {!error && hits && hits.length === 0 && (
            <p className="px-3.5 py-3 text-xs text-slate-500 dark:text-zinc-400">
              {t.readSearchEmpty}
            </p>
          )}
          {!error && hits && hits.length > 0 && (
            <ul>
              {hits.map((hit) => {
                const title = (ce ? hit.titleCe : hit.titleRu) || hit.titleRu || hit.titleCe;
                const snippet = buildSnippet(hit.snippet, query.trim()) ?? null;
                return (
                  <li key={`${hit.chapterId}-${hit.snippet.slice(0, 24)}`} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-800">
                    <div className="flex items-start gap-2 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          {hit.chapterNumber ? `${hit.chapterNumber}. ` : ''}{title}
                        </p>
                        {snippet && (
                          <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-slate-500 dark:text-zinc-400">
                            {snippet.before}
                            <mark className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                              {snippet.match}
                            </mark>
                            {snippet.after}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => jump(hit)}
                        className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                      >
                        {t.readSearchGo}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
