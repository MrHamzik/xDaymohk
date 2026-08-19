'use client';

import {
  Clock, MapPin, Star, Users, Zap, AlertTriangle, Ban,
  Banknote, CalendarDays, ChevronRight, CreditCard, ShieldAlert, ShieldCheck, Wallet,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useI18n } from '@/lib/i18n';
import { formatTimeLeft, formatTaskDateTime } from '@/lib/tasks/client';
import { taskCostBreakdown, TASK_PRIORITY_SURCHARGE, type Task } from '@/lib/types';
import { isPaymentMethod, type PaymentMethod } from '@/lib/payments';

interface TaskCardProps {
  task: Task;
  /** Задание завершено, но я ещё не поставил оценку — жёлтая метка. */
  needsReview?: boolean;
  onOpen: (task: Task) => void;
}

/** Оформление приоритета: цвет «корешка», чипа и иконка.
 *  Подпись берётся из словаря — здесь только визуал, иначе строка
 *  «Приоритет +20%» осталась бы непереводимой и разъезжалась бы
 *  с реальным процентом из TASK_PRIORITY_SURCHARGE. */
const PRIORITY_META = {
  normal: {
    spine: 'bg-slate-200 dark:bg-zinc-700',
    chip: 'smk-chip--muted',
    Icon: Clock,
  },
  high: {
    spine: 'bg-gradient-to-b from-amber-300 to-amber-500',
    // Цвета меток — из палитры темы, а не литералами Tailwind:
    // иначе в тёмных темах они оставались светлыми пятнами.
    chip: 'smk-note-warn',
    Icon: Zap,
  },
  critical: {
    spine: 'bg-gradient-to-b from-rose-400 to-rose-600',
    chip: 'smk-note-danger',
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
  const { t } = useI18n();
  const priority = PRIORITY_META[task.priority];
  // Процент надбавки берём из единого источника, чтобы подпись на
  // карточке не расходилась с расчётом стоимости.
  const surchargePercent = Math.round(TASK_PRIORITY_SURCHARGE[task.priority] * 100);
  const priorityLabel = task.priority === 'high'
    ? `${t.tasksUrgencyHigh} +${surchargePercent}%`
    : task.priority === 'critical'
    ? `${t.tasksUrgencyCritical} +${surchargePercent}%`
    : null;
  const cost = taskCostBreakdown(task.reward, task.priority, task.purchaseBudget ?? 0);
  // Задания, созданные до появления способов оплаты, колонки не имеют —
  // для них расчёт наличными, как было раньше.
  const payMethod: PaymentMethod = isPaymentMethod(task.paymentMethod)
    ? task.paymentMethod
    : 'cash';
  const total = cost.reward + cost.surcharge;
  const timeLabels = {
    overdue: t.timeOverdue, min: t.timeMin, hour: t.timeHour, day: t.timeDay,
  };
  // «На дату» — конкретный день и час; срочное — обратный отсчёт.
  const timeLeft = task.kind === 'scheduled'
    ? formatTaskDateTime(task.scheduledAt)
    : formatTimeLeft(task.deadlineAt, timeLabels);
  const isOverdue = timeLeft === t.timeOverdue;
  // Спор — самостоятельное состояние, а не срок. Раньше такая карточка
  // показывала часы и «просрочено»: дата у неё уже неактуальна, а
  // иконка и цвет совпадали с обычным отсчётом, и отличить спор от
  // просрочки было нельзя.
  const isDisputed = task.status === 'disputed';
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
      aria-label={`${t.taskOpenAria}: ${task.title}`}
      className={`smk-lux smk-rays smk-enter group flex h-full cursor-pointer flex-col overflow-hidden text-slate-900 dark:text-white ${
        needsReview ? 'ring-1 ring-amber-300/70 dark:ring-amber-700/60' : ''
      } ${
        // Отменённое гасим прозрачностью, а не серым цветом: серый
        // пришлось бы задавать литералом мимо палитры, и в тёмных
        // темах карточка стала бы светлее живых.
        task.status === 'cancelled' ? 'opacity-60' : ''
      }`}
    >
      {/* Слой 3: «корешок» — цвет говорит о срочности до чтения текста */}
      <span className={`smk-spine ${priority.spine}`} aria-hidden />

      {/* ── Шапка: заказчик и цена ─────────────────────────────── */}
      <div className="flex items-start gap-3 py-3.5 pl-4 pr-3.5">
        <div className="relative shrink-0">
          <div className="smk-ring h-11 w-11">
            <Avatar
              src={task.authorAvatarUrl}
              alt={task.authorName || t.taskCustomerFallback}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          </div>
          {isTrusted && (
            <span
              title={t.taskTrusted}
              className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white p-0.5 dark:bg-zinc-800"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="smk-title truncate text-base font-bold leading-tight text-slate-900 dark:text-white">
            {task.authorName || t.taskCustomerDefault}
          </h3>
          {/* Слой 5: метаданные с воздухом и ромбами-разделителями */}
          <div className="smk-meta mt-1.5 flex flex-wrap items-center text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
              <Star className="h-3 w-3 smk-star" />
              {rating > 0 ? rating.toFixed(1) : t.taskNoRatings}
            </span>
            <span>{task.authorAccountDays ?? 0} {t.taskDaysShort}</span>
            <span>{task.authorTasksCreated ?? 0} {t.taskTasksWord}</span>
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
            {t.taskSadaka}
          </span>
        )}
      </div>

      {/* Слой 2: разделитель с ромбом */}
      <hr className="smk-orn mx-4" />

      {/* ── Суть задания ───────────────────────────────────────── */}
      <div className="px-4 py-3">
        <h4 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900 dark:text-white">
          {task.title}
        </h4>
        {task.description && (
          <p className="mt-1.5 line-clamp-2 break-words text-[13px] leading-relaxed text-slate-600 dark:text-zinc-400">
            {task.description}
          </p>
        )}
      </div>

      <hr className="smk-orn mx-4" />

      {/* ── Метки ───────────────────────────────────────────────
          Все метки — один класс .smk-chip: одинаковый размер, скругление
          и отступы. Отличаются только иконка, текст и цвет. Раньше здесь
          мешались .smk-chip (скругление 999px) и rounded-lg с разными
          gap — ряд выглядел собранным из кусков. */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-4 py-3">
        {/* Отменённое задание остаётся в списках неделю — обе стороны
            должны увидеть, что случилось. Метка идёт первой: она
            отменяет смысл всех остальных (срок, места, оплата). */}
        {task.status === 'cancelled' && (
          <span className="smk-chip smk-note-danger">
            <Ban className="h-3 w-3" />
            {t.taskCancelledBadge}
          </span>
        )}

        {needsReview && (
          <span className="smk-chip smk-note-warn">
            <Star className="h-3 w-3" />
            {t.taskAwaitingReview}
          </span>
        )}

        {priorityLabel && (
          <span className={`smk-chip ${priority.chip}`}>
            <priority.Icon className="h-3 w-3" />
            {priorityLabel}
          </span>
        )}

        {isDisputed ? (
          /* У спора нет обратного отсчёта — важно состояние. */
          <span className="smk-chip smk-note-danger">
            <ShieldAlert className="h-3 w-3" />
            {t.taskDisputeShort}
          </span>
        ) : (
          <span className={`smk-chip ${isOverdue ? 'smk-note-danger' : 'smk-chip--muted'}`}>
            {/* Слой 7: пульсирующая точка у «горящих» заданий */}
            {task.priority === 'critical' && !isOverdue && (
              <span className="smk-urgent-dot h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
            )}
            {task.kind === 'scheduled' ? <CalendarDays className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {timeLeft || '—'}
          </span>
        )}

        {task.kind === 'scheduled' && (
          <span className={`smk-chip ${isFull ? 'smk-chip--muted' : 'smk-note-success'}`}>
            <Users className="h-3 w-3" />
            {takenSlots} / {task.slots}
          </span>
        )}

        {/* Способ расчёта — только у платных заданий: в «ГIончалла»
            денег нет, и метка «наличными» там сбивала бы с толку. */}
        {task.isPaid && (
          <span className={`smk-chip ${payMethod === 'cash' ? 'smk-note-success' : 'smk-note-info'}`}>
            {payMethod === 'cash'
              ? <Banknote className="h-3 w-3" />
              : <CreditCard className="h-3 w-3" />}
            {t[`taskPay_${payMethod}` as keyof typeof t] as string}
          </span>
        )}

        {(task.purchaseBudget ?? 0) > 0 && (
          <span title={t.taskPurchaseTip} className="smk-chip smk-note-warn">
            <Wallet className="h-3 w-3" />
            {t.taskPurchaseShort} {task.purchaseBudget} ₽
          </span>
        )}

        {typeof task.distanceM === 'number' && (
          <span className="smk-chip smk-note-info">
            <MapPin className="h-3 w-3" />
            {task.distanceM < 1000 ? `${task.distanceM} м` : `${(task.distanceM / 1000).toFixed(1)} км`}
          </span>
        )}
      </div>

      {/* ── Подвал: адрес и стрелка ────────────────────────────── */}
      {/* Подвал на подложке — как у карточки анкеты: раньше адрес висел
          на голом полотне за тонкой линией и читался как обрезок. */}
      <div className="smk-card-foot flex items-center justify-between gap-2 py-2.5 pl-4 pr-3.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">{task.address || t.taskAddressMissing}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 smk-arrow" />
      </div>
    </article>
  );
}
