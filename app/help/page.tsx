'use client';

/**
 * /help — «Помощь»: частые вопросы и вопросы от пользователей.
 *
 * Раньше страница была четырьмя захардкоженными вопросами и списком
 * контактов, включая выдуманный номер телефона «+7 (999) 000-00-00».
 * Теперь FAQ и вопросы живут в БД (обновление 31), есть поиск по базе
 * и форма обращения; ответ приходит уведомлением в приложение.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ChevronDown, LifeBuoy, Loader2, MessageCircle, Search, Send, Trash2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import Prose from '@/components/reading/Prose';

/** Телеграм поддержки — единственный внешний канал связи. */
const SUPPORT_TELEGRAM = 'https://t.me/+Zx6xmc5g_a5hZmEy';
const SUPPORT_EMAIL = 'support@daymohk.xyz';

interface FaqItem {
  id: string;
  questionRu: string; questionCe: string;
  answerRu: string; answerCe: string;
}
interface UserQuestion {
  id: string;
  authorName: string;
  question: string;
  answer: string;
  status: 'new' | 'answered' | 'closed';
  createdAt: string;
}

export default function HelpPage() {
  const { language } = useI18n();
  const { account } = useAuth();
  const ce = language === 'ce';
  const L = (ru: string, che: string) => (ce ? che : ru);

  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [questions, setQuestions] = useState<UserQuestion[]>([]);
  const [mine, setMine] = useState<UserQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const token = useCallback(async () => {
    if (!supabase) return '';
    const s = await supabase.auth.getSession();
    return s.data.session?.access_token || '';
  }, []);

  const load = useCallback(async (q: string) => {
    setIsLoading(true);
    try {
      const accessToken = await token();
      const res = await fetch(`/api/support?q=${encodeURIComponent(q)}`, {
        cache: 'no-store',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = await res.json();
      setFaq(Array.isArray(data.faq) ? data.faq : []);
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setMine(Array.isArray(data.mine) ? data.mine : []);
    } catch {
      // Сеть моргнула — оставляем прежние списки.
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Поиск с задержкой: запрос уходит, когда человек перестал печатать,
  // а не на каждую букву.
  useEffect(() => {
    const timer = setTimeout(() => { void load(search.trim()); }, 350);
    return () => clearTimeout(timer);
  }, [search, load]);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length < 5) {
      setNotice(L('Опишите вопрос подробнее.', 'Хаттар шардина яздé.'));
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const accessToken = await token();
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMine((list) => [data.question, ...list]);
      setDraft('');
      setNotice(L('Вопрос отправлен. Ответ придёт уведомлением.',
        'Хаттар дIадахьийтина. Жоп хьехамца кхочур ду.'));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : L('Не удалось отправить.', 'ДIадахьийта ца делира.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(L('Удалить свой вопрос?', 'Хьайн хаттар дIадаккха?'))) return;
    const accessToken = await token();
    const res = await fetch(`/api/support?id=${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) setMine((list) => list.filter((q) => q.id !== id));
  };

  const faqQ = (f: FaqItem) => (ce ? f.questionCe : f.questionRu) || f.questionRu;
  const faqA = (f: FaqItem) => (ce ? f.answerCe : f.answerRu) || f.answerRu;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <Link href="/" className="smk-solid inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold">
          <ArrowLeft className="h-3.5 w-3.5" />
          {L('Назад', 'ЦIа')}
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hero-gradient text-white shadow-lg">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="smk-title truncate text-xl font-black text-slate-900 dark:text-white">
            {L('Помощь', 'ГIо')}
          </h1>
          <p className="truncate text-xs text-slate-500 dark:text-zinc-400">
            {L('Вопросы и ответы', 'Хаттарш а, жоппаш а')}
          </p>
        </div>
      </div>

      <hr className="smk-orn mb-4" />

      {/* Частые вопросы */}
      {faq.length > 0 && (
        <section className="mb-5">
          <h2 className="smk-sheet-label mb-2">{L('Частые вопросы', 'Дуккха хаттало')}</h2>
          <div className="smk-rows">
            {faq.map((f) => (
              <div key={f.id} className="py-1">
                <button type="button" onClick={() => setOpenId(openId === f.id ? null : f.id)}
                  aria-expanded={openId === f.id}
                  className="flex w-full items-center gap-2 py-2 text-left">
                  <span className="min-w-0 flex-1 text-xs font-bold text-slate-900 dark:text-white">
                    {faqQ(f)}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 smk-arrow transition ${openId === f.id ? 'rotate-180' : ''}`} />
                </button>
                {openId === f.id && (
                  <div className="smk-read pb-2 text-[13px]">
                    <Prose text={faqA(f)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Вопросы пользователей */}
      <section>
        <h2 className="smk-sheet-label mb-2">{L('Вопросы пользователей', 'Лелошхойн хаттарш')}</h2>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={L('Найти похожий вопрос…', 'Тера хаттар лаха…')}
            className="smk-sheet-row w-full py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
          />
        </div>

        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          </div>
        )}

        {!isLoading && questions.length === 0 && (
          <p className="smk-dashed p-4 text-center text-xs text-slate-500 dark:text-zinc-500">
            {search
              ? L('Ничего не нашлось. Задайте свой вопрос ниже.', 'ХIумма а ца карийна. Лахахь хаттар де.')
              : L('Пока нет опубликованных вопросов.', 'Зорбане яьхна хаттарш дац.')}
          </p>
        )}

        <div className="space-y-1.5">
          {questions.map((q) => (
            <article key={q.id} className="smk-sheet-row p-2.5">
              <p className="text-xs font-bold text-slate-900 dark:text-white">{q.question}</p>
              {q.answer && (
                <>
                  <hr className="smk-orn-soft my-2" />
                  <div className="smk-read text-[13px]"><Prose text={q.answer} /></div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* Мои вопросы */}
      {mine.length > 0 && (
        <section className="mt-5">
          <h2 className="smk-sheet-label mb-2">{L('Мои вопросы', 'Сан хаттарш')}</h2>
          <div className="space-y-1.5">
            {mine.map((q) => (
              <article key={q.id} className="smk-sheet-row p-2.5">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-xs font-bold text-slate-900 dark:text-white">
                    {q.question}
                  </p>
                  <button type="button" onClick={() => remove(q.id)}
                    aria-label={L('Удалить', 'ДIадаккха')}
                    className="smk-act smk-act--danger flex h-6 w-6 shrink-0 items-center justify-center">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {q.answer ? (
                  <>
                    <hr className="smk-orn-soft my-2" />
                    <div className="smk-read text-[13px]"><Prose text={q.answer} /></div>
                  </>
                ) : (
                  <p className="smk-meta mt-1 text-[10px]">
                    {L('Ожидает ответа', 'Жоп доьхуш ду')}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Задать вопрос */}
      <section className="mt-5">
        <h2 className="smk-sheet-label mb-2">{L('Задать вопрос', 'Хаттар де')}</h2>
        {account ? (
          <form onSubmit={ask} className="smk-sheet-row space-y-2 p-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={L('Опишите, что не получается', 'Хlун ца хуьлу яздé')}
              className="w-full resize-y rounded-xl bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-white"
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {L('Отправить', 'ДIадахьийта')}
              </button>
              <span className="smk-meta text-[10px]">{draft.length}/1000</span>
            </div>
            {notice && <p className="smk-meta text-[11px]">{notice}</p>}
          </form>
        ) : (
          <p className="smk-sheet-row p-2.5 text-[11px] text-slate-500 dark:text-zinc-500">
            {L('Войдите, чтобы задать вопрос.', 'Хаттар дан профиле чу вала.')}
          </p>
        )}
      </section>

      {/* Связь с поддержкой */}
      <hr className="smk-orn my-5" />
      <div className="space-y-1.5">
        <a href={SUPPORT_TELEGRAM} target="_blank" rel="noopener noreferrer"
          className="smk-sheet-row flex items-center gap-2 p-2.5 text-xs font-bold text-slate-700 transition hover:brightness-95 dark:text-zinc-200 dark:hover:brightness-110">
          <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          {L('Техподдержка в Telegram', 'Telegram чохь гIо')}
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}`}
          className="smk-sheet-row flex items-center gap-2 p-2.5 text-xs font-bold text-slate-700 transition hover:brightness-95 dark:text-zinc-200 dark:hover:brightness-110">
          <Send className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
