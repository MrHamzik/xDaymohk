'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Star, Check, UserX } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useI18n } from '@/lib/i18n';
import { runTaskAction, submitResidentReview } from '@/lib/tasks/client';
import { taskTotalReward, type Task, type TaskParticipant } from '@/lib/types';

interface AttendanceModalProps {
  task: Task;
  participants: TaskParticipant[];
  onClose: () => void;
  onDone: () => void;
}

interface Row {
  attended: boolean;
  bonusPercent: number;
  rating: number;
  text: string;
}

/**
 * Завершение запланированного задания: заказчик отмечает, кто пришёл,
 * ставит оценку и может добавить бонус до +20 % сверх награды.
 *
 * Снижения оплаты нет намеренно: работа сделана — платят полностью,
 * недовольство выражается рейтингом (иначе односторонний штраф после
 * выполненной работы юридически спорен).
 */
export default function AttendanceModal({
  task,
  participants,
  onClose,
  onDone,
}: AttendanceModalProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const active = participants.filter((p) => ['joined', 'attended', 'done'].includes(p.status));

  useEffect(() => {
    // По умолчанию считаем, что пришли все: заказчику проще снять
    // галочку у одного, чем отметить десятерых.
    const initial: Record<string, Row> = {};
    for (const p of active) {
      initial[p.userId] = { attended: true, bonusPercent: 0, rating: 5, text: '' };
    }
    setRows(initial);
    // active пересобирается каждый рендер — завязываемся на состав по id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.map((p) => p.userId).join(',')]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const base = taskTotalReward(task.reward, task.priority);
  const attendedCount = Object.values(rows).filter((r) => r.attended).length;
  const totalPayout = Object.values(rows)
    .filter((r) => r.attended)
    .reduce((sum, r) => sum + Math.round(base * (1 + r.bonusPercent / 100)), 0);

  const patch = (userId: string, next: Partial<Row>) => {
    setRows((cur) => ({ ...cur, [userId]: { ...cur[userId], ...next } }));
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    setError('');
    try {
      // 1. Явка и бонусы одним запросом — сервер закрывает задание.
      await runTaskAction(task.id, 'attend', {
        attendance: active.map((p) => ({
          userId: p.userId,
          attended: rows[p.userId]?.attended ?? false,
          bonusPercent: rows[p.userId]?.bonusPercent ?? 0,
        })),
      });

      // 2. Оценки пришедшим. Ошибку одной оценки не считаем фатальной:
      //    явка уже сохранена, повторно её отправлять нельзя.
      for (const p of active) {
        const row = rows[p.userId];
        if (!row?.attended) continue;
        try {
          await submitResidentReview({
            taskId: task.id,
            targetId: p.userId,
            rating: row.rating,
            text: row.text.trim(),
          });
        } catch {
          // пропускаем — оценку можно поставить позже из карточки
        }
      }

      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.attendanceSaveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-title"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="smk-sheet-head flex items-center justify-between px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id="attendance-title" className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
              {t.attendanceTitle}
            </h2>
            <p className="truncate text-[11px] text-slate-500 dark:text-zinc-500">{task.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:bg-zinc-800/60 dark:text-zinc-400">
            {t.attendanceHint}
          </p>

          {active.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-400">
              {t.attendanceNobody}
            </p>
          )}

          {active.map((p) => {
            const row = rows[p.userId] ?? { attended: true, bonusPercent: 0, rating: 5, text: '' };
            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-3 transition ${
                  row.attended
                    ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20'
                    : 'border-slate-200 bg-slate-50 opacity-70 dark:border-zinc-700 dark:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar src={p.avatarUrl} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {p.fullName || t.attendanceResident}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                      ★ {(p.rating ?? 0) > 0 ? p.rating?.toFixed(1) : '—'} · {t.attendanceDoneCount}: {p.tasksDoneCount ?? 0}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.attended}
                    onClick={() => patch(p.userId, { attended: !row.attended })}
                    className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                      row.attended
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {row.attended ? <Check className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                    {row.attended ? t.attendanceCame : t.attendanceMissed}
                  </button>
                </div>

                {row.attended && (
                  <div className="mt-3 space-y-2 border-t border-emerald-200/60 pt-2.5 dark:border-emerald-900/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {t.attendanceRating}
                      </span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            aria-label={`${star} ${t.taskStarsAria}`}
                            onClick={() => patch(p.userId, { rating: star })}
                          >
                            <Star
                              className={`h-5 w-5 ${
                                star <= row.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300 dark:text-zinc-600'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    {task.isPaid && (
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {t.attendanceBonus} +{row.bonusPercent}%
                          </span>
                          <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                            {Math.round(base * (1 + row.bonusPercent / 100))} ₽
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={20}
                          step={5}
                          value={row.bonusPercent}
                          onChange={(e) => patch(p.userId, { bonusPercent: Number(e.target.value) })}
                          aria-label={`${t.attendanceBonusAria}: ${p.fullName || ''}`.trim()}
                          className="mt-1 w-full accent-emerald-600"
                        />
                      </div>
                    )}

                    <input
                      value={row.text}
                      onChange={(e) => patch(p.userId, { text: e.target.value })}
                      maxLength={500}
                      placeholder={t.taskRatingComment}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="smk-sheet-section smk-sheet-foot p-4">
          {task.isPaid && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-zinc-800/60">
              <span className="font-semibold text-slate-600 dark:text-zinc-400">
                {t.attendanceCameCount} {attendedCount} {t.attendanceOf} {active.length}
              </span>
              <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                {t.attendancePayout}: {totalPayout} ₽
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || active.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.attendanceFinishBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
