'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HandHeart } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import TaskCard from '@/components/tasks/TaskCard';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import TaskDetailModal from '@/components/tasks/TaskDetailModal';
import TaskFilterBar from '@/components/tasks/TaskFilterBar';
import EmptyState from '@/components/ui/EmptyState';
import FeedSkeleton from '@/components/ui/FeedSkeleton';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import {
  fetchTasks,
  fetchTaskFilters,
  runTaskMaintenance,
  distanceMeters,
} from '@/lib/tasks/client';
import { TASK_NEARBY_RADIUS_M, type AppFilter, type Task } from '@/lib/types';
import { useTasksRealtime } from '@/lib/tasks/realtime';

type FeedTab = 'nearby' | 'all' | 'mine';

/**
 * «ГIончалла» (бывш. ВайГIо) — безвозмездная помощь на том же движке
 * заданий, что и «Аренца Темщик», но с isPaid = false: без награды,
 * без требований к возрасту исполнителя (помогать может любой).
 */
export default function VaygoPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const { isCurrentUserAdmin } = useProfiles();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<AppFilter[]>([]);
  const [tab, setTab] = useState<FeedTab>('nearby');
  const [category, setCategory] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [minReward, setMinReward] = useState(0);
  const [payment, setPayment] = useState('');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
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
      setTasks(await fetchTasks({ paid: false, limit: 100 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.tasksLoadError);
    } finally {
      setIsLoading(false);
    }
  }, [t.tasksLoadError]);

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
    if (tab !== 'nearby' || position || geoDenied) return;
    if (!navigator.geolocation) { setGeoDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300_000 },
    );
  }, [tab, position, geoDenied]);

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
    if (tab === 'mine') list = list.filter((t) => t.authorId === account?.id);
    else if (tab === 'nearby' && position) {
      list = list.filter((t) => typeof t.distanceM === 'number' && t.distanceM <= TASK_NEARBY_RADIUS_M);
    }
    // Отменённые видны только СТОРОНАМ сделки: заказчику в «Мои» и
    // исполнителю в «В работе». В общей ленте им делать нечего — это
    // закрытые заказы, а не предложения работы.
    if (tab !== 'mine') {
      list = list.filter((t) => t.status !== 'cancelled');
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
    if (tab === 'nearby' && position) {
      return [...list].sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9));
    }
    return list;
  }, [withDistance, tab, category, priorityFilter, minReward, payment, query, account?.id, position]);

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
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white">
                <HandHeart className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                {t.tasksGoTitle}
              </h2>
              <p className="truncate text-sm text-slate-500 dark:text-zinc-500">
                {t.tasksGoSubtitle}
              </p>
            </div>
          </div>

          <TaskFilterBar
            query={query}
            setQuery={setQuery}
            tab={tab}
            setTab={(v) => setTab(v as FeedTab)}
            tabs={[
              { value: 'nearby', label: t.tasksTabNearby },
              { value: 'all', label: t.tasksTabAll },
              { value: 'mine', label: t.tasksTabMine },
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
            accent="teal"
          />

          {error && (
            <p className="smk-note smk-note-danger mb-3 px-3 py-2">
              {error}
            </p>
          )}

          {isLoading ? (
            <FeedSkeleton />
          ) : visibleTasks.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleTasks.map((task) => (
                <TaskCard key={task.id} task={task} onOpen={(t) => setOpenTaskId(t.id)} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                query || category || priorityFilter || minReward > 0 || payment
                  ? t.emptyFiltered
                  : t.tasksEmptyGo
              }
              hint={
                query || category || priorityFilter || minReward > 0 || payment
                  ? t.emptyFilteredHint
                  : t.tasksEmptyGoHint
              }
              action={
                query || category || priorityFilter || minReward > 0 || payment ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setCategory('');
                      setPriorityFilter('');
                      setMinReward(0);
                      setPayment('');
                    }}
                    className="smk-btn-gold smk-shine inline-flex items-center px-3.5 py-2 smk-text-label"
                  >
                    {t.emptyResetFilters}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingTask(null); setIsCreateOpen(true); }}
                    className="smk-btn-gold smk-shine inline-flex items-center px-3.5 py-2 smk-text-label"
                  >
                    {t.emptyCreateGo}
                  </button>
                )
              }
            />
          )}
        </main>
      </div>


      <CreateTaskModal
        isOpen={isCreateOpen}
        isPaid={false}
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
        onOpenGo={() => { setEditingTask(null); setIsCreateOpen(true); }}
      />
    </div>
  );
}
