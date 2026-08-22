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
import PinProposeModal from '@/components/PinProposeModal';
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

  const activeProfile: Profile | null = activeProfileId
    ? profiles.find((profile) => profile.id === activeProfileId) ?? null
    : null;



  return (
    <div className="space-y-5">
      <SwipeTabs
        tabs={[
          { id: 'main', label: t.homeTabMain },
          { id: 'picks', label: t.homeTabPicks },
          { id: 'stats', label: t.homeTabStats },
        ]}
        active={homeTab}
        onChange={setHomeTab}
        panels={{
          /* «Главная» наполняется следующим этапом: баннер «Каталог
              родины» и аккаунт-блок убраны по замечаниям 23.08
              (п.7, п.8). */
          main: (
            <EmptyState title={t.inDevelopment} hint={t.homeMainEmpty} />
          ),

          /* «Подборка» — предложенное жителями и закреплённое админом. */
          picks: (
            <HomePinnedSection
              onOpenProfile={setActiveProfileId}
              onOpenTask={setTaskId}
            />
          ),

          /* «Статистика» — письма, подписка, такси, чтение. */
          stats: (
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

            </div>
          ),

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
interface PinnedRow {
  id: string;
  target_type: 'profile' | 'task';
  target_id: string;
}

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
