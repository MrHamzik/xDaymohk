'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { useSheetSwipe } from '@/lib/hooks/useSheetSwipe';
import type { Task } from '@/lib/types';

interface DisputeComplaintModalProps {
  task: Task;
  /** Роль подающего: от неё зависит формулировка в тексте обращения. */
  role: 'author' | 'executor';
  onClose: () => void;
  onSent: () => void;
}

/**
 * Жалоба администратору по спорному заданию.
 *
 * Почему модалка, а не ссылка в «Помощь». Раньше кнопка вела в раздел
 * вопросов: человек уходил со спора на другую страницу, терял контекст
 * и должен был сам описать, о каком задании речь. Администратор
 * получал обращение без единой зацепки.
 *
 * Здесь контекст (номер, название, награда, причина отказа) подставляется
 * автоматически, а человек пишет только суть.
 *
 * Пишем в support_questions — ту же очередь, что и обычные обращения:
 * админ уже разбирает её в своём разделе, отдельная таблица под споры
 * означала бы второй интерфейс для той же по смыслу работы. Таблица
 * complaints не подходит: она привязана к анкете (profile_id), а у
 * задания анкеты нет.
 */
export default function DisputeComplaintModal({
  task, role, onClose, onSent,
}: DisputeComplaintModalProps) {
  const { t } = useI18n();
  const swipe = useSheetSwipe(onClose);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      setError(t.taskComplaintTooShort);
      return;
    }
    setIsSending(true);
    setError('');
    try {
      if (!supabase) throw new Error(t.taskComplaintError);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error(t.taskComplaintError);

      // Контекст задания собираем на клиенте и кладём в текст: сервер
      // support принимает только строку вопроса, а менять его схему
      // ради одного сценария избыточно.
      // Формат построчный и разбирается обратно (lib/support/format.ts):
      // админ-панель показывает поля таблицей, а не сплошной строкой.
      const context = [
        `[Спор по заданию #${task.id}]`,
        `Название: ${task.title}`,
        `Награда: ${task.reward} ₽`,
        `Роль заявителя: ${role === 'author' ? 'заказчик' : 'исполнитель'}`,
        task.disputeReason ? `Причина отказа: ${task.disputeReason}` : '',
        '',
        trimmed,
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: context }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t.taskComplaintError);
      }
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.taskComplaintError);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="smk-sheet-head flex items-center justify-between px-4 pb-3 pt-4"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
            <ShieldAlert className="h-4 w-4" />
            {t.taskDisputeComplain}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="smk-act rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <p className="smk-note smk-note-info px-3 py-2">
            {t.taskComplaintHint}
          </p>

          {/* Что уйдёт администратору вместе с текстом — показываем
              честно, чтобы человек не дублировал это руками. */}
          <div className="smk-inset px-3 py-2.5">
            <p className="smk-sheet-label mb-1">{t.taskComplaintContext}</p>
            <p className="text-xs font-bold text-slate-900 dark:text-white">{task.title}</p>
            <p className="smk-meta mt-0.5">
              #{task.id} · {task.reward} ₽
            </p>
          </div>

          <div>
            <label htmlFor="dispute-complaint" className="smk-sheet-label mb-1.5 block">
              {t.taskComplaintLabel}
            </label>
            <textarea
              id="dispute-complaint"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder={t.taskComplaintPlaceholder}
              className="smk-field w-full resize-none px-3 py-2.5 text-xs text-slate-900 outline-none dark:text-white"
            />
            <p className="smk-meta mt-1 text-right">{text.length}/1000</p>
          </div>

          {error && (
            <p className="smk-note smk-note-danger px-3 py-2">{error}</p>
          )}
        </div>

        <div className="smk-sheet-section smk-sheet-foot flex gap-2 p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={isSending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.taskComplaintSend}
          </button>
        </div>
      </div>
    </div>
  );
}
