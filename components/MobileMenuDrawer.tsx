'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Bot,
  Briefcase,
  CarFront,
  ChevronRight,
  Compass,
  Globe2,
  Home,
  HandHeart,
  LogIn,
  MapPin,
  ShieldAlert,
  Sparkles,
  UserRound,
  Users,
  Wrench, BookMarked } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import MenuProfileCard from '@/components/MenuProfileCard';
import { useI18n } from '@/lib/i18n';
import SettingsControlsBar from '@/components/SettingsControlsBar';
import PrayerTimesBar from '@/components/PrayerTimesBar';
import QiblaModal from '@/components/QiblaModal';
import QuranModal from '@/components/QuranModal';
import SpecialDaysModal from '@/components/SpecialDaysModal';
import BlacklistModal from '@/components/BlacklistModal';

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export default function MobileMenuDrawer({ isOpen, onClose, isAdmin = false }: MobileMenuDrawerProps) {
  const pathname = usePathname();
  const { account } = useAuth();
  const { language, t } = useI18n();

  const [isQiblaOpen, setIsQiblaOpen] = useState(false);
  const [isQuranOpen, setIsQuranOpen] = useState(false);
  const [isSpecialDaysOpen, setIsSpecialDaysOpen] = useState(false);
  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    onClose();
  }, [pathname]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex justify-start bg-zinc-950/75 backdrop-blur-sm transition-opacity"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-drawer-title"
        onClick={onClose}
      >
        <div
          className="flex h-full w-[min(23rem,75vw)] flex-col overflow-hidden bg-white p-3.5 shadow-2xl transition-all dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}
        >
          {/* Main Top / Center Scrollable Content */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5 no-scrollbar">
            {/* 1. Settings 4-button icons row (Without "Управление и настройки" text) */}
            <div>
              <SettingsControlsBar />
            </div>

            {/* 2. Prayer times ticker right below the 4 settings icons */}
            <div>
              <PrayerTimesBar />
            </div>

            {/* 3. Section: НАВИГАЦИЯ (Clean flat vertical list rows) */}
            <div className="space-y-0.5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-200 px-2 py-1">
                {language === 'ce' ? 'Навигаци' : 'Навигация'}
              </span>

              <div className="flex flex-col space-y-0.5">
                <Link
                  href="/"
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                    pathname === '/'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-800 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Home className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{language === 'ce' ? 'ЦIа' : 'Главная'}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </Link>

                <Link
                  href="/catalog"
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                    pathname === '/catalog'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-800 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{t.catalog}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </Link>

                <Link
                  href="/map"
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                    pathname === '/map'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-800 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{t.map}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </Link>

                                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={onClose}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                      pathname === '/admin'
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span>{t.admin}</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                  </Link>
                )}
              <Link
                  href="/about"
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                    pathname === '/about'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-800 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{t.about}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </Link>


              </div>
            </div>

            {/* 4. Section: РЕЛИГИЯ И ИСЛАМ (Clean titles without brackets or "Суры") */}
            <div className="space-y-0.5 border-t border-slate-100 smk-hr pt-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-200 px-2 py-1">
                {language === 'ce' ? 'Дин а, ислам а' : 'Религия и ислам'}
              </span>

              <div className="flex flex-col space-y-0.5">
                <button
                  type="button"
                  onClick={() => setIsQiblaOpen(true)}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center gap-2.5">
                    <Compass className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{language === 'ce' ? 'Къилба' : 'Кибла'}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </button>

                <Link href="/quran" onClick={onClose}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{language === 'ce' ? 'Сийлахь Къуръан' : 'Священный Коран'}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </Link>

                <button
                  type="button"
                  onClick={() => setIsSpecialDaysOpen(true)}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{language === 'ce' ? 'Исламан сийлахь денош' : 'Особые дни по Хиджре'}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </button>

                <Link href="/sira" onClick={onClose}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center gap-2.5">
                    <BookMarked className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{language === 'ce' ? 'Пайхамаран Сира' : 'Сира Пророка'}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </Link>

                


              </div>
            </div>

            {/* 5. Section: СЕРВИСЫ ДАЙМОХК */}
            <div className="space-y-0.5 border-t border-slate-100 smk-hr pt-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-200 px-2 py-1">
                {language === 'ce' ? 'Вай сервисаш' : 'Сервисы экосистемы'}
              </span>

              <div className="flex flex-col space-y-0.5">
                <Link href="/" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <CarFront className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t.taxiTitle}</span>
                  </div>
                  <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[9px] font-extrabold text-orange-800 dark:bg-orange-950/70 dark:text-orange-400">{t.inDevelopment}</span>
                </Link>

                <Link href="/" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <Globe2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t.vpnTitle}</span>
                  </div>
                  <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[9px] font-extrabold text-orange-800 dark:bg-orange-950/70 dark:text-orange-400">{t.inDevelopment}</span>
                </Link>

                <Link href="/" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t.vaynakhTitle}</span>
                  </div>
                  <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[9px] font-extrabold text-orange-800 dark:bg-orange-950/70 dark:text-orange-400">{t.inDevelopment}</span>
                </Link>

                <Link href="/vaygo" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <HandHeart className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t.goTitle}</span>
                  </div>
                </Link>

                <Link href="/vayghullakh" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t.gullaqTitle}</span>
                  </div>
                </Link>

                <Link href="/" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>{t.djannaTitle}</span>
                  </div>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[9px] font-extrabold text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200">{t.inPlans}</span>
                </Link>
              </div>
            </div>

            <div className="space-y-0.5 border-t border-slate-100 smk-hr pt-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-200 px-2 py-1">
                {language === 'ce' ? 'Кхиндерш' : 'Дополнительно'}
              </span>
              <div className="flex flex-col space-y-0.5">
                <Link href="/settings" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1-1-1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <span>{t.settings}</span>
                  </div>
                </Link>
                <Link href="/guide" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book-open h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                    <span>{language === 'ce' ? 'Руководство' : 'Руководство'}</span>
                  </div>
                </Link>
                <Link href="/help" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-life-buoy h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"><circle cx="12" cy="12" r="10"></circle><path d="m4.93 4.93 4.24 4.24"></path><path d="m14.83 9.17 4.24-4.24"></path><path d="m14.83 14.83 4.24 4.24"></path><path d="m9.17 14.83-4.24 4.24"></path><circle cx="12" cy="12" r="4"></circle></svg>
                    <span>{language === 'ce' ? 'ГIо' : 'Помощь'}</span>
                  </div>
                </Link>
                <Link href="/legal" onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scroll-text h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"><path d="M15 12h-5"></path><path d="M15 8h-5"></path><path d="M19 17V5a2 2 0 0 0-2-2H4"></path><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"></path></svg>
                    <span>{language === 'ce' ? 'Правовин соглашени' : 'Правовые соглашения'}</span>
                  </div>
                </Link>
                <button type="button" onClick={() => { onClose && onClose(); setIsBlacklistOpen(true); }} className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-ban h-4 w-4 shrink-0 text-red-600 dark:text-red-400"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2-1 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 4 19 5a1 1 0 0 1 1 1z"></path><path d="m4.706 8.5 14.588 11.006"></path></svg>
                    <span>{t.blacklist}</span>
                  </div>
                </button>
              </div>
            </div>

                          

        </div>
      <MenuProfileCard />

      </div>
      </div>

      {/* Islamic Modals */}
      <QiblaModal isOpen={isQiblaOpen} onClose={() => setIsQiblaOpen(false)} />
      <QuranModal isOpen={isQuranOpen} onClose={() => setIsQuranOpen(false)} />
      <SpecialDaysModal isOpen={isSpecialDaysOpen} onClose={() => setIsSpecialDaysOpen(false)} />
      <BlacklistModal isOpen={isBlacklistOpen} onClose={() => setIsBlacklistOpen(false)} />
    </>
  );
}
