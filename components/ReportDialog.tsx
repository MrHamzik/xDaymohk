'use client';

import { useEffect, useState } from 'react';
import { Flag, X } from 'lucide-react';
import { Profile } from '@/lib/types';

interface ReportDialogProps {
  profile: Profile | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export default function ReportDialog({ profile, isOpen, onClose, onSubmit }: ReportDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [addToBlacklist, setAddToBlacklist] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen || !profile) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const finalReason = profile.isVerified ? "Заблокирован: жалоба на проверенную анкету" : reason;
    if (!profile.isVerified && !finalReason.trim()) {
      setError('Опишите причину жалобы.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      if (addToBlacklist) {
        // Here we could technically add to blacklist, but for now we'll just submit the complaint
        await onSubmit(finalReason + (addToBlacklist ? " [ЧС]" : ""));
      } else {
        await onSubmit(finalReason);
      }
      setReason('');
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось отправить жалобу.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Пожаловаться на анкету и пользователя">
      <form onSubmit={submit} className="w-full rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-zinc-950 sm:max-w-md sm:rounded-2xl border border-slate-200/50 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
              <Flag className="h-5 w-5 shrink-0" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Пожаловаться на анкету</h2>
              <p className="truncate text-xs text-slate-500 dark:text-zinc-500">Анкета: {profile.fullName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"><X className="h-4 w-4" /></button>
        </div>

        {profile.isVerified ? (
          <p className="mt-3 text-xs text-slate-600 dark:text-zinc-400">Этот пользователь проверен администрацией. Жалоба приведет к блокировке.</p>
        ) : (
          <>
            <label htmlFor="complaint-reason" className="mt-3 block text-xs font-bold text-slate-700 dark:text-zinc-400">Причина жалобы</label>
            <textarea id="complaint-reason" maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например: неверные контакты или описание услуги" className="mt-1 w-full resize-y break-words rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" />
            <p className="mt-0.5 text-right text-[10px] text-slate-400">{reason.length}/500</p>
          </>
        )}
        
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400">
          <input type="checkbox" checked={addToBlacklist} onChange={(e) => setAddToBlacklist(e.target.checked)} className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500" />
          Добавить в чёрный список
        </label>

        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2.5.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">Отмена</button>
          <button type="submit" disabled={isSaving} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
            {isSaving ? 'Отправляем...' : profile.isVerified ? 'Заблокировать' : 'Отправить жалобу'}
          </button>
        </div>
      </form>
    </div>
  );
}
