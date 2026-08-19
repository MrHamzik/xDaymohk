'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Loader2, Save, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { SectionTitle, Toggle } from '@/components/settings/SettingsPrimitives';
import {
  BANKS, EMPTY_PAYOUT, formatCard, formatPhone, type PayoutMethods,
} from '@/lib/payments';

/**
 * Реквизиты для получения оплаты за задания.
 *
 * Заполняет ИСПОЛНИТЕЛЬ — заранее, один раз. Заказчик увидит их только
 * после того, как его отклик одобрен и работа сдана: номер телефона и
 * карта в открытом доступе — приманка для схем «верните ошибочный
 * перевод», поэтому доступ проверяет сервер (/api/payout).
 *
 * Сервис деньги не принимает и не переводит: перевод идёт напрямую
 * между людьми. Об этом сказано прямо в подсказке, иначе человек ждёт,
 * что приложение спишет и зачислит само.
 */
export default function PayoutSettings() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [value, setValue] = useState<PayoutMethods>(EMPTY_PAYOUT);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const token = useCallback(async () => {
    if (!supabase) return '';
    const session = await supabase.auth.getSession();
    return session.data.session?.access_token || '';
  }, []);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const load = async () => {
      const accessToken = await token();
      if (!accessToken) return;
      setIsLoading(true);
      try {
        const res = await fetch('/api/payout', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.payout) setValue(data.payout);
      } catch {
        // Оставляем пустую форму.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [account, token]);

  const save = async () => {
    setIsSaving(true);
    setError('');
    setSaved(false);
    try {
      const accessToken = await token();
      const res = await fetch('/api/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(value),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.payoutSaveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  if (!account) return null;

  const field = 'w-full rounded-xl bg-slate-100/80 px-3 py-2.5 text-xs text-slate-900 outline-none transition focus:ring-2 focus:ring-emerald-500/30 dark:bg-zinc-800 dark:text-white';
  const label = 'mb-1 block smk-text-label font-bold text-slate-600 dark:text-zinc-400';

  /**
   * Переключение тумблера сохраняем СРАЗУ, не дожидаясь кнопки
   * «Сохранить»: это согласие показывать данные другим людям, и оно
   * должно применяться в тот момент, когда человек его дал или отозвал.
   * Реквизиты в полях при этом остаются — выключение их не стирает.
   */
  const toggleEnabled = async (next: boolean) => {
    const updated = { ...value, isEnabled: next };
    setValue(updated);
    setError('');
    try {
      const accessToken = await token();
      const res = await fetch('/api/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (e) {
      // Откатываем переключатель: иначе человек думает, что согласие
      // отозвано, а сервер продолжает отдавать реквизиты.
      setValue((v) => ({ ...v, isEnabled: !next }));
      setError(e instanceof Error ? e.message : t.payoutSaveFailed);
    }
  };

  return (
    <section>
      <SectionTitle
        title={t.payoutSection}
        hint={t.payoutSectionHint}
        action={
          <Toggle
            checked={value.isEnabled}
            onChange={(next) => void toggleEnabled(next)}
            label={t.payoutSection}
          />
        }
      />

      {!value.isEnabled && !isLoading && (
        <p className="smk-sheet-row p-3 smk-text-label leading-relaxed text-slate-600 dark:text-zinc-400">
          {t.payoutDisabledHint}
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        </div>
      ) : value.isEnabled ? (
        <div className="space-y-2.5">
          {/* СБП */}
          <div className="smk-sheet-row p-3">
            <h4 className="smk-sheet-label mb-2">{t.payoutSbpTitle}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="payout-phone" className={label}>{t.payoutPhone}</label>
                <input
                  id="payout-phone"
                  type="tel"
                  inputMode="tel"
                  value={value.sbpPhone}
                  onChange={(e) => setValue((v) => ({ ...v, sbpPhone: e.target.value }))}
                  onBlur={() => setValue((v) => ({ ...v, sbpPhone: formatPhone(v.sbpPhone) }))}
                  placeholder="+7 (999) 123-45-67"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="payout-sbp-bank" className={label}>{t.payoutBank}</label>
                <select
                  id="payout-sbp-bank"
                  value={value.sbpBank}
                  onChange={(e) => setValue((v) => ({ ...v, sbpBank: e.target.value }))}
                  className={field}
                >
                  <option value="">{t.payoutBankChoose}</option>
                  {BANKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <p className="smk-meta mt-1.5 smk-text-label leading-relaxed">{t.payoutSbpHint}</p>
          </div>

          {/* Карта */}
          <div className="smk-sheet-row p-3">
            <h4 className="smk-sheet-label mb-2">{t.payoutCardTitle}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="payout-card" className={label}>{t.payoutCardNumber}</label>
                <input
                  id="payout-card"
                  inputMode="numeric"
                  value={value.cardNumber}
                  onChange={(e) => setValue((v) => ({ ...v, cardNumber: e.target.value }))}
                  onBlur={() => setValue((v) => ({ ...v, cardNumber: formatCard(v.cardNumber) }))}
                  placeholder="2202 2002 1234 5678"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="payout-card-bank" className={label}>{t.payoutBank}</label>
                <select
                  id="payout-card-bank"
                  value={value.cardBank}
                  onChange={(e) => setValue((v) => ({ ...v, cardBank: e.target.value }))}
                  className={field}
                >
                  <option value="">{t.payoutBankChoose}</option>
                  {BANKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <p className="smk-meta mt-1.5 smk-text-label leading-relaxed">{t.payoutCardHint}</p>
          </div>

          {/* ЮMoney */}
          <div className="smk-sheet-row p-3">
            <h4 className="smk-sheet-label mb-2">{t.payoutWalletTitle}</h4>
            <label htmlFor="payout-wallet" className={label}>{t.payoutWalletNumber}</label>
            <input
              id="payout-wallet"
              inputMode="numeric"
              value={value.yoomoneyWallet}
              onChange={(e) => setValue((v) => ({ ...v, yoomoneyWallet: e.target.value }))}
              placeholder="410011234567890"
              className={field}
            />
            <p className="smk-meta mt-1.5 smk-text-label leading-relaxed">{t.payoutWalletHint}</p>
          </div>

          {error && (
            <p className="smk-note smk-note-danger px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t.save}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 smk-text-label font-bold text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                {t.payoutSaved}
              </span>
            )}
          </div>

          <p className="smk-note smk-note-info flex items-start gap-1.5 px-3 py-2">
            <Wallet className="mt-0.5 h-3 w-3 shrink-0" />
            {t.payoutPrivacyNote}
          </p>
        </div>
      ) : null}

      <Link
        href="/payouts"
        className="smk-sheet-row mt-2.5 flex min-h-11 items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-800 transition hover:brightness-95 dark:text-zinc-200 dark:hover:brightness-110"
      >
        <span className="min-w-0 flex-1">{t.payoutHistoryLink}</span>
        <ChevronRight className="h-4 w-4 shrink-0 smk-arrow" />
      </Link>
    </section>
  );
}
