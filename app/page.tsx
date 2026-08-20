'use client';

/**
 * Главная страница — приветственный экран (заглушка).
 * Каталог специалистов — на /catalog.
 */

import Link from 'next/link';
import { BookOpen, Map, PartyPopper, Users } from 'lucide-react';
import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function HomePage() {
  const { account } = useAuth();
  const { language } = useI18n();
  const router = useRouter();
  const ce = language === 'ce';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const items = [
    { href: '/catalog', icon: Users, title: ce ? 'Каталог' : 'Каталог', desc: ce ? 'Специалисташ а, жимхош а' : 'Специалисты и жители' },
    { href: '/map', icon: Map, title: ce ? 'Карта' : 'Карта', desc: ce ? 'ЦIенош а, объекташ а' : 'Дома и объекты' },
    { href: '/guide', icon: BookOpen, title: ce ? 'Руководство' : 'Руководство', desc: ce ? 'ХIара хIун ду Даймохкехь' : 'Что есть в Даймохке' },
  ];

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

      <div className="smk-shell">
        <AppSidebar isAdmin={Boolean(account?.isAdmin)} />

        {/* Контент */}
        <main className="smk-shell-main">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
                <PartyPopper className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-black leading-tight text-slate-900 dark:text-white">
                {ce ? 'Марша догIийла' : 'Добро пожаловать'}
                <br />
                <span className="text-emerald-600 dark:text-emerald-400">{ce ? 'хьомечу Даймохка' : 'в родной Даймохк'}</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-zinc-400">
                {ce
                  ? 'Даймохк — жимхойн а, говзанчийн а каталог. Хьажа каталоге, карта тIе, я руководство.'
                  : 'Даймохк — каталог жителей и специалистов. Загляните в каталог, на карту или в руководство.'}
              </p>
            </div>

            {/* Карточки-разделы */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
                >
                  <it.icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{it.title}</span>
                  <span className="text-xs text-slate-500 dark:text-zinc-400">{it.desc}</span>
                </Link>
              ))}
            </div>

            {/* Быстрый доступ: кибла — удалён по запросу (вёл на карту) */}
          </div>
        </main>
      </div>

      <MobileMenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} isAdmin={Boolean(account?.isAdmin)} />
      <BottomNav onOpenMenu={() => setIsMenuOpen(true)} onOpenCreate={() => setIsCreateOpen(true)} isAdmin={Boolean(account?.isAdmin)} />
      <CreateActionModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onOpenCreateProfile={() => router.push('/catalog')}
      />
    </div>
  );
}
