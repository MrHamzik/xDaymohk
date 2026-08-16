'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Languages, X } from 'lucide-react';
import { Profile } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

export interface AdminBanPayload {
  hours: number | null; // null = навсегда
  title: string;
  message: string;
  ceTitle?: string;
  ceMessage?: string;
  sender?: string;
}

interface AdminBanModalProps {
  profile: Profile | null;
  onClose: () => void;
  onConfirm: (payload: AdminBanPayload) => Promise<void>;
}

const BAN_OPTIONS: { value: string; label: string; hours?: number }[] = [
  { value: '1h', label: 'На час', hours: 1 },
  { value: '3h', label: '3 часа', hours: 3 },
  { value: '6h', label: '6 часов', hours: 6 },
  { value: '24h', label: '24 часа', hours: 24 },
  { value: '3d', label: '3 дня', hours: 72 },
  { value: '7d', label: '7 дней', hours: 168 },
  { value: '30d', label: 'Месяц', hours: 720 },
  { value: 'forever', label: 'Навсегда' },
];

/**
 * Одностороннее окно блокировки для админа: причина, срок, письмо-уведомление.
 * Открывается вместо простого подтверждения «Заблокировать?».
 */
export default function AdminBanModal({ profile, onClose, onConfirm }: AdminBanModalProps) {
  const { language } = useI18n();
  const [ban, setBan] = useState('24h');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [ceTitle, setCeTitle] = useState('');
  const [ceMessage, setCeMessage] = useState('');
  const [senderName, setSenderName] = useState('Даймохк');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      setBan('24h');
      setTitle('Контент нарушает правила сообщества');
      setMessage(
        `Ваш контент нарушает правила сообщества Даймохк. Пожалуйста, ознакомьтесь с правилами и больше не нарушайте их.`,
      );
      setCeTitle('Контенташ йукъараллин бакъонаш хьакхар ду');
      setCeMessage(
        `Хьан контенташ Даймохк йукъараллин бакъонаш хьакхар ду. Дехар до, бакъонашца хьажа, тIаьхьа ца хьакхайалархьама.`,
      );
    }
  }, [profile]);

  if (!profile) return null;

  const translate = async () => {
    try {
      const r1 = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: title || 'Контент нарушает правила сообщества', from: 'ru', to: 'ce' }),
      });
      const d1 = r1.ok ? await r1.json() : null;
      const r2 = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, from: 'ru', to: 'ce' }),
      });
      const d2 = r2.ok ? await r2.json() : null;
      if (d1?.translated) setCeTitle(d1.translated);
      if (d2?.translated) setCeMessage(d2.translated);
    } catch {
      // заполнит вручную
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const opt = BAN_OPTIONS.find((o) => o.value === ban);
      await onConfirm({
        hours: opt?.value === 'forever' ? null : (opt?.hours ?? null),
        title: title.trim() || 'Контент нарушает правила сообщества',
        message: message.trim(),
        ceTitle: ceTitle.trim() || undefined,
        ceMessage: ceMessage.trim() || undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-950 border border-slate-200/50 dark:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-4 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <Ban className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {language === 'ce' ? 'Билсдаккхар' : 'Заблокировать'} — {profile.fullName}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                {language === 'ce' ? 'Цхьатера арз: бакъонаш хьакхар' : 'Одностороннее: нарушение правил сообщества'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 dark:border-zinc-800">
          <label className="mb-1 block text-[10px] font-semibold text-slate-400 dark:text-zinc-500">
            {language === 'ce' ? 'Царара (дIахьошверг)' : 'Отправитель'}
          </label>
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Даймохк"
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 no-scrollbar">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
              {language === 'ce' ? 'Срок' : 'Срок блокировки'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BAN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBan(opt.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${ban === opt.value ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                {language === 'ce' ? 'Хаам (тема а, хьажорг а)' : 'Письмо пользователю'}
              </label>
              <button type="button" onClick={() => void translate()} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-emerald-700" title="Автоперевод">
                <Languages className="h-3 w-3" /> Автоперевод
              </button>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === 'ce' ? 'Хаттар' : 'Тема'}
              className="mb-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={language === 'ce' ? 'Хьажорг' : 'Текст письма'}
              className="min-h-[7.5rem] w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
            <input
              value={ceTitle}
              onChange={(e) => setCeTitle(e.target.value)}
              placeholder="Тема (чеченский)"
              className="mb-1.5 mt-1.5 w-full rounded-lg border border-emerald-200 bg-emerald-50/40 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-white"
            />
            <textarea
              rows={2}
              value={ceMessage}
              onChange={(e) => setCeMessage(e.target.value)}
              placeholder="Текст письма (чеченский)"
              className="w-full resize-y rounded-lg border border-emerald-200 bg-emerald-50/40 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-white"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 p-4 dark:border-zinc-800">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {language === 'ce' ? 'ДIабацо' : 'Отмена'}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50">
            <Ban className="h-3.5 w-3.5" />
            {busy ? (language === 'ce' ? 'ДIадахка…' : 'Блокируем…') : (language === 'ce' ? 'Билсде' : 'Заблокировать')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
