'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Check, Copy, ExternalLink, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import {
  bankName, bankScheme, formatCard, formatPhone, yoomoneyLink,
  type PayoutMethods,
} from '@/lib/payments';

interface PayoutPanelProps {
  taskId: string;
  /** Сколько заказчик должен исполнителю, ₽. */
  amount: number;
}

/**
 * Блок оплаты исполнителю — для заказчика, после выполнения задания.
 *
 * Почему два шага, а не одна кнопка «оплатить»
 * --------------------------------------------
 * Собрать ссылку «переведи 500 ₽ по номеру» технически нельзя: СБП
 * принимает только зарегистрированные банком QR-коды, а прямые
 * диплинки банков открывают пустую форму перевода. Единственное
 * исключение — ЮMoney, там сумма реально подставляется.
 *
 * Поэтому: сначала копирование (работает всегда), потом открытие банка
 * (удобство). Кнопка банка подписана честно — «сумму придётся вставить
 * самому», чтобы человек не решил, что приложение сломалось.
 */
export default function PayoutPanel({ taskId, amount }: PayoutPanelProps) {
  const { t } = useI18n();
  const [payout, setPayout] = useState<PayoutMethods | null>(null);
  const [method, setMethod] = useState<string>('cash');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase) return;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch(`/api/payout?taskId=${encodeURIComponent(taskId)}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPayout(data.payout ?? null);
        setMethod(data.paymentMethod ?? 'cash');
      } catch {
        // Реквизиты не пришли — покажем подсказку про наличные.
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [taskId]);

  const copy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      // Буфер недоступен (старый браузер, http) — значение всё равно
      // видно на экране и его можно выделить вручную.
    }
  }, []);

  // Наличные: реквизиты не нужны вовсе.
  if (method === 'cash') {
    return (
      <div className="smk-sheet-section px-4 py-3.5">
        <h3 className="smk-sheet-label mb-1.5 flex items-center gap-1.5">
          <Banknote className="h-3 w-3" />
          {t.taskPayoutTitleShort}
        </h3>
        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-zinc-400">
          {t.taskPayoutCashNote}
        </p>
      </div>
    );
  }

  const hasSbp = method === 'sbp' && Boolean(payout?.sbpPhone);
  const hasCard = method === 'card' && Boolean(payout?.cardNumber);
  const hasWallet = method === 'yoomoney' && Boolean(payout?.yoomoneyWallet);

  if (!hasSbp && !hasCard && !hasWallet) {
    return (
      <div className="smk-sheet-section px-4 py-3.5">
        <h3 className="smk-sheet-label mb-1.5 flex items-center gap-1.5">
          <Wallet className="h-3 w-3" />
          {t.taskPayoutTitleShort}
        </h3>
        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-zinc-400">
          {t.taskPayoutMissing}
        </p>
      </div>
    );
  }

  const bankId = hasSbp ? payout!.sbpBank : payout!.cardBank;
  const scheme = bankScheme(bankId);
  const requisite = hasSbp
    ? formatPhone(payout!.sbpPhone)
    : hasCard
      ? formatCard(payout!.cardNumber)
      : payout!.yoomoneyWallet;

  const CopyRow = ({ id, label, value }: { id: string; label: string; value: string }) => (
    <button
      type="button"
      onClick={() => copy(id, value)}
      className="smk-sheet-row flex w-full items-center gap-2 p-2.5 text-left transition hover:brightness-95 dark:hover:brightness-110"
    >
      <span className="min-w-0 flex-1">
        <span className="smk-sheet-label smk-sheet-label--plain block">{label}</span>
        <span className="mt-0.5 block truncate font-mono text-sm font-bold text-slate-900 dark:text-white">
          {value}
        </span>
      </span>
      {copied === id
        ? <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        : <Copy className="h-4 w-4 shrink-0 smk-arrow" />}
    </button>
  );

  return (
    <div className="smk-sheet-section px-4 py-3.5">
      <h3 className="smk-sheet-label mb-2 flex items-center gap-1.5">
        <Wallet className="h-3 w-3" />
        {t.taskPayoutTitleShort}
      </h3>

      {/* Шаг 1 — копирование. Работает везде и всегда. */}
      <p className="smk-meta mb-1.5 text-[11px] font-semibold">{t.taskPayoutStep1}</p>
      <div className="space-y-1.5">
        <CopyRow id="amount" label={t.taskPayoutCopyAmount} value={String(amount)} />
        <CopyRow
          id="req"
          label={hasSbp ? t.taskPayoutCopyPhone : hasCard ? t.taskPayoutCopyCard : 'ЮMoney'}
          value={requisite}
        />
        {bankId && (hasSbp || hasCard) && (
          <p className="smk-meta px-1 text-[10px]">
            {t.taskPayoutStep2.replace('Шаг 2. ', '')} — {bankName(bankId)}
          </p>
        )}
      </div>

      {/* Шаг 2 — открыть приложение. Для ЮMoney сумма подставится, для
          банков нет: об этом сказано прямо под кнопкой. */}
      <p className="smk-meta mb-1.5 mt-3 text-[11px] font-semibold">{t.taskPayoutStep2}</p>
      {hasWallet ? (
        <>
          <a
            href={yoomoneyLink(payout!.yoomoneyWallet, amount)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t.taskPayoutOpenYoomoney}
          </a>
          <p className="smk-meta mt-1.5 text-[10px] leading-relaxed">
            {t.taskPayoutYoomoneyNote}
          </p>
        </>
      ) : (
        <>
          <a
            href={scheme ?? 'https://www.nspk.ru/'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t.taskPayoutOpenBank}
          </a>
          <p className="smk-meta mt-1.5 text-[10px] leading-relaxed">
            {t.taskPayoutBankNote}
          </p>
        </>
      )}

      <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        {t.taskPayoutSafety}
      </p>
    </div>
  );
}
