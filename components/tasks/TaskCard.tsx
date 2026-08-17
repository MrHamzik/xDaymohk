'use client';

import { Clock, MapPin, Star, Users, Zap, AlertTriangle, CalendarDays } from 'lucide-react';
import TaskAvatar from '@/components/tasks/TaskAvatar';
import { formatTimeLeft } from '@/lib/tasks/client';
import { taskTotalReward, type Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  /** Задание завершено, но я ещё не поставил оценку — жёлтая метка. */
  needsReview?: boolean;
  onOpen: (task: Task) => void;
}

/** Подписи и цвета приоритета: жёлтый — важно, красный — критично. */
const PRIORITY_META = {
  normal: null,
  high: {
    label: 'Приоритет +20%',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    Icon: Zap,
  },
  critical: {
    label: 'Критично +50%',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    Icon: AlertTriangle,
  },
} as const;

export default function TaskCard({ task, needsReview = false, onOpen }: TaskCardProps) {
  const priority = PRIORITY_META[task.priority];
  const total = taskTotalReward(task.reward, task.priority);
  const timeLeft = formatTimeLeft(task.kind === 'urgent' ? task.deadlineAt : task.scheduledAt);
  const isOverdue = timeLeft === 'просрочено';
  const takenSlots = task.takenSlots ?? 0;
  const isFull = takenSlots >= task.slots;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(task);
        }
      }}
      aria-label={`Открыть задание: ${task.title}`}
      className={`group flex cursor-pointer flex-col gap-3 rounded-2xl border p-3.5 shadow-sm transition hover:shadow-md ${
        needsReview
          ? 'border-amber-300 bg-amber-50/50 hover:border-amber-400 dark:border-amber-800 dark:bg-amber-950/20'
          : 'border-slate-200 bg-white hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-emerald-800'
      }`}
    >
      {/* Шапка: по этим цифрам исполнитель решает, стоит ли браться */}
      <div className="flex items-center gap-2.5">
        <TaskAvatar src={task.authorAvatarUrl} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
            {task.authorName || 'Житель Даймохк'}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-zinc-500">
            <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {(task.authorRating ?? 0) > 0 ? task.authorRating?.toFixed(1) : '—'}
            </span>
            <span>· {task.authorAccountDays ?? 0} дн. в сети</span>
            <span>· заданий: {task.authorTasksCreated ?? 0}</span>
          </div>
        </div>
        {task.isPaid && (
          <div className="shrink-0 text-right">
            <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {total} ₽
            </p>
            {total !== task.reward && (
              <p className="text-[10px] text-slate-400 line-through">{task.reward} ₽</p>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">
          {task.title}
        </h3>
        {task.description && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-zinc-400">
            {task.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
        {needsReview && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
            <Star className="h-3 w-3 fill-current" />
            Ожидает оценки
          </span>
        )}
        {priority && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${priority.className}`}>
            <priority.Icon className="h-3 w-3" />
            {priority.label}
          </span>
        )}

        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300">
          {task.kind === 'scheduled' ? <CalendarDays className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          <span className={isOverdue ? 'text-rose-600 dark:text-rose-400' : ''}>
            {task.kind === 'scheduled' ? 'на дату' : 'осталось'}: {timeLeft || '—'}
          </span>
        </span>

        {task.kind === 'scheduled' && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
              isFull
                ? 'bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
            }`}
          >
            <Users className="h-3 w-3" />
            {takenSlots} / {task.slots}
          </span>
        )}

        {typeof task.distanceM === 'number' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            <MapPin className="h-3 w-3" />
            {task.distanceM < 1000 ? `${task.distanceM} м` : `${(task.distanceM / 1000).toFixed(1)} км`}
          </span>
        )}

        {!task.isPaid && (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
            ГIончалла
          </span>
        )}
      </div>

      {task.address && (
        <p className="flex items-center gap-1 truncate text-[11px] text-slate-400 dark:text-zinc-500">
          <MapPin className="h-3 w-3 shrink-0" />
          {task.address}
        </p>
      )}
    </article>
  );
}
