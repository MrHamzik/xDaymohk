'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Award, MapPin, Sparkles, Users } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import SearchFilter from '@/components/SearchFilter';
import ProfileCard from '@/components/ProfileCard';
import ProfileModal from '@/components/ProfileModal';
import ReportDialog from '@/components/ReportDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import EditProfileModal from '@/components/EditProfileModal';
import AccountModal from '@/components/AccountModal';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { formatCount } from '@/lib/text';
import { filterProfiles, isAdminProfile } from '@/lib/profile-filters';
import { useI18n } from '@/lib/i18n';
import { AudienceFilter, Profile } from '@/lib/types';

export default function Home() {
  const { account } = useAuth();
  const { profiles, users, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, addReview, addComplaint } = useProfiles();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilters, setAudienceFilters] = useState<AudienceFilter[]>([]);
  const [professionFilters, setProfessionFilters] = useState<string[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [reportProfile, setReportProfile] = useState<Profile | null>(null);
  const [blockProfile, setBlockProfile] = useState<Profile | null>(null);

  const visibleProfiles = useMemo(() => profiles.filter((profile) => !profile.isHidden && !profile.isBanned), [profiles]);
  const adminOwnerId = account?.isAdmin ? account.id : undefined;
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId && ((isCurrentUserAdmin || !profile.isHidden) && !profile.isBanned)) ?? null,
    [profiles, activeProfileId, isCurrentUserAdmin],
  );

  const filteredProfiles = useMemo(
    () => filterProfiles(visibleProfiles, {
      query: searchQuery,
      audienceFilters,
      professionFilters,
      adminOwnerId,
      users,
    }),
    [visibleProfiles, searchQuery, audienceFilters, professionFilters, adminOwnerId, users],
  );

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
  const confirmBlockProfile = async () => {
    if (!blockProfile || isProfileAdmin(blockProfile)) {
      setBlockProfile(null);
      return;
    }
    await updateProfile(blockProfile.id, { isHidden: true, isBanned: false });
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
        {/* Compact, clean Hero Banner */}
        <section className="relative mb-4 overflow-hidden rounded-2xl bg-hero-gradient p-4 text-white shadow-md sm:p-5" aria-labelledby="hero-title">
          <div className="relative z-10 max-w-2xl">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-600/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-100 backdrop-blur-md">
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

        <SearchFilter
          searchQuery={searchQuery}
          setQuery={setSearchQuery}
          audienceFilters={audienceFilters}
          setAudienceFilters={setAudienceFilters}
          professionFilters={professionFilters}
          setProfessionFilters={setProfessionFilters}
        />

        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-400">
            {filteredProfiles.length > 0 ? `${t.catalog} — ${filteredProfiles.length}` : t.nothingFound}
          </h3>
        </div>

        {filteredProfiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {filteredProfiles.map((profile) => (
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
          <div className="my-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
            <h4 className="mb-1 text-sm font-bold text-slate-800 dark:text-white">{t.nothingFound}</h4>
            <p className="mx-auto mb-3 max-w-sm text-xs text-slate-500 dark:text-zinc-500">
              {t.searchEmptyHint}
            </p>
            <button
              onClick={openAddProfile}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
            >
              {account?.isBlocked ? t.addUnavailable : account ? t.addProfileBtn : t.signInToAdd}
            </button>
          </div>
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
      <ConfirmDialog
        isOpen={Boolean(blockProfile)}
        title="Заблокировать?"
        message="Анкета будет скрыта из общего каталога, но останется у администратора в разделе скрытых анкет. Это действие можно отменить."
        confirmLabel="Заблокировать"
        danger
        onConfirm={confirmBlockProfile}
        onCancel={() => setBlockProfile(null)}
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
