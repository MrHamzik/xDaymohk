'use client';

/**
 * Главная — персональная лента.
 * Каталог специалистов живёт на /catalog.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import HomeFeed from '@/components/HomeFeed';
import { useAuth } from '@/components/AuthProvider';

export default function HomePage() {
  const { account } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

      <div className="smk-shell">
        <AppSidebar isAdmin={Boolean(account?.isAdmin)} />
        <main className="smk-shell-main">
          <HomeFeed />
        </main>
      </div>

      <MobileMenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} isAdmin={Boolean(account?.isAdmin)} />
      <BottomNav onOpenMenu={() => setIsMenuOpen(true)} onOpenCreate={() => setIsCreateOpen(true)} isAdmin={Boolean(account?.isAdmin)} />
      <CreateActionModal
        isOpen={isCreateOpen}
        onOpenPlus={() => setIsCreateOpen(true)}
        onClose={() => setIsCreateOpen(false)}
        onOpenCreateProfile={() => router.push('/catalog')}
      />
    </div>
  );
}
