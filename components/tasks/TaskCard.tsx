'use client';

import {
  Clock, MapPin, Star, Users, Zap, AlertTriangle,
  CalendarDays, ChevronRight, ShieldCheck,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import { formatTimeLeft } from '@/lib/tasks/client';
import { taskTotalReward, type Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  /** Задание завершено, но я ещё не поставил оценку — жёлтая метка. */
  needsReview?: boolean;
  onOpen: (task: Task) => void;
}

/** Оформление приоритета: цвет «корешка», подпись и иконка. */
const PRIORITY_META = {
  normal: {
    label: null,
    spine: 'bg-slate-200 dark:bg-zinc-700',
    chip: '',
    Icon: Clock,
  },
  high: {
    label: 'Приоритет +20%',
    spine: 'bg-gradient-to-b from-amber-300 to-amber-500',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    Icon: Zap,
  },
  critical: {
    label: 'Критично +50%',
    spine: 'bg-gradient-to-b from-rose-400 to-rose-600',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
    Icon: AlertTriangle,
  },
} as const;

/**
 * Карточка задания.
 *
 * Дизайн строится слоями: «корешок» приоритета слева, едва заметный
 * вайнахский орнамент фоном, разделители с ромбом вместо сплошных
 * линий, цена на подложке с внутренней обводкой. Никаких вложенных
 * рамок — только заливки и линии, поэтому карточка остаётся плотной
 * и читабельной даже на узком экране.
 */
export default function TaskCard({ task, needsReview = false, onOpen }: TaskCardProps) {
  const priority = PRIORITY_META[task.priority];
  const total = taskTotalReward(task.reward, task.priority);
  const timeLeft = formatTimeLeft(task.kind === 'urgent' ? task.deadlineAt : task.scheduledAt);
  const isOverdue = timeLeft === 'просрочено';
  const takenSlots = task.takenSlots ?? 0;
  const isFull = takenSlots >= task.slots;
  const rating = task.authorRating ?? 0;
  // «Надёжный» — 5+ заданий и рейтинг не ниже 4.5: сигнал исполнителю.
  const isTrusted = rating >= 4.5 && (task.authorTasksCreated ?? 0) >= 5;

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
      className={`smk-card smk-ornament smk-corner group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white text-slate-900 shadow-sm hover:shadow-lg dark:bg-zinc-800 dark:text-white ${
        needsReview
          ? 'border-amber-300/70 hover:border-amber-400 dark:border-amber-800/80'
          : 'border-slate-200/70 hover:border-emerald-300/80 dark:border-zinc-700/80 dark:hover:border-emerald-800'
      }`}
    >
      {/* Слой 3: «корешок» — цвет говорит о срочности до чтения текста */}
      <span className={`smk-spine ${priority.spine}`} aria-hidden />

      {/* ── Шапка: заказчик и цена ─────────────────────────────── */}
      <div className="flex items-start gap-3 py-3.5 pl-4 pr-3.5">
        <div className="relative shrink-0">
          <div className="h-11 w-11 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/70 dark:bg-zinc-950 dark:ring-zinc-700/70">
            <Avatar
              src={task.authorAvatarUrl}
              alt={task.authorName || 'Заказчик'}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          </div>
          {isTrusted && (
            <span
              title="Надёжный заказчик"
              className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white p-0.5 dark:bg-zinc-800"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-bold leading-tight text-slate-900 dark:text-white">
            {task.authorName || 'Житель Даймохк'}
          </h3>
          {/* Слой 5: метаданные с воздухом и ромбами-разделителями */}
          <div className="smk-meta mt-1.5 flex flex-wrap items-center text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {rating > 0 ? rating.toFixed(1) : 'нет оценок'}
            </span>
            <span>{task.authorAccountDays ?? 0} дн.</span>
            <span>{task.authorTasksCreated ?? 0} заданий</span>
          </div>
        </div>

        {task.isPaid ? (
          <div className="smk-price shrink-0">
            <span className="text-[15px] font-extrabold leading-tight text-emerald-700 dark:text-emerald-300">
              {total} ₽
            </span>
            {total !== task.reward && (
              <span className="text-[9px] font-semibold leading-tight text-emerald-600/60 line-through dark:text-emerald-400/50">
                {task.reward} ₽
              </span>
            )}
          </div>
        ) : (
          <span className="smk-price smk-price-teal shrink-0 text-[11px] font-extrabold text-teal-700 dark:text-teal-300">
            Садака
          </span>
        )}
      </div>

      {/* Слой 2: разделитель с ромбом */}
      <div className="smk-divider mx-4" />

      {/* ── Суть задания ───────────────────────────────────────── */}
      <div className="px-4 py-3">
        <h4 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-white">
          {task.title}
        </h4>
        {task.description && (
          <p className="mt-1.5 line-clamp-2 break-words text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
            {task.description}
          </p>
        )}
      </div>

      <div className="smk-divider mx-4" />

      {/* ── Метки ──────────────────────────────────────────────── */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-4 py-3 text-[10px] font-bold">
        {needsReview && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
            <Star className="h-3 w-3 fill-current" />
            Ожидает оценки
          </span>
        )}

        {priority.label && (
          <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${priority.chip}`}>
            <priority.Icon className="h-3 w-3" />
            {priority.label}
          </span>
        )}

        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ${
            isOverdue
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
              : 'bg-slate-100 text-slate-600 dark:bg-zinc-700/70 dark:text-zinc-300'
          }`}
        >
          {/* Слой 7: пульсирующая точка у «горящих» заданий */}
          {task.priority === 'critical' && !isOverdue && (
            <span className="smk-urgent-dot h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
          )}
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

      {/* ── Подвал: адрес и стрелка ────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 py-2.5 pl-4 pr-3.5 dark:border-zinc-700/60 dark:bg-zinc-900/40">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">{task.address || 'Адрес не указан'}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500 dark:text-zinc-600" />
      </div>
    </article>
  );
}
