'use client';

import { useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface PinProposeModalProps {
  isOpen: boolean;
  /** Что предлагаем: анкету или задание. */
  targetType: 'profile' | 'task';
  targetId: string;
  onClose: () => void;
}

type PinStatus = 'idle' | 'busy' | 'done' | 'already' | 'failed';

/**
 * «Скрепка» — предложение анкеты/задания на главную (Этап 2-каталог,
 * п.6). Один аккаунт — одно предложение в день, сброс в 00:00: правило
 * объясняется здесь, проверяется сервером (/api/home-pins) и страхуется
 * уникальным ключом БД. Предложения видны администрации в разделе
 * «Главная страница»; закрепление блоков — следующий этап.
 */
export default function PinProposeModal({ isOpen, targetType, targetId, onClose }: PinProposeModalProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PinStatus>('idle');
  useLockBody(isOpen);

  if (!isOpen) return null;

  const submit = async () => {
    if (!supabase) return;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    setStatus('busy');
    try {
      const res = await fetch('/api/home-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetType, targetId }),
      });
      if (res.ok) setStatus('done');
      else if (res.status === 409) setStatus('already');
      else setStatus('failed');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-propose-title"
    >
      <div className="smk-sheet w-full max-w-xs rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <Paperclip className="h-4 w-4" />
          </div>
          <h2 id="pin-propose-title" className="min-w-0 text-sm font-bold text-slate-900 dark:text-white">
            {t.pinTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
          {t.pinText}
        </p>

        {status === 'done' && (
          <p className="smk-note smk-note-info mt-2 px-2.5 py-2">{t.pinDone}</p>
        )}
        {status === 'already' && (
          <p className="smk-note smk-note-warn mt-2 px-2.5 py-2">{t.pinAlready}</p>
        )}
        {status === 'failed' && (
          <p className="smk-note smk-note-danger mt-2 px-2.5 py-2">{t.pinFailed}</p>
        )}

        {status !== 'done' && (
          <button
            type="button"
            disabled={status === 'busy'}
            onClick={() => void submit()}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {status === 'busy' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t.pinSubmit}
          </button>
        )}
      </div>
    </div>
  );
}
