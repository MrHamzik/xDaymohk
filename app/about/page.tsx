'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Bot, Briefcase, CarFront, Globe2, HandHeart, Heart, MapPin, ShieldCheck, UserPlus, Users } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import EditProfileModal from '@/components/EditProfileModal';
import AccountModal from '@/components/AccountModal';
import AdminPanel from '@/components/AdminPanel';
import ProfileModal from '@/components/ProfileModal';
import SupportBudget from '@/components/SupportBudget';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { isAdminProfile } from '@/lib/profile-filters';
import { Profile } from '@/lib/types';

export default function AboutPage() {
  const { account } = useAuth();
  const { profiles, complaints, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, addReview, updateComplaint } = useProfiles();
  const { t } = useI18n();
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const activeProfile = useMemo(() => profiles.find((profile) => profile.id === activeProfileId && ((isCurrentUserAdmin || !profile.isHidden) && !profile.isBanned)) ?? null, [profiles, activeProfileId, isCurrentUserAdmin]);

  const handleSaveProfile = (profile: Profile) => {
    if (editingProfile) {
      updateProfile(profile.id, profile);
      setEditingProfile(null);
    } else {
      addProfile(profile);
    }
  };

  const handleUpdateProfile = updateProfile;

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
        <main className="flex-1 min-w-0 max-w-3xl space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label={t.catalog}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t.aboutTitle}</h2>
          </div>
        </div>

        <section className="w-full rounded-3xl border border-rose-100 bg-rose-50/70 p-5 dark:border-zinc-700 dark:bg-zinc-950/80 sm:p-6" aria-labelledby="about-support-title">
          <h3 id="about-support-title" className="text-base font-extrabold text-slate-900 dark:text-white">{t.aboutNonProfitTitle}</h3>
          <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-zinc-400">
            {t.aboutNonProfitText}
          </p>
        </section>

        <SupportBudget />

        <div className="flex justify-center py-1">
          <a
            href="https://pay.cloudtips.ru/p/1bcfadae"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3 text-sm font-bold text-white shadow-md shadow-rose-500/20 transition hover:bg-rose-600"
          >
            <Heart className="h-5 w-5 animate-pulse fill-white text-white" />
            {t.supportProject}
          </a>
        </div>

        <section aria-labelledby="about-features-title">
          <h3 id="about-features-title" className="mb-4 text-base font-bold text-slate-900 dark:text-white">{t.whatYouCanDo}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.findPerson}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.findPersonText}
              </p>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <MapPin className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.openContacts}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.openContactsText}
              </p>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.chooseWithConfidence}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.chooseWithConfidenceText}
              </p>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <UserPlus className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.addYourProfile}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.addYourProfileText}
              </p>
            </div>

            <div className="relative space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <span className="absolute right-5 top-5 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t.inDevelopment}</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <CarFront className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.taxiTitle}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.taxiText}
              </p>
            </div>

            <div className="relative space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <span className="absolute right-5 top-5 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t.inDevelopment}</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <Globe2 className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.vpnTitle}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.vpnText}
              </p>
            </div>

            <div className="relative space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <span className="absolute right-5 top-5 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t.inDevelopment}</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <BookOpen className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.vaynakhTitle}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.vaynakhText}
              </p>
            </div>

            <div className="relative space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <span className="absolute right-5 top-5 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t.inDevelopment}</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <Briefcase className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.gullaqTitle}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.gullaqText}
              </p>
            </div>

            <div className="relative space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <span className="absolute right-5 top-5 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t.inDevelopment}</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <HandHeart className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.goTitle}</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.goText}
              </p>
            </div>

            <div className="relative space-y-3 rounded-3xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/40 to-white p-6 shadow-sm dark:border-indigo-900/60 dark:from-indigo-950/20 dark:to-zinc-900 md:col-span-2">
              <span className="absolute right-5 top-5 rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">{t.inPlans}</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                <Bot className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">{t.djannaTitle}</h4>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
                {t.djannaText}
              </p>
              <div className="rounded-2xl border border-indigo-100 bg-white/80 p-3 text-xs leading-relaxed text-slate-500 dark:border-indigo-900/40 dark:bg-zinc-800/80 dark:text-zinc-500">
                {t.djannaNote}
              </div>
            </div>
          </div>
        </section>
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
      {isCurrentUserAdmin && (
        <AdminPanel
          isOpen={isAdminPanelOpen}
          onClose={() => setIsAdminPanelOpen(false)}
          profiles={profiles}
          complaints={complaints}
          onUpdateProfile={handleUpdateProfile}
          onUpdateComplaint={updateComplaint}
          onOpenProfile={(profile) => { setIsAdminPanelOpen(false); setActiveProfileId(profile.id); }}
        />
      )}

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
