'use client';

import { Clock, MapPin, Star, Users, Zap, AlertTriangle, CalendarDays, ChevronRight } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { formatTimeLeft } from '@/lib/tasks/client';
import { taskTotalReward, type Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  /** Задание завершено, но я ещё не поставил оценку — жёлтая метка. */
  needsReview?: boolean;
  onOpen: (task: Task) => void;
}

/** Приоритет: жёлтый — важно, красный — критично. */
const PRIORITY_META = {
  normal: null,
  high: {
    label: 'Приоритет',
    surcharge: '+20%',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    Icon: Zap,
  },
  critical: {
    label: 'Критично',
    surcharge: '+50%',
    className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
    Icon: AlertTriangle,
  },
} as const;

/**
 * Карточка задания. Оформление повторяет ProfileCard из каталога:
 * секции разделены тонкими линиями (border-t), а не вложенными
 * рамками — так плотнее и читабельнее.
 */
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
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md dark:bg-zinc-800 ${
        needsReview
          ? 'border-amber-300/70 hover:border-amber-400 dark:border-amber-800'
          : 'border-slate-200/60 hover:border-emerald-300/80 dark:border-zinc-800'
      }`}
    >
      {/* Полоска приоритета — цветовой акцент без рамки */}
      {task.priority !== 'normal' && (
        <div
          className={`h-1 w-full ${
            task.priority === 'critical'
              ? 'bg-gradient-to-r from-rose-400 to-rose-600'
              : 'bg-gradient-to-r from-amber-300 to-amber-500'
          }`}
        />
      )}

      {/* Шапка: заказчик + награда */}
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200/60 bg-slate-100 dark:border-zinc-800/60 dark:bg-zinc-950">
          <Avatar
            src={task.authorAvatarUrl}
            alt={task.authorName || 'Заказчик'}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
            {task.authorName || 'Житель Даймохк'}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-zinc-500">
            <span className="inline-flex items-center gap-0.5 font-bold text-amber-600 dark:text-amber-400">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {(task.authorRating ?? 0) > 0 ? task.authorRating?.toFixed(1) : '—'}
            </span>
            <span className="text-slate-300 dark:text-zinc-700">·</span>
            <span>{task.authorAccountDays ?? 0} дн.</span>
            <span className="text-slate-300 dark:text-zinc-700">·</span>
            <span>заданий: {task.authorTasksCreated ?? 0}</span>
          </div>
        </div>

        {task.isPaid ? (
          <div className="shrink-0 text-right">
            <p className="text-base font-extrabold leading-tight text-emerald-600 dark:text-emerald-400">
              {total} ₽
            </p>
            {total !== task.reward && (
              <p className="text-[10px] leading-tight text-slate-400 line-through">{task.reward} ₽</p>
            )}
          </div>
        ) : (
          <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-extrabold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
            ГIончалла
          </span>
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-zinc-800/70" />

      {/* Суть задания */}
      <div className="px-3.5 py-3 sm:px-4">
        <h4 className="line-clamp-2 text-sm font-bold leading-5 text-slate-900 dark:text-white">
          {task.title}
        </h4>
        {task.description && (
          <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-600 dark:text-zinc-400">
            {task.description}
          </p>
        )}
      </div>

      {/* Метки */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-3.5 pb-3 text-[10px] font-bold sm:px-4">
        {needsReview && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
            <Star className="h-3 w-3 fill-current" />
            Ожидает оценки
          </span>
        )}

        {priority && (
          <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${priority.className}`}>
            <priority.Icon className="h-3 w-3" />
            {priority.label} {priority.surcharge}
          </span>
        )}

        <span
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${
            isOverdue
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
              : 'bg-slate-100 text-slate-600 dark:bg-zinc-700/70 dark:text-zinc-300'
          }`}
        >
          {task.kind === 'scheduled' ? <CalendarDays className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {timeLeft || '—'}
        </span>

        {task.kind === 'scheduled' && (
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${
              isFull
                ? 'bg-slate-100 text-slate-500 dark:bg-zinc-700/70 dark:text-zinc-400'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
            }`}
          >
            <Users className="h-3 w-3" />
            {takenSlots} / {task.slots}
          </span>
        )}

        {typeof task.distanceM === 'number' && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            <MapPin className="h-3 w-3" />
            {task.distanceM < 1000 ? `${task.distanceM} м` : `${(task.distanceM / 1000).toFixed(1)} км`}
          </span>
        )}
      </div>

      {/* Подвал: адрес + стрелка */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50 sm:px-4">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">{task.address || 'Адрес не указан'}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500 dark:text-zinc-600" />
      </div>
    </article>
  );
}
