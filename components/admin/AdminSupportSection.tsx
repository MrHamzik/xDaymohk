'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, Send, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';

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
export default function AdminSupportSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);

  const { account } = useAuth();
  const [items, setItems] = useState<Question[]>([]);
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
  const sorted = [...items].sort((a, b) => Number(isNew(b)) - Number(isNew(a)));

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="smk-sheet-label">
          {L('Вопросы пользователей', 'Лелошхойн хаттарш')}
        </span>
        <span className="smk-meta text-[10px]">
          {L('Новых: ', 'Керланаш: ')}{items.filter(isNew).length}
        </span>
      </div>

      {error && (
        <p className="smk-note smk-note-danger px-3 py-2 text-xs font-semibold">
          {error}
        </p>
      )}

      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <p className="smk-dashed p-4 text-center text-xs text-slate-500 dark:text-zinc-500">
          {L('Вопросов нет.', 'Хаттарш дац.')}
        </p>
      )}

      <div className="space-y-2">
        {sorted.map((q) => (
          <article key={q.id} className="smk-sheet-row p-2.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{q.question}</p>
                <p className="smk-meta mt-0.5 text-[10px]">
                  {q.authorName || L('Житель', 'Бахархо')}
                  {isNew(q) ? L(' · ждёт ответа', ' · жоп доьхуш') : L(' · отвечен', ' · жоп делла')}
                </p>
              </div>
              <button type="button" onClick={() => patch(q.id, { isPublic: !q.isPublic })}
                disabled={busyId === q.id}
                title={q.isPublic ? L('Скрыть из общего списка', 'Юкъарчу могIанера дIаяккха') : L('Показывать всем', 'Массарна гайта')}
                aria-label={q.isPublic ? L('Скрыть из общего списка', 'Юкъарчу могIанера дIаяккха') : L('Показывать всем', 'Массарна гайта')}
                className="smk-act flex h-7 w-7 shrink-0 items-center justify-center">
                {q.isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={() => remove(q.id)} disabled={busyId === q.id}
                aria-label={L('Удалить', 'ДIадаккха')}
                className="smk-act smk-act--danger flex h-7 w-7 shrink-0 items-center justify-center">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <textarea
              value={drafts[q.id] ?? q.answer}
              onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
              rows={3}
              maxLength={4000}
              placeholder={L('Ответ (можно с разметкой)', 'Жоп')}
              className="mt-2 w-full resize-y rounded-xl bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-white"
            />

            <div className="mt-2 flex items-center gap-2">
              <button type="button"
                onClick={() => patch(q.id, { answer: drafts[q.id] ?? q.answer })}
                disabled={busyId === q.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                {busyId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {L('Ответить', 'Жоп дала')}
              </button>
              {isNew(q) && (
                <button type="button" onClick={() => patch(q.id, { status: 'closed' })}
                  disabled={busyId === q.id}
                  className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-zinc-800">
                  <X className="h-3.5 w-3.5" />
                  {L('Закрыть без ответа', 'Жоп доцуш дIакъовла')}
                </button>
              )}
              {q.status === 'answered' && (
                <span className="smk-meta inline-flex items-center gap-1 text-[10px]">
                  <Check className="h-3 w-3" />
                  {q.isPublic ? L('Виден всем', 'Массарна гуш') : L('Виден только автору', 'Автора бен ца гуш')}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
