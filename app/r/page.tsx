'use client';

/**
 * /r — посадочная страница QR «реквизиты кодом».
 *
 * Данные только в hash: камера открывает https-ссылку, сервер hash
 * не видит, SQL нет, авторизация не нужна. Это не оплата по QR банка.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  bankName, formatCard, formatPhone, parsePayoutQrHash,
  type PayoutQrPayload,
} from '@/lib/payments';

export default function PayoutQrPage() {
  const { t } = useI18n();
  const [payload, setPayload] = useState<PayoutQrPayload | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const read = useCallback(() => {
    setPayload(parsePayoutQrHash(window.location.hash));
  }, []);

  useEffect(() => {
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [read]);

  const copy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
    } catch {
      // Буфер недоступен — значение видно на экране.
    }
  }, []);

  const CopyRow = ({
    id, label, value, copyValue,
  }: { id: string; label: string; value: string; copyValue?: string }) => (
    <button
      type="button"
      onClick={() => copy(id, copyValue ?? value)}
      className="smk-sheet-row flex min-h-11 w-full items-center gap-2 p-3 text-left transition hover:brightness-95 dark:hover:brightness-110"
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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
      <div className="mb-5">
        <Link
          href="/"
          className="smk-solid inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.siteName}
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hero-gradient text-white shadow-lg">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="smk-title truncate font-black text-slate-900 dark:text-white">
            {t.payoutQrPageTitle}
          </h1>
        </div>
      </div>

      <hr className="smk-orn mb-4" />

      {!payload ? (
        <p className="smk-note smk-note-warn px-3.5 py-3 smk-text-body leading-relaxed">
          {t.payoutQrNoData}
        </p>
      ) : (
        <>
          <p className="mb-3 smk-text-body leading-relaxed text-slate-600 dark:text-zinc-400">
            {t.payoutQrPageHint}
          </p>

          <div className="space-y-1.5">
            <CopyRow
              id="amount"
              label={t.payoutQrAmount}
              value={`${payload.amount} ₽`}
              copyValue={String(payload.amount)}
            />
            {payload.method === 'sbp' ? (
              <CopyRow
                id="req"
                label={t.taskPayoutCopyPhone}
                value={formatPhone(payload.phone)}
              />
            ) : (
              <CopyRow
                id="req"
                label={t.taskPayoutCopyCard}
                value={formatCard(payload.card)}
              />
            )}
          </div>

          {payload.bank && (
            <p className="smk-meta mt-2 px-1 smk-text-label">
              {t.taskPayoutBankLabel} — {bankName(payload.bank)}
            </p>
          )}

          <hr className="smk-orn-soft my-4" />

          <p className="smk-note smk-note-danger px-3 py-2">
            {t.taskPayoutSafety}
          </p>
        </>
      )}
    </div>
  );
}
