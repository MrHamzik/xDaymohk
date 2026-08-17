'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Power, MapPin, Search, Star } from 'lucide-react';
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
type FeedTab = 'nearby' | 'all' | 'mine' | 'taken';

export default function VayghullakhPage() {
  const { account } = useAuth();
  const { isCurrentUserAdmin } = useProfiles();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  // Задания, где я исполнитель, приходят отдельным запросом: общая лента
  // публичная и о моём участии не знает.
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [pendingReview, setPendingReview] = useState<string[]>([]);
  const [categories, setCategories] = useState<AppFilter[]>([]);
  const [tab, setTab] = useState<FeedTab>('nearby');
  const [category, setCategory] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [minReward, setMinReward] = useState(0);
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
        } catch {
          // не критично: лента уже показана
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить задания');
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    load();
    fetchTaskFilters('tasks').then(setCategories).catch(() => setCategories([]));
    // Тихо подчищаем просроченные и подтверждаем «зависшие» —
    // как раздел «Письма» в админке, без отдельного планировщика.
    runTaskMaintenance();
  }, [load]);

  // Живое обновление ленты: чужие действия (взяли задание, выполнили,
  // подтвердили) видны без перезахода.
  useTasksRealtime(load);

  useEffect(() => {
    if (!account) return;
    fetchExecutorStatus()
      .then((s) => { setIsActive(s.isActive); setActiveExecutors(s.activeExecutors); })
      .catch(() => {});
  }, [account]);

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
      setError(e instanceof Error ? e.message : 'Не удалось изменить статус');
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

  const visibleTasks = useMemo(() => {
    let list = withDistance;

    if (tab === 'mine') {
      list = list.filter((t) => t.authorId === account?.id);
    } else if (tab === 'taken') {
      // Реальный список участия — из /api/tasks/mine, а не догадки по статусу.
      // Завершённые сюда не попадают: /mine отдаёт и их (для метки
      // «ожидает оценки»), но во вкладке «В работе» им не место.
      // Исключение — задания, которые я ещё не оценил: их нужно видеть,
      // иначе оценку негде поставить.
      list = myTasks.filter(
        (t) => !['completed', 'cancelled', 'expired'].includes(t.status)
          || pendingReview.includes(t.id),
      );
    } else if (tab === 'nearby' && position) {
      list = list.filter((t) => typeof t.distanceM === 'number' && t.distanceM <= TASK_NEARBY_RADIUS_M);
    }

    if (category) list = list.filter((t) => t.category === category);
    if (priorityFilter) list = list.filter((t) => t.priority === priorityFilter);
    // Сравниваем с чистой наградой: надбавка за срочность и деньги
    // на закупку — не доход исполнителя.
    if (minReward > 0) list = list.filter((t) => t.reward >= minReward);

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
  }, [withDistance, myTasks, pendingReview, tab, category, priorityFilter, minReward, query, account?.id, position]);

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
              aria-label="Назад"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Аренца Темщик</h2>
              <p className="truncate text-sm text-slate-500 dark:text-zinc-500">
                Задания за вознаграждение · активны: {activeExecutors}
              </p>
            </div>
          </div>

          {/* Тумблер «Активен»: без него нельзя брать задания */}
          {account && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {isActive ? 'Вы активны' : 'Вы неактивны'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                  {isActive
                    ? 'Вы видите задания и можете их брать'
                    : 'Включите, чтобы брать задания'}
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
                {isActive ? 'Активен' : 'Включить'}
              </button>
            </div>
          )}

          <TaskFilterBar
            query={query}
            setQuery={setQuery}
            tab={tab}
            setTab={(v) => setTab(v as FeedTab)}
            tabs={[
              { value: 'nearby', label: 'Близко' },
              { value: 'all', label: 'Все' },
              { value: 'mine', label: 'Мои' },
              { value: 'taken', label: 'В работе', count: myTasks.length || undefined },
            ]}
            categories={categories}
            category={category}
            setCategory={setCategory}
            priority={priorityFilter}
            setPriority={setPriorityFilter}
            minReward={minReward}
            setMinReward={setMinReward}
          />

          {pendingReview.length > 0 && (
            <button
              type="button"
              onClick={() => setTab('taken')}
              className="mb-3 flex w-full items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-left text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
            >
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
              Ожидают вашей оценки: {pendingReview.length} — откройте задание и поставьте оценку
            </button>
          )}

          {tab === 'nearby' && geoDenied && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Геолокация недоступна — показываем все задания. Разрешите доступ, чтобы
              видеть задания в радиусе 1 км.
            </p>
          )}

          {error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
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
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-zinc-700">
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
                {tab === 'nearby' ? 'Рядом заданий нет' : 'Заданий пока нет'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Создайте первое — его увидят жители Даймохк.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Кнопка создания */}

      <CreateTaskModal
        isOpen={isCreateOpen}
        isPaid
        onClose={() => setIsCreateOpen(false)}
        onCreated={load}
      />
      <TaskDetailModal
        taskId={openTaskId}
        currentUserId={account?.id}
        onClose={() => setOpenTaskId(null)}
        onChanged={load}
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
        onOpenGullaq={() => setIsCreateOpen(true)}
      />
    </div>
  );
}
