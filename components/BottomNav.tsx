'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUserRound, LogIn, MapPin, Menu, Plus, Users } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';

interface BottomNavProps {
  onOpenMenu?: () => void;
  onOpenCreate?: () => void;
  isAdmin?: boolean;
}

export default function BottomNav({ onOpenMenu, onOpenCreate }: BottomNavProps) {
  const pathname = usePathname();
  const { account } = useAuth();
  const { t } = useI18n();

  return (
    <nav
      className="site-bottom-nav fixed inset-x-0 bottom-0 z-40 w-full bg-white/95 px-2 py-2.5 shadow-2xl backdrop-blur-xl transition-colors dark:bg-zinc-950/95 sm:hidden"
      style={{ position: 'fixed', right: 0, bottom: 0, left: 0 }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-center gap-1 text-center">
        {/* 1. Menu button */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t.menu}
          className="flex flex-col items-center justify-center rounded-2xl py-1 text-slate-500 transition hover:text-slate-900 active:scale-95 dark:text-zinc-500 dark:hover:text-white"
        >
          <Menu className="mb-0.5 h-5 w-5" />
          <span className="text-[11px] font-semibold">{t.menu}</span>
        </button>

        {/* 2. Catalog — каталог живёт на /catalog (главная — отдельная landing) */}
        <Link
          href="/catalog"
          className={`flex flex-col items-center justify-center rounded-2xl py-1 transition active:scale-95 ${
            pathname === '/catalog'
              ? 'font-bold text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-white'
          }`}
        >
          <Users className="mb-0.5 h-5 w-5" />
          <span className="text-[11px] font-semibold">{t.catalog}</span>
        </Link>

        {/* 3. Center Elevated Gradient Plus Button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenCreate}
            aria-label={t.quickCreate}
            title={t.quickCreate}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-600/35 transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="h-6 w-6 stroke-[2.5]" />
          </button>
        </div>

        {/* 4. Map */}
        <Link
          href="/map"
          className={`flex flex-col items-center justify-center rounded-2xl py-1 transition active:scale-95 ${
            pathname === '/map'
              ? 'font-bold text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-white'
          }`}
        >
          <MapPin className="mb-0.5 h-5 w-5" />
          <span className="text-[11px] font-semibold">{t.map}</span>
        </Link>

        {/* 5. Главная — лежит на "/" (роута /home не существует).
             Раньше здесь был href="/home": Next.js префетчил несуществующий
             маршрут, из-за чего в консоли сыпалось GET /home?_rsc=... 404,
             а сам переход вёл на страницу «не найдено». */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center rounded-2xl py-1 transition active:scale-95 ${
            pathname === '/'
              ? 'font-bold text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-white'
          }`}
        >
          <div className="mb-0.5 h-5 w-5 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
          <span className="text-[11px] font-semibold">{t.navMain}</span>
        </Link>
      </div>
    </nav>
  );
}
