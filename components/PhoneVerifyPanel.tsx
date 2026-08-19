'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import PhoneField from '@/components/PhoneField';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { extractPhoneDigits } from '@/lib/phone';

/**
 * Подтверждение номера SMS-кодом.
 *
 * Код на клиент не приходит. Без ключа SMS.RU сервер откажется слать —
 * это не обход, а честный отказ.
 */
export default function PhoneVerifyPanel({
  onVerified,
  hideField = false,
  phoneDigits,
}: {
  onVerified?: () => void;
  /** Номер уже рисует родитель — поле здесь не дублируем. */
  hideField?: boolean;
  phoneDigits?: string;
}) {
  const { t } = useI18n();
  const { account, updateAccount } = useAuth();
  const [ownDigits, setOwnDigits] = useState(() => extractPhoneDigits(account?.phone ?? ''));
  const digits = phoneDigits ?? ownDigits;
  const setDigits = (value: string) => {
    if (phoneDigits === undefined) setOwnDigits(value);
  };
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(Boolean(account?.phoneVerified));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const session = await supabase!.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/phone', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (cancelled || !res.ok) return;
      setVerified(Boolean(data.verified));
      if (data.phone) setDigits(extractPhoneDigits(String(data.phone)));
    })();
    return () => { cancelled = true; };
  }, []);

  const token = async () => {
    if (!supabase) return '';
    const session = await supabase.auth.getSession();
    return session.data.session?.access_token || '';
  };

  const send = async () => {
    setBusy('send');
    setError('');
    setNotice('');
    try {
      const access = await token();
      const res = await fetch('/api/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.phoneVerifyNoProvider);
      setSent(true);
      setNotice(t.phoneVerifySent);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.phoneVerifyNoProvider);
    } finally {
      setBusy('');
    }
  };

  const confirm = async () => {
    setBusy('check');
    setError('');
    try {
      const access = await token();
      const res = await fetch('/api/phone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify({ phone: digits, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.phoneVerifyWrong);
      setVerified(true);
      setNotice(t.phoneVerifyOk);
      if (data.phone) {
        await updateAccount({ phone: String(data.phone), phoneVerified: true });
      }
      window.dispatchEvent(new CustomEvent('daymohk-phone-verified'));
      onVerified?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.phoneVerifyWrong);
    } finally {
      setBusy('');
    }
  };

  if (verified) {
    return (
      <p className="smk-note smk-note-success flex items-center gap-1.5 px-3 py-2">
        <Check className="h-3.5 w-3.5 shrink-0" />
        {t.phoneVerifiedBadge}
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="smk-text-label leading-relaxed text-slate-600 dark:text-zinc-400">
        {t.phoneVerifyHint}
      </p>
      {!hideField && (
        <PhoneField id="phone-verify" value={digits} onChange={setDigits} required />
      )}
      <button
        type="button"
        onClick={() => void send()}
        disabled={Boolean(busy) || digits.length < 10}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy === 'send' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {sent ? t.phoneVerifyResend : t.phoneVerifySend}
      </button>

      {sent && (
        <>
          <label htmlFor="phone-code" className="smk-sheet-label block">
            {t.phoneVerifyCode}
          </label>
          <input
            id="phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            className="smk-field w-full px-3 py-2.5 text-sm font-bold tracking-[0.3em] text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 dark:text-white"
          />
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={Boolean(busy) || code.length !== 6}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === 'check' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t.phoneVerifyConfirm}
          </button>
        </>
      )}

      {notice && <p className="smk-note smk-note-info px-3 py-2">{notice}</p>}
      {error && <p className="smk-note smk-note-danger px-3 py-2">{error}</p>}
    </div>
  );
}
