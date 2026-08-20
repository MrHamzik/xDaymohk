'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import PhoneField from '@/components/PhoneField';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { extractPhoneDigits } from '@/lib/phone';

/**
 * Телефон без SMS: номер сохраняется как есть.
 */
export default function PhoneVerifyPanel({
  onVerified,
  hideField = false,
  phoneDigits,
}: {
  onVerified?: () => void;
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
  const [saved, setSaved] = useState(Boolean(account?.phone));
  const [busy, setBusy] = useState(false);
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
      if (data.phone) {
        setDigits(extractPhoneDigits(String(data.phone)));
        setSaved(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!supabase) throw new Error(t.phoneSaveFailed);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || '';
      const res = await fetch('/api/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.phoneSaveFailed);
      setSaved(true);
      setNotice(t.phoneSaveOk);
      if (data.phone) {
        await updateAccount({ phone: String(data.phone), phoneVerified: true });
      }
      window.dispatchEvent(new CustomEvent('daymohk-phone-verified'));
      onVerified?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.phoneSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="smk-text-label leading-relaxed text-slate-600 dark:text-zinc-400">
        {t.phoneVerifyHint}
      </p>
      {!hideField && (
        <PhoneField id="phone-save" value={digits} onChange={setDigits} required />
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || digits.length < 10}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t.save}
      </button>
      {saved && !notice && (
        <p className="smk-note smk-note-success flex items-center gap-1.5 px-3 py-2">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {t.phoneVerifiedBadge}
        </p>
      )}
      {notice && <p className="smk-note smk-note-success px-3 py-2">{notice}</p>}
      {error && <p className="smk-note smk-note-danger px-3 py-2">{error}</p>}
    </div>
  );
}
