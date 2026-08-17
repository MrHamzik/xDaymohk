'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, Star, MapPin, Clock, Users, CalendarDays, Trash2, ExternalLink, Wallet } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { fetchTask, runTaskAction, submitResidentReview, deleteTask, formatTimeLeft } from '@/lib/tasks/client';
import AttendanceModal from '@/components/tasks/AttendanceModal';
import {
  taskTotalReward,
  TASK_AUTO_CONFIRM_HOURS,
  type Task,
  type TaskParticipant,
} from '@/lib/types';

interface TaskDetailModalProps {
  taskId: string | null;
  currentUserId?: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function TaskDetailModal({
  taskId,
  currentUserId,
  onClose,
  onChanged,
}: TaskDetailModalProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Оценка второй стороны после завершения.
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingText, setRatingText] = useState('');
  // Модалка отметки явки (только для запланированных заданий).
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);

  const load = useCallback(async () => {
    if (!taskId) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchTask(taskId);
      setTask(data.task);
      setParticipants(data.participants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить задание');
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [taskId, onClose]);

  if (!taskId) return null;

  const isAuthor = Boolean(task && currentUserId && task.authorId === currentUserId);
  const myPart = participants.find((p) => p.userId === currentUserId);
  const isExecutor = Boolean(myPart && ['joined', 'attended', 'done'].includes(myPart.status));
  const activeParticipants = participants.filter((p) => ['joined', 'attended', 'done'].includes(p.status));
  const total = task ? taskTotalReward(task.reward, task.priority) : 0;

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
    } finally {
      setBusy('');
    }
  };

  const btn = 'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-60';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="truncate pr-2 text-sm font-extrabold text-slate-900 dark:text-white">
            {task?.title ?? 'Задание'}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {/* Удаление — в шапке, а не среди кнопок внизу: там его
                не находили. Показываем автору всегда; можно ли удалять
                на самом деле, решает сервер и объясняет причину. */}
            {isAuthor && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (!window.confirm('Удалить задание? Его больше не будет в списках.')) return;
                  act('delete', async () => {
                    await deleteTask(task!.id);
                    onClose();
                  });
                }}
                aria-label="Удалить задание"
                title="Удалить задание"
                className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                {busy === 'delete'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          )}

          {task && (
            <>
              {/* Заказчик — по этим цифрам судят, браться ли */}
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/70 dark:bg-zinc-950 dark:ring-zinc-700/70">
                  <Avatar
                    src={task.authorAvatarUrl}
                    alt={task.authorName || 'Заказчик'}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {task.authorName || 'Житель Даймохк'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-0.5 font-bold text-amber-600 dark:text-amber-400">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {(task.authorRating ?? 0) > 0 ? task.authorRating?.toFixed(1) : 'нет оценок'}
                    </span>
                    <span>· {task.authorAccountDays ?? 0} дн. в сети</span>
                    <span>· заданий: {task.authorTasksCreated ?? 0}</span>
                  </div>
                </div>
                {task.isPaid && (
                  <p className="shrink-0 text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                    {total} ₽
                  </p>
                )}
              </div>

              {task.description && (
                <div className="border-t border-slate-100 px-4 py-4 dark:border-zinc-800">
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Подробности
                  </h3>
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-700 dark:text-zinc-300">
                    {task.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-4 py-4 text-[11px] dark:border-zinc-800">
                <InfoRow
                  icon={task.kind === 'scheduled' ? CalendarDays : Clock}
                  label={task.kind === 'scheduled' ? 'Дата работ' : 'Сделать до'}
                  value={formatTimeLeft(task.kind === 'scheduled' ? task.scheduledAt : task.deadlineAt) || '—'}
                />
                {task.kind === 'scheduled' && (
                  <InfoRow icon={Users} label="Мест занято" value={`${task.takenSlots ?? 0} / ${task.slots}`} />
                )}
                {(task.purchaseBudget ?? 0) > 0 && (
                  <InfoRow
                    icon={Wallet}
                    label="Купить на сумму"
                    value={`${task.purchaseBudget} ₽`}
                  />
                )}
              </div>

              {/* Адрес — точно тот же блок, что в карточке анкеты:
                  плитка с иконкой, адрес и ссылка «Открыть на карте». */}
              {(task.address || (typeof task.lat === 'number' && typeof task.lng === 'number')) && (
                <div className="border-t border-slate-100 px-4 py-4 dark:border-zinc-800">
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    Адресс
                  </h3>
                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {task.address || 'Адрес не указан'}
                      </p>
                      {typeof task.lat === 'number' && typeof task.lng === 'number' && (
                        <a
                          href={`https://yandex.ru/maps/?pt=${task.lng},${task.lat}&z=16&l=map`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          Открыть на карте
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Участники: видно, кто взял задание */}
              {activeParticipants.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-4 dark:border-zinc-800">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {task.kind === 'urgent' ? 'Исполнитель' : `Записались (${activeParticipants.length})`}
                  </h3>
                  <div className="space-y-1.5">
                    {activeParticipants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-800/60"
                      >
                        <Avatar src={p.avatarUrl} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {p.fullName || 'Житель'}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                            ★ {(p.rating ?? 0) > 0 ? p.rating?.toFixed(1) : '—'} · выполнено: {p.tasksDoneCount ?? 0}
                          </p>
                        </div>
                        {isAuthor && task.status !== 'completed' && (
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => act('exclude', () => runTaskAction(task.id, 'exclude', { userId: p.userId }))}
                            className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            Исключить
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {task.status === 'awaiting_confirm' && (
                <p className="mx-4 mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Исполнитель отметил работу выполненной. Если не подтвердить за {TASK_AUTO_CONFIRM_HOURS} ч,
                  задание закроется автоматически, а создание новых будет заблокировано.
                </p>
              )}

              {/* Оценка второй стороны после закрытия сделки */}
              {task.status === 'completed' && (isAuthor || isExecutor) && (
                <div className="mx-4 mb-4 rounded-2xl bg-emerald-50/70 p-3.5 dark:bg-emerald-950/30">
                  <h3 className="mb-2 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    {isAuthor ? 'Оцените исполнителя' : 'Оцените заказчика'}
                  </h3>
                  <div className="mb-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`${star} звёзд`}
                        onClick={() => setRatingValue(star)}
                        className="p-0.5"
                      >
                        <Star
                          className={`h-6 w-6 ${
                            star <= ratingValue
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300 dark:text-zinc-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={ratingText}
                    onChange={(e) => setRatingText(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Комментарий (необязательно)"
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      const targetId = isAuthor ? activeParticipants[0]?.userId : task.authorId;
                      if (!targetId) { setError('Некого оценивать'); return; }
                      act('rate', () => submitResidentReview({
                        taskId: task.id, targetId, rating: ratingValue, text: ratingText.trim(),
                      }));
                    }}
                    className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Отправить оценку
                  </button>
                </div>
              )}

              {error && (
                <p className="mx-4 mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* Действия зависят от роли и статуса */}
        {task && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4 dark:border-zinc-800">
            {!isAuthor && !isExecutor && task.status === 'open' && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act('take', () => runTaskAction(task.id, task.kind === 'urgent' ? 'take' : 'join'))}
                className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                {busy === 'take' && <Loader2 className="h-4 w-4 animate-spin" />}
                {task.kind === 'urgent' ? 'Взять задание' : 'Записаться'}
              </button>
            )}

            {isExecutor && ['open', 'in_progress'].includes(task.status) && (
              <>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act('submit', () => runTaskAction(task.id, 'submit'))}
                  className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  {busy === 'submit' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Выполнил
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act('leave', () => runTaskAction(task.id, 'leave'))}
                  className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300`}
                >
                  Отказаться
                </button>
              </>
            )}

            {isAuthor && task.status === 'awaiting_confirm' && (
              <>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act('confirm', () => runTaskAction(task.id, 'confirm'))}
                  className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  {busy === 'confirm' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Подтвердить
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act('reject', () => runTaskAction(task.id, 'reject'))}
                  className={`${btn} border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300`}
                >
                  Не принято
                </button>
              </>
            )}

            {/* Запланированное задание закрывается через отметку явки:
                там же ставятся оценки и бонусы. */}
            {isAuthor
              && task.kind === 'scheduled'
              && ['open', 'in_progress', 'awaiting_confirm'].includes(task.status)
              && activeParticipants.length > 0 && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setIsAttendanceOpen(true)}
                className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                Завершить и отметить явку
              </button>
            )}

            {isAuthor && ['open', 'in_progress'].includes(task.status) && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act('cancel', () => runTaskAction(task.id, 'cancel'))}
                className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700`}
              >
                Отменить задание
              </button>
            )}

          </div>
        )}
      </div>

      {isAttendanceOpen && task && (
        <AttendanceModal
          task={task}
          participants={participants}
          onClose={() => setIsAttendanceOpen(false)}
          onDone={() => { load(); onChanged(); }}
        />
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-800/60">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-slate-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}
