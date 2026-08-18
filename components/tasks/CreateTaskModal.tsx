'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink } from 'lucide-react';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { useI18n } from '@/lib/i18n';
import { createTask, fetchTaskFilters } from '@/lib/tasks/client';
import { getUserCoords } from '@/lib/geo';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/payments';
import { findClosestSamashkiHouse } from '@/lib/samashki-addresses';
import {
  taskCostBreakdown, TASK_MIN_REWARD, TASK_PRIORITY_SURCHARGE,
  type AppFilter, type TaskKind, type TaskPriority,
} from '@/lib/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  /** true — «Аренца Темщик» (за деньги), false — «ГIончалла» (безвозмездно). */
  isPaid: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/** input[type=datetime-local] хочет local-time без таймзоны. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CreateTaskModal({ isOpen, isPaid, onClose, onCreated }: CreateTaskModalProps) {
  const { t, language } = useI18n();
  const [categories, setCategories] = useState<AppFilter[]>([]);
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
  const [minAccountDays, setMinAccountDays] = useState('0');
  const [minTasksDone, setMinTasksDone] = useState('0');
  const [allowNewcomers, setAllowNewcomers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetchTaskFilters('tasks').then(setCategories).catch(() => setCategories([]));
    // Срочное — через 30 минут (чаще всего «принеси сейчас»),
    // запланированное — на завтра.
    const soon = new Date(Date.now() + 30 * 60_000);
    const tomorrow = new Date(Date.now() + 24 * 3600_000);
    setDeadlineAt(toLocalInput(soon));
    setScheduledAt(toLocalInput(tomorrow));
  }, [isOpen]);

  // Адрес подставляем сам: берём координаты пользователя и находим
  // ближайший дом из адресной книги (та же функция, что у кнопки «Моё
  // место» на карте). Задание почти всегда «у меня дома», и ручной ввод
  // улицы каждый раз — лишняя работа.
  //
  // getUserCoords не показывает окно запроса сам: если разрешение не
  // выдано, поле просто остаётся пустым, и человек заполнит его руками.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void getUserCoords().then((position) => {
      if (cancelled || !position) return;
      // Не перетираем то, что пользователь уже начал вводить.
      setAddress((current) => {
        if (current.trim()) return current;
        try {
          const closest = findClosestSamashkiHouse(position);
          if (closest?.fullAddress) {
            setCoords({ lat: closest.lat, lng: closest.lng });
            return closest.fullAddress;
          }
        } catch {
          // Адресная книга недоступна — оставляем поле пустым.
        }
        return current;
      });
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
      await createTask({
        isPaid,
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
      });
      // Сбрасываем форму, чтобы следующее открытие было чистым.
      setTitle('');
      setDescription('');
      setReward(String(TASK_MIN_REWARD));
      setPurchaseBudget('');
      setPriority('normal');
      setSlots('1');
      setAddress('');
      setCoords(null);
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
            {isPaid ? t.taskCreateTitlePaid : t.taskCreateTitleFree}
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
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
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
            <div>
              <label htmlFor="task-category" className={labelClass}>{t.taskCategoryLabel}</label>
              <select
                id="task-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fieldClass}
              >
                {categories.length === 0 && <option value="other">{t.taskCategoryOther}</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.value}>
                    {(language === 'ce' && c.labelCe) || c.labelRu}
                  </option>
                ))}
              </select>
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
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
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
                    className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
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
                <dl className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] dark:bg-zinc-800/70">
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
                  <p className="pt-0.5 text-[10px] text-slate-400">
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
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        aria-pressed={paymentMethod === method}
                        className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                          paymentMethod === method
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {t[`taskPay_${method}` as keyof typeof t] as string}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500 dark:text-zinc-500">
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
              {coords && (
                <a
                  href={`https://yandex.ru/maps/?pt=${coords.lng},${coords.lat}&z=17&l=map`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {t.openOnMap}
                  <ExternalLink className="h-3 w-3" />
                </a>
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
          </div>

          {/* Требования: кого пускать на задание.
              Раньше блок был свёрнут в <details>: заказчик его не
              открывал и не знал, что фильтры вообще есть, — а потом
              удивлялся откликам без рейтинга. Показываем всегда. */}
          <div className={sectionClass}>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
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
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            </div>
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
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.taskPublishBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
