'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import SearchFilter from '@/components/SearchFilter';
import ProfileCard from '@/components/ProfileCard';
import ProfileModal from '@/components/ProfileModal';
import ReportDialog from '@/components/ReportDialog';
import EditProfileModal from '@/components/EditProfileModal';
import AccountModal from '@/components/AccountModal';
import CreateActionModal from '@/components/CreateActionModal';
import AdminBanModal, { AdminBanPayload } from '@/components/AdminBanModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CatalogLanding from '@/components/catalog/CatalogLanding';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import SwipeTabs from '@/components/SwipeTabs';
import type { QuickTaskPreset } from '@/lib/quick-request';
import { EMPTY_GEO_SELECTION, type GeoSelection } from '@/lib/geo-dictionary';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useProfiles } from '@/components/ProfilesProvider';
import { useBlacklist } from '@/components/BlacklistProvider';
import { filterProfiles } from '@/lib/profile-filters';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import { AudienceFilter, Profile } from '@/lib/types';
import EmptyState from '@/components/ui/EmptyState';
import SpecialistLeaders from '@/components/SpecialistLeaders';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';

const PAGE_SIZE_DESKTOP = 30;
const PAGE_SIZE_TABLET = 24;
const PAGE_SIZE_MOBILE = 20;

function pickPageSize(): number {
  if (typeof window === 'undefined') return PAGE_SIZE_DESKTOP;
  const width = window.innerWidth;
  if (width < 640) return PAGE_SIZE_MOBILE;
  if (width < 1024) return PAGE_SIZE_TABLET;
  return PAGE_SIZE_DESKTOP;
}

export default function Home() {
  const { account } = useAuth();
  const { settings } = useSettings();
  const { profiles, users, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, addReview, addComplaint, updateUserBlocked, createNotification, refreshRemoteData } = useProfiles();

  // Топ специалистов по числу отзывов (п.2 замечаний 23.08).
  const topSpecialists = useMemo(
    () => profiles
      .filter((p) => p.isSpecialist && !p.isHidden && !p.isBanned)
      .sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
      .slice(0, 20),
    [profiles],
  );
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilters, setAudienceFilters] = useState<AudienceFilter[]>([]);
  const [professionFilters, setProfessionFilters] = useState<string[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [favIds, setFavIds] = useState<string[]>([]);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [reportProfile, setReportProfile] = useState<Profile | null>(null);
  const [blockProfile, setBlockProfile] = useState<Profile | null>(null);
  // Лендинг: быстрая заявка открывает штатную форму задания с пресетом.
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickPreset, setQuickPreset] = useState<QuickTaskPreset | null>(null);
  // Вкладки каталога (Услуги/Рейтинг/Каталог) и гео-фильтр «города /
  // районы / сёла».
  // Пока гид не пройден, открываем вкладку «Каталог»: шаг гида ждёт
  // прокрутки карточек анкет, а они живут именно там — лендинг
  // сломал бы первое прохождение.
  const [catalogTab, setCatalogTab] = useState(() => (settings.tourDone ? 'services' : 'catalog'));
  const [geo, setGeo] = useState<GeoSelection>(EMPTY_GEO_SELECTION);

  const openQuickTask = (preset: QuickTaskPreset | null = null) => {
    // Гость заявку оставить не может: сначала вход (как и создание
    // анкеты через openAddProfile).
    if (!account) {
      setIsAccountModalOpen(true);
      return;
    }
    // Пустой объект — тоже «быстрое создание»: без вопроса про
    // черновик (п.8 замечаний 22.08).
    setQuickPreset(preset ?? {});
    setQuickTaskOpen(true);
  };

  const showCatalog = () => {
    document.getElementById('catalog-list-anchor')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // «Найти рабочих»: переключает вкладку каталога и подводит к списку.
  const showCatalogTab = () => {
    setCatalogTab('catalog');
    window.setTimeout(showCatalog, 80);
  };

  // Pagination
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_DESKTOP);
  const [visibleCount, setVisibleCount] = useState<number>(pageSize);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => {
      const next = pickPageSize();
      setPageSize(next);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Чёрный список фильтруем ЗДЕСЬ, а не в ProfilesProvider: скрытие
  // взаимное и зависит от того, кто смотрит, — общий кеш анкет должен
  // оставаться одинаковым для всех.
  const { isHidden: isBlockedOwner, block: blockOwner } = useBlacklist();
  const visibleProfiles = useMemo(
    () => profiles.filter((profile) =>
      !profile.isHidden && !profile.isBanned && !isBlockedOwner(profile.ownerId)),
    [profiles, isBlockedOwner],
  );
  const adminOwnerId = account?.isAdmin ? account.id : undefined;
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId && ((isCurrentUserAdmin || !profile.isHidden) && !profile.isBanned)) ?? null,
    [profiles, activeProfileId, isCurrentUserAdmin],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('profile');
    if (id) setActiveProfileId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Загрузка списка — только для вошедшего. А вот подписка на событие
    // регистрируется ВСЕГДА (см. ниже): раньше весь эффект начинался с
    // `if (!account) return`, и при первом рендере, пока аккаунт ещё не
    // подтянулся, слушатель не успевал появиться. Сердечко в карточке
    // переключалось, запрос уходил, а список в каталоге узнавал об этом
    // только после перезагрузки страницы.
    if (account && supabase) {
      void (async () => {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/favorites', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (!cancelled && Array.isArray(data?.ids)) setFavIds(data.ids);
      })();
    }

    const onFav = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; on?: boolean }>).detail;
      if (!detail?.id) return;
      setFavIds((current) => {
        const has = current.includes(detail.id!);
        if (detail.on && !has) return [...current, detail.id!];
        if (!detail.on && has) return current.filter((id) => id !== detail.id);
        return current;
      });
    };
    window.addEventListener('daymohk-favorites', onFav);
    return () => {
      cancelled = true;
      window.removeEventListener('daymohk-favorites', onFav);
    };
  }, [account?.id]);

  const filteredProfiles = useMemo(() => {
    const base = filterProfiles(visibleProfiles, {
      query: searchQuery,
      audienceFilters,
      professionFilters,
      adminOwnerId,
      users,
      geo,
    });
    if (!favOnly) return base;
    return base.filter((profile) => favIds.includes(profile.id));
  }, [visibleProfiles, searchQuery, audienceFilters, professionFilters, adminOwnerId, users, favOnly, favIds]);

  // Reset paging when the filtered set shrinks (search/filters change)
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize, searchQuery, audienceFilters, professionFilters]);

  // Infinite scroll: when the sentinel enters the viewport, load more.
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    if (visibleCount >= filteredProfiles.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + pageSize, filteredProfiles.length));
        }
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleCount, filteredProfiles.length, pageSize]);

  const handleSaveProfile = (newProfile: Profile) => {
    if (editingProfile) {
      updateProfile(newProfile.id, newProfile);
      setEditingProfile(null);
    } else {
      addProfile(newProfile);
    }
  };
  const handleUpdateProfile = updateProfile;
  const handleAddReview = addReview;
  const handleBlockProfile = (profile: Profile) => {
    if (isProfileAdmin(profile)) return;
    setBlockProfile(profile);
  };
  const confirmBlockProfile = async (payload: AdminBanPayload) => {
    if (!blockProfile || isProfileAdmin(blockProfile)) {
      setBlockProfile(null);
      return;
    }
    // Блокировка аккаунта владельца анкеты (окно с подробностями) —
    // через серверный /api/admin/ban (service role), как в админ-панели:
    // ставит is_blocked, скрывает анкеты, снимает проверенность.
    try {
      if (blockProfile.ownerId && supabase) {
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;
        if (accessToken) {
          const res = await fetch('/api/admin/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: blockProfile.ownerId, hours: null }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            console.warn('Блокировка не применена:', err?.error ?? res.status);
          }
          // Обновляем список сразу — карточка скрывается без перезагрузки.
          await refreshRemoteData();
        }
      }
    } catch {
      // продолжаем — письмо важнее
    }
    // Письмо-уведомление владельцу (ru + ce) через API (service role).
    if (blockProfile.ownerId) {
      try {
        const session = supabase ? await supabase.auth.getSession() : null;
        const accessToken = session?.data.session?.access_token;
        if (accessToken) {
          const response = await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              recipientId: blockProfile.ownerId,
              type: 'user_blocked',
              title: payload.title,
              message: payload.message,
              ceTitle: payload.ceTitle,
              ceMessage: payload.ceMessage,
              sender: payload.sender,
            }),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => null);
            console.warn('Письмо о блокировке не отправлено:', result?.error ?? response.status);
          }
        }
      } catch {
        // письмо — не критично; блокировка уже применена
      }
    }
    setBlockProfile(null);
  };
  const openAddProfile = () => {
    if (account?.isBlocked) {
      setIsAccountModalOpen(true);
    } else if (account) {
      setIsAddModalOpen(true);
    } else {
      setIsAccountModalOpen(true);
    }
  };

  const pagedProfiles = filteredProfiles.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProfiles.length;
  const pull = usePullRefresh(async () => { await refreshRemoteData(); });

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

            <div className="smk-shell">
        <AppSidebar isAdmin={isCurrentUserAdmin} />

        {/* Main Content Area */}
        <main
          className="smk-shell-main"
          onTouchStart={pull.onTouchStart}
          onTouchEnd={pull.onTouchEnd}
        >
          {pull.refreshing && (
            <p className="mb-3 text-center smk-text-label text-slate-500 dark:text-zinc-400">{t.loading}</p>
          )}
        {/* Три вкладки с горизонтальным свайпом (п.4): Услуги /
            Рейтинг / Каталог. Панели держатся в памяти после первого
            открытия, переключение мгновенное (п.5). */}
        <SwipeTabs
          tabs={[
            { id: 'services', label: t.catTabServices },
            { id: 'rating', label: t.catTabRating },
            { id: 'catalog', label: t.catTabCatalog },
          ]}
          active={catalogTab}
          onChange={setCatalogTab}
          panels={{
            services: (
              <CatalogLanding onOpenTask={openQuickTask} onShowCatalog={showCatalogTab} />
            ),
            rating: (
              <div className="space-y-3">
                <SpecialistLeaders compact onOpen={(id) => setActiveProfileId(id)} />
                {/* Компактный топ всех специалистов по числу отзывов
                    (п.2 замечаний 23.08). */}
                <section>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {t.ratingListTitle}
                  </h2>
                  <p className="mb-1.5 smk-text-label text-slate-500 dark:text-zinc-400">
                    {t.ratingListHint}
                  </p>
                  <div className="space-y-1">
                    {topSpecialists.map((profile, index) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => setActiveProfileId(profile.id)}
                        className="smk-lux flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition hover:brightness-95 dark:hover:brightness-110"
                      >
                        <span className="w-5 shrink-0 text-center smk-text-label font-black text-slate-400">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">
                            {profile.fullName}
                          </span>
                          <span className="block truncate smk-text-label text-slate-500 dark:text-zinc-400">
                            {profile.professionTitle || t.catalog}
                          </span>
                        </span>
                        <span className="shrink-0 smk-text-label font-bold text-slate-600 dark:text-zinc-300">
                          ★ {profile.rating.toFixed(1)} · {profile.reviewCount}
                        </span>
                      </button>
                    ))}
                    {topSpecialists.length === 0 && (
                      <p className="smk-dashed p-3 text-center text-xs text-slate-500">{t.nothingFound}</p>
                    )}
                  </div>
                </section>
              </div>
            ),
            catalog: (
              <div id="catalog-list-anchor" className="scroll-mt-24">
        <SearchFilter
          searchQuery={searchQuery}
          setQuery={setSearchQuery}
          audienceFilters={audienceFilters}
          setAudienceFilters={setAudienceFilters}
          professionFilters={professionFilters}
          setProfessionFilters={setProfessionFilters}
          geo={geo}
          setGeo={setGeo}
        />

        {account && (
          <button
            type="button"
            onClick={() => setFavOnly((value) => !value)}
            className={`mb-2 rounded-xl px-3 py-2 text-xs font-bold ${
              favOnly ? 'bg-emerald-600 text-white' : 'smk-field text-slate-700 dark:text-zinc-200'
            }`}
          >
            {t.favFilter}
          </button>
        )}

        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-400">
            {filteredProfiles.length > 0
              ? `${t.catalog} — ${Math.min(visibleCount, filteredProfiles.length)} / ${filteredProfiles.length}`
              : t.nothingFound}
          </h3>
        </div>

        {filteredProfiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pagedProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onSelect={(selectedProfile) => setActiveProfileId(selectedProfile.id)}
                isAdminStatus={isProfileAdmin(profile)}
                showPending={Boolean(isCurrentUserAdmin || (account && profile.ownerId === account.id))}
                isOwnProfile={Boolean(account && profile.ownerId === account.id)}
                isAdmin={isCurrentUserAdmin}
                onReport={isCurrentUserAdmin || account?.isBlocked || isProfileAdmin(profile) || (account && profile.ownerId === account.id) ? undefined : setReportProfile}
                onBlock={isCurrentUserAdmin && !isProfileAdmin(profile) ? handleBlockProfile : undefined}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={t.nothingFound}
            hint={t.searchEmptyHint}
            action={
              <button
                type="button"
                onClick={openAddProfile}
                className="smk-btn-gold smk-shine inline-flex items-center px-3.5 py-2 smk-text-label"
              >
                {account?.isBlocked ? t.addUnavailable : account ? t.addProfileBtn : t.signInToAdd}
              </button>
            }
          />
        )}

        {/* Infinite scroll sentinel + explicit "load more" button for accessibility */}
        {hasMore && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div
              ref={loadMoreRef}
              aria-hidden="true"
              className="h-1 w-full"
            />
            <button
              type="button"
              onClick={() => setVisibleCount((current) => Math.min(current + pageSize, filteredProfiles.length))}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t.loadMoreTasks} ({Math.min(pageSize, filteredProfiles.length - visibleCount)})
            </button>
          </div>
        )}

        {!hasMore && filteredProfiles.length > pageSize && (
          <p className="mt-4 text-center smk-text-label text-slate-400 dark:text-zinc-500">
            {t.catalogViewedAll.replace('{count}', String(filteredProfiles.length))}
          </p>
        )}
              </div>
            ),
          }}
        />
      </main>
      </div>
      <ProfileModal
        profile={activeProfile}
        isAdminStatus={activeProfile ? isProfileAdmin(activeProfile) : false}
        showPending={Boolean(isCurrentUserAdmin || (account && activeProfile?.ownerId === account.id))}
        isViewerBlocked={Boolean(account?.isBlocked)}
        onClose={() => setActiveProfileId(null)}
        onReview={handleAddReview}
      />
      {/* Быстрая заявка лендинга: бесплатное задание с пресетом.
          Без вопроса про черновик: быстрое создание не копится
          в шаблоны/черновики (п.8 замечаний 22.08). */}
      {/* Быстрые карточки — задания Темщика (платные): ГIончалла —
          это «Помощь», а не доставка/еда (п.6 замечаний 23.08). */}
      <CreateTaskModal
        isOpen={quickTaskOpen}
        isPaid
        skipDraftAsk
        preset={quickPreset}
        onClose={() => setQuickTaskOpen(false)}
        onCreated={() => setQuickTaskOpen(false)}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onOpenAddModal={() => { setEditingProfile(null); setIsAddModalOpen(true); }}
        onEditProfile={(profile) => { setEditingProfile(profile); setIsAccountModalOpen(false); setIsAddModalOpen(true); }}
      />
      <EditProfileModal
        isOpen={isAddModalOpen}
        account={account}
        profile={editingProfile}
        onClose={() => { setEditingProfile(null); setIsAddModalOpen(false); }}
        onSave={handleSaveProfile}
      />
      {isCurrentUserAdmin && null}

      <ReportDialog
        profile={reportProfile}
        isOpen={Boolean(reportProfile)}
        onClose={() => setReportProfile(null)}
        onSubmit={(reason) => {
          if (!reportProfile) return Promise.resolve();
          // Жалоба с блокировкой (проверенная анкета): суффикс [ЧС]
          // раньше просто приклеивался к тексту жалобы — человек считался
          // заблокированным, но в ЧС не попадал (баг от 22.08, п.8).
          const withBlacklist = reason.endsWith('[ЧС]');
          const clean = withBlacklist ? reason.replace(/\s*\[ЧС\]\s*$/, '') : reason;
          const complaint = addComplaint(reportProfile.id, clean);
          if (withBlacklist && reportProfile.ownerId) {
            return blockOwner(reportProfile.ownerId, clean)
              .then(() => complaint)
              .catch(() => complaint);
          }
          return complaint;
        }}
      />
      <AdminBanModal
        profile={blockProfile}
        onClose={() => setBlockProfile(null)}
        onConfirm={confirmBlockProfile}
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
      <CreateActionModal
        isOpen={isCreateSheetOpen}
        onOpenPlus={() => setIsCreateSheetOpen(true)}
        onClose={() => setIsCreateSheetOpen(false)}
        onOpenCreateProfile={openAddProfile}
      />
    </div>
  );
}
