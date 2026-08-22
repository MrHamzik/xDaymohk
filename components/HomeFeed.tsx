'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award, Bell, BookMarked, BookOpen, CarFront, ChevronRight, Crown,
  Landmark, MapPin, Search, Sparkles, Users,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import SpecialistLeaders from '@/components/SpecialistLeaders';
import ProfileModal from '@/components/ProfileModal';
import ProfileCard from '@/components/ProfileCard';
import TaskCard from '@/components/tasks/TaskCard';
import TaskDetailModal from '@/components/tasks/TaskDetailModal';
import NotificationCenter from '@/components/NotificationCenter';
import SwipeTabs from '@/components/SwipeTabs';
import EmptyState from '@/components/ui/EmptyState';
import { fetchTasks, fetchTask, fetchTaskFilters } from '@/lib/tasks/client';
import { loadReadingProgress } from '@/lib/reading-progress';
import {
  fetchMyProgress, findProgress, migrateLocalBookmarks,
} from '@/lib/reading-progress-db';
import {
  READING_HREFS, READING_MENU_IDS, READING_SECTIONS, type ReadingSection,
} from '@/lib/reading-sections';
import { formatSavedHint, type SavedMark } from '@/lib/reading-rules';
import { formatCount } from '@/lib/text';
import type { AppFilter, Profile, Task } from '@/lib/types';

/**
 * Персональная главная — три вкладки с горизонтальным свайпом
 * (решение владельца, Этап 2-каталог, п.6):
 *
 *  · «Главная» — письма, Pro, такси, «Продолжить чтение» и старый
 *    градиентный баннер каталога (перенесён сюда);
 *  · «Рейтинг» — специалист дня/недели/месяца, ниже весь список
 *    специалистов по количеству отзывов;
 *  · «Задания» — сначала дорогие, потом остальные; лёгкие фильтры
 *    (поиск, категория, платные/бесплатные).
 *
 * Панели держатся в памяти после первого открытия — переключение
 * мгновенное (п.5 замечаний).
 */
export default function HomeFeed() {
  const { account } = useAuth();
  const { t, language } = useI18n();
  const { settings } = useSettings();
  const { profiles, isCurrentUserAdmin, isProfileAdmin, addReview } = useProfiles();
  const [homeTab, setHomeTab] = useState('main');
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  /** Живая сводка ВайТакси: онлайн-таксисты и множитель спроса. */
  const [taxiSummary, setTaxiSummary] = useState<{ onlineDrivers: number; surge: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/taxi/summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setTaxiSummary({ onlineDrivers: Number(data.onlineDrivers ?? 0), surge: Number(data.surge ?? 1) });
        }
      })
      .catch(() => { /* такси пока без БД — карточка останется заглушкой */ });
    return () => { cancelled = true; };
  }, []);
  /** Сохранённые точки чтения по разделам (БД либо локальные гостевые). */
  const [progress, setProgress] = useState<Partial<Record<ReadingSection, SavedMark>>>({});

  // Прогресс чтения. У вошедших — база (п.3 ТЗ Этапа 2), гостевые
  // закладки после входа переносятся туда же.
  useEffect(() => {
    let cancelled = false;

    if (account) {
      void (async () => {
        await migrateLocalBookmarks(account.id);
        const list = await fetchMyProgress();
        if (cancelled) return;
        const next: Partial<Record<ReadingSection, SavedMark>> = {};
        for (const section of READING_SECTIONS) {
          const mark = findProgress(list ?? [], section);
          if (mark) {
            next[section] = {
              chapterId: mark.chapterId,
              scroll: mark.scroll,
              titleRu: mark.titleRu,
              titleCe: mark.titleCe,
              chapterNumber: mark.chapterNumber,
            };
          }
        }
        setProgress(next);
      })();
    } else {
      const next: Partial<Record<ReadingSection, SavedMark>> = {};
      for (const section of READING_SECTIONS) {
        const mark = loadReadingProgress(section);
        if (mark) {
          next[section] = {
            chapterId: mark.articleId,
            scroll: mark.scroll,
            titleRu: mark.titleRu,
            titleCe: mark.titleCe,
            chapterNumber: mark.chapterNumber,
          };
        }
      }
      setProgress(next);
    }

    return () => { cancelled = true; };
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Блоки разделов: только не скрытые в меню И с сохранённым прогрессом.
  const hiddenMenu = new Set(settings.hiddenMenu);
  const readLinksWithProgress = READ_LINKS.filter(
    (item) => !hiddenMenu.has(READING_MENU_IDS[item.section]) && progress[item.section],
  );

  const firstName = (account?.fullName || '').trim().split(/\s+/)[0];
  const hello = firstName
    ? t.homeHello.replace('{name}', firstName)
    : t.homeHelloGuest;

  const activeProfile: Profile | null = activeProfileId
    ? profiles.find((profile) => profile.id === activeProfileId) ?? null
    : null;

  // Видимые специалисты для вкладки «Рейтинг»: по числу отзывов.
  const rankedSpecialists = useMemo(
    () => profiles
      .filter((profile) => profile.isSpecialist && !profile.isHidden && !profile.isBanned)
      .sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0)),
    [profiles],
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="smk-title smk-text-display font-black text-slate-900 dark:text-white">
          {hello}
        </h1>
        <p className="mt-1 smk-text-body text-slate-500 dark:text-zinc-400">{t.homeFeedLead}</p>
      </header>

      <SwipeTabs
        tabs={[
          { id: 'main', label: t.homeTabMain },
          { id: 'rating', label: t.homeTabRating },
          { id: 'tasks', label: t.homeTabTasks },
        ]}
        active={homeTab}
        onChange={setHomeTab}
        panels={{
          main: (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <NotificationCenter
                  trigger={({ open, unreadCount }) => (
                    <button
                      type="button"
                      onClick={open}
                      className="smk-lux flex w-full items-center gap-3 px-3.5 py-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                        <Bell className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block smk-text-title font-bold text-slate-900 dark:text-white">
                          {unreadCount > 0
                            ? t.homeUnread.replace('{n}', String(unreadCount))
                            : t.homeUnreadNone}
                        </span>
                        <span className="smk-text-label font-semibold text-emerald-700 dark:text-emerald-400">
                          {t.homeOpenMail}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 smk-arrow" />
                    </button>
                  )}
                />

                <Link href="/pro" className="smk-lux flex items-center gap-3 px-3.5 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--smk-gold)] text-white">
                    <Crown className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block smk-text-title font-bold text-slate-900 dark:text-white">
                      {t.proTitle}
                    </span>
                    <span className="smk-text-label text-slate-500 dark:text-zinc-400">
                      {t.proOpen}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 smk-arrow" />
                </Link>

                {/* Живая сводка ВайТакси: сколько таксистов онлайн и
                    текущий множитель («в разное время разные
                    ценники») — решение владельца. */}
                <Link href="/taxi" className="smk-lux flex items-center gap-3 px-3.5 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <CarFront className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block smk-text-title font-bold text-slate-900 dark:text-white">
                      {t.homeTaxiPeak}
                    </span>
                    <span className="smk-text-label text-slate-500 dark:text-zinc-400">
                      {taxiSummary
                        ? `${language === 'ce' ? 'Онлайн таксисташ' : 'Онлайн таксистов'}: ${taxiSummary.onlineDrivers} · ×${taxiSummary.surge}`
                        : t.homeTaxiNone}
                    </span>
                  </span>
                  {taxiSummary && taxiSummary.surge > 1 && (
                    <span className="smk-chip smk-note-warn">×{taxiSummary.surge}</span>
                  )}
                </Link>
              </div>

              {/* п.4: блоки «Продолжить чтение» — только с прогрессом. */}
              {readLinksWithProgress.length > 0 && (
                <section>
                  <h2 className="mb-2 smk-text-title font-extrabold text-slate-900 dark:text-white">
                    {t.homeContinue}
                  </h2>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {readLinksWithProgress.map((item) => {
                      const Icon = item.icon;
                      const href = READING_HREFS[item.section];
                      const mark = progress[item.section];
                      const linkHref = mark
                        ? `${href}?chapter=${encodeURIComponent(mark.chapterId)}`
                        : href;
                      return (
                        <Link key={item.section} href={linkHref} className="smk-lux flex items-center gap-3 px-3.5 py-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hero-gradient text-white">
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate smk-text-title font-bold text-slate-900 dark:text-white">
                              {t[item.titleKey]}
                            </span>
                            <span className="block truncate smk-text-label text-slate-500 dark:text-zinc-400">
                              {mark
                                ? formatSavedHint(mark, language, t.readChapter)
                                : t.homeContinueStart}
                            </span>
                          </span>
                          <span className="smk-text-label font-bold text-emerald-700 dark:text-emerald-400">
                            {mark ? t.homeContinueOpen : t.homeContinueStart}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Старый градиентный баннер каталога перенесён на
                  главную (решение владельца). */}
              <HomeHeroBanner specialistCount={rankedSpecialists.length} />

              {/* Закреплённые администрацией блоки (скрепка → админка
                  → главная), обновление 74. */}
              <HomePinnedSection
                onOpenProfile={setActiveProfileId}
                onOpenTask={setTaskId}
              />
            </div>
          ),

          rating: (
            <div className="space-y-4">
              <SpecialistLeaders onOpen={(id) => setActiveProfileId(id)} />
              <section>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t.ratingListTitle}
                </h2>
                <p className="mb-2 smk-text-label text-slate-500 dark:text-zinc-400">
                  {t.ratingListHint}
                </p>
                {rankedSpecialists.length === 0 ? (
                  <EmptyState title={t.nothingFound} hint={t.homeNoTasks} />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {rankedSpecialists.map((profile) => (
                      <ProfileCard
                        key={profile.id}
                        profile={profile}
                        onSelect={(selected) => setActiveProfileId(selected.id)}
                        isAdminStatus={isProfileAdmin(profile)}
                        showPending={Boolean(isCurrentUserAdmin || (account && profile.ownerId === account.id))}
                        isOwnProfile={Boolean(account && profile.ownerId === account.id)}
                        isAdmin={isCurrentUserAdmin}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          ),

          tasks: <HomeTasksTab onOpenTask={setTaskId} />,
        }}
      />

      <ProfileModal
        profile={activeProfile}
        isAdminStatus={activeProfile ? isProfileAdmin(activeProfile) : false}
        showPending={Boolean(isCurrentUserAdmin || (account && activeProfile?.ownerId === account.id))}
        isViewerBlocked={Boolean(account?.isBlocked)}
        onClose={() => setActiveProfileId(null)}
        onReview={addReview}
      />
      <TaskDetailModal
        taskId={taskId}
        currentUserId={account?.id}
        onClose={() => setTaskId(null)}
        onChanged={() => { /* лента заданий обновится при следующем открытии вкладки */ }}
      />
    </div>
  );
}

/** Четыре блока чтения: порядок по ТЗ (Коран, Нохчалма, Руководство, Сира). */
const READ_LINKS: Array<{
  section: ReadingSection;
  icon: typeof BookOpen;
  titleKey: 'navQuran' | 'navSira' | 'vaynakhTitle' | 'navGuide';
}> = [
  { section: 'quran', icon: BookOpen, titleKey: 'navQuran' },
  { section: 'nochchalma', icon: Landmark, titleKey: 'vaynakhTitle' },
  { section: 'guide', icon: BookOpen, titleKey: 'navGuide' },
  { section: 'sira', icon: BookMarked, titleKey: 'navSira' },
];

/** Прежний hero каталога — двухцветный градиент, теперь на главной. */
function HomeHeroBanner({ specialistCount }: { specialistCount: number }) {
  const { t } = useI18n();
  return (
    <section className="smk-sign relative overflow-hidden rounded-2xl bg-hero-gradient p-4 text-white shadow-md sm:p-5" aria-labelledby="home-hero-title">
      <div className="relative z-10 max-w-2xl">
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-600/60 px-2.5 py-0.5 smk-text-label font-semibold text-emerald-100 backdrop-blur-md">
          <Sparkles className="h-3 w-3 text-emerald-300" />
          {t.heroBadge}
        </span>
        <h2 id="home-hero-title" className="mb-1 text-xl font-extrabold tracking-tight sm:text-2xl">
          {t.heroTitle}
        </h2>
        <p className="mb-3 max-w-xl text-xs leading-relaxed text-emerald-100 sm:text-sm">
          {t.heroSubtitle}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1 font-medium backdrop-blur-sm">
            <Users className="h-3 w-3 text-emerald-300" />
            {formatCount(specialistCount, t.heroProfilesCount, t.heroProfilesCount, t.heroProfilesCount)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1 font-medium backdrop-blur-sm">
            <Award className="h-3 w-3 text-emerald-300" />
            {t.heroRatingDocs}
          </span>
          <Link
            href="/map"
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1 font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
          >
            <MapPin className="h-3 w-3" />
            {t.heroOpenMap}
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Вкладка «Задания»: сначала дорогие, потом остальные; лёгкие
 * фильтры — поиск, категория, платные/бесплатные (решение владельца).
 */
function HomeTasksTab({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [categories, setCategories] = useState<AppFilter[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [paidMode, setPaidMode] = useState<'all' | 'paid' | 'free'>('all');

  useEffect(() => {
    let cancelled = false;
    void fetchTasks({ status: 'open', sort: 'reward', limit: 100 })
      .then((list) => { if (!cancelled) setTasks(list); })
      .catch(() => { if (!cancelled) setTasks([]); });
    void fetchTaskFilters('tasks')
      .then((list) => { if (!cancelled) setCategories(list); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tasks ?? []).filter((task) => {
      if (paidMode === 'paid' && !task.isPaid) return false;
      if (paidMode === 'free' && task.isPaid) return false;
      if (category !== 'all' && task.category !== category) return false;
      if (q && !`${task.title} ${task.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, query, category, paidMode]);

  const expensive = filtered.filter((task) => task.isPaid);
  const rest = filtered.filter((task) => !task.isPaid);

  const field = 'smk-field w-full px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white';

  return (
    <div className="space-y-4">
      {/* Лёгкие фильтры */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="smk-ico pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.tasksSearchPlaceholder}
            aria-label={t.tasksSearchPlaceholder}
            className={`${field} pl-9`}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'paid', 'free'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaidMode(mode)}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                paidMode === mode
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'smk-field text-slate-600 dark:text-zinc-400'
              }`}
            >
              {mode === 'all' ? t.tasksFilterPaidAll : mode === 'paid' ? t.tasksFilterPaidOnly : t.tasksFilterFreeOnly}
            </button>
          ))}
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label={t.tasksFilterCategoryAll}
            className="smk-field rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300"
          >
            <option value="all">{t.tasksFilterCategoryAll}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.value}>{c.labelRu}</option>
            ))}
          </select>
        </div>
      </div>

      {tasks === null && <p className="smk-text-label text-slate-500 dark:text-zinc-400">{t.loading}</p>}
      {tasks !== null && filtered.length === 0 && (
        <EmptyState title={t.homeNoTasks} hint={t.searchEmptyHint} />
      )}

      {expensive.length > 0 && (
        <section>
          <h2 className="mb-2 smk-text-title font-extrabold text-slate-900 dark:text-white">
            {t.tasksTabExpensive}
          </h2>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {expensive.map((task) => (
              <TaskCard key={task.id} task={task} onOpen={(item) => onOpenTask(item.id)} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="mb-2 smk-text-title font-extrabold text-slate-900 dark:text-white">
            {t.tasksTabRest}
          </h2>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {rest.map((task) => (
              <TaskCard key={task.id} task={task} onOpen={(item) => onOpenTask(item.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface PinnedRow {
  id: string;
  target_type: 'profile' | 'task';
  target_id: string;
}

/**
 * Закреплённые администрацией анкеты и задания на главной
 * (обновление 74, финал цикла «скрепка»). Скрытые и забаненные
 * анкеты отсеиваются здесь же, как во всём каталоге. Пусто — блок
 * не рисуется вовсе.
 */
function HomePinnedSection({
  onOpenProfile,
  onOpenTask,
}: {
  onOpenProfile: (id: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const { t } = useI18n();
  const { profiles, isCurrentUserAdmin, isProfileAdmin } = useProfiles();
  const { account } = useAuth();
  const [pinned, setPinned] = useState<PinnedRow[] | null>(null);
  const [pinnedTasks, setPinnedTasks] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/home-pinned', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { pinned: [] }))
      .then((data) => {
        if (cancelled) return;
        const list: PinnedRow[] = Array.isArray(data?.pinned) ? data.pinned : [];
        setPinned(list);
        const taskIds = list.filter((p) => p.target_type === 'task').map((p) => p.target_id);
        void Promise.all(taskIds.map((id) => fetchTask(id).then((r) => r.task).catch(() => null)))
          .then((tasks) => {
            if (!cancelled) setPinnedTasks(tasks.filter((task): task is Task => Boolean(task && task.status === 'open')));
          });
      })
      .catch(() => { if (!cancelled) setPinned([]); });
    return () => { cancelled = true; };
  }, []);

  const pinnedProfiles = useMemo(
    () => (pinned ?? [])
      .filter((p) => p.target_type === 'profile')
      .map((p) => profiles.find((profile) => profile.id === p.target_id))
      .filter((profile): profile is Profile => Boolean(profile && !profile.isHidden && !profile.isBanned)),
    [pinned, profiles],
  );

  if (!pinned || (pinnedProfiles.length === 0 && pinnedTasks.length === 0)) return null;

  return (
    <section>
      <h2 className="mb-2 smk-text-title font-extrabold text-slate-900 dark:text-white">
        {t.homePinnedTitle}
      </h2>
      {pinnedProfiles.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {pinnedProfiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onSelect={(selected) => onOpenProfile(selected.id)}
              isAdminStatus={isProfileAdmin(profile)}
              showPending={Boolean(isCurrentUserAdmin || (account && profile.ownerId === account.id))}
              isOwnProfile={Boolean(account && profile.ownerId === account.id)}
              isAdmin={isCurrentUserAdmin}
            />
          ))}
        </div>
      )}
      {pinnedTasks.length > 0 && (
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {pinnedTasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={(item) => onOpenTask(item.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
