'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Crown } from 'lucide-react';
import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import ProPlans from '@/components/settings/ProPlans';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';

export default function ProPage() {
  const { account } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

      <div className="smk-shell">
        <AppSidebar isAdmin={Boolean(account?.isAdmin)} />
        <main className="smk-shell-main">
          <div className="mb-4 flex items-center gap-3">
            <Link
              href="/"
              aria-label={t.navMain}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 smk-text-display font-extrabold text-slate-900 dark:text-white">
                <Crown className="h-5 w-5 shrink-0 text-[var(--smk-gold)]" />
                {t.proTitle}
              </h1>
              <p className="mt-1 smk-text-body text-slate-500 dark:text-zinc-400">
                {t.proPageLead}
              </p>
            </div>
          </div>
          <hr className="smk-orn mb-4" />
          <div className="smk-lux p-4">
            <ProPlans />
          </div>
        </main>
      </div>

      <BottomNav
        onOpenMenu={() => setIsMenuDrawerOpen(true)}
        onOpenCreate={() => setIsCreateSheetOpen(true)}
        isAdmin={Boolean(account?.isAdmin)}
      />
      <MobileMenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        isAdmin={Boolean(account?.isAdmin)}
      />
      <CreateActionModal
        isOpen={isCreateSheetOpen}
        onOpenPlus={() => setIsCreateSheetOpen(true)}
        onClose={() => setIsCreateSheetOpen(false)}
        onOpenCreateProfile={() => router.push('/catalog')}
      />
    </div>
  );
}
