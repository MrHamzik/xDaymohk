'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Award, MapPin, Sparkles, Users } from 'lucide-react';
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
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useProfiles } from '@/components/ProfilesProvider';
import { useBlacklist } from '@/components/BlacklistProvider';
import { formatCount } from '@/lib/text';
import { filterProfiles } from '@/lib/profile-filters';
import { useI18n } from '@/lib/i18n';
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
  const { profiles, users, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, addReview, addComplaint, updateUserBlocked, createNotification, refreshRemoteData } = useProfiles();
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
  const { isHidden: isBlockedOwner } = useBlacklist();
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
        {/* Compact, clean Hero Banner */}
        <section className="smk-sign relative mb-4 overflow-hidden rounded-2xl bg-hero-gradient p-4 text-white shadow-md sm:p-5" aria-labelledby="hero-title">
          <div className="relative z-10 max-w-2xl">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-600/60 px-2.5 py-0.5 smk-text-label font-semibold text-emerald-100 backdrop-blur-md">
              <Sparkles className="h-3 w-3 text-emerald-300" />
              {t.heroBadge}
            </span>
            <h2 id="hero-title" className="mb-1 text-xl font-extrabold tracking-tight sm:text-2xl">
              {t.heroTitle}
            </h2>
            <p className="mb-3 max-w-xl text-xs leading-relaxed text-emerald-100 sm:text-sm">
              {t.heroSubtitle}
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1 font-medium backdrop-blur-sm">
                <Users className="h-3 w-3 text-emerald-300" />
                {formatCount(visibleProfiles.length, t.heroProfilesCount, t.heroProfilesCount, t.heroProfilesCount)}
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

        <SpecialistLeaders onOpen={(id) => setActiveProfileId(id)} />

        <SearchFilter
          searchQuery={searchQuery}
          setQuery={setSearchQuery}
          audienceFilters={audienceFilters}
          setAudienceFilters={setAudienceFilters}
          professionFilters={professionFilters}
          setProfessionFilters={setProfessionFilters}
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
        onSubmit={(reason) => reportProfile ? addComplaint(reportProfile.id, reason) : Promise.resolve()}
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
        onClose={() => setIsCreateSheetOpen(false)}
        onOpenCreateProfile={openAddProfile}
      />
    </div>
  );
}
