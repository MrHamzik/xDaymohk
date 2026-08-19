'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, Loader2, Star, MapPin, Clock, Users, CalendarDays, ShieldAlert, Trash2,
  Ban, Pencil, Wallet,
} from 'lucide-react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { supabase } from '@/lib/supabase';
import {
  canAcceptPayment, isPaymentMethod, type PaymentMethod, type PayoutMethods,
} from '@/lib/payments';
import {
  fetchTask, runTaskAction, submitResidentReview, deleteTask,
  formatTimeLeft, formatTaskDateTime,
} from '@/lib/tasks/client';
import AttendanceModal from '@/components/tasks/AttendanceModal';
import PayoutPanel from '@/components/tasks/PayoutPanel';
import InteractiveMap from '@/components/InteractiveMapLazy';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { type MapLayerMode } from '@/components/InteractiveMap';
import { useI18n } from '@/lib/i18n';
import { useTaskRealtime } from '@/lib/tasks/realtime';
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
  /** Открыть форму правки. Без обработчика кнопка «Изменить» не показывается. */
  onEdit?: (task: Task) => void;
}

export default function TaskDetailModal({
  taskId,
  currentUserId,
  onClose,
  onChanged,
  onEdit,
}: TaskDetailModalProps) {
  const { t } = useI18n();
  const [task, setTask] = useState<Task | null>(null);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Оценка второй стороны после завершения.
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingText, setRatingText] = useState('');
  // Оценка отправлена в этой сессии просмотра. Без флага блок оценки
  // просто исчезал (задание уходило из pendingReview у родителя), и со
  // стороны это выглядело как «карточка закрылась сама».
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  // Модалка отметки явки (только для запланированных заданий).
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [myPayout, setMyPayout] = useState<PayoutMethods | null>(null);
  // Карта адреса разворачивается по кнопке, а не грузится сразу:
  // Leaflet тянет свой бандл и тайлы, а адрес нужен не в каждом
  // открытии карточки.
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('streets');

  const load = useCallback(async () => {
    if (!taskId) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchTask(taskId);
      setTask(data.task);
      setParticipants(data.participants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.taskLoadOneError);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, t.taskLoadOneError]);

  useEffect(() => { load(); }, [load]);

  // Свои реквизиты: нужны, чтобы предупредить об их отсутствии заранее,
  // а не после отказа сервера. Сервер всё равно проверит повторно —
  // клиентская проверка здесь только ради понятности.
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const loadPayout = async () => {
      if (!supabase) return;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch('/api/payout', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMyPayout(data.payout ?? null);
      } catch {
        // Не получилось — сервер откажет с понятным текстом.
      }
    };
    void loadPayout();
    return () => { cancelled = true; };
  }, [taskId]);

  // Новое задание — новая форма оценки.
  useEffect(() => {
    setRatingSubmitted(false);
    setRatingValue(5);
    setRatingText('');
  }, [taskId]);

  // Открытая карточка живая: нажатие «Выполнил» у второй стороны,
  // отметка явки и новый отзыв применяются без перезахода.
  useTaskRealtime(taskId, load);

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
  // Моя заявка ещё на рассмотрении у заказчика (платные задания).
  const isPendingMe = myPart?.status === 'pending';
  const activeParticipants = participants.filter((p) => ['joined', 'attended', 'done'].includes(p.status));
  const pendingParticipants = participants.filter((p) => p.status === 'pending');

  // «Исключить» после одобрения отклика больше нет.
  //
  // Раньше кнопка висела рядом с уже одобренным исполнителем: заказчик
  // сам выбрал человека, тот приступил к работе — и его можно было
  // выкинуть одним кликом без объяснений. Теперь расстаться с
  // одобренным можно только через «Не принято» (спор с окном 24 ч) или
  // отмену задания с уведомлением. Сервер проверяет то же самое:
  // исключать разрешено, лишь пока статус участника — pending.

  // Заказчик закрывает задание «на дату» через отметку явки — там он
  // уже ставит оценки и бонусы каждому. Показывать ему ещё и общую
  // форму отзыва значит просить оценить второй раз.
  const authorRatesViaAttendance = Boolean(task && task.kind === 'scheduled');
  const total = task ? taskTotalReward(task.reward, task.priority) : 0;

  // Способ расчёта: у заданий, созданных до его появления, колонки нет.
  const payMethod: PaymentMethod = isPaymentMethod(task?.paymentMethod)
    ? task!.paymentMethod as PaymentMethod
    : 'cash';
  // Взять задание с переводом можно только с заполненными реквизитами.
  const canTake = !task?.isPaid || canAcceptPayment(payMethod, myPayout);

  // ── Отметка «Оплата получена» ────────────────────────────────────
  // Нужна только на ПЛАТНЫХ заданиях с переводом: наличные передаются
  // из рук в руки при встрече, там второй клик ничего не доказывает.
  const needsPaymentProof = Boolean(task?.isPaid) && payMethod !== 'cash';
  const isPaymentReceived = Boolean(task?.paymentReceivedAt);
  // Страховка от зависания: если исполнитель отметку так и не поставил,
  // через окно автоподтверждения кнопка заказчика открывается сама —
  // иначе пропавший исполнитель заморозил бы задание навсегда.
  const autoConfirmDue = Boolean(
    task?.submittedAt
    && Date.now() - Date.parse(task.submittedAt) >= TASK_AUTO_CONFIRM_HOURS * 3600_000,
  );
  const canConfirm = !needsPaymentProof || isPaymentReceived || autoConfirmDue;

  // Править условия можно, пока задание открыто и никто не одобрен.
  // Заявки на рассмотрении (pending) не мешают: заказчик ещё никого
  // не выбрал, а откликнувшимся уйдёт уведомление об изменениях.
  const canEdit = Boolean(
    task && task.status === 'open' && activeParticipants.length === 0 && onEdit,
  );


  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.taskActionError);
    } finally {
      setBusy('');
    }
  };

  // Подписи единиц времени для formatTimeLeft (функция вне React).
  const timeLabels = {
    overdue: t.timeOverdue, min: t.timeMin, hour: t.timeHour, day: t.timeDay,
  };

  // Сколько осталось до конца рассмотрения спора. Считаем здесь, ниже
  // timeLabels: тот же форматтер, что у дедлайна задания.
  const disputeLeft = task?.disputeUntil
    ? formatTimeLeft(task.disputeUntil, timeLabels)
    : '';

  const btn = 'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-60';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="smk-sheet-head flex items-center justify-between px-4 pb-3 pt-4">
          <h2 className="truncate pr-2 text-sm font-extrabold text-slate-900 dark:text-white">
            {task?.title ?? t.taskDetailTitle}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="smk-act rounded-lg p-1.5"
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
                    alt={task.authorName || t.taskCustomerFallback}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {task.authorName || t.taskCustomerDefault}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-0.5 font-bold text-amber-600 dark:text-amber-400">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {(task.authorRating ?? 0) > 0 ? task.authorRating?.toFixed(1) : t.taskNoRatings}
                    </span>
                    <span>· {task.authorAccountDays ?? 0} {t.taskDaysOnline}</span>
                    <span>· {t.taskCreatedWord}: {task.authorTasksCreated ?? 0}</span>
                  </div>
                </div>
                {task.isPaid && (
                  <p className="shrink-0 text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                    {total} ₽
                  </p>
                )}
              </div>

              {task.description && (
                <div className="smk-sheet-section px-4 py-4">
                  <h3 className="smk-sheet-label mb-1.5">
                    {t.taskDetailsHeading}
                  </h3>
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-700 dark:text-zinc-300">
                    {task.description}
                  </p>
                </div>
              )}

              <div className="smk-sheet-section grid grid-cols-2 gap-2 px-4 py-4 text-[11px]">
                <InfoRow
                  icon={task.kind === 'scheduled' ? CalendarDays : Clock}
                  label={task.kind === 'scheduled' ? t.taskWhenLabel : t.taskTimeLeftLabel}
                  value={(task.kind === 'scheduled'
                    ? formatTaskDateTime(task.scheduledAt)
                    : formatTimeLeft(task.deadlineAt, timeLabels)) || '—'}
                />
                {task.kind === 'scheduled' && (
                  <InfoRow icon={Users} label={t.taskSlotsTaken} value={`${task.takenSlots ?? 0} / ${task.slots}`} />
                )}
                {(task.purchaseBudget ?? 0) > 0 && (
                  <InfoRow
                    icon={Wallet}
                    label={t.taskBuyFor}
                    value={`${task.purchaseBudget} ₽`}
                  />
                )}
              </div>

              {/* Адрес — точно тот же блок, что в карточке анкеты:
                  плитка с иконкой, адрес и ссылка «Открыть на карте». */}
              {(task.address || (typeof task.lat === 'number' && typeof task.lng === 'number')) && (
                <div className="smk-sheet-section px-4 py-4">
                  <h3 className="smk-sheet-label mb-1.5">
                    {t.taskAddressHeading}
                  </h3>
                  <div className="smk-field flex items-start gap-3 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {task.address || t.taskAddressMissing}
                      </p>
                      {/* «Открыть на карте» открывает НАШУ карту прямо
                          в карточке — как в анкете (WorkplaceSection).
                          Раньше ссылка уводила во внешние Яндекс.Карты:
                          человек уходил из приложения ради точки,
                          которую мы и так умеем показать. */}
                      {typeof task.lat === 'number' && typeof task.lng === 'number' && (
                        <button
                          type="button"
                          onClick={() => setIsMapOpen((open) => !open)}
                          aria-expanded={isMapOpen}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          <MapPin className="h-3 w-3" />
                          {isMapOpen ? t.hideMap : t.openOnMap}
                        </button>
                      )}
                    </div>
                  </div>

                  {isMapOpen && typeof task.lat === 'number' && typeof task.lng === 'number' && (
                    <div className="mt-2.5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="smk-sheet-label">{t.showLabel}</span>
                        <MapSegmentedControl
                          ariaLabel={t.mapTypeAria}
                          active={[mapLayerMode]}
                          onSelect={setMapLayerMode}
                          options={[
                            { value: 'streets' as MapLayerMode, label: t.mapLayerStreets },
                            { value: 'satellite' as MapLayerMode, label: t.mapLayerSatellite },
                            { value: 'hybrid' as MapLayerMode, label: t.mapLayerHybrid },
                          ]}
                        />
                      </div>
                      {/* Карта только на просмотр: точку задал заказчик,
                          менять её из чужой карточки нельзя — поэтому
                          без onSelect. */}
                      <InteractiveMap
                        selectedPosition={{ lat: task.lat, lng: task.lng }}
                        showControls={false}
                        showProfiles={false}
                        showHouses
                        showPlaces
                        mapLayerMode={mapLayerMode}
                        onMapLayerModeChange={setMapLayerMode}
                        className="h-56 overflow-hidden rounded-xl sm:h-72"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Заявки на рассмотрении — только заказчику */}
              {isAuthor && pendingParticipants.length > 0 && (
                <div className="smk-sheet-section px-4 py-4">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    {t.taskPendingHeading} ({pendingParticipants.length})
                  </h3>
                  <div className="space-y-1.5">
                    {pendingParticipants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-xl bg-amber-50/70 p-2.5 dark:bg-amber-950/20"
                      >
                        <Avatar src={p.avatarUrl} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
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
                          disabled={Boolean(busy)}
                          onClick={() => act('approve', () => runTaskAction(task.id, 'approve', { userId: p.userId }))}
                          className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {t.taskApproveBtn}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => act('decline', () => runTaskAction(task.id, 'decline', { userId: p.userId }))}
                          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:hover:bg-rose-950/40"
                        >
                          {t.taskDeclineBtn}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Моя заявка ждёт решения заказчика */}
              {isPendingMe && (
                <p className="smk-note smk-note-warn mx-4 mb-4 px-3.5 py-2.5">
                  {t.taskPendingMine}
                </p>
              )}

              {/* Участники: видно, кто взял задание */}
              {activeParticipants.length > 0 && (
                <div className="smk-sheet-section px-4 py-4">
                  <h3 className="smk-sheet-label mb-2">
                    {task.kind === 'urgent' ? t.taskExecutorHeading : `${t.taskJoinedHeading} (${activeParticipants.length})`}
                  </h3>
                  <div className="space-y-1.5">
                    {activeParticipants.map((p) => (
                      <div
                        key={p.id}
                        className="smk-sheet-row flex items-center gap-2 p-2.5"
                      >
                        <Avatar src={p.avatarUrl} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {p.fullName || t.attendanceResident}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                            ★ {(p.rating ?? 0) > 0 ? p.rating?.toFixed(1) : '—'} · выполнено: {p.tasksDoneCount ?? 0}
                          </p>
                        </div>
                        {/* «Исключить» здесь больше нет: этот список —
                            уже ОДОБРЕННЫЕ исполнители. Кнопка живёт
                            только в блоке заявок на рассмотрении
                            («Отклонить»), а расстаться с одобренным
                            можно через «Не принято» или отмену. */}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Оплата идёт вне приложения — говорим об этом прямо, иначе
                  обе стороны ждут, что деньги переведёт сервис. */}
              {task.isPaid && (isAuthor || isExecutor)
                && ['open', 'in_progress', 'awaiting_confirm'].includes(task.status) && (
                <div className="smk-note smk-note-info mx-4 mb-4 px-3.5 py-3">
                  <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                    <Wallet className="h-3.5 w-3.5" />
                    {t.taskPayoutTitle}
                  </h3>
                  <p className="text-[11px] leading-relaxed">
                    {t.taskPayoutNote}
                  </p>
                </div>
              )}

              {/* Реквизиты исполнителя — заказчику, когда работа сдана.
                  Показываются только ему и только после одобрения
                  отклика: проверку делает сервер (/api/payout). */}
              {isAuthor && task.isPaid
                && ['awaiting_confirm', 'completed'].includes(task.status) && (
                <PayoutPanel taskId={task.id} amount={total} />
              )}

              {task.status === 'awaiting_confirm' && (
                <p className="smk-note smk-note-warn mx-4 mb-4 px-3.5 py-2.5">
                  {t.taskAwaitConfirmNote.replace('{hours}', String(TASK_AUTO_CONFIRM_HOURS))}
                </p>
              )}

              {/* Отменённое задание: объясняем обеим сторонам, что
                  произошло и сколько оно ещё будет видно. Раньше оно
                  просто пропадало у заказчика и висело как живое у
                  исполнителя. */}
              {task.status === 'cancelled' && (
                <div className="smk-note smk-note-danger mx-4 mb-4 px-3.5 py-3">
                  <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                    <Ban className="h-3.5 w-3.5" />
                    {t.taskCancelledBadge}
                  </h3>
                  {task.cancelReason && (
                    <p className="mb-1.5 break-words text-[11px] leading-relaxed">
                      «{task.cancelReason}»
                    </p>
                  )}
                  <p className="text-[11px] leading-relaxed">
                    {t.taskCancelledNote}
                  </p>
                </div>
              )}

              {/* Спор об оплате: заказчик не принял работу.
                  Показываем обеим сторонам — исполнителю важно знать
                  причину, заказчику — что задание заморожено и удалить
                  его сейчас нельзя. */}
              {task.status === 'disputed' && (
                <div className="smk-note smk-note-danger mx-4 mb-4 px-3.5 py-3">
                  <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {t.taskDisputeTitle}
                  </h3>
                  {task.disputeReason && (
                    <p className="mb-1.5 break-words text-[11px] leading-relaxed">
                      «{task.disputeReason}»
                    </p>
                  )}
                  <p className="text-[11px] leading-relaxed">
                    {isAuthor ? t.taskDisputeAuthor : t.taskDisputeExecutor}
                  </p>
                  {disputeLeft && (
                    <p className="mt-1.5 text-[11px] font-bold">
                      {t.taskDisputeLeft.replace('{time}', disputeLeft)}
                    </p>
                  )}
                </div>
              )}

              {/* Подтверждение вместо исчезающей формы */}
              {task.status === 'completed' && ratingSubmitted
                && !(isAuthor && authorRatesViaAttendance) && (
                <p className="smk-note smk-note-success mx-4 mb-4 px-3.5 py-3">
                  {t.taskRatingSaved}
                </p>
              )}

              {/* Оценка второй стороны после закрытия сделки */}
              {task.status === 'completed' && !ratingSubmitted
                && !(isAuthor && authorRatesViaAttendance)
                && (isAuthor || isExecutor) && (
                <div className="mx-4 mb-4 rounded-2xl bg-emerald-50/70 p-3.5 dark:bg-emerald-950/30">
                  <h3 className="mb-2 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    {isAuthor ? t.taskRateExecutor : t.taskRateCustomer}
                  </h3>
                  <div className="mb-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`${star} ${t.taskStarsAria}`}
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
                    placeholder={t.taskRatingComment}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      const targetId = isAuthor ? activeParticipants[0]?.userId : task.authorId;
                      if (!targetId) { setError(t.taskNobodyToRate); return; }
                      act('rate', async () => {
                        await submitResidentReview({
                          taskId: task.id, targetId, rating: ratingValue, text: ratingText.trim(),
                        });
                        setRatingSubmitted(true);
                      });
                    }}
                    className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {t.taskSendRating}
                  </button>
                </div>
              )}

              {error && (
                <p className="smk-note smk-note-danger mx-4 mb-4 px-3.5 py-2.5">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* Действия зависят от роли и статуса */}
        {task && (
          <div className="smk-sheet-section smk-sheet-foot flex flex-wrap gap-2 p-4">
            {!isAuthor && !isExecutor && !isPendingMe && task.status === 'open' && (
              <>
                <button
                  type="button"
                  disabled={Boolean(busy) || !canTake}
                  onClick={() => act('take', () => runTaskAction(task.id, task.kind === 'urgent' ? 'take' : 'join'))}
                  className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  {busy === 'take' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {task.isPaid
                    ? t.taskTakeRequestBtn
                    : task.kind === 'urgent' ? t.taskTakeBtn : t.taskJoinBtn}
                </button>

                {/* Объясняем, ПОЧЕМУ кнопка недоступна, и даём путь к
                    решению: неактивная кнопка без причины выглядит как
                    поломка. */}
                {!canTake && (
                  <p className="smk-note smk-note-warn w-full px-3 py-2">
                    {t.taskNeedPayout.replace(
                      '{method}',
                      t[`taskPay_${payMethod}` as keyof typeof t] as string,
                    )}{' '}
                    <Link href="/settings" className="font-bold underline">
                      {t.taskNeedPayoutLink}
                    </Link>
                  </p>
                )}
              </>
            )}

            {/* Заявку можно отозвать, пока заказчик не ответил */}
            {isPendingMe && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act('leave', () => runTaskAction(task.id, 'leave'))}
                className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300`}
              >
                {t.taskWithdrawBtn}
              </button>
            )}

            {/* «Выполнил» — только на срочных заданиях. Задание «на дату»
                закрывает заказчик отметкой явки: он видит, кто пришёл, и
                там же ставит оценки с бонусами. Кнопка у исполнителя
                переводила задание в awaiting_confirm и ломала этот путь. */}
            {isExecutor && task.kind === 'urgent' && ['open', 'in_progress'].includes(task.status) && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act('submit', () => runTaskAction(task.id, 'submit'))}
                className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                {busy === 'submit' && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.taskSubmitBtn}
              </button>
            )}

            {/* Отметка исполнителя «Оплата получена».
                Пока её нет, заказчик не может закрыть задание с
                переводом: иначе он нажимал «Подтвердить», сделка
                считалась успешной, а денег исполнитель не видел. */}
            {isExecutor && needsPaymentProof && task.status === 'awaiting_confirm' && (
              isPaymentReceived ? (
                <p className="smk-note smk-note-success w-full px-3 py-2">
                  {t.taskPaymentReceivedDone}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => act('paid', () => runTaskAction(task.id, 'paid'))}
                    className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                  >
                    {busy === 'paid' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t.taskPaymentReceivedBtn}
                  </button>
                  <p className="smk-note smk-note-warn w-full px-3 py-2">
                    {t.taskPaymentReceivedHint}
                  </p>
                </>
              )
            )}

            {isExecutor && ['open', 'in_progress'].includes(task.status) && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act('leave', () => runTaskAction(task.id, 'leave'))}
                className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300`}
              >
                {t.taskLeaveBtn}
              </button>
            )}

            {isAuthor && task.status === 'awaiting_confirm' && (
              <>
                <button
                  type="button"
                  disabled={Boolean(busy) || !canConfirm}
                  onClick={() => act('confirm', () => runTaskAction(task.id, 'confirm'))}
                  className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  {busy === 'confirm' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t.taskConfirmBtn}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act('reject', () => runTaskAction(task.id, 'reject'))}
                  className={`${btn} border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300`}
                >
                  {t.taskRejectBtn}
                </button>

                {/* Неактивная кнопка без причины выглядит поломкой —
                    объясняем, чего ждём и что нужно сделать. */}
                {!canConfirm && (
                  <p className="smk-note smk-note-warn w-full px-3 py-2">
                    {t.taskConfirmLockedNote.replace(
                      '{hours}',
                      String(TASK_AUTO_CONFIRM_HOURS),
                    )}
                  </p>
                )}
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
                {t.taskFinishAttendanceBtn}
              </button>
            )}

            {/* Правка условий — только пока задание открыто и никого
                не одобрили. После одобрения исполнитель уже рассчитывает
                на эти награду, адрес и срок: менять их задним числом
                значит переписать договор после рукопожатия. Сервер
                проверяет то же самое (PATCH /api/tasks/:id). */}
            {isAuthor && canEdit && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => onEdit?.(task)}
                className={`${btn} smk-field text-slate-700 hover:brightness-95 dark:text-zinc-200 dark:hover:brightness-110`}
              >
                <Pencil className="h-4 w-4" />
                {t.taskEditBtn}
              </button>
            )}

            {/* Одна кнопка вместо пары «корзина + отменить»: пока
                задание никто не взял — оно просто удаляется, после
                этого остаётся только отмена, чтобы исполнитель получил
                уведомление. Пользователю не нужно выбирать между ними. */}
            {isAuthor && ['open', 'in_progress'].includes(task.status) && (() => {
              const canDelete = task.status === 'open' && activeParticipants.length === 0;
              return (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (canDelete) {
                      if (!window.confirm(t.taskDeleteConfirm)) return;
                      act('delete', async () => {
                        await deleteTask(task.id);
                        onClose();
                      });
                      return;
                    }
                    if (!window.confirm(t.taskCancelConfirm)) return;
                    act('cancel', () => runTaskAction(task.id, 'cancel'));
                  }}
                  className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70`}
                >
                  {busy === 'delete' || busy === 'cancel'
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                  {canDelete ? t.taskDeleteBtn : t.taskCancelBtn}
                </button>
              );
            })()}

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
  // Одна строка: подпись слева, значение справа. Двухэтажный вариант
  // разрывал короткие пары вроде «Осталось · 2 ч» без пользы.
  return (
    <div className="smk-sheet-row flex items-center justify-between gap-2 px-2.5 py-2">
      <span className="smk-sheet-label flex shrink-0 items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="truncate text-xs font-bold text-slate-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}
