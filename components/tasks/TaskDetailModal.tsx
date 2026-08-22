'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, Loader2, Star, MapPin, Clock, Users, CalendarDays, ShieldAlert, Trash2,
  Ban, Check, Pencil, Wallet, Share2, Copy, Phone, MessageSquare, Send, Flag, ShieldBan, Paperclip,
} from 'lucide-react';
import PinProposeModal from '@/components/PinProposeModal';
import PayoutPeekSheet from '@/components/settings/PayoutPeekSheet';
import Avatar from '@/components/Avatar';
import { supabase } from '@/lib/supabase';
import { findClosestSamashkiHouse } from '@/lib/samashki-addresses';
import { Route as RouteIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { getUserCoords } from '@/lib/geo';

const TaxiMapModal = dynamic(() => import('@/components/taxi/TaxiMapModal'), { ssr: false });
import {
  canAcceptPayment, isPaymentMethod, type PaymentMethod, type PayoutMethods,
} from '@/lib/payments';
import {
  fetchTask, runTaskAction, submitResidentReview, deleteTask,
  formatTimeLeft, formatTaskDateTime,
} from '@/lib/tasks/client';
import AttendanceModal from '@/components/tasks/AttendanceModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import DisputeComplaintModal from '@/components/tasks/DisputeComplaintModal';
import PayoutPanel from '@/components/tasks/PayoutPanel';
import { PayoutQrBlock } from '@/components/tasks/PayoutQrCode';
import InteractiveMap from '@/components/InteractiveMapLazy';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { type MapLayerMode } from '@/components/InteractiveMap';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import { useBlacklist } from '@/components/BlacklistProvider';
import { useSheetSwipe } from '@/lib/hooks/useSheetSwipe';
import { useLockBody } from '@/lib/hooks/useLockBody';
import { shareLink, siteOrigin } from '@/lib/share';
import { haptic } from '@/lib/haptics';
import { useTaskRealtime } from '@/lib/tasks/realtime';
import {
  taskTotalReward,
  TASK_AUTO_CONFIRM_HOURS,
  TASK_DISPUTE_HOURS,
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
  /** Создать такое же новое задание. */
  onRepeat?: (task: Task) => void;
}

export default function TaskDetailModal({
  taskId,
  currentUserId,
  onClose,
  onChanged,
  onEdit,
  onRepeat,
}: TaskDetailModalProps) {
  const { t } = useI18n();
  // «Скрыть подсказки» прячет только статичные пояснения. Сообщения о
  // состоянии и причины неактивных кнопок остаются всегда.
  const { settings } = useSettings();
  const { block } = useBlacklist();
  const showHints = !settings.hideHints;
  const swipe = useSheetSwipe(onClose);
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
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeFrom, setRouteFrom] = useState<{ lat: number; lng: number } | null>(null);

  // Путь от исполнителя до точки заказчика (п.5).
  const openRoute = async () => {
    let from: { lat: number; lng: number } | null = null;
    try { from = await getUserCoords(true); } catch { from = null; }
    setRouteFrom(from);
    setRouteOpen(true);
  };
  // Жалоба по спору: модалка поверх карточки, чтобы не терять контекст.
  const [isComplaintOpen, setIsComplaintOpen] = useState(false);
  // Что подтверждаем: удаление (никто не взял) или отмену (взяли).
  const [confirmClose, setConfirmClose] = useState<'delete' | 'cancel' | null>(null);
  const [complaintSent, setComplaintSent] = useState(false);
  // Блокировка автора задания из шапки (п.7).
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [shareHint, setShareHint] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
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
  useLockBody(Boolean(taskId));

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [taskId, onClose]);

  /**
   * Выбор точки на карте автором.
   *
   * Клик по карте отдаёт только координаты (адрес приходит лишь при
   * выборе объекта), поэтому приводим точку к ближайшему известному
   * дому — так же, как в форме создания и в редакторе анкеты. Иначе у
   * задания были бы координаты без адреса, и исполнитель не понял бы,
   * куда ехать.
   *
   * Дальше открываем форму правки с новым адресом: сохранять молча
   * нельзя, заказчик должен увидеть, что именно поменялось.
   *
   * ВАЖНО: хук объявлен ДО `if (!taskId) return null` ниже. React
   * требует одинакового порядка хуков между рендерами, а при закрытой
   * карточке компонент выходит раньше — useCallback после выхода
   * вызывал «Rendered fewer hooks than expected» при открытии.
   */
  const handleMapPick = useCallback((
    position: { lat: number; lng: number },
    explicitAddress?: string,
  ) => {
    if (!task || !onEdit) return;
    const picked = explicitAddress
      ? { address: explicitAddress, lat: position.lat, lng: position.lng }
      : (() => {
        const closest = findClosestSamashkiHouse(position);
        return { address: closest.fullAddress, lat: closest.lat, lng: closest.lng };
      })();
    setIsMapOpen(false);
    onEdit({ ...task, ...picked });
  }, [task, onEdit]);

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

  // Править условия можно, пока работу не сдали.
  //
  // После одобрения правка тоже разрешена (обновление 42): одобренный
  // отклик вернётся «на рассмотрение», исполнитель заново примет
  // условия. А вот после «Выполнил» поздно — он делал работу по
  // прежним договорённостям.
  const canEdit = Boolean(
    task && ['open', 'in_progress'].includes(task.status) && onEdit,
  );

  // Мои изменённые условия, которые я ещё не принял.
  const myNeedsConsent = Boolean(myPart?.needsConsent);

  // В споре согласие нужно от обеих сторон.
  const iAgreedDispute = isAuthor
    ? Boolean(task?.disputeAuthorOk)
    : Boolean(task?.disputeExecutorOk);
  const otherAgreedDispute = isAuthor
    ? Boolean(task?.disputeExecutorOk)
    : Boolean(task?.disputeAuthorOk);



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
        {/* Шапка задания в две строки (п.11).
            Когда к иконкам добавились «Пожаловаться» и «Заблокировать»,
            ряд кнопок занял половину ширины, и название задания в той же
            строке обрезалось многоточием уже на втором-третьем слове.
            Теперь сверху — только ряд иконок, а название идёт отдельной
            строкой под ним и переносится целиком. */}
        <div
          className="smk-sheet-head flex flex-col gap-2 px-4 pb-3 pt-3"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div className="flex shrink-0 items-center justify-end gap-1">
            {task && (
              <button
                type="button"
                onClick={() => {
                  void shareLink(
                    task.title,
                    task.title,
                    `${siteOrigin()}/${task.isPaid ? 'temshik' : 'goncholla'}?task=${encodeURIComponent(task.id)}`,
                  ).then((result) => {
                    if (result === 'copied') {
                      setShareHint(true);
                      window.setTimeout(() => setShareHint(false), 2000);
                    }
                  });
                }}
                aria-label={t.shareAction}
                className="smk-act rounded-lg p-1.5"
              >
                <Share2 className="h-4 w-4" />
              </button>
            )}
            {/* Скрепка: предложить задание на главную (раз в день). */}
            {currentUserId && (
              <button
                type="button"
                onClick={() => setPinOpen(true)}
                aria-label={t.pinTitle}
                title={t.pinTitle}
                className="smk-act flex h-7 w-7 items-center justify-center"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            )}
            {/* Жалоба и блокировка — те же действия и в том же месте,
                что в шапке анкеты (п.7). Раньше пожаловаться можно было
                только по спорному заданию, из глубины карточки: на
                обычное объявление управы не было вовсе.

                Своё задание не блокируют и на себя не жалуются, поэтому
                автору кнопки не показываем. */}
            {task && !isAuthor && currentUserId && (
              <>
                <button
                  type="button"
                  onClick={() => setIsComplaintOpen(true)}
                  aria-label={t.cardReportAria}
                  title={t.cardReport}
                  className="smk-act flex h-7 w-7 items-center justify-center text-[var(--smk-gold-deep)]"
                >
                  <Flag className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBlock(true)}
                  disabled={blockBusy}
                  aria-label={t.profileBlockUser}
                  title={t.profileBlockUser}
                  className="smk-act smk-act--danger flex h-7 w-7 items-center justify-center"
                >
                  <ShieldBan className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="smk-act rounded-lg p-1.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 className="break-words text-sm font-extrabold leading-snug text-slate-900 dark:text-white">
            {task?.title ?? t.taskDetailTitle}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shareHint && (
            <p className="smk-note smk-note-success mx-4 mt-3 px-3 py-2">{t.shareCopied}</p>
          )}
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
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-400">
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

              {/* Связь с заказчиком (обновление 56).
                  Номера приходят из анкеты автора и только теми
                  каналами, которые он разрешил на этом задании.
                  Вьюха уже вернула пустую строку, если показ запрещён
                  или посетитель не вошёл, — здесь просто нечего рисовать. */}
              {(task.authorPhone || task.authorWhatsapp || task.authorTelegram) && (
                <div className="flex items-center gap-2 px-4 pb-4">
                  {task.authorPhone && (
                    <a
                      href={`tel:${task.authorPhone}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-95"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {t.callBtn}
                    </a>
                  )}
                  {task.authorWhatsapp && (
                    <a
                      href={`https://wa.me/${task.authorWhatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 active:scale-95"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  )}
                  {task.authorTelegram && (
                    <a
                      href={`https://t.me/${task.authorTelegram.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Telegram"
                      title="Telegram"
                      className="rounded-xl bg-[#229ED9] p-2.5 text-white transition hover:brightness-110 active:scale-95"
                    >
                      <Send className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}

              {task.description && (
                <div className="smk-sheet-section px-4 py-4">
                  <h3 className="smk-sheet-label mb-1.5">
                    {t.taskDetailsHeading}
                  </h3>
                  <p className="whitespace-pre-wrap break-words smk-text-body leading-relaxed text-slate-700 dark:text-zinc-300">
                    {task.description}
                  </p>
                </div>
              )}

              <div className="smk-sheet-section grid grid-cols-1 gap-2 px-4 py-4 smk-text-label sm:grid-cols-2">
                {/* У спора срока нет: работа уже сдана, идёт разбор.
                    Раньше здесь выводилось «Осталось · просрочено» —
                    отсчёт по дедлайну, который к этому моменту давно
                    прошёл и ничего не значит. */}
                <InfoRow
                  icon={task.status === 'disputed'
                    ? ShieldAlert
                    : task.kind === 'scheduled' ? CalendarDays : Clock}
                  label={task.status === 'disputed'
                    ? t.taskStatusLabel
                    : task.kind === 'scheduled' ? t.taskWhenLabel : t.taskTimeLeftLabel}
                  value={task.status === 'disputed'
                    ? t.taskDisputeShort
                    : (task.kind === 'scheduled'
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
                  {/* Иконка во всю высоту блока: адрес сверху, кнопка
                      «Открыть на карте» под ним — как в карточке анкеты.
                      items-stretch + h-auto растягивают плитку иконки на
                      обе строки, поэтому блок читается как одно целое. */}
                  <div className="smk-inset flex items-stretch gap-3 p-3">
                    <div className="flex w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {task.address || t.taskAddressMissing}
                      </p>
                      {/* Открывает НАШУ карту прямо в карточке, а не
                          внешние Яндекс.Карты: точку мы умеем показать
                          сами, и уходить из приложения незачем. */}
                      {typeof task.lat === 'number' && typeof task.lng === 'number' && (
                        <span className="mt-1.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setIsMapOpen((open) => !open)}
                            aria-expanded={isMapOpen}
                            className="inline-flex items-center gap-1 smk-text-label font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            <MapPin className="h-3 w-3" />
                            {isMapOpen ? t.hideMap : t.openOnMap}
                          </button>
                          {/* п.5: исполнитель видит путь от своего
                              местоположения до точки заказчика. */}
                          <button
                            type="button"
                            onClick={() => void openRoute()}
                            className="inline-flex items-center gap-1 smk-text-label font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            <RouteIcon className="h-3 w-3" />
                            {t.taskRouteToCustomer}
                          </button>
                        </span>
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
                      {/* Автор задания может выбрать точку прямо здесь:
                          клик по карте подставляет ближайший известный
                          адрес и открывает форму правки с ним. Раньше
                          onSelect не передавался вовсе — человек кликал
                          по дому, и ничего не происходило.

                          Остальным карта только на просмотр: точку
                          задал заказчик, менять её из чужой карточки
                          нельзя. */}
                      <InteractiveMap
                        selectedPosition={{ lat: task.lat, lng: task.lng }}
                        onSelect={canEdit ? handleMapPick : undefined}
                        showControls={false}
                        showProfiles={false}
                        showHouses
                        showPlaces
                        mapLayerMode={mapLayerMode}
                        onMapLayerModeChange={setMapLayerMode}
                        className="h-56 overflow-hidden rounded-xl sm:h-72"
                      />
                      {canEdit && showHints && (
                        <p className="smk-note smk-note-info px-3 py-2">
                          {t.taskMapPickHint}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Заявки на рассмотрении — только заказчику */}
              {isAuthor && pendingParticipants.length > 0 && (
                <div className="smk-sheet-section px-4 py-4">
                  <h3 className="smk-sheet-label mb-2">
                    {t.taskPendingHeading} ({pendingParticipants.length})
                  </h3>
                  <div className="space-y-1.5">
                    {pendingParticipants.map((p) => (
                      <div
                        key={p.id}
                        // Слот темы вместо bg-amber-50/70: тот литерал не
                        // подчинялся палитре, поэтому заявка на
                        // рассмотрении выглядела чужеродной, а после
                        // одобрения строка вставала на .smk-sheet-row и
                        // «вдруг» становилась правильной.
                        className="smk-note smk-note-warn flex items-center gap-2 p-2.5"
                      >
                        <Avatar src={p.avatarUrl} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {p.fullName || t.attendanceResident}
                          </p>
                          <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                            ★ {(p.rating ?? 0) > 0 ? p.rating?.toFixed(1) : '—'} · {t.attendanceDoneCount}: {p.tasksDoneCount ?? 0}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => act('approve', () => runTaskAction(task.id, 'approve', { userId: p.userId }))}
                          className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 smk-text-label font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {t.taskApproveBtn}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => act('decline', () => runTaskAction(task.id, 'decline', { userId: p.userId }))}
                          className="shrink-0 rounded-lg px-2 py-1 smk-text-label font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:hover:bg-rose-950/40"
                        >
                          {t.taskDeclineBtn}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Моя заявка ждёт решения заказчика */}
              {isPendingMe && showHints && (
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
                          <p className="smk-text-label text-slate-500 dark:text-zinc-500">
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
              {task.isPaid && (isAuthor || isExecutor) && showHints
                && ['open', 'in_progress', 'awaiting_confirm'].includes(task.status) && (
                <div className="smk-note smk-note-info mx-4 mb-4 px-3.5 py-3">
                  <h3 className="mb-1 flex items-center gap-1.5 smk-text-label font-bold uppercase tracking-wide">
                    <Wallet className="h-3.5 w-3.5" />
                    {t.taskPayoutTitle}
                  </h3>
                  <p className="smk-text-label leading-relaxed">
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

              {/* Исполнитель показывает код с телефона — заказчик
                  сканирует камерой. Не обещаем оплату по QR: камера
                  откроет ссылку с реквизитами (или ЮMoney). */}
              {isExecutor && needsPaymentProof && task.status === 'awaiting_confirm' && (
                <PayoutQrBlock
                  method={payMethod}
                  payout={myPayout}
                  amount={total}
                  comment="Даймохк: оплата задания"
                  reveal
                />
              )}

              {task.status === 'awaiting_confirm' && showHints && (
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
                  <h3 className="mb-1 flex items-center gap-1.5 smk-text-label font-bold uppercase tracking-wide">
                    <Ban className="h-3.5 w-3.5" />
                    {t.taskCancelledBadge}
                  </h3>
                  {task.cancelReason && (
                    <p className="mb-1.5 break-words smk-text-label leading-relaxed">
                      «{task.cancelReason}»
                    </p>
                  )}
                  <p className="smk-text-label leading-relaxed">
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
                  <h3 className="mb-1 flex items-center gap-1.5 smk-text-label font-bold uppercase tracking-wide">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {t.taskDisputeTitle}
                  </h3>
                  {task.disputeReason && (
                    <p className="mb-1.5 break-words smk-text-label leading-relaxed">
                      «{task.disputeReason}»
                    </p>
                  )}
                  <p className="smk-text-label leading-relaxed">
                    {isAuthor ? t.taskDisputeAuthor : t.taskDisputeExecutor}
                  </p>
                  {/* Объясняем МЕХАНИКУ: раньше блок сообщал «идёт
                      рассмотрение», но не говорил, что это за
                      рассмотрение, кто его ведёт и что будет дальше. */}
                  {showHints && (
                    <>
                      <p className="mt-2 pt-2 opacity-90" style={{ borderTop: '1px solid currentColor' }}>
                        <span className="font-bold">{t.taskDisputeHowTitle}. </span>
                        {t.taskDisputeHow.replace('{hours}', String(TASK_DISPUTE_HOURS))}
                      </p>
                      <p className="mt-1.5 opacity-90">{t.taskDisputeAfter}</p>
                    </>
                  )}

                </div>
              )}

              {/* Срок рассмотрения — отдельной тонкой строкой под блоком:
                  внутри красной плашки он тонул среди текста, хотя это
                  главное число в споре. */}
              {task.status === 'disputed' && disputeLeft && (
                <div className="smk-inset mx-4 mb-3 flex items-center justify-between gap-2 px-3 py-2">
                  <span className="smk-sheet-label">{t.taskDisputeLeftLabel}</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {disputeLeft}
                  </span>
                </div>
              )}

              {/* Действия по спору — обычные кнопки под блоком, а не
                  ссылки внутри него: зелёная решает спор, красная зовёт
                  администратора. Внутри плашки они читались как часть
                  предупреждения и терялись. */}
              {task.status === 'disputed' && (isAuthor || isExecutor) && (
                <div className="mx-4 mb-4 space-y-2">
                  {complaintSent && (
                    <p className="smk-note smk-note-success px-3 py-2">
                      {t.taskComplaintSent}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {iAgreedDispute ? (
                      <p className="smk-note smk-note-success flex flex-1 items-center gap-1.5 px-3 py-2.5">
                        <Check className="h-4 w-4 shrink-0" />
                        {t.taskDisputeWaitingOther}
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => act('confirm', () => runTaskAction(task.id, 'confirm'))}
                        className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                      >
                        {busy === 'confirm'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Check className="h-4 w-4" />}
                        {otherAgreedDispute ? t.taskDisputeResolveLast : t.taskDisputeResolve}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsComplaintOpen(true)}
                      className={`${btn} border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300`}
                    >
                      <ShieldAlert className="h-4 w-4" />
                      {t.taskDisputeComplain}
                    </button>
                  </div>
                </div>
              )}

              {/* Подтверждение вместо исчезающей формы */}
              {task.status === 'completed' && ratingSubmitted
                && !(isAuthor && authorRatesViaAttendance) && (
                showHints ? (
                  <p className="smk-note smk-note-success mx-4 mb-4 px-3.5 py-3">
                    {t.taskRatingSaved}
                  </p>
                ) : null
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
                  onClick={() => {
                    haptic(settings.vibrate);
                    void act('take', () => runTaskAction(task.id, task.kind === 'urgent' ? 'take' : 'join'));
                  }}
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
                    <button type="button" onClick={() => setPayoutOpen(true)} className="font-bold underline">
                      {t.taskNeedPayoutLink}
                    </button>
                  </p>
                )}
              </>
            )}

            {/* Условия изменились после отклика — нужно согласие.
                Пока не принял, заказчик не может одобрить. */}
            {isPendingMe && myNeedsConsent && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act('accept', () => runTaskAction(task.id, 'accept'))}
                className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                {busy === 'accept'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Check className="h-4 w-4" />}
                {t.taskAcceptChangesBtn}
              </button>
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
                showHints ? (
                  <p className="smk-note smk-note-success w-full px-3 py-2">
                    {t.taskPaymentReceivedDone}
                  </p>
                ) : null
              ) : (
                <>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      haptic(settings.vibrate);
                      void act('paid', () => runTaskAction(task.id, 'paid'));
                    }}
                    className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                  >
                    {busy === 'paid' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t.taskPaymentReceivedBtn}
                  </button>
                  {showHints && (
                    <p className="smk-note smk-note-warn w-full px-3 py-2">
                      {t.taskPaymentReceivedHint}
                    </p>
                  )}
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

            {isAuthor && task.status === 'completed' && onRepeat && (
              <button
                type="button"
                onClick={() => onRepeat(task)}
                className={`${btn} smk-field text-slate-700 hover:brightness-95 dark:text-zinc-200 dark:hover:brightness-110`}
              >
                <Copy className="h-4 w-4" />
                {t.taskRepeat}
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
                  // Подтверждение — наша модалка ConfirmDialog, а не
                  // системный alert: тот игнорирует тему, шрифт и язык
                  // приложения и выглядит инородно.
                  onClick={() => setConfirmClose(canDelete ? 'delete' : 'cancel')}
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

      <ConfirmDialog
        isOpen={confirmClose !== null}
        title={confirmClose === 'delete' ? t.taskDeleteBtn : t.taskCancelBtn}
        message={confirmClose === 'delete' ? t.taskDeleteConfirm : t.taskCancelConfirm}
        confirmLabel={confirmClose === 'delete' ? t.taskDeleteBtn : t.taskCancelBtn}
        danger
        isBusy={busy === 'delete' || busy === 'cancel'}
        onCancel={() => setConfirmClose(null)}
        onConfirm={() => {
          const mode = confirmClose;
          setConfirmClose(null);
          if (!task || !mode) return;
          if (mode === 'delete') {
            act('delete', async () => {
              await deleteTask(task.id);
              onClose();
            });
            return;
          }
          act('cancel', () => runTaskAction(task.id, 'cancel'));
        }}
      />

      {/* Подтверждение блокировки автора (п.7): та же формулировка,
          что и в анкете, — действие одинаковое, и предупреждать о
          последствиях надо одинаково. */}
      <ConfirmDialog
        isOpen={confirmBlock}
        title={t.profileBlockUser}
        message={t.profileBlockConfirm}
        confirmLabel={t.profileBlockUser}
        danger
        isBusy={blockBusy}
        onCancel={() => setConfirmBlock(false)}
        onConfirm={() => {
          if (!task?.authorId) return;
          setBlockBusy(true);
          void (async () => {
            try {
              await block(task.authorId);
              setConfirmBlock(false);
              // Заблокированный автор пропадает из списков — держать
              // его задание открытым уже незачем.
              onClose();
            } catch (blockError) {
              setError(blockError instanceof Error ? blockError.message : t.taskComplaintError);
              setConfirmBlock(false);
            } finally {
              setBlockBusy(false);
            }
          })();
        }}
      />

      {isComplaintOpen && task && (
        <DisputeComplaintModal
          task={task}
          role={isAuthor ? 'author' : 'executor'}
          onClose={() => setIsComplaintOpen(false)}
          onSent={() => setComplaintSent(true)}
        />
      )}

      {task && (
        <PinProposeModal
          isOpen={pinOpen}
          targetType="task"
          targetId={task.id}
          onClose={() => setPinOpen(false)}
        />
      )}

      {isAttendanceOpen && task && (
        <AttendanceModal
          task={task}
          participants={participants}
          onClose={() => setIsAttendanceOpen(false)}
          onDone={() => { load(); onChanged(); }}
        />
      )}
      <PayoutPeekSheet isOpen={payoutOpen} onClose={() => setPayoutOpen(false)} />
      {/* Маршрут исполнителя: моё GPS → точка заказчика (п.5). */}
      {task && typeof task.lat === 'number' && typeof task.lng === 'number' && (
        <TaxiMapModal
          isOpen={routeOpen}
          onClose={() => setRouteOpen(false)}
          from={routeFrom ? { ...routeFrom, label: '' } : null}
          to={{ lat: task.lat, lng: task.lng, label: task.address }}
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
