'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Loader2, Search, Send, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { parseDisputeQuestion, shortRequestId } from '@/lib/support/format';
import MapSegmentedControl from '@/components/MapSegmentedControl';

interface Question {
  id: string;
  authorName: string;
  question: string;
  answer: string;
  status: 'new' | 'answered' | 'closed';
  isPublic: boolean;
  createdAt: string;
}

/**
 * Очередь вопросов из раздела «Помощь».
 *
 * Ответ отправляется автору уведомлением (тип support_answered), а
 * флаг «Показывать всем» выносит пару вопрос-ответ в общий список и
 * поиск. По умолчанию вопрос НЕ публичный: в нём могут быть личные
 * подробности, и публиковать их молча нельзя.
 */
/** Разделы списка обращений в админ-панели. */
type SupportScope = 'all' | 'pinned' | 'hidden';

export default function AdminSupportSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);

  const { account } = useAuth();
  const [items, setItems] = useState<Question[]>([]);
  // Развёрнутое обращение — только одно за раз: список остаётся
  // обозримым, а не превращается в стену текста.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<SupportScope>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const token = async () => {
    if (!supabase) return '';
    const s = await supabase.auth.getSession();
    return s.data.session?.access_token || '';
  };

  const load = useCallback(async () => {
    // Без токена запрос бессмыслен: очередь вопросов видна только
    // администратору. См. пояснение в AdminArticlesSection.
    const accessToken = await token();
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/support', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setItems(Array.isArray(data.pending) ? data.pending : []);
    } catch {
      setError(L('Не удалось загрузить вопросы', 'Хаттарш чуэца ца делира'));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!account) return;
    void load();
  }, [load, account]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError('');
    try {
      const accessToken = await token();
      const res = await fetch('/api/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems((list) => list.map((q) => (q.id === id ? data.question : q)));
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : L('Не удалось сохранить', 'ДIаязъян ца делира'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(L('Удалить вопрос?', 'Хаттар дIадаккха?'))) return;
    setBusyId(id);
    try {
      const accessToken = await token();
      await fetch(`/api/support?id=${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      setItems((list) => list.filter((q) => q.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const isNew = (q: Question) => q.status === 'new';

  /**
   * Поиск и разделы.
   *
   * Обращений накапливается много, а найти нужное было нечем: список
   * шёл сплошняком, и ориентироваться приходилось глазами. Ищем сразу
   * по всему, что человек может помнить: тексту вопроса, ответу, имени
   * автора, номеру обращения и id задания из жалобы.
   */
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = items;

    // «Закреплённые» — с открытым глазиком: именно они попадают в
    // публичный раздел «Помощь». «Скрытые» — видны только автору.
    if (scope === 'pinned') list = list.filter((q) => q.isPublic);
    if (scope === 'hidden') list = list.filter((q) => !q.isPublic);

    if (!needle) return list;
    return list.filter((q) => {
      const dispute = parseDisputeQuestion(q.question);
      return [
        q.question,
        q.answer,
        q.authorName,
        shortRequestId(q.id),
        q.id,
        dispute?.taskId,
        dispute?.title,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [items, search, scope]);

  // Новые сверху: на них ждут ответа.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => Number(isNew(b)) - Number(isNew(a))),
    [filtered],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="smk-sheet-label">
          {L('Вопросы пользователей', 'Лелошхойн хаттарш')}
        </span>
        <span className="smk-meta smk-text-label">
          {L('Новых: ', 'Керланаш: ')}{items.filter(isNew).length}
        </span>
      </div>

      {/* Поиск по вопросу, ответу, автору, номеру обращения и id
          задания из жалобы. */}
      <div className="relative">
        <span className="smk-ico pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-3.5 w-3.5" />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L('Поиск: вопрос, автор, #id, задание…', 'Лахар: хаттар, автор, #id…')}
          aria-label={L('Поиск по обращениям', 'Арзаша юкъахь лахар')}
          className="smk-field w-full py-2 pl-9 pr-9 text-xs text-slate-900 outline-none dark:text-white"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={L('Очистить', 'ЦIанъе')}
            className="smk-act absolute inset-y-0 right-0 flex w-9 items-center justify-center"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Разделы: закреплённые видны всем в «Помощи», скрытые — только
          автору обращения. */}
      <MapSegmentedControl
        ariaLabel={L('Разделы обращений', 'Арзийн декъаш')}
        active={[scope]}
        onSelect={setScope}
        options={[
          { value: 'all' as const, label: L('Все', 'Дерриг'), count: items.length || undefined },
          {
            value: 'pinned' as const,
            label: L('Закреплённые', 'ЧIагIдина'),
            count: items.filter((q) => q.isPublic).length || undefined,
          },
          {
            value: 'hidden' as const,
            label: L('Скрытые', 'Къайлаха'),
            count: items.filter((q) => !q.isPublic).length || undefined,
          },
        ]}
        className="w-full"
      />

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

      {!isLoading && sorted.length === 0 && (
        <p className="smk-dashed p-4 text-center text-xs text-slate-500 dark:text-zinc-500">
          {items.length === 0
            ? L('Вопросов нет.', 'Хаттарш дац.')
            : L('Ничего не нашлось.', 'ХIумма а ца карийна.')}
        </p>
      )}

      <div className="space-y-2">
        {sorted.map((q) => {
          // Свёрнутый вид по умолчанию: в списке видно только номер
          // обращения, состояние и две кнопки. Раньше каждая карточка
          // сразу разворачивала весь текст жалобы одной строкой —
          // десяток обращений превращался в нечитаемую простыню.
          const isOpen = expanded === q.id;
          const dispute = parseDisputeQuestion(q.question);
          return (
            <article key={q.id} className="smk-sheet-row p-2.5">
              {/* Шапка: номер, статус, удаление, разворот */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : q.id)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {shortRequestId(q.id)}
                  </span>
                  {dispute && (
                    <span className="smk-chip smk-note-danger shrink-0">
                      {L('Спор', 'Къовсам')}
                    </span>
                  )}
                  <span className="smk-meta truncate smk-text-label">
                    {q.authorName || L('Житель', 'Бахархо')}
                    {isNew(q) ? L(' · ждёт ответа', ' · жоп доьхуш') : L(' · отвечен', ' · жоп делла')}
                  </span>
                </button>

                <button type="button" onClick={() => remove(q.id)} disabled={busyId === q.id}
                  aria-label={L('Удалить', 'ДIадаккха')}
                  className="smk-act smk-act--danger flex h-7 w-7 shrink-0 items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : q.id)}
                  aria-label={isOpen ? L('Свернуть', 'Юха хIотто') : L('Развернуть', 'Схьадаста')}
                  aria-expanded={isOpen}
                  className="smk-act flex h-7 w-7 shrink-0 items-center justify-center"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isOpen && (
                <div className="mt-2.5 space-y-2.5">
                  {/* Жалоба по заданию — полями, а не одной строкой. */}
                  {dispute ? (
                    <div className="smk-inset px-3 py-2.5">
                      <dl className="space-y-1 smk-text-label">
                        <DisputeRow label={L('Задание', 'ТIедиллар')} value={dispute.title} />
                        <DisputeRow label={L('Награда', 'Мах')} value={dispute.reward} />
                        <DisputeRow label={L('Заявитель', 'Арз деш верг')} value={dispute.role} />
                        <DisputeRow label={L('Причина отказа', 'ТIе ца эцна бахьана')} value={dispute.rejectReason} />
                        <DisputeRow label="ID" value={dispute.taskId} mono />
                      </dl>
                      {dispute.text && (
                        <p className="mt-2 whitespace-pre-wrap break-words border-t border-dashed pt-2 text-xs text-slate-800 dark:text-zinc-200">
                          {dispute.text}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="smk-inset whitespace-pre-wrap break-words px-3 py-2.5 text-xs text-slate-800 dark:text-zinc-200">
                      {q.question}
                    </p>
                  )}

                  <button type="button" onClick={() => patch(q.id, { isPublic: !q.isPublic })}
                    disabled={busyId === q.id}
                    className="smk-act inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 smk-text-label">
                    {q.isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {q.isPublic
                      ? L('Виден всем', 'Массарна гуш')
                      : L('Виден только автору', 'Автора бен ца гуш')}
                  </button>

                  <textarea
                    value={drafts[q.id] ?? q.answer}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    rows={3}
                    maxLength={4000}
                    placeholder={L('Ответ (можно с разметкой)', 'Жоп')}
                    className="smk-field w-full resize-y px-3 py-2 text-xs text-slate-900 outline-none dark:text-white"
                  />

                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => patch(q.id, { answer: drafts[q.id] ?? q.answer })}
                      disabled={busyId === q.id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 smk-text-label font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                      {busyId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {L('Ответить', 'Жоп дала')}
                    </button>
                    {isNew(q) && (
                      <button type="button" onClick={() => patch(q.id, { status: 'closed' })}
                        disabled={busyId === q.id}
                        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 smk-text-label font-bold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-zinc-800">
                        <X className="h-3.5 w-3.5" />
                        {L('Закрыть без ответа', 'Жоп доцуш дIакъовла')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Строка «подпись — значение» в разобранной жалобе. */
function DisputeRow({ label, value, mono = false }: {
  label: string; value?: string; mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-500 dark:text-zinc-500">{label}:</dt>
      <dd className={`min-w-0 flex-1 break-words font-bold text-slate-900 dark:text-white ${mono ? 'font-mono smk-text-label' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
