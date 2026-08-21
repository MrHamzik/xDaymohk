'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell, BookMarked, BookOpen, CarFront, ChevronRight, Crown, Landmark,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import SpecialistLeaders from '@/components/SpecialistLeaders';
import ProfileModal from '@/components/ProfileModal';
import TaskCard from '@/components/tasks/TaskCard';
import TaskDetailModal from '@/components/tasks/TaskDetailModal';
import NotificationCenter from '@/components/NotificationCenter';
import { fetchTasks } from '@/lib/tasks/client';
import { loadReadingProgress } from '@/lib/reading-progress';
import {
  fetchMyProgress, findProgress, migrateLocalBookmarks,
} from '@/lib/reading-progress-db';
import { READING_HREFS, READING_MENU_IDS, READING_SECTIONS, type ReadingSection } from '@/lib/reading-sections';
import { formatSavedHint, type SavedMark } from '@/lib/reading-rules';
import type { Profile, Task } from '@/lib/types';

/**
 * Четыре блока «Продолжить чтение» на главной (п.1 и п.4 ТЗ Этапа 2).
 * Порядок — по ТЗ: Коран, Нохчалма, Руководство, Сира.
 */
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

/**
 * Персональная главная: приветствие, письма, такси, специалисты недели,
 * продолжить чтение, топ заданий по награде.
 */
export default function HomeFeed() {
  const { account } = useAuth();
  const { t, language } = useI18n();
  const { settings } = useSettings();
  const { profiles, isCurrentUserAdmin, isProfileAdmin, addReview } = useProfiles();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  /** Сохранённые точки чтения по разделам (БД либо локальные гостевые). */
  const [progress, setProgress] = useState<Partial<Record<ReadingSection, SavedMark>>>({});

  useEffect(() => {
    let cancelled = false;
    void fetchTasks({ paid: true, status: 'open', sort: 'reward', limit: 4 })
      .then((list) => { if (!cancelled) setTasks(list); })
      .catch(() => { if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, []);

  // Прогресс чтения. У вошедших — база (п.3 ТЗ Этапа 2): состояние
  // видно с любого устройства, и гостевые закладки после входа
  // переносятся туда же. У гостей — локальные закладки браузера.
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

  // Блоки разделов показываются, только если раздел не скрыт в боковом
  // меню (Режим редактирования) — п.1 ТЗ Этапа 2.
  const hiddenMenu = new Set(settings.hiddenMenu);
  const visibleReadLinks = READ_LINKS.filter(
    (item) => !hiddenMenu.has(READING_MENU_IDS[item.section]),
  );

  const firstName = (account?.fullName || '').trim().split(/\s+/)[0];
  const hello = firstName
    ? t.homeHello.replace('{name}', firstName)
    : t.homeHelloGuest;

  const activeProfile: Profile | null = activeProfileId
    ? profiles.find((profile) => profile.id === activeProfileId) ?? null
    : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="smk-title smk-text-display font-black text-slate-900 dark:text-white">
          {hello}
        </h1>
        <p className="mt-1 smk-text-body text-slate-500 dark:text-zinc-400">{t.homeFeedLead}</p>
      </header>

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
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--smk-gold)] text-white">
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

        <Link href="/taxi" className="smk-lux flex items-center gap-3 px-3.5 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <CarFront className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block smk-text-title font-bold text-slate-900 dark:text-white">
              {t.homeTaxiPeak}
            </span>
            <span className="smk-text-label text-slate-500 dark:text-zinc-400">
              {t.homeTaxiNone}
            </span>
          </span>
          <span className="smk-chip smk-note-warn">{t.inDevelopment}</span>
        </Link>
      </div>

      <SpecialistLeaders onOpen={(id) => setActiveProfileId(id)} />

      {/* п.1 ТЗ Этапа 2: все четыре блока скрыты — секция не
          показывается вовсе. */}
      {visibleReadLinks.length > 0 && (
        <section>
          <h2 className="mb-2 smk-text-title font-extrabold text-slate-900 dark:text-white">
            {t.homeContinue}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleReadLinks.map((item) => {
              const Icon = item.icon;
              const href = READING_HREFS[item.section];
              // п.4: блок с сохранённым прогрессом ведёт прямо к главе —
              // страница раздела прокрутит к сохранённой позиции.
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

      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="smk-text-title font-extrabold text-slate-900 dark:text-white">
              {t.homeTopTasks}
            </h2>
            <p className="smk-text-label text-slate-500 dark:text-zinc-400">{t.homeTopTasksHint}</p>
          </div>
          <Link href="/temshik" className="smk-text-label font-bold text-emerald-700 dark:text-emerald-400">
            {t.homeAllTasks}
          </Link>
        </div>
        {tasks === null && (
          <p className="smk-text-label text-slate-500 dark:text-zinc-400">{t.loading}</p>
        )}
        {tasks && tasks.length === 0 && (
          <p className="smk-note smk-note-info px-3 py-2">{t.homeNoTasks}</p>
        )}
        {tasks && tasks.length > 0 && (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onOpen={(item) => setTaskId(item.id)} />
            ))}
          </div>
        )}
      </section>

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
        onChanged={() => {
          void fetchTasks({ paid: true, status: 'open', sort: 'reward', limit: 4 })
            .then(setTasks)
            .catch(() => {});
        }}
      />
    </div>
  );
}
