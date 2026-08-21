'use client';

import { useEffect, useState } from 'react';
import { Flag, X } from 'lucide-react';
import { Profile } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface ReportDialogProps {
  profile: Profile | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

const REASON_KEYS = ['reportSex', 'reportViolence', 'reportHate', 'reportDanger', 'reportSpam'] as const;

export default function ReportDialog({ profile, isOpen, onClose, onSubmit }: ReportDialogProps) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [addToBlacklist, setAddToBlacklist] = useState(false);

  useLockBody(isOpen);

  useEffect(() => {
    if (isOpen) {
      setPicked('');
      setReason('');
      setError('');
      setAddToBlacklist(false);
    }
  }, [isOpen, profile?.id]);

  if (!isOpen || !profile) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = picked ? (t[picked as keyof typeof t] as string) : '';
    const comment = reason.trim();
    const finalReason = profile.isVerified
      ? 'Заблокирован: жалоба на проверенную анкету'
      : [label, comment].filter(Boolean).join('. ');
    if (!profile.isVerified && !finalReason.trim()) {
      setError(t.reportReasonPick);
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      // У проверенной анкеты кнопка называется «Заблокировать» и
      // галочки ЧС нет — значит блокировка подразумевается самим
      // нажатием, иначе действие не выполнилось бы вовсе.
      const toBlacklist = profile.isVerified || addToBlacklist;
      await onSubmit(toBlacklist ? `${finalReason} [ЧС]` : finalReason);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.taskComplaintError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t.cardReportAria}>
      <form onSubmit={submit} className="smk-sheet w-full rounded-t-2xl p-4 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
              <Flag className="h-5 w-5 shrink-0" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t.cardReport}</h2>
              <p className="truncate text-xs text-slate-500 dark:text-zinc-500">{profile.fullName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className="smk-hit flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"><X className="h-4 w-4" /></button>
        </div>

        {profile.isVerified ? (
          /* Проверенная анкета (п.9).
             Раньше здесь показывался текст ПОДТВЕРЖДЕНИЯ БЛОКИРОВКИ
             («Заблокировать этого человека?..»): человек нажимал
             «Пожаловаться», а читал про блокировку и не понимал, куда
             делись причины жалобы. Объясняем прямо: жаловаться нельзя и
             почему, но заблокировать — можно. */
          <div className="smk-note smk-note-info mt-3 space-y-1 px-3 py-2.5">
            <p className="font-bold">{t.reportVerifiedTitle}</p>
            <p className="leading-relaxed">{t.reportVerifiedText}</p>
          </div>
        ) : (
          <fieldset className="mt-3 space-y-1.5">
            <legend className="smk-sheet-label mb-1.5">{t.reportReasonPick}</legend>
            {REASON_KEYS.map((key) => (
              <label key={key} className="smk-field flex cursor-pointer items-start gap-2 px-3 py-2">
                <input
                  type="radio"
                  name="report-reason"
                  checked={picked === key}
                  onChange={() => setPicked(key)}
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                />
                <span className="smk-text-body text-slate-800 dark:text-zinc-200">{t[key]}</span>
              </label>
            ))}
            <label htmlFor="complaint-reason" className="mt-2 block text-xs font-bold text-slate-700 dark:text-zinc-400">{t.reportCommentOptional}</label>
            <textarea id="complaint-reason" maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full resize-y break-words smk-field px-3 py-2.5 text-xs text-slate-900 dark:text-white" />
          </fieldset>
        )}

        {/* У проверенной анкеты блокировка — единственное доступное
            действие, и отдельная галочка «ещё и заблокировать» рядом с
            кнопкой «Заблокировать» только путала. Показываем её лишь
            там, где есть выбор: жалоба ИЛИ жалоба с блокировкой. */}
        {!profile.isVerified && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400">
            <input type="checkbox" checked={addToBlacklist} onChange={(e) => setAddToBlacklist(e.target.checked)} className="h-4 w-4 rounded text-emerald-600" />
            {t.cardBlock}
          </label>
        )}

        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-zinc-400">{t.cancel}</button>
          <button type="submit" disabled={isSaving} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
            {isSaving ? t.saving : profile.isVerified ? t.cardBlock : t.cardReport}
          </button>
        </div>
      </form>
    </div>
  );
}
