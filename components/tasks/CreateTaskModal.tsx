'use client';

import { useEffect, useState } from 'react';
import {
  clearTaskDraft, draftIsEmpty, loadTaskDraft, loadTemplates, removeTemplate, saveTaskDraft, saveTemplate,
  type TaskDraft,
} from '@/lib/tasks/drafts';
import { X, Loader2, LocateFixed, MapPin } from 'lucide-react';
import { reverseGeocode } from '@/lib/geocoding';
import { useSheetSwipe } from '@/lib/hooks/useSheetSwipe';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import InteractiveMap from '@/components/InteractiveMapLazy';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { type MapLayerMode } from '@/components/InteractiveMap';
import { useI18n } from '@/lib/i18n';
import { createTask, updateTask, fetchTaskFilters } from '@/lib/tasks/client';
import { filterIcon } from '@/lib/filter-icons';
import { getUserCoords } from '@/lib/geo';
import { useAuth } from '@/components/AuthProvider';
import { SettingRow, Toggle } from '@/components/settings/SettingsPrimitives';
import PayoutPeekSheet from '@/components/settings/PayoutPeekSheet';
import { useProfiles } from '@/components/ProfilesProvider';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  canAcceptPayment, isPaymentMethod, PAYMENT_METHODS,
  type PaymentMethod, type PayoutMethods,
} from '@/lib/payments';
import { findClosestSamashkiHouse } from '@/lib/samashki-addresses';
import {
  taskCostBreakdown, TASK_MIN_REWARD, TASK_PRIORITY_SURCHARGE,
  type AppFilter, type Task, type TaskKind, type TaskPriority,
} from '@/lib/types';

/** Лёгкое предзаполнение нового задания (быстрая заявка с каталога). */
export interface TaskPreset {
  title?: string;
  description?: string;
  category?: string;
  /** «Сбор рабочих» приходит как запланированное («на дату»). */
  kind?: 'urgent' | 'scheduled';
}

interface CreateTaskModalProps {
  isOpen: boolean;
  /** true — «Аренца Темщик» (за деньги), false — «ГIончалла» (безвозмездно). */
  isPaid: boolean;
  /**
   * Задание для правки. Если передано — форма работает в режиме
   * редактирования: поля предзаполнены, вместо создания идёт PATCH.
   *
   * Отдельная модалка не нужна: набор полей и все проверки те же, а два
   * почти одинаковых файла разъехались бы при первой же правке.
   */
  editTask?: Task | null;
  /** Предзаполнить форму новым заданием (повторить / шаблон). */
  seedTask?: Task | null;
  /**
   * Точечное предзаполнение (быстрая заявка): титул/описание/категория.
   * Слабее, чем seedTask — остальные поля получают умолчания, черновик
   * не спрашиваем (заявка и есть черновик).
   */
  preset?: TaskPreset | null;
  /**
   * Быстрое создание (карточки каталога): не предлагать «Есть
   * незаконченное задание» — черновики для них не копятся (п.8).
   */
  skipDraftAsk?: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/** input[type=datetime-local] хочет local-time без таймзоны. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CreateTaskModal({
  isOpen, isPaid, editTask = null, seedTask = null, preset = null, skipDraftAsk = false, onClose, onCreated,
}: CreateTaskModalProps) {
  const isEditing = Boolean(editTask);
  const source = editTask ?? seedTask;
  const { t, language } = useI18n();
  const { account } = useAuth();
  const { profiles } = useProfiles();
  const [categories, setCategories] = useState<AppFilter[]>([]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('streets');
  const [kind, setKind] = useState<TaskKind>('urgent');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [reward, setReward] = useState(String(TASK_MIN_REWARD));
  const [purchaseBudget, setPurchaseBudget] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [slots, setSlots] = useState('1');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // 4.5 по умолчанию: заказчик почти всегда хочет проверенного
  // исполнителя, а ноль пропускал вообще всех и обнаруживался только
  // после первого неудачного отклика. Планку видно и её можно снизить.
  const [minRating, setMinRating] = useState('4.5');
  // Наличные по умолчанию: в селе это основной способ, и он не требует
  // от исполнителя вообще никаких реквизитов.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  // Свои реквизиты: по ним решаем, какие способы расчёта доступны.
  const [myPayout, setMyPayout] = useState<PayoutMethods | null>(null);
  const [minAccountDays, setMinAccountDays] = useState('0');
  const [minTasksDone, setMinTasksDone] = useState('0');
  const [allowNewcomers, setAllowNewcomers] = useState(true);
  // Видимость контактов по ЭТОМУ заданию. Сами номера лежат в профиле и
  // сюда не копируются — здесь только «показывать или нет».
  const [showPhone, setShowPhone] = useState(false);
  const [showWhatsapp, setShowWhatsapp] = useState(false);
  const [showTelegram, setShowTelegram] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [draftAsk, setDraftAsk] = useState(false);
  const [templates, setTemplates] = useState(() => loadTemplates(isPaid));
  const swipe = useSheetSwipe(onClose);

  const applyDraft = (draft: TaskDraft) => {
    setKind(draft.kind);
    setTitle(draft.title ?? '');
    setDescription(draft.description ?? '');
    setCategory(draft.category || 'other');
    setReward(draft.reward || String(TASK_MIN_REWARD));
    setPurchaseBudget(draft.purchaseBudget ?? '');
    setPriority(draft.priority ?? 'normal');
    setSlots(draft.slots || '1');
    setAddress(draft.address ?? '');
    if (isPaymentMethod(draft.paymentMethod)) setPaymentMethod(draft.paymentMethod);
    setMinRating(draft.minRating || '4.5');
    setMinAccountDays(draft.minAccountDays || '0');
    setMinTasksDone(draft.minTasksDone || '0');
    setAllowNewcomers(draft.allowNewcomers !== false);
  };

  // Реквизиты заказчика: способ расчёта, для которого их нет, выбрать
  // нельзя — иначе задание создастся, а платить будет нечем.
  useEffect(() => {
    if (!isOpen || !supabase) return;
    let cancelled = false;
    void (async () => {
      const session = await supabase!.auth.getSession();
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
        // Не загрузилось — доступны только наличные, это безопасно.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchTaskFilters('tasks').then(setCategories).catch(() => setCategories([]));
    setTemplates(loadTemplates(isPaid));

    // В режиме правки поля берём из задания, а не подставляем умолчания.
    if (editTask) {
      setKind(editTask.kind as TaskKind);
      setTitle(editTask.title ?? '');
      setDescription(editTask.description ?? '');
      setCategory(editTask.category || 'other');
      setReward(String(editTask.reward ?? 0));
      setPurchaseBudget(editTask.purchaseBudget ? String(editTask.purchaseBudget) : '');
      setPriority((editTask.priority as TaskPriority) ?? 'normal');
      setSlots(String(editTask.slots ?? 1));
      setDeadlineAt(editTask.deadlineAt ? toLocalInput(new Date(editTask.deadlineAt)) : '');
      setScheduledAt(editTask.scheduledAt ? toLocalInput(new Date(editTask.scheduledAt)) : '');
      setAddress(editTask.address ?? '');
      setCoords(
        typeof editTask.lat === 'number' && typeof editTask.lng === 'number'
          ? { lat: editTask.lat, lng: editTask.lng }
          : null,
      );
      setMinRating(String(editTask.minRating ?? 0));
      setMinAccountDays(String(editTask.minAccountDays ?? 0));
      setMinTasksDone(String(editTask.minTasksDone ?? 0));
      setAllowNewcomers(editTask.allowNewcomers !== false);
      setShowPhone(editTask.showPhone === true);
      setShowWhatsapp(editTask.showWhatsapp === true);
      setShowTelegram(editTask.showTelegram === true);
      if (isPaymentMethod(editTask.paymentMethod)) {
        setPaymentMethod(editTask.paymentMethod as PaymentMethod);
      }
      setDraftAsk(false);
      return;
    }

    // Срочное — через 30 минут (чаще всего «принеси сейчас»),
    // запланированное — на завтра. Повтор тоже получает новые сроки:
    // старый дедлайн уже в прошлом.
    const soon = new Date(Date.now() + 30 * 60_000);
    const tomorrow = new Date(Date.now() + 24 * 3600_000);
    setDeadlineAt(toLocalInput(soon));
    setScheduledAt(toLocalInput(tomorrow));

    if (seedTask) {
      setKind(seedTask.kind as TaskKind);
      setTitle(seedTask.title ?? '');
      setDescription(seedTask.description ?? '');
      setCategory(seedTask.category || 'other');
      setReward(String(seedTask.reward ?? TASK_MIN_REWARD));
      setPurchaseBudget(seedTask.purchaseBudget ? String(seedTask.purchaseBudget) : '');
      setPriority((seedTask.priority as TaskPriority) ?? 'normal');
      setSlots(String(seedTask.slots ?? 1));
      setAddress(seedTask.address ?? '');
      setCoords(
        typeof seedTask.lat === 'number' && typeof seedTask.lng === 'number'
          ? { lat: seedTask.lat, lng: seedTask.lng }
          : null,
      );
      setMinRating(String(seedTask.minRating ?? 4.5));
      setMinAccountDays(String(seedTask.minAccountDays ?? 0));
      setMinTasksDone(String(seedTask.minTasksDone ?? 0));
      setAllowNewcomers(seedTask.allowNewcomers !== false);
      if (isPaymentMethod(seedTask.paymentMethod)) {
        setPaymentMethod(seedTask.paymentMethod as PaymentMethod);
      }
      setDraftAsk(false);
      return;
    }

    // Быстрая заявка (пресет): поля из формы, остальное — умолчания.
    // Черновик не предлагаем: содержимое заявки и есть начальный текст.
    if (preset) {
      if (preset.kind === 'scheduled' || preset.kind === 'urgent') setKind(preset.kind);
      setTitle(preset.title ?? '');
      setDescription(preset.description ?? '');
      setCategory(preset.category || 'other');
      setDraftAsk(false);
      return;
    }

    const draft = loadTaskDraft(isPaid);
    setDraftAsk(skipDraftAsk ? false : Boolean(draft && !draftIsEmpty(draft)));
  }, [isOpen, editTask, seedTask, preset, skipDraftAsk, isPaid]);

  useEffect(() => {
    if (!isOpen || isEditing) return;
    const draft: TaskDraft = {
      kind, title, description, category, reward, purchaseBudget, priority, slots,
      address, paymentMethod, minRating, minAccountDays, minTasksDone, allowNewcomers,
    };
    if (draftIsEmpty(draft)) return;
    saveTaskDraft(isPaid, draft);
  }, [isOpen, isEditing, isPaid, kind, title, description, category, reward, purchaseBudget,
    priority, slots, address, paymentMethod, minRating, minAccountDays, minTasksDone, allowNewcomers]);

  // Адрес подставляем сам, в два источника по убыванию точности:
  //   1. GPS → ближайший дом из адресной книги (как кнопка «Моё место»);
  //   2. адрес из личной анкеты — если GPS запрещён или недоступен.
  //
  // Второй источник обязателен: getUserCoords намеренно не показывает
  // окно запроса разрешения (иначе Chrome блокирует геолокацию после
  // нескольких отказов), поэтому у большинства пользователей координат
  // просто нет. Без запасного варианта поле оставалось пустым — ровно
  // то, на что жаловался заказчик.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    /** Адрес из личной анкеты пользователя. */
    const fromProfile = (): { address: string; lat?: number; lng?: number } | null => {
      if (!account) return null;
      const own = profiles.filter((profile) => profile.ownerId === account.id);
      // Личная анкета приоритетнее: в ней домашний адрес, а в анкете
      // специалиста — место работы.
      const personal = own.find((profile) => profile.isPersonal) ?? own[0];
      const value = personal?.workplaceAddress?.trim();
      if (!value) return null;
      return {
        address: value,
        lat: personal?.workplaceCoords?.lat,
        lng: personal?.workplaceCoords?.lng,
      };
    };

    const apply = (value: string, lat?: number, lng?: number) => {
      // Не перетираем то, что пользователь уже начал вводить.
      setAddress((current) => (current.trim() ? current : value));
      if (typeof lat === 'number' && typeof lng === 'number') {
        setCoords((current) => current ?? { lat, lng });
      }
    };

    void getUserCoords().then((position) => {
      if (cancelled) return;

      if (position) {
        try {
          const closest = findClosestSamashkiHouse(position);
          if (closest?.fullAddress) {
            apply(closest.fullAddress, closest.lat, closest.lng);
            return;
          }
        } catch {
          // Адресная книга недоступна — пробуем анкету.
        }
      }

      const profileAddress = fromProfile();
      if (profileAddress) {
        apply(profileAddress.address, profileAddress.lat, profileAddress.lng);
      }
    });

    return () => { cancelled = true; };
  }, [isOpen, account, profiles]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // «Где я?»: GPS + обратное геокодирование (п.5).
  const [locating, setLocating] = useState(false);
  const locateMe = async () => {
    setLocating(true);
    try {
      const position = await getUserCoords(true);
      if (!position) return;
      setCoords({ lat: position.lat, lng: position.lng });
      let label = `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
      try {
        const geo = await reverseGeocode(position);
        if (geo) label = geo;
      } catch { /* компактные координаты */ }
      setAddress(label);
    } finally {
      setLocating(false);
    }
  };

  if (!isOpen) return null;

  // Контакты берём из анкеты автора: в форме задания их не вводят.
  // Телефон живёт в аккаунте, WhatsApp и Telegram — в анкете.
  const myProfile = account ? profiles.find((profile) => profile.ownerId === account.id) : undefined;
  // Галочки профиля «не показывать в анкетах» действуют и здесь: скрытый
  // контакт в новое задание не подставляется (решение от 21.08, ночь).
  const myPhone = account?.hidePhone ? '' : (account?.phone ?? '');
  const myWhatsapp = account?.hideWhatsapp ? '' : (myProfile?.whatsapp ?? '');
  const myTelegram = account?.hideTelegram ? '' : (myProfile?.telegram ?? '');
  const hasAnyContact = Boolean(myPhone || myWhatsapp || myTelegram);

  const rewardValue = Number(reward) || 0;
  const budgetValue = Number(purchaseBudget) || 0;
  // «Покупки» — единственная категория, где нужен бюджет на товар.
  const isPurchase = category === 'purchases';
  const cost = taskCostBreakdown(rewardValue, priority, isPurchase ? budgetValue : 0);
  const slotsValue = Math.max(1, Number(slots) || 1);

  const handleSubmit = async () => {
    setError('');
    if (title.trim().length < 3) {
      setError(t.taskTitleTooShort);
      return;
    }
    if (isPaid && rewardValue < TASK_MIN_REWARD) {
      setError(t.taskRewardTooLow.replace('{amount}', String(TASK_MIN_REWARD)));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        kind,
        title: title.trim(),
        description: description.trim(),
        category,
        reward: isPaid ? rewardValue : 0,
        purchaseBudget: isPaid && isPurchase ? budgetValue : 0,
        priority: isPaid ? priority : 'normal',
        slots: kind === 'scheduled' ? slotsValue : 1,
        // datetime-local отдаёт локальное время — переводим в ISO (UTC).
        deadlineAt: kind === 'urgent' && deadlineAt ? new Date(deadlineAt).toISOString() : null,
        scheduledAt: kind === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        address: address.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        minRating: Number(minRating) || 0,
        paymentMethod: isPaid ? paymentMethod : 'cash',
        minAccountDays: Number(minAccountDays) || 0,
        minTasksDone: Number(minTasksDone) || 0,
        allowNewcomers,
        // Контакты не передаём — только разрешение их показать.
        // Номера сервер возьмёт из профиля автора.
        showPhone,
        showWhatsapp,
        showTelegram,
      };

      if (editTask) {
        // kind и isPaid сервер не меняет: раздел и сценарий закрытия
        // задания зафиксированы при создании.
        await updateTask(editTask.id, payload);
      } else {
        await createTask({ isPaid, ...payload });
      }
      // Сбрасываем форму, чтобы следующее открытие было чистым.
      setTitle('');
      setDescription('');
      setReward(String(TASK_MIN_REWARD));
      setPurchaseBudget('');
      setPriority('normal');
      setSlots('1');
      setAddress('');
      setCoords(null);
      clearTaskDraft(isPaid);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.taskCreateError);
    } finally {
      setIsSaving(false);
    }
  };

  // Поля с мягкой заливкой вместо голых рамок: так форма читается
  // плотнее и совпадает по духу с карточками каталога.
  const fieldClass = 'w-full rounded-xl border border-transparent bg-slate-100/80 px-3.5 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/30 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:bg-zinc-800';
  const labelClass = 'smk-sheet-label mb-1.5 block';
  // Секция: заголовок + разделитель сверху, без вложенных рамок.
  const sectionClass = 'smk-sheet-section space-y-3 px-4 py-4';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
      onClick={onClose}
    >
      <div
        className="smk-sheet flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="smk-sheet-head flex items-center justify-between px-4 pb-3 pt-4">
          <h2 id="create-task-title" className="text-sm font-extrabold text-slate-900 dark:text-white">
            {isEditing
              ? t.taskEditTitle
              : isPaid ? t.taskCreateTitlePaid : t.taskCreateTitleFree}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="smk-act rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {draftAsk && !isEditing && (
            <div className="smk-note smk-note-warn mx-4 mt-4 px-3.5 py-3">
              <p className="smk-text-body">{t.taskDraftBanner}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const draft = loadTaskDraft(isPaid);
                    if (draft) applyDraft(draft);
                    setDraftAsk(false);
                  }}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                >
                  {t.taskDraftKeep}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearTaskDraft(isPaid);
                    setDraftAsk(false);
                  }}
                  className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300"
                >
                  {t.taskDraftDrop}
                </button>
              </div>
            </div>
          )}

          {!isEditing && templates.length > 0 && (
            <div className="px-4 pt-4">
              <span className={labelClass}>{t.taskTemplates}</span>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((tpl) => (
                  <span
                    key={tpl.id}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-100 pl-3 dark:bg-zinc-800"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        applyDraft(tpl);
                        setDraftAsk(false);
                      }}
                      className="py-1.5 text-xs font-bold text-slate-700 dark:text-zinc-200"
                    >
                      {tpl.name}
                    </button>
                    <button
                      type="button"
                      aria-label={t.delete}
                      onClick={() => setTemplates(removeTemplate(isPaid, tpl.id))}
                      className="smk-hit px-2 py-1.5 text-slate-400 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Тип задания */}
          <div className="px-4 pb-4 pt-4">
          <span className={labelClass}>{t.taskKindLabel}</span>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-zinc-800" role="tablist">
            {([['urgent', t.taskKindUrgent], ['scheduled', t.taskKindScheduled]] as [TaskKind, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                onClick={() => setKind(value)}
                className={`flex-1 rounded-lg px-2 py-1.5 smk-text-label font-bold transition ${
                  kind === value
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          </div>

          <div className={sectionClass}>
            <div>
            <label htmlFor="task-title" className={labelClass}>{t.taskWhatToDo}</label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={t.taskWhatToDoPlaceholder}
              className={fieldClass}
            />
            </div>

            <div>
            <label htmlFor="task-desc" className={labelClass}>{t.taskDetailsLabel}</label>
            <textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t.taskDetailsPlaceholder}
              className={`${fieldClass} resize-none`}
            />
            </div>
          </div>

          <div className={`${sectionClass} grid grid-cols-2 gap-3`}>
            <div className="col-span-2">
              {/* Категории — чипами с иконками из админки: что админ
                  поставил в «Фильтрах», то и видит житель (п.4
                  замечаний 23.08). */}
              <span className={labelClass}>{t.taskCategoryLabel}</span>
              <div className="flex flex-wrap gap-1.5">
                {(categories.length > 0
                  ? categories
                  : [{ id: 'other', value: 'other', labelRu: t.taskCategoryOther, labelCe: null, icon: null }]
                ).map((c) => {
                  const Icon = filterIcon(c.icon ?? undefined, c.value);
                  const on = category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                        on
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {(language === 'ce' && c.labelCe) || c.labelRu}
                    </button>
                  );
                })}
              </div>
            </div>

            {isPaid && (
              <div>
                <label htmlFor="task-reward" className={labelClass}>{t.taskRewardLabel}</label>
                <input
                  id="task-reward"
                  type="number"
                  inputMode="numeric"
                  min={TASK_MIN_REWARD}
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  placeholder={String(TASK_MIN_REWARD)}
                  className={fieldClass}
                />
              </div>
            )}
          </div>

          {/* Бюджет на закупку — только для «Покупок»: исполнитель
              тратит свои деньги и получает их обратно с наградой. */}
          {isPaid && isPurchase && (
            <div className={sectionClass}>
              <label htmlFor="task-budget" className={labelClass}>{t.taskBudgetLabel}</label>
              <input
                id="task-budget"
                type="number"
                inputMode="numeric"
                min={0}
                value={purchaseBudget}
                onChange={(e) => setPurchaseBudget(e.target.value)}
                placeholder="1500"
                className={fieldClass}
              />
              <p className="mt-1.5 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-400">
                {t.taskBudgetHint}
              </p>
            </div>
          )}
          {/* Приоритет — надбавка платит заказчик */}
          {isPaid && (
            <div className={sectionClass}>
              <span className={labelClass}>{t.tasksUrgency}</span>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-zinc-800">
                {/* Проценты считаем из TASK_PRIORITY_SURCHARGE: раньше здесь
                    были зашитые «+20%/+50%», не совпадавшие с расчётом. */}
                {([
                  ['normal', t.taskUrgencyNormalShort],
                  ['high', `🟡 +${Math.round(TASK_PRIORITY_SURCHARGE.high * 100)}%`],
                  ['critical', `🔴 +${Math.round(TASK_PRIORITY_SURCHARGE.critical * 100)}%`],
                ] as [TaskPriority, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPriority(value)}
                    className={`flex-1 rounded-lg px-2 py-1.5 smk-text-label font-bold transition ${
                      priority === value
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Полная разбивка: видно, за что платит заказчик и
                  сколько на руки получит исполнитель. */}
              {rewardValue > 0 && (
                <dl className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 smk-text-label dark:bg-zinc-800/70">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500 dark:text-zinc-400">{t.taskCostReward}</dt>
                    <dd className="font-bold text-slate-800 dark:text-zinc-200">{cost.reward} ₽</dd>
                  </div>
                  {cost.surcharge > 0 && (
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500 dark:text-zinc-400">
                        {t.taskCostSurcharge}
                      </dt>
                      <dd className="font-bold text-amber-600 dark:text-amber-400">
                        +{cost.surcharge} ₽
                      </dd>
                    </div>
                  )}
                  {cost.budget > 0 && (
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500 dark:text-zinc-400">{t.taskCostBudget}</dt>
                      <dd className="font-bold text-slate-800 dark:text-zinc-200">
                        +{cost.budget} ₽
                      </dd>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1.5 dark:border-zinc-700">
                    <dt className="font-bold text-slate-700 dark:text-zinc-300">{t.taskCostTotal}</dt>
                    <dd className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                      {cost.total} ₽
                    </dd>
                  </div>
                  <p className="smk-note smk-note-info mt-1.5 px-2.5 py-2">
                    {t.taskCostExecutorGets} {cost.executorGets} ₽
                    {cost.budget > 0 && ` ${t.taskCostBudgetIncluded}`}. {t.taskCostTaxNote}
                  </p>
                </dl>
              )}

              {/* Способ оплаты. Сервис деньги НЕ принимает и не переводит:
                  расчёт идёт напрямую между жителями, поэтому здесь
                  выбирается лишь то, как удобнее рассчитаться. */}
              {isPaid && (
                <div className="mt-3">
                  <span className={labelClass}>{t.taskPaymentMethod}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map((method) => {
                      // Способ доступен, только если у ЗАКАЗЧИКА заполнены
                      // соответствующие реквизиты: иначе он выберет СБП,
                      // а платить будет нечем — задание зависнет.
                      const ready = canAcceptPayment(method, myPayout);
                      return (
                        <button
                          key={method}
                          type="button"
                          disabled={!ready}
                          onClick={() => setPaymentMethod(method)}
                          aria-pressed={paymentMethod === method}
                          title={ready ? undefined : t.taskPayNeedOwnPayout}
                          className={`rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            paymentMethod === method
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'smk-field text-slate-600 hover:brightness-95 dark:text-zinc-300 dark:hover:brightness-110'
                          }`}
                        >
                          {t[`taskPay_${method}` as keyof typeof t] as string}
                        </button>
                      );
                    })}
                  </div>

                  {/* Ссылка в настройки: неактивная кнопка без объяснения
                      выглядит поломкой. */}
                  {PAYMENT_METHODS.some((m) => !canAcceptPayment(m, myPayout)) && (
                    <p className="smk-note smk-note-warn mt-1.5 px-2.5 py-2">
                      {t.taskPayNeedOwnPayout}{' '}
                      <button type="button" onClick={() => setPayoutOpen(true)} className="font-bold underline">
                        {t.taskNeedPayoutLink}
                      </button>
                    </p>
                  )}
                  <p className="smk-note smk-note-info mt-1.5 px-2.5 py-2">
                    {paymentMethod === 'cash'
                      ? t.taskPayHintCash
                      : t.taskPayHintTransfer}
                  </p>
                </div>
              )}
            </div>
          )}

          {kind === 'urgent' ? (
            <div className={sectionClass}>
              <label htmlFor="task-deadline" className={labelClass}>{t.taskDeadlineLabel}</label>
              <input
                id="task-deadline"
                type="datetime-local"
                value={deadlineAt}
                onChange={(e) => setDeadlineAt(e.target.value)}
                className={fieldClass}
              />
            </div>
          ) : (
            <div className={`${sectionClass} grid grid-cols-2 gap-3`}>
              <div>
                <label htmlFor="task-scheduled" className={labelClass}>{t.taskScheduledLabel}</label>
                <input
                  id="task-scheduled"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="task-slots" className={labelClass}>{t.taskSlotsLabel}</label>
                <input
                  id="task-slots"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={slots}
                  onChange={(e) => setSlots(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          )}

          <div className={sectionClass}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="task-address" className={labelClass}>{t.taskAddressLabel}</label>
              {/* Как в анкете: ссылка появляется, когда координаты выбраны */}
              {/* Наша карта прямо в форме — как в редакторе анкеты.
                  Раньше ссылка уводила во внешние Яндекс.Карты, и точку
                  приходилось сверять в другом приложении. */}
              {coords && (
                <button
                  type="button"
                  onClick={() => setIsMapOpen((open) => !open)}
                  aria-expanded={isMapOpen}
                  className="mb-1.5 inline-flex items-center gap-1 smk-text-label font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <MapPin className="h-3 w-3" />
                  {isMapOpen ? t.hideMap : t.openOnMap}
                </button>
              )}
            </div>
            <AddressAutocomplete
              id="task-address"
              value={address}
              onChange={setAddress}
              onSelect={(s) => {
                setAddress(s.displayName);
                setCoords({ lat: s.lat, lng: s.lng });
              }}
            />

            {/* «Где я?» (п.5 замечаний 23.08): GPS ставит точку там, где
                стоит заказчик, адрес — ближайшая улица через обратное
                геокодирование; дома из БД остаются подсказками. */}
            <button
              type="button"
              onClick={() => void locateMe()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              {t.taskWhereAmI}
            </button>

            {/* Карта на выбор точки: клик по ней уточняет адрес — тот же
                сценарий, что в анкете. Грузим только после раскрытия:
                Leaflet тянет свой бандл и тайлы. */}
            {isMapOpen && coords && (
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
                <InteractiveMap
                  selectedPosition={coords}
                  onSelect={(position, explicitAddress) => {
                    // Точку приводим к ближайшему известному дому, как в
                    // анкете: свободный клик по полю давал координаты без
                    // адреса, и исполнитель не понимал, куда ехать.
                    if (explicitAddress) {
                      setCoords(position);
                      setAddress(explicitAddress);
                      return;
                    }
                    const closest = findClosestSamashkiHouse(position);
                    setCoords({ lat: closest.lat, lng: closest.lng });
                    setAddress(closest.fullAddress);
                  }}
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

          {/* Требования: кого пускать на задание.
              Раньше блок был свёрнут в <details>: заказчик его не
              открывал и не знал, что фильтры вообще есть, — а потом
              удивлялся откликам без рейтинга. Показываем всегда. */}
          <div className={sectionClass}>
            <h3 className="smk-text-label font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
              {t.taskRequirements}
            </h3>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="task-min-rating" className={labelClass}>{t.taskMinRating}</label>
                  <input
                    id="task-min-rating" type="number" min={0} max={5} step={0.5}
                    value={minRating} onChange={(e) => setMinRating(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="task-min-days" className={labelClass}>{t.taskMinDays}</label>
                  <input
                    id="task-min-days" type="number" min={0}
                    value={minAccountDays} onChange={(e) => setMinAccountDays(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="task-min-done" className={labelClass}>{t.taskMinTasks}</label>
                  <input
                    id="task-min-done" type="number" min={0}
                    value={minTasksDone} onChange={(e) => setMinTasksDone(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={allowNewcomers}
                  onChange={(e) => setAllowNewcomers(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-emerald-600"
                />
                <span>
                  <span className="font-bold text-slate-800 dark:text-zinc-200">{t.taskAllowNewcomers}</span>
                  <br />
                  {t.taskAllowNewcomersHint}
                </span>
              </label>
            </div>
          </div>

          {error && (
            <div className="px-4 pb-4">
              <p className="smk-note smk-note-danger px-3.5 py-2.5">
                {error}
              </p>
            </div>
          )}
        </div>

                  {/* Контакты по заданию.
              Раньше здесь стоял «Общий номер»: телефон вводился заново
              на каждое задание и разъезжался с профилем. Теперь номера
              живут только в профиле, а тут выбирается их видимость. */}
          <div className="smk-sheet-section space-y-2 px-4 py-4">
            <h3 className="smk-sheet-label">{t.taskContactsTitle}</h3>
            <p className="smk-text-label leading-relaxed text-slate-500 dark:text-zinc-500">
              {t.taskContactsHint}
            </p>

            {hasAnyContact ? (
              <div className="space-y-1.5 pt-1">
                {/* Тумблер показываем только для заполненного контакта:
                    предлагать «показать телефон», которого нет, — обман. */}
                {Boolean(myPhone) && (
                  <SettingRow title={t.taskShowPhone}>
                    <Toggle checked={showPhone} onChange={setShowPhone} label={t.taskShowPhone} />
                  </SettingRow>
                )}
                {Boolean(myWhatsapp) && (
                  <SettingRow title={t.taskShowWhatsapp}>
                    <Toggle checked={showWhatsapp} onChange={setShowWhatsapp} label={t.taskShowWhatsapp} />
                  </SettingRow>
                )}
                {Boolean(myTelegram) && (
                  <SettingRow title={t.taskShowTelegram}>
                    <Toggle checked={showTelegram} onChange={setShowTelegram} label={t.taskShowTelegram} />
                  </SettingRow>
                )}
              </div>
            ) : (
              <p className="smk-text-label leading-relaxed text-amber-700 dark:text-amber-400">
                {t.taskContactsEmpty}
              </p>
            )}
          </div>


        <div className="smk-sheet-section smk-sheet-foot flex gap-2 p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t.cancel}
          </button>
          {!isEditing && title.trim().length >= 3 && (
            <button
              type="button"
              onClick={() => {
                const name = title.trim().slice(0, 40);
                setTemplates(saveTemplate(isPaid, {
                  kind, title, description, category, reward, purchaseBudget, priority, slots,
                  address, paymentMethod, minRating, minAccountDays, minTasksDone, allowNewcomers,
                }, name));
              }}
              className="rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-zinc-300"
            >
              {t.taskSaveTemplate}
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? t.taskSaveChangesBtn : t.taskPublishBtn}
          </button>
        </div>
      </div>
      <PayoutPeekSheet
        isOpen={payoutOpen}
        onClose={() => {
          setPayoutOpen(false);
          if (!supabase) return;
          void supabase.auth.getSession().then(async (session) => {
            const token = session.data.session?.access_token;
            if (!token) return;
            const res = await fetch('/api/payout', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const data = await res.json().catch(() => null);
            if (data?.payout) setMyPayout(data.payout);
          });
        }}
      />
    </div>
  );
}
