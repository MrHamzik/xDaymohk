'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Languages, Mail, ShieldAlert, X } from 'lucide-react';
import { Complaint, NotificationLetterPayload, UserSummary } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

export type ComplaintResolveMode = 'accept' | 'dismiss';

interface RecipientDraft {
  /** null — получатель не определён (например, удалён) */
  userId: string | null;
  name: string;
  topic: string;
  message: string;
  /** Чеченский вариант темы и текста (п.9 — жалобы идут в двух языках). */
  ceTopic: string;
  ceMessage: string;
  ban: 'none' | '1h' | '3h' | '6h' | '24h' | '3d' | '7d' | '30d' | 'forever' | 'custom';
  customHours: string;
}

interface ComplaintResolveModalProps {
  complaint: Complaint | null;
  mode: ComplaintResolveMode;
  /** Владелец анкеты (нарушитель). */
  owner: UserSummary | null;
  /** Автор жалобы (отправитель). */
  author: UserSummary | null;
  profileName: string;
  onClose: () => void;
  onResolve: (payload: {
    complaintId: string;
    status: 'resolved' | 'dismissed';
    /** Письма-уведомления для отправки (кому не null). */
    notifications: NotificationLetterPayload[];
    /** Блокировки для применения (кому и на сколько часов; null = навсегда). */
    bans: { userId: string; hours: number | null }[];
  }) => Promise<void>;
}

const BAN_OPTIONS: { value: RecipientDraft['ban']; label: string; labelCe?: string; hours?: number }[] = [
  { value: 'none', label: 'Не блокировать', labelCe: 'Ма билсде' },
  { value: '1h', label: 'На час', labelCe: 'Сахьтанна', hours: 1 },
  { value: '3h', label: '3 часа', labelCe: '3 сахьт', hours: 3 },
  { value: '6h', label: '6 часов', labelCe: '6 сахьт', hours: 6 },
  { value: '24h', label: '24 часа', labelCe: '24 сахьт', hours: 24 },
  { value: '3d', label: '3 дня', labelCe: '3 де', hours: 72 },
  { value: '7d', label: '7 дней', labelCe: '7 де', hours: 168 },
  { value: '30d', label: 'Месяц', labelCe: 'Бутт', hours: 720 },
  { value: 'forever', label: 'Навсегда', labelCe: 'Долахь' },
  { value: 'custom', label: 'Кастомно', labelCe: 'Шен кеп' },
];

const EMPTY_DRAFT = (name: string, userId: string | null): RecipientDraft => ({
  userId,
  name,
  topic: '',
  message: '',
  ceTopic: '',
  ceMessage: '',
  ban: 'none',
  customHours: '24',
});

function banSignal(draft: RecipientDraft): number | null | 'none' {
  const opt = BAN_OPTIONS.find((o) => o.value === draft.ban);
  if (!opt || opt.value === 'none') return 'none';
  if (opt.value === 'forever') return null;
  if (opt.value === 'custom') {
    const h = Number(draft.customHours);
    if (!Number.isFinite(h) || h <= 0) return 'none';
    return h;
  }
  return opt.hours ?? 'none';
}

export default function ComplaintResolveModal({
  complaint,
  mode,
  owner,
  author,
  profileName,
  onClose,
  onResolve,
}: ComplaintResolveModalProps) {
  const [recipient, setRecipient] = useState<RecipientDraft>(EMPTY_DRAFT('', null));
  const [reporter, setReporter] = useState<RecipientDraft>(EMPTY_DRAFT('', null));
  const { language } = useI18n();
  const [senderName, setSenderName] = useState('Даймохк');
  const [busy, setBusy] = useState(false);

  // Автозаполнение при открытии, в зависимости от режима (accept/dismiss).
  useEffect(() => {
    if (!complaint) return;
    const ownerName = owner?.fullName || profileName || 'пользователь';
    const authorName = author?.fullName || complaint.authorName || 'отправитель';

    if (mode === 'accept') {
      // Нарушитель (владелец анкеты): жалоба подтверждена, меры приняты.
      setRecipient({
        userId: owner?.id ?? null,
        name: ownerName,
        topic: 'Жалоба о нарушении',
        message:
          `На вас поступила жалоба о нарушении правил сообщества Даймохк. ` +
          `Мы проверили информацию и приняли меры. Пожалуйста, соблюдайте правила, ` +
          `чтобы продолжать пользоваться платформой.`,
        ceTopic: 'Бакъонаш хьакхарна арз',
        ceMessage:
          `Хьан тIе Даймохк йукъараллин бакъонаш хьакхарна арз веана. ` +
          `Тхайгара хаамаш талла а, оьшуш долу мераш дIаийцира а. Дехар до, ` +
          `бакъонаш кхобуш хила, платформин пайда ца оьцуш.`,
        ban: '24h',
        customHours: '24',
      });
      // Отправитель: благодарность.
      setReporter({
        userId: author?.id ?? null,
        name: authorName,
        topic: 'Спасибо за сигнал',
        message:
          `Мы приняли меры в отношении пользователя ${ownerName}. ` +
          `Спасибо, что помогаете сообществу Даймохк!`,
        ceTopic: 'Баркалла сигналан',
        ceMessage:
          `Тхайгара мераш дIаийцира ${ownerName} лелорхочунна. ` +
          `Баркалла, Даймохк йукъарло гIо деш хиларна!`,
        ban: 'none',
        customHours: '24',
      });
    } else {
      // Жалоба необоснованна — наказание получает отправитель.
      setReporter({
        userId: author?.id ?? null,
        name: authorName,
        topic: 'Жалоба отклонена',
        message:
          `Ваша жалоба на пользователя ${ownerName} была рассмотрена и признана ` +
          `необоснованной. Пожалуйста, не отправляйте ложные жалобы — это нарушает ` +
          `правила сообщества Даймохк.`,
        ceTopic: 'Арз дIаяьккхина',
        ceMessage:
          `Хьан арз ${ownerName} лелорхочунна хьажа а, бакъонца йоцуш а ` +
          `билгалйаьккхина. Дехар до, харц арзаш ма дIаяхьий — иза Даймохк ` +
          `йукъараллин бакъонаш хьакхар ду.`,
        ban: '24h',
        customHours: '24',
      });
      // Нарушитель: всё в порядке.
      setRecipient({
        userId: owner?.id ?? null,
        name: ownerName,
        topic: 'Жалоба отклонена',
        message:
          `Жалоба, поступившая на вас, была рассмотрена и отклонена как необоснованная. ` +
          `Никаких мер не принято. Приносим извинения за беспокойство.`,
        ceTopic: 'Арз дIаяьккхина',
        ceMessage:
          `Хьан тIе веана арз хьажа а, бакъонца йоцуш дIаяьккхина а ю. ` +
          `Цхьа мера а ца дIаийцира. Аьтто боцучух кхерамах бехк ма билла.`,
        ban: 'none',
        customHours: '24',
      });
    }
  }, [complaint, mode, owner, author, profileName]);

  if (!complaint) return null;

  const updateDraft = (
    setter: React.Dispatch<React.SetStateAction<RecipientDraft>>,
    patch: Partial<RecipientDraft>,
  ) => setter((d) => ({ ...d, ...patch }));

  /** Автоперевод русских полей письма в чеченские (п.9). */
  const translateAutofill = async (setter: React.Dispatch<React.SetStateAction<RecipientDraft>>, draft: RecipientDraft) => {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.topic || 'Уведомление', from: 'ru', to: 'ce' }),
      });
      const topicResult = response.ok ? await response.json() : null;
      const ceTopic = topicResult?.translated ?? '';

      const messageResponse = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.message, from: 'ru', to: 'ce' }),
      });
      const messageResult = messageResponse.ok ? await messageResponse.json() : null;
      const ceMessage = messageResult?.translated ?? '';

      if (ceTopic || ceMessage) {
        setter((d) => ({ ...d, ceTopic: ceTopic || d.ceTopic, ceMessage: ceMessage || d.ceMessage }));
      }
    } catch {
      // Ошибка перевода — админ заполнит вручную.
    }
  };

  const handleSubmit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const notifications: NotificationLetterPayload[] = [recipient, reporter]
        .filter((d) => d.userId)
        .map((d) => ({
          recipientId: d.userId as string,
          title: d.topic || 'Уведомление',
          message: d.message,
          ceTitle: d.ceTopic || undefined,
          ceMessage: d.ceMessage || undefined,
          sender: senderName.trim() || 'Даймохк',
          type: 'complaint_result',
        }));
      const bans = [recipient, reporter]
        .filter((d) => d.userId && banSignal(d) !== 'none')
        .map((d) => ({ userId: d.userId as string, hours: banSignal(d) === null ? null : (banSignal(d) as number) }));
      await onResolve({
        complaintId: complaint.id,
        status: mode === 'accept' ? 'resolved' : 'dismissed',
        notifications,
        bans,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const renderRecipientCard = (
    title: string,
    draft: RecipientDraft,
    setter: React.Dispatch<React.SetStateAction<RecipientDraft>>,
    subtitle: string,
  ) => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{title}</h4>
        {draft.userId ? (
          <span className="truncate rounded-full bg-white px-2 py-0.5 smk-text-label font-semibold text-slate-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
            {draft.name}
          </span>
        ) : (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 smk-text-label font-semibold text-slate-500 dark:bg-zinc-800 dark:text-zinc-500">
            получатель недоступен
          </span>
        )}
      </div>
      <p className="mb-2 smk-text-label text-slate-400 dark:text-zinc-500">{subtitle}</p>
      <div className="space-y-2">
        <div>
          <label className="mb-1 block smk-text-label font-semibold text-slate-600 dark:text-zinc-400">{language === 'ce' ? 'Хаттар' : 'Тема'}</label>
          <input
            value={draft.topic}
            onChange={(e) => updateDraft(setter, { topic: e.target.value })}
            placeholder="Заголовок письма"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block smk-text-label font-semibold text-slate-600 dark:text-zinc-400">{language === 'ce' ? 'Хьажорг' : 'Текст письма'}</label>
          <textarea
            rows={3}
            value={draft.message}
            onChange={(e) => updateDraft(setter, { message: e.target.value })}
            placeholder="Описание"
            className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block smk-text-label font-semibold text-slate-600 dark:text-zinc-300">{language === 'ce' ? 'Нохчийн (тема а, хьажорг а)' : 'Чеченский (тема и текст)'}</label>
            <button
              type="button"
              onClick={() => void translateAutofill(setter, draft)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 smk-text-label font-bold text-white transition hover:bg-emerald-700"
              title="Автоперевод (русский → чеченский)"
            >
              <Languages className="h-3 w-3" /> Автоперевод
            </button>
          </div>
          <input
            value={draft.ceTopic}
            onChange={(e) => updateDraft(setter, { ceTopic: e.target.value })}
            placeholder="Тема (чеченский)"
            className="mb-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
          <textarea
            rows={2}
            value={draft.ceMessage}
            onChange={(e) => updateDraft(setter, { ceMessage: e.target.value })}
            placeholder="Текст письма (чеченский)"
            className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block smk-text-label font-semibold text-slate-600 dark:text-zinc-400">{language === 'ce' ? 'Билсдаккхар' : 'Блокировка'}</label>
          <div className="flex items-center gap-2">
            <select
              value={draft.ban}
              onChange={(e) => updateDraft(setter, { ban: e.target.value as RecipientDraft['ban'] })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            >
              {BAN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{language === 'ce' ? (opt.labelCe || opt.label) : opt.label}</option>
              ))}
            </select>
            {draft.ban === 'custom' && (
              <input
                type="number"
                min={1}
                value={draft.customHours}
                onChange={(e) => updateDraft(setter, { customHours: e.target.value })}
                placeholder="часы"
                title="Сколько часов блокировать"
                className="w-24 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-4 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${mode === 'accept' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'}`}>
              {mode === 'accept' ? <Check className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {mode === 'accept'
                  ? (language === 'ce' ? 'Арз тIеэца' : 'Принять жалобу')
                  : (language === 'ce' ? 'Арз дIаяккха' : 'Отклонить жалобу')}
              </h2>
              <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                {language === 'ce' ? 'Кехаташ: тIебелиначарна а, дIахьочунна а · анкета: ' : 'Письма нарушителю и отправителю · анкета: '}{profileName}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 dark:border-zinc-800">
          <label className="mb-1 block smk-text-label font-semibold text-slate-400 dark:text-zinc-500">
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
          {mode === 'accept' ? (
            <>
              {renderRecipientCard(language === 'ce' ? 'Кехат тIебелиначарна' : 'Письмо нарушителю', recipient, setRecipient, language === 'ce' ? 'Юьхьанцара йоза: арз тIеийцина, мераш дIаийцина' : 'Текст по умолчанию: жалоба подтверждена, меры приняты')}
              {renderRecipientCard(language === 'ce' ? 'Кехат дIахьочунна' : 'Письмо отправителю', reporter, setReporter, language === 'ce' ? 'Юьхьанцара йоза: баркалла сигналан' : 'Текст по умолчанию: спасибо за сигнал')}
            </>
          ) : (
            <>
              {renderRecipientCard(language === 'ce' ? 'Кехат дIахьочунна' : 'Письмо отправителю', reporter, setReporter, language === 'ce' ? 'Арз бакъонца йоцуш билгалйина — къинтIера валар дIахьочунна' : 'Жалоба признана необоснованной — наказание получает отправитель')}
              {renderRecipientCard(language === 'ce' ? 'Кехат тIебелиначарна' : 'Письмо нарушителю', recipient, setRecipient, language === 'ce' ? 'Арз дIаяьккхина, мераш ца дIаийцина' : 'Жалоба отклонена, меры не приняты')}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 p-4 dark:border-zinc-800">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${mode === 'accept' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            <Mail className="h-3.5 w-3.5" />
            {busy ? (language === 'ce' ? 'ДIадахка…' : 'Отправляем…') : mode === 'accept' ? (language === 'ce' ? 'ТIеэца а, дIадахка а' : 'Принять и отправить') : (language === 'ce' ? 'ДIаяккха а, дIадахка а' : 'Отклонить и отправить')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
