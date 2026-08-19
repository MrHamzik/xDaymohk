'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Plus, Save, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import Prose from '@/components/reading/Prose';
import {
  ARTICLE_SECTIONS, type Article, type ArticleSection,
} from '@/lib/articles';

const SECTION_LABELS: Record<ArticleSection, string> = {
  sira: 'Сира Пророка',
  nohchalla: 'Нохчалла',
  guide: 'Руководство',
};

/** Подсказка по разметке — прямо в редакторе, чтобы не держать в голове. */
const SYNTAX_HINT = [
  '# Заголовок    ## Подзаголовок    ### Мелкий',
  '**жирный**   *курсив*   ==выделить цветом==',
  '> важная мысль (цитата)',
  '- список     1. нумерованный список',
  '| Колонка | Колонка |  → таблица (вторая строка: |---|---|)',
  '---  разделитель      [текст](https://ссылка)',
].join('\n');

/**
 * Редактор глав для страниц-чтения.
 *
 * Тело главы — markdown, а не HTML: содержимое из админки попадает на
 * публичную страницу, и вставка произвольного HTML означала бы XSS для
 * всех читателей. Разметка рендерится компонентом Prose в закрытый
 * набор React-элементов — тем же, что увидит читатель, поэтому
 * предпросмотр здесь честный, а не «примерно похожий».
 */
export default function AdminArticlesSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);

  const { account } = useAuth();
  const [section, setSection] = useState<ArticleSection>('sira');
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Язык вкладки редактирования и режим предпросмотра — на каждую главу свои.
  const [lang, setLang] = useState<'ru' | 'ce'>('ru');
  const [preview, setPreview] = useState(false);
  // Несохранённые правки: ключ — id главы.
  const [drafts, setDrafts] = useState<Record<string, Partial<Article>>>({});

  const token = async () => {
    if (!supabase) return '';
    const s = await supabase.auth.getSession();
    return s.data.session?.access_token || '';
  };

  const load = useCallback(async () => {
    // Запрос уходит ТОЛЬКО с токеном. Раньше при отсутствии токена
    // заголовок просто не добавлялся, и сервер честно отвечал 401 —
    // в консоли это выглядело как ошибка приложения. Сессия Supabase
    // восстанавливается асинхронно, поэтому на первом рендере токена
    // ещё нет: ждём и повторяем, а не шлём заведомо неудачный запрос.
    const accessToken = await token();
    if (!accessToken) return;

    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/articles?section=${section}&all=1`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401 || res.status === 403) {
        setError(L('Нужен вход администратора', 'Администраторан чувалар оьшу'));
        return;
      }
      const data = await res.json();
      setArticles(Array.isArray(data.articles) ? data.articles : []);
    } catch {
      setError(L('Не удалось загрузить главы', 'Дийцарш чуэца ца делира'));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // account в зависимостях: пока сессия не восстановлена, грузить
  // нечего — эффект перезапустится, когда появится пользователь.
  useEffect(() => {
    if (!account) return;
    void load();
  }, [load, account]);

  /** Значение поля с учётом несохранённого черновика. */
  const value = <K extends keyof Article>(a: Article, key: K): Article[K] =>
    (drafts[a.id]?.[key] as Article[K]) ?? a[key];

  const edit = (id: string, patch: Partial<Article>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const create = async () => {
    setBusyId('new');
    try {
      const accessToken = await token();
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          section,
          titleRu: L('Новая глава', 'Керла дийцар'),
          titleCe: 'Керла дийцар',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setArticles((list) => [...list, data.article]);
      setOpenId(data.article.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : L('Не удалось создать', 'Кхолла ца делира'));
    } finally {
      setBusyId(null);
    }
  };

  const save = async (a: Article, extra?: Partial<Article>) => {
    setBusyId(a.id);
    setError('');
    try {
      const accessToken = await token();
      const res = await fetch('/api/articles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ id: a.id, ...drafts[a.id], ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setArticles((list) => list.map((x) => (x.id === a.id ? data.article : x)));
      setDrafts((d) => { const next = { ...d }; delete next[a.id]; return next; });
    } catch (e) {
      setError(e instanceof Error ? e.message : L('Не удалось сохранить', 'ДIаязъян ца делира'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: Article) => {
    if (!window.confirm(L('Удалить главу без возможности восстановления?', 'Дийцар дIадаккха?'))) return;
    setBusyId(a.id);
    try {
      const accessToken = await token();
      const res = await fetch(`/api/articles?id=${encodeURIComponent(a.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setArticles((list) => list.filter((x) => x.id !== a.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : L('Не удалось удалить', 'ДIадаккха ца делира'));
    } finally {
      setBusyId(null);
    }
  };

  /** Поменять главу местами с соседней: порядок правится кнопками. */
  const move = async (a: Article, dir: -1 | 1) => {
    const index = articles.indexOf(a);
    const neighbour = articles[index + dir];
    if (!neighbour) return;
    setBusyId(a.id);
    try {
      const accessToken = await token();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
      await Promise.all([
        fetch('/api/articles', { method: 'PATCH', headers, body: JSON.stringify({ id: a.id, sortOrder: neighbour.sortOrder }) }),
        fetch('/api/articles', { method: 'PATCH', headers, body: JSON.stringify({ id: neighbour.id, sortOrder: a.sortOrder }) }),
      ]);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const field = 'w-full rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-white';

  return (
    <section className="space-y-3">
      {/* Выбор раздела */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ARTICLE_SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setSection(s); setOpenId(null); setDrafts({}); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              section === s
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
        <button
          type="button"
          onClick={create}
          disabled={busyId === 'new'}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {busyId === 'new' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {L('Новая глава', 'Керла дийцар')}
        </button>
      </div>

      {error && (
        <p className="smk-note smk-note-danger px-3 py-2">
          {error}
        </p>
      )}

      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <p className="smk-dashed p-4 text-center text-xs text-slate-500 dark:text-zinc-500">
          {L('В этом разделе пока нет глав.', 'ХIокху декъехь дийцарш дац.')}
        </p>
      )}

      <div className="space-y-2">
        {articles.map((a, index) => {
          const isOpen = openId === a.id;
          const dirty = Boolean(drafts[a.id]);
          return (
            <div key={a.id} className="smk-sheet-row overflow-hidden">
              <div className="flex items-center gap-2 p-2.5">
                <span className="smk-read-num shrink-0">{index + 1}</span>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : a.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">
                    {a.titleRu || a.titleCe || L('Без названия', 'ЦIе йоцуш')}
                  </span>
                  <span className="smk-meta block smk-text-label">
                    {a.isPublished ? L('Опубликована', 'Зорбане яьлла') : L('Черновик', 'Черновик')}
                    {dirty ? L(' · есть несохранённые правки', ' · дIаязйина йоцу хийцамаш') : ''}
                  </span>
                </button>

                <button type="button" onClick={() => move(a, -1)} disabled={index === 0 || busyId === a.id}
                  aria-label={L('Выше', 'Лакхе')} className="smk-act flex h-7 w-7 items-center justify-center">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(a, 1)} disabled={index === articles.length - 1 || busyId === a.id}
                  aria-label={L('Ниже', 'Лахе')} className="smk-act flex h-7 w-7 items-center justify-center">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => save(a, { isPublished: !a.isPublished })} disabled={busyId === a.id}
                  aria-label={a.isPublished ? L('Снять с публикации', 'Зорбанера дIаяккха') : L('Опубликовать', 'Зорбане яккха')}
                  title={a.isPublished ? L('Снять с публикации', 'Зорбанера дIаяккха') : L('Опубликовать', 'Зорбане яккха')}
                  className="smk-act flex h-7 w-7 items-center justify-center">
                  {a.isPublished ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => remove(a)} disabled={busyId === a.id}
                  aria-label={L('Удалить', 'ДIадаккха')} className="smk-act smk-act--danger flex h-7 w-7 items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {isOpen && (
                <div className="space-y-2 border-t border-[color:var(--smk-divider)] p-2.5">
                  {/* Язык и предпросмотр */}
                  <div className="flex items-center gap-1.5">
                    {(['ru', 'ce'] as const).map((l) => (
                      <button key={l} type="button" onClick={() => setLang(l)}
                        className={`rounded-lg px-2.5 py-1 smk-text-label font-bold transition ${
                          lang === l ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800'
                        }`}>
                        {l === 'ru' ? 'Русский' : 'Нохчийн'}
                      </button>
                    ))}
                    <button type="button" onClick={() => setPreview((v) => !v)}
                      className={`ml-auto rounded-lg px-2.5 py-1 smk-text-label font-bold transition ${
                        preview ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800'
                      }`}>
                      {L('Предпросмотр', 'Хьалха хьажар')}
                    </button>
                  </div>

                  <input
                    value={lang === 'ru' ? value(a, 'titleRu') : value(a, 'titleCe')}
                    onChange={(e) => edit(a.id, lang === 'ru' ? { titleRu: e.target.value } : { titleCe: e.target.value })}
                    placeholder={L('Заголовок главы', 'Дийцаран корта')}
                    className={field}
                  />
                  <input
                    value={lang === 'ru' ? value(a, 'leadRu') : value(a, 'leadCe')}
                    onChange={(e) => edit(a.id, lang === 'ru' ? { leadRu: e.target.value } : { leadCe: e.target.value })}
                    placeholder={L('Короткая подводка (необязательно)', 'Йоца хаам (оьшуш дац)')}
                    className={field}
                  />

                  {preview ? (
                    <div className="smk-read rounded-xl bg-white p-3 dark:bg-zinc-900">
                      <Prose text={lang === 'ru' ? value(a, 'bodyRu') : value(a, 'bodyCe')} />
                    </div>
                  ) : (
                    <textarea
                      value={lang === 'ru' ? value(a, 'bodyRu') : value(a, 'bodyCe')}
                      onChange={(e) => edit(a.id, lang === 'ru' ? { bodyRu: e.target.value } : { bodyCe: e.target.value })}
                      rows={16}
                      placeholder={L('Текст главы', 'Дийцаран йоза')}
                      className={`${field} resize-y font-mono leading-relaxed`}
                    />
                  )}

                  <pre className="smk-meta overflow-x-auto whitespace-pre rounded-lg bg-slate-50 p-2 smk-text-label leading-relaxed dark:bg-zinc-800/60">
                    {SYNTAX_HINT}
                  </pre>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => save(a)} disabled={busyId === a.id || !dirty}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                      {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {L('Сохранить', 'ДIаязъе')}
                    </button>
                    {dirty && (
                      <button type="button"
                        onClick={() => setDrafts((d) => { const n = { ...d }; delete n[a.id]; return n; })}
                        className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-zinc-800">
                        {L('Отменить правки', 'Хийцамаш дIабаха')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
