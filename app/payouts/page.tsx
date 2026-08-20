'use client';

/**
 * /payouts — история расчётов за месяц.
 *
 * Не чек и не платёжка: стороны сами отметили, что деньги переданы.
 * Сервис в расчётах не участвует (422-ФЗ).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wallet } from 'lucide-react';
import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import SettlementsHistory from '@/components/settings/SettlementsHistory';

export default function PayoutsPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const { isCurrentUserAdmin } = useProfiles();
  const router = useRouter();
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

      <div className="smk-shell">
        <AppSidebar isAdmin={isCurrentUserAdmin} />

        <main className="smk-shell-main">
          <div className="mb-4 flex items-center gap-3">
            <Link
              href="/settings"
              aria-label={t.tasksBack}
              className="smk-act flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 smk-text-display font-extrabold text-slate-900 dark:text-white">
                <Wallet className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {t.settlementsTitle}
              </h1>
              <p className="truncate smk-text-body text-slate-500 dark:text-zinc-500">
                {t.settlementsSubtitle}
              </p>
            </div>
          </div>

          <hr className="smk-orn mb-4" />

          <p className="smk-note smk-note-info mb-4 px-3.5 py-3 smk-text-label leading-relaxed">
            {t.settlementsDisclaimer}
          </p>

          {!account ? (
            <p className="smk-note smk-note-warn px-3.5 py-3">
              {t.settlementsSignIn}
            </p>
          ) : (
            <SettlementsHistory />
          )}
        </main>
      </div>

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
        onOpenCreateProfile={() => router.push('/catalog')}
      />
    </div>
  );
}
