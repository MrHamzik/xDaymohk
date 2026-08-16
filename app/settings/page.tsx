'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Map as MapIcon, Settings as SettingsIcon } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { COMPACT_MAP_EVENT, isCompactMapEnabled, setCompactMapEnabled } from '@/lib/map-prefs';

export default function SettingsPage() {
  const { isCurrentUserAdmin } = useProfiles();
  const { language } = useI18n();
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  // Читаем localStorage только после монтирования — иначе разойдётся
  // серверная и клиентская разметка (hydration mismatch).
  const [compactMap, setCompactMap] = useState(false);

  useEffect(() => {
    const refresh = () => setCompactMap(isCompactMapEnabled());
    refresh();
    // Настройку можно переключить и из панели быстрых настроек — держим
    // тумблер в актуальном состоянии.
    window.addEventListener(COMPACT_MAP_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(COMPACT_MAP_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const toggleCompactMap = () => {
    const next = !compactMap;
    setCompactMap(next);
    setCompactMapEnabled(next);
  };

  const isChechen = language === 'ce';

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

      <div className="mx-auto flex w-full max-w-6xl items-start justify-start gap-6 px-3.5 pb-20 pt-18 sm:pb-8 lg:pt-24">
        <aside className="sticky top-24 z-40 hidden w-[290px] shrink-0 flex-col lg:flex h-[calc(100vh-8rem)]">
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950 no-scrollbar">
            <SidebarNav isAdmin={isCurrentUserAdmin} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 max-w-3xl space-y-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Назад"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white">
                <SettingsIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {isChechen ? 'Нисдарш' : 'Настройки'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-zinc-500">
                {isChechen
                  ? 'Хьан нисдарш хьан гӏирсехь бисина ду.'
                  : 'Настройки сохраняются на этом устройстве.'}
              </p>
            </div>
          </div>

          <section
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
            aria-labelledby="settings-map-title"
          >
            <div className="mb-3 flex items-center gap-2">
              <MapIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <h3 id="settings-map-title" className="text-sm font-bold text-slate-900 dark:text-white">
                {isChechen ? 'Карта' : 'Карта'}
              </h3>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <label htmlFor="compact-map-switch" className="min-w-0 cursor-pointer">
                <span className="block text-sm font-bold text-slate-900 dark:text-white">
                  {isChechen ? 'Гӏеза карта' : 'Компактная карта'}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-zinc-500">
                  {isChechen
                    ? 'Кӏезиг кластерш, дозанза терахьаш — карта цӏена хуьлу.'
                    : 'Номера домов — тонкими цифрами без фона и теней, кластеры и точки меньше. Кликаются так же, как обычно.'}
                </span>
              </label>
              <button
                id="compact-map-switch"
                type="button"
                role="switch"
                aria-checked={compactMap}
                onClick={toggleCompactMap}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  compactMap ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    compactMap ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </section>
        </main>
      </div>

      <BottomNav onOpenMenu={() => setIsMenuDrawerOpen(true)} isAdmin={isCurrentUserAdmin} />
      <MobileMenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        isAdmin={isCurrentUserAdmin}
      />
    </div>
  );
}
