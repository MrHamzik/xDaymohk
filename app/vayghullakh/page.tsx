'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileWarning, Loader2, Power, MapPin, Search, ShieldAlert, Star } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import TaskCard from '@/components/tasks/TaskCard';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import TaskDetailModal from '@/components/tasks/TaskDetailModal';
import TaskFilterBar from '@/components/tasks/TaskFilterBar';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import {
  fetchTasks,
  fetchMyTasks,
  fetchTaskFilters,
  fetchExecutorStatus,
  setExecutorStatus,
  runTaskMaintenance,
  distanceMeters,
} from '@/lib/tasks/client';
import { TASK_NEARBY_RADIUS_M, type AppFilter, type Task } from '@/lib/types';
import { useTasksRealtime } from '@/lib/tasks/realtime';

/** Вкладки ленты. «Близко» — по умолчанию, 1 км от текущей позиции. */
type FeedTab = 'nearby' | 'all' | 'mine' | 'taken' | 'disputed' | 'review' | 'changed';

export default function VayghullakhPage() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { account } = useAuth();
  const { isCurrentUserAdmin } = useProfiles();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  // Задания, где я исполнитель, приходят отдельным запросом: общая лента
  // публичная и о моём участии не знает.
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [pendingReview, setPendingReview] = useState<string[]>([]);
  // Задания, где заказчик изменил условия и ждёт моего согласия.
  const [needsConsent, setNeedsConsent] = useState<string[]>([]);
  const [categories, setCategories] = useState<AppFilter[]>([]);
  const [tab, setTab] = useState<FeedTab>('nearby');
  const [category, setCategory] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [minReward, setMinReward] = useState(0);
  const [payment, setPayment] = useState('');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [isActive, setIsActive] = useState(false);
  const [activeExecutors, setActiveExecutors] = useState(0);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Задание, открытое на правку. Та же форма, что и для создания:
  // набор полей и проверки совпадают.
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const list = await fetchTasks({ paid: true, limit: 100 });
      setTasks(list);
      if (account) {
        try {
          const mine = await fetchMyTasks();
          setMyTasks(mine.tasks.filter((t) => t.isPaid));
          setPendingReview(mine.pendingReview);
          setNeedsConsent(mine.needsConsent);
        } catch {
          // не критично: лента уже показана
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.tasksLoadError);
    } finally {
      setIsLoading(false);
    }
  }, [account, t.tasksLoadError]);

  useEffect(() => {
    // Обслуживание идёт ПЕРЕД загрузкой, а не параллельно с ней.
    //
    // Раньше load() и runTaskMaintenance() стартовали одновременно:
    // лента успевала прийти раньше, чем уборка удаляла просроченные,
    // и они оставались на экране до следующего захода. Именно поэтому
    // «просроченные до сих пор не удалились из списка».
    //
    // Ждём уборку, но не даём ей заблокировать раздел: она сама себя
    // гасит по таймауту и ошибки не выбрасывает.
    let cancelled = false;
    const boot = async () => {
      await runTaskMaintenance();
      if (!cancelled) await load();
    };
    void boot();
    fetchTaskFilters('tasks').then(setCategories).catch(() => setCategories([]));
    return () => { cancelled = true; };
  }, [load]);

  // Живое обновление ленты: чужие действия (взяли задание, выполнили,
  // подтвердили) видны без перезахода.
  useTasksRealtime(load);

  // Быстрое создание с кнопки «+»: с другой страницы сюда приходят с
  // ?create=1 и форма должна открыться сразу. useSearchParams не берём —
  // он требует Suspense и переводит страницу в динамический рендер;
  // здесь достаточно один раз прочитать адрес после монтирования.
  // Флаг из адреса убираем, иначе форма открывалась бы снова при
  // любом возврате «назад» на эту страницу.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') !== '1') return;
    setEditingTask(null);
    setIsCreateOpen(true);
    params.delete('create');
    const rest = params.toString();
    router.replace(rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
  }, [router]);


  useEffect(() => {
    if (!account) return;
    fetchExecutorStatus()
      .then(async (s) => {
        setActiveExecutors(s.activeExecutors);
        // «Всегда Активен, если в сети»: открытие раздела включает
        // статус на те же 30 минут, что и ручной тумблер. Окно
        // продлевается любым действием — отдельного таймера не нужно.
        if (!s.isActive && settings.autoActiveOnOpen) {
          try {
            await setExecutorStatus(true);
            setIsActive(true);
            const fresh = await fetchExecutorStatus();
            setActiveExecutors(fresh.activeExecutors);
            return;
          } catch {
            // не критично: человек включит тумблер вручную
          }
        }
        setIsActive(s.isActive);
      })
      .catch(() => {});
  }, [account, settings.autoActiveOnOpen]);

  // Геолокация только по требованию вкладки «Близко»: браузер наказывает
  // за автоматические запросы, поэтому просим при явном выборе вкладки.
  useEffect(() => {
    if (tab !== 'nearby' || position || geoDenied) return;
    if (!navigator.geolocation) { setGeoDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300_000 },
    );
  }, [tab, position, geoDenied]);

  const handleToggleActive = async () => {
    if (!account) return;
    setIsTogglingStatus(true);
    try {
      const next = !isActive;
      await setExecutorStatus(next);
      setIsActive(next);
      const s = await fetchExecutorStatus();
      setActiveExecutors(s.activeExecutors);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.tasksStatusError);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  /** Расстояния считаем один раз на список, а не в каждой карточке. */
  const withDistance = useMemo(() => {
    if (!position) return tasks;
    return tasks.map((task) => (
      typeof task.lat === 'number' && typeof task.lng === 'number'
        ? { ...task, distanceM: distanceMeters(position, { lat: task.lat, lng: task.lng }) }
        : task
    ));
  }, [tasks, position]);

  /**
   * Задания, где я исполнитель и они ещё не закрыты.
   *
   * Тот же список идёт и в ленту, и в счётчик на вкладке. Раньше счётчик
   * брал myTasks.length — полный ответ /api/tasks/mine, куда специально
   * попадают и завершённые (по ним нужна оценка). Из-за этого на вкладке
   * висело «4», а внутри после фильтрации не оставалось ничего.
   */
  const takenTasks = useMemo(() => myTasks.filter(
    // Отменённые сюда не попадают: они удаляются в момент отмены
    // (обновление 42), исполнителю уходит уведомление.
    (t) => !['completed', 'cancelled', 'expired', 'disputed'].includes(t.status),
  ), [myTasks]);

  /**
   * Скрытый раздел «На рассмотрении».
   *
   * Спор — это не работа: сдавать там нечего, идёт разбирательство.
   * Пока такие задания лежали в «В работе», они мешали видеть реальные
   * дела. Раздел появляется только когда споры есть, и виден ОБЕИМ
   * сторонам: исполнителю (он в myTasks) и заказчику (его задания
   * приходят общей лентой).
   */
  const disputedTasks = useMemo(() => {
    const mine = myTasks.filter((t) => t.status === 'disputed');
    const authored = tasks.filter(
      (t) => t.status === 'disputed' && t.authorId === account?.id,
    );
    // Одно задание может попасть в оба списка (например, у админа) —
    // склеиваем по id, иначе карточка задвоится.
    const byId = new Map([...mine, ...authored].map((t) => [t.id, t]));
    return [...byId.values()];
  }, [myTasks, tasks, account?.id]);

  /**
   * Скрытый раздел «Ожидают оценки» — только закрытые задания, по
   * которым я ещё не поставил оценку. Раньше кнопка вела в «В работе»,
   * где они терялись среди живых.
   */
  const reviewTasks = useMemo(
    () => myTasks.filter((t) => pendingReview.includes(t.id)),
    [myTasks, pendingReview],
  );

  /**
   * Скрытый раздел «Изменённые».
   *
   * Заказчик поправил награду, адрес или срок после моего отклика —
   * пока я не приму новые условия, он не сможет меня одобрить. Раздел
   * нужен, чтобы такие задания не терялись: в общей ленте они выглядят
   * как обычные открытые.
   */
  const changedTasks = useMemo(
    () => myTasks.filter((t) => needsConsent.includes(t.id)),
    [myTasks, needsConsent],
  );

  const visibleTasks = useMemo(() => {
    let list = withDistance;

    if (tab === 'mine') {
      list = list.filter((t) => t.authorId === account?.id);
    } else if (tab === 'taken') {
      list = takenTasks;
    } else if (tab === 'disputed') {
      list = disputedTasks;
    } else if (tab === 'review') {
      list = reviewTasks;
    } else if (tab === 'changed') {
      list = changedTasks;
    } else if (tab === 'nearby' && position) {
      list = list.filter((t) => typeof t.distanceM === 'number' && t.distanceM <= TASK_NEARBY_RADIUS_M);
    }

    // Отменённые видны только СТОРОНАМ сделки: заказчику в «Мои» и
    // исполнителю в «В работе». В общей ленте им делать нечего — это
    // закрытые заказы, а не предложения работы.
    if (!['mine', 'taken', 'disputed', 'review', 'changed'].includes(tab)) {
      list = list.filter((t) => t.status !== 'cancelled');
    }
    // Споры живут в своём разделе и в общей ленте не мешаются.
    if (!['disputed', 'mine'].includes(tab)) {
      list = list.filter((t) => t.status !== 'disputed');
    }

    if (category) list = list.filter((t) => t.category === category);
    // Фильтры хранят выбор строкой через запятую (может быть несколько).
    if (priorityFilter) {
      const picked = priorityFilter.split(',').filter(Boolean);
      list = list.filter((t) => picked.includes(t.priority));
    }
    // Сравниваем с чистой наградой: надбавка за срочность и деньги
    // на закупку — не доход исполнителя.
    if (minReward > 0) list = list.filter((t) => t.reward >= minReward);
    // Способ расчёта: у старых заданий колонки нет — считаем наличными,
    // иначе фильтр «Наличные» их бы не находил.
    if (payment) {
      const picked = payment.split(',').filter(Boolean);
      list = list.filter((t) => picked.includes(t.paymentMethod ?? 'cash'));
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }

    // «Близко» — от ближнего к дальнему, остальные вкладки — свежие сверху.
    if (tab === 'nearby' && position) {
      return [...list].sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9));
    }
    return list;
  }, [withDistance, takenTasks, disputedTasks, reviewTasks, changedTasks, tab,
    category, priorityFilter, minReward, payment, query, account?.id, position]);

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

      <div className="mx-auto flex w-full max-w-6xl items-start justify-start gap-6 px-3.5 pb-20 pt-18 sm:pb-8 lg:pt-24">
        <aside className="sticky top-24 z-40 hidden h-[calc(100vh-8rem)] w-[290px] shrink-0 flex-col lg:flex">
          <div className="no-scrollbar flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
            <SidebarNav isAdmin={isCurrentUserAdmin} />
          </div>
        </aside>

        <main className="min-w-0 max-w-3xl flex-1">
          <div className="mb-4 flex items-center gap-3">
            <Link
              href="/catalog"
              aria-label={t.tasksBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t.tasksGullaqTitle}</h2>
              <p className="truncate text-sm text-slate-500 dark:text-zinc-500">
                {t.tasksGullaqSubtitle} · {t.tasksActiveExecutors}: {activeExecutors}
              </p>
            </div>
          </div>

          {/* Тумблер «Активен»: без него нельзя брать задания */}
          {account && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {isActive ? t.tasksYouActive : t.tasksYouInactive}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                  {isActive ? t.tasksActiveHint : t.tasksInactiveHint}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                disabled={isTogglingStatus}
                onClick={handleToggleActive}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-60 ${
                  isActive
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-zinc-700 dark:text-zinc-300'
                }`}
              >
                {isTogglingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                {isActive ? t.tasksActiveBtn : t.tasksActivateBtn}
              </button>
            </div>
          )}

          <TaskFilterBar
            query={query}
            setQuery={setQuery}
            tab={tab}
            setTab={(v) => setTab(v as FeedTab)}
            tabs={[
              { value: 'nearby', label: t.tasksTabNearby },
              { value: 'all', label: t.tasksTabAll },
              { value: 'mine', label: t.tasksTabMine },
              { value: 'taken', label: t.tasksTabTaken, count: takenTasks.length || undefined },
              // «На рассмотрении» и «Ожидают оценки» СКРЫТЫЕ: их нет
              // среди вкладок, попасть туда можно только с красной или
              // жёлтой плашки выше. Постоянные вкладки были бы шумом —
              // у большинства жителей эти разделы всегда пусты.
            ]}
            categories={categories}
            category={category}
            setCategory={setCategory}
            priority={priorityFilter}
            setPriority={setPriorityFilter}
            minReward={minReward}
            setMinReward={setMinReward}
            payment={payment}
            setPayment={setPayment}
          />

          {/* Споры — «опасность». Плашка висит, ПОКА есть нерешённые
              вопросы: и внутри раздела тоже, иначе, зайдя в него,
              человек терял единственное напоминание. Внутри она
              работает на выход. */}
          {disputedTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setTab(tab === 'disputed' ? 'all' : 'disputed')}
              className="smk-note smk-note-danger mb-3 flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                {t.tasksDisputedBanner}: {disputedTasks.length} —{' '}
                {tab === 'disputed' ? t.tasksHiddenBack : t.tasksDisputedHint}
              </span>
            </button>
          )}

          {/* Изменённые условия — «опасность»: без согласия исполнителя
              заказчик не сможет его одобрить, и отклик зависнет. */}
          {changedTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setTab(tab === 'changed' ? 'all' : 'changed')}
              className="smk-note smk-note-danger mb-3 flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <FileWarning className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                {t.tasksChangedBanner}: {changedTasks.length} —{' '}
                {tab === 'changed' ? t.tasksHiddenBack : t.tasksChangedHint}
              </span>
            </button>
          )}

          {/* Оценки — «предупреждение». Тоже скрытый раздел: попасть в
              него можно только отсюда, там видны лишь задания без
              оценки. Раньше кнопка вела в «В работе», где они терялись
              среди живых. */}
          {reviewTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setTab(tab === 'review' ? 'all' : 'review')}
              className="smk-note smk-note-warn mb-3 flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <Star className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                {t.tasksPendingReview}: {reviewTasks.length} —{' '}
                {tab === 'review' ? t.tasksHiddenBack : t.tasksPendingReviewHint}
              </span>
            </button>
          )}

          {tab === 'nearby' && geoDenied && (
            <p className="smk-note smk-note-warn mb-3 flex items-start gap-2 px-3 py-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t.tasksGeoDenied}
            </p>
          )}

          {error && (
            <p className="smk-note smk-note-danger mb-3 px-3 py-2">
              {error}
            </p>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
          ) : visibleTasks.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  needsReview={pendingReview.includes(task.id)}
                  onOpen={(t) => setOpenTaskId(t.id)}
                />
              ))}
            </div>
          ) : (
            <div className="smk-dashed p-8 text-center">
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
                {tab === 'nearby' ? t.tasksEmptyNearby : t.tasksEmpty}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {t.tasksEmptyHint}
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Кнопка создания */}

      <CreateTaskModal
        isOpen={isCreateOpen}
        isPaid
        editTask={editingTask}
        onClose={() => { setIsCreateOpen(false); setEditingTask(null); }}
        onCreated={load}
      />
      <TaskDetailModal
        taskId={openTaskId}
        currentUserId={account?.id}
        onClose={() => setOpenTaskId(null)}
        onChanged={load}
        onEdit={(task) => {
          // Карточку закрываем: форма правки — тоже модалка, две
          // наложенные друг на друга читались бы как сбой.
          setOpenTaskId(null);
          setEditingTask(task);
          setIsCreateOpen(true);
        }}
      />

      <BottomNav
        onOpenMenu={() => setIsMenuDrawerOpen(true)}
        onOpenCreate={() => setIsCreateSheetOpen(true)}
        isAdmin={isCurrentUserAdmin}
      />
      <MobileMenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        isAdmin={isCurrentUserAdmin}
      />
      {/* Плюс в нижнем баре открывает общее круговое меню; выбор
          нужного раздела сразу открывает форму, не уводя со страницы. */}
      <CreateActionModal
        isOpen={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
        onOpenCreateProfile={() => router.push('/catalog')}
        onOpenGullaq={() => { setEditingTask(null); setIsCreateOpen(true); }}
      />
    </div>
  );
}
