'use client';

import { CheckCircle2, X, XCircle } from 'lucide-react';

interface NoticeProps {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
}

export default function Notice({ message, type = 'info', onClose }: NoticeProps) {
  const isError = type === 'error';
  return (
    <div className={`fixed left-1/2 top-20 z-[100] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border p-4 text-sm shadow-2xl backdrop-blur-md ${
      isError
        ? 'border-red-200 bg-red-50/95 text-red-800 dark:border-red-900 dark:bg-red-950/95 dark:text-red-200'
        : type === 'success'
          ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/95 dark:text-emerald-200'
          : 'border-slate-200 bg-white/95 text-slate-700 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300'
    }`} role="alert">
      {isError ? <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
      <p className="min-w-0 flex-1 break-words">{message}</p>
      <button type="button" onClick={onClose} aria-label="Закрыть уведомление" className="shrink-0 rounded-lg p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
