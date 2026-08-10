'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, LocateFixed, MapPinned, Phone, Users, Star } from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMapLazy';
import { type MapLayerMode } from '@/components/InteractiveMap';
import AccountModal from '@/components/AccountModal';
import EditProfileModal from '@/components/EditProfileModal';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import ProfileModal from '@/components/ProfileModal';
import ReportDialog from '@/components/ReportDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProfileBadges from '@/components/ProfileBadges';
import SearchFilter from '@/components/SearchFilter';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { filterProfiles } from '@/lib/profile-filters';
import { calculateWorkingStatus } from '@/lib/schedule';
import { formatReviews } from '@/lib/text';
import { useI18n } from '@/lib/i18n';
import { AudienceFilter, Profile } from '@/lib/types';

export default function MapPage() {
  const { profiles, users, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, addReview, addComplaint } = useProfiles();
  const { account } = useAuth();
  const { t } = useI18n();
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [reportProfile, setReportProfile] = useState<Profile | null>(null);
  const [blockProfile, setBlockProfile] = useState<Profile | null>(null);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilters, setAudienceFilters] = useState<AudienceFilter[]>([]);
  const [professionFilters, setProfessionFilters] = useState<string[]>([]);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('streets');
  const [locationRequestKey, setLocationRequestKey] = useState(0);
  const [showProfiles, setShowProfiles] = useState(true);
  const [showHouses, setShowHouses] = useState(true);
  const [showPlaces, setShowPlaces] = useState(true);

  const adminOwnerId = account?.isAdmin ? account.id : undefined;
  const profilesWithAddresses = useMemo(
    () => profiles.filter((profile) => Boolean(profile.workplaceAddress.trim()) && !profile.isHidden && !profile.isBanned),
    [profiles],
  );
  const filteredProfiles = useMemo(
    () => filterProfiles(profilesWithAddresses, {
      query: searchQuery,
      audienceFilters,
      professionFilters,
      adminOwnerId,
      users,
    }),
    [profilesWithAddresses, searchQuery, audienceFilters, professionFilters, adminOwnerId, users],
  );

  useEffect(() => {
    setSelectedProfileId((currentId) => (
      currentId && filteredProfiles.some((profile) => profile.id === currentId)
        ? currentId
        : null
    ));
  }, [filteredProfiles]);

  const selectedProfile = useMemo(
    () => filteredProfiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [filteredProfiles, selectedProfileId],
  );
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId && ((isCurrentUserAdmin || !profile.isHidden) && !profile.isBanned)) ?? null,
    [profiles, activeProfileId, isCurrentUserAdmin],
  );
  const selectedOwnerProfiles = useMemo(() => {
    if (!selectedProfile) return [];
    if (!selectedProfile.ownerId) return [selectedProfile];
    return profiles.filter((profile) => profile.ownerId === selectedProfile.ownerId && !profile.isHidden && !profile.isBanned);
  }, [profiles, selectedProfile]);

  const handleSaveProfile = (profile: Profile) => {
    if (editingProfile) {
      updateProfile(profile.id, profile);
      setEditingProfile(null);
    } else {
      addProfile(profile);
    }
  };

  const handleBlockProfile = (profile: Profile) => {
    if (isProfileAdmin(profile)) return;
    setBlockProfile(profile);
  };

  const confirmBlockProfile = async () => {
    if (!blockProfile || isProfileAdmin(blockProfile)) {
      setBlockProfile(null);
      return;
    }
    await updateProfile(blockProfile.id, { isHidden: true, isBanned: false });
    setBlockProfile(null);
    setActiveProfileId(null);
  };

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />
            <div className="mx-auto flex w-full max-w-6xl items-start justify-start gap-6 px-3.5 pb-20 pt-18 sm:pb-8 lg:pt-24">
        {/* Detached Sidebar for Desktop */}
        <aside className="sticky top-24 z-40 hidden w-[290px] shrink-0 flex-col lg:flex h-[calc(100vh-8rem)]">
          <div className="flex-1 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950 no-scrollbar">
            <SidebarNav isAdmin={isCurrentUserAdmin} />
          </div>
        </aside>
        
        {/* Main Content Area */}
        <main className="flex-1 min-w-0 max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Вернуться в каталог"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t.mapPageTitle}</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-500">{t.mapPageSubtitle}</p>
          </div>
        </div>

        <SearchFilter
          searchQuery={searchQuery}
          setQuery={setSearchQuery}
          audienceFilters={audienceFilters}
          setAudienceFilters={setAudienceFilters}
          professionFilters={professionFilters}
          setProfessionFilters={setProfessionFilters}
        />

        <section className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800" aria-labelledby="map-profiles-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <h3 id="map-profiles-title" className="truncate text-sm font-bold text-slate-900 dark:text-white">Анкеты выбранного пользователя</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-500">Нажмите на миниатюру, чтобы выбрать его точку или открыть анкету.</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{selectedOwnerProfiles.length}</span>
          </div>

          {selectedOwnerProfiles.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {selectedOwnerProfiles.map((profile) => {
                const hasMapPoint = filteredProfiles.some((item) => item.id === profile.id);
                const isSelected = profile.id === selectedProfile?.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => hasMapPoint ? setSelectedProfileId(profile.id) : setActiveProfileId(profile.id)}
                    className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left transition ${isSelected ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-800/70 dark:hover:border-emerald-800'}`}
                  >
                    <img src={profile.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{profile.professionTitle || 'Личная анкета'}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-zinc-500">{profile.workplaceAddress || 'Адрес не указан'}</span>
                    </span>
                    {profile.verificationStatus === 'pending' && <span className="shrink-0 text-[10px] text-slate-500 dark:text-zinc-500">На проверке</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-500">Выберите точку анкеты на карте.</p>
          )}
        </section>

        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-3">
          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 md:col-span-2" aria-labelledby="map-section-title">
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <MapPinned className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <h3 id="map-section-title" className="truncate text-sm font-bold text-slate-900 dark:text-white">Даймохк</h3>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-zinc-800" aria-label="Управление картой">
                <button type="button" onClick={() => setLocationRequestKey((key) => key + 1)} aria-label={t.mapMyLoc} title={t.mapMyLoc} className="rounded-lg p-1.5 text-emerald-700 transition hover:bg-white dark:text-emerald-300 dark:hover:bg-zinc-700"><LocateFixed className="h-4 w-4" /></button>
                <button type="button" onClick={() => setMapLayerMode('streets')} aria-pressed={mapLayerMode === 'streets'} className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${mapLayerMode === 'streets' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 dark:text-zinc-500'}`}>{t.mapLayerStreets}</button>
                <button type="button" onClick={() => setMapLayerMode('satellite')} aria-pressed={mapLayerMode === 'satellite'} className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${mapLayerMode === 'satellite' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 dark:text-zinc-500'}`}>{t.mapLayerSatellite}</button>
                <button type="button" onClick={() => setMapLayerMode('hybrid')} aria-pressed={mapLayerMode === 'hybrid'} className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${mapLayerMode === 'hybrid' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 dark:text-zinc-500'}`}>{t.mapLayerHybrid}</button>
              </div>
            </div>
            <InteractiveMap
              selectedPosition={selectedProfile?.workplaceCoords ?? null}
              showControls={false}
              showProfiles={showProfiles}
              showHouses={showHouses}
              showPlaces={showPlaces}
              onClearSelection={() => setSelectedProfileId(null)}
              mapLayerMode={mapLayerMode}
              onMapLayerModeChange={setMapLayerMode}
              locationRequestKey={locationRequestKey}
              markers={filteredProfiles.map((profile) => {
                const statusInfo = calculateWorkingStatus(profile, account?.id === profile.ownerId ? account?.statusOverride : profile.statusOverride);
                return {
                  id: profile.id,
                  position: profile.workplaceCoords,
                  label: profile.fullName,
                  description: `${statusInfo.label} (${statusInfo.details || ''}) · ${profile.workplaceAddress}`,
                  status: statusInfo.status,
                  onClick: () => setSelectedProfileId(profile.id),
                };
              })}
              className="h-[380px] sm:h-[460px]"
            />
            
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 pt-3 dark:border-zinc-700">
              <div className="flex items-center gap-1.5" aria-label="Слои объектов">
                <span className="text-[11px] font-bold text-slate-400">{t.mapShowLayers}</span>
                <button
                  type="button"
                  onClick={() => setShowProfiles((prev) => !prev)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                    showProfiles
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
                  }`}
                >
                  {t.mapLayerProfiles}
                </button>
                <button
                  type="button"
                  onClick={() => setShowHouses((prev) => !prev)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                    showHouses
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
                  }`}
                >
                  {t.mapLayerHouses}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlaces((prev) => !prev)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                    showPlaces
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
                  }`}
                >
                  {t.mapLayerPlaces}
                </button>
              </div>

              <p className="text-[11px] text-slate-400">{t.mapClearHint}</p>
            </div>
          </section>

          {selectedProfile && (
            <section className="flex min-w-0 flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950" aria-labelledby="profile-location-title">
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800">
                    <img src={selectedProfile.avatarUrl} alt={selectedProfile.fullName} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h3 id="profile-location-title" className="break-words text-sm font-bold text-slate-900 dark:text-white">{selectedProfile.fullName}</h3>
                    <ProfileBadges profile={selectedProfile} adminStatus={isProfileAdmin(selectedProfile)} showPending={Boolean(isCurrentUserAdmin || (account && selectedProfile.ownerId === account.id))} />
                    <p className="mt-1 truncate text-sm font-semibold text-emerald-600 dark:text-emerald-400">{selectedProfile.isSpecialist ? selectedProfile.professionTitle || 'Специалист' : 'Житель'}</p>
                    {selectedProfile.rating > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-500">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {selectedProfile.rating.toFixed(1)} · {formatReviews(selectedProfile.reviewCount)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 text-sm text-slate-600 dark:text-zinc-400">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Рабочий адрес</span>
                    <p className="break-words font-semibold text-slate-900 dark:text-white">{selectedProfile.workplaceAddress}</p>
                  </div>
                  <p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap leading-relaxed">{selectedProfile.bio}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveProfileId(selectedProfile.id)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                >
                  <FileText className="h-4 w-4" />
                  Открыть
                </button>
              </div>

              {!account?.isBlocked && !selectedProfile.hidePhone && selectedProfile.phone && (
                <a
                  href={`tel:${selectedProfile.phone}`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-700"
                >
                  <Phone className="h-4 w-4" />
                  Позвонить
                </a>
              )}
            </section>
          )}
        </div>
      </main>
      </div>
      <ProfileModal
        profile={activeProfile}
        isAdminStatus={activeProfile ? isProfileAdmin(activeProfile) : false}
        showPending={Boolean(isCurrentUserAdmin || (account && activeProfile?.ownerId === account.id))}
        isViewerBlocked={Boolean(account?.isBlocked)}
        onClose={() => setActiveProfileId(null)}
        onReview={addReview}
      />
      <ReportDialog
        profile={reportProfile}
        isOpen={Boolean(reportProfile)}
        onClose={() => setReportProfile(null)}
        onSubmit={(reason) => reportProfile ? addComplaint(reportProfile.id, reason) : Promise.resolve()}
      />
      <ConfirmDialog
        isOpen={Boolean(blockProfile)}
        title="Заблокировать?"
        message="Анкета будет скрыта из общего каталога, но останется у администратора в разделе скрытых анкет. Это действие можно отменить."
        confirmLabel="Заблокировать"
        danger
        onConfirm={confirmBlockProfile}
        onCancel={() => setBlockProfile(null)}
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
        onOpenCreateProfile={() => {
          setEditingProfile(null);
          setIsAddModalOpen(true);
        }}
      />
    </div>
  );
}
