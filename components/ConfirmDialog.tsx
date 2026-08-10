'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  isBusy?: boolean;
}

export default function ConfirmDialog({ isOpen, title, message, confirmLabel, onConfirm, onCancel, danger = false, isBusy = false }: ConfirmDialogProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-950">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-zinc-500">{message}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Закрыть" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} disabled={isBusy} className="rounded-xl border border-slate-200 px-3 py-2.5.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800">Отмена</button>
          <button type="button" onClick={onConfirm} disabled={isBusy} className={`rounded-xl px-3 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{isBusy ? 'Выполняем…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
