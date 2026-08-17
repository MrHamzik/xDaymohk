'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, HandHeart, Search } from 'lucide-react';
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
  fetchTaskFilters,
  runTaskMaintenance,
  distanceMeters,
} from '@/lib/tasks/client';
import { TASK_NEARBY_RADIUS_M, type AppFilter, type Task } from '@/lib/types';

type FeedTab = 'nearby' | 'all' | 'mine';

/**
 * «ГIончалла» (бывш. ВайГIо) — безвозмездная помощь на том же движке
 * заданий, что и «Аренца Темщик», но с isPaid = false: без награды,
 * без требований к возрасту исполнителя (помогать может любой).
 */
export default function VaygoPage() {
  const { account } = useAuth();
  const { isCurrentUserAdmin } = useProfiles();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<AppFilter[]>([]);
  const [tab, setTab] = useState<FeedTab>('nearby');
  const [category, setCategory] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [minReward, setMinReward] = useState(0);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
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
      setTasks(await fetchTasks({ paid: false, limit: 100 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchTaskFilters('tasks').then(setCategories).catch(() => setCategories([]));
    runTaskMaintenance();
  }, [load]);

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
    if (tab === 'nearby' && position) {
      return [...list].sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9));
    }
    return list;
  }, [withDistance, tab, category, priorityFilter, minReward, query, account?.id, position]);

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
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white">
                <HandHeart className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                ГIончалла
              </h2>
              <p className="truncate text-sm text-slate-500 dark:text-zinc-500">
                Безвозмездная помощь — садака за савваб
              </p>
            </div>
          </div>

          <TaskFilterBar
            query={query}
            setQuery={setQuery}
            tab={tab}
            setTab={(v) => setTab(v as FeedTab)}
            tabs={[
              { value: 'nearby', label: 'Близко' },
              { value: 'all', label: 'Все' },
              { value: 'mine', label: 'Мои' },
            ]}
            categories={categories}
            category={category}
            setCategory={setCategory}
            priority={priorityFilter}
            setPriority={setPriorityFilter}
            minReward={minReward}
            setMinReward={setMinReward}
            accent="teal"
          />

          {error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
            </div>
          ) : visibleTasks.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleTasks.map((task) => (
                <TaskCard key={task.id} task={task} onOpen={(t) => setOpenTaskId(t.id)} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-zinc-700">
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
                Просьб о помощи пока нет
              </p>
              <p className="mt-1 text-xs text-slate-400">
                «Кто поможет брату своему — тому поможет Аллах»
              </p>
            </div>
          )}
        </main>
      </div>


      <CreateTaskModal
        isOpen={isCreateOpen}
        isPaid={false}
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
        onOpenGo={() => setIsCreateOpen(true)}
      />
    </div>
  );
}
