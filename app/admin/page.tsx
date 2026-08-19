'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Moon, ShieldAlert, Sun } from 'lucide-react';
import AdminFiltersSection from '@/components/admin/AdminFiltersSection';
import AdminArticlesSection from '@/components/admin/AdminArticlesSection';
import AdminSupportSection from '@/components/admin/AdminSupportSection';
import AdminAuditSection from '@/components/admin/AdminAuditSection';
import AdminProfilesSection from '@/components/admin/AdminProfilesSection';
import AdminComplaintsSection from '@/components/admin/AdminComplaintsSection';
import AdminUsersSection from '@/components/admin/AdminUsersSection';
import AdminAddressesSection from '@/components/admin/AdminAddressesSection';
import AdminLettersSection from '@/components/admin/AdminLettersSection';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';

type AdminSection = 'profiles' | 'complaints' | 'users' | 'addresses' | 'letters' | 'filters' | 'articles' | 'support' | 'audit';

/**
 * Оболочка админки: доступ, шапка, вкладки.
 *
 * Разделы живут в components/admin/*Section — так правка писем не
 * рискует задеть адреса, а файл страницы больше не грузит всё сразу
 * в одну кучу из ~2800 строк.
 */
export default function AdminPage() {
  const { account, signInWithGoogle } = useAuth();
  const { profiles, users, complaints, isCurrentUserAdmin } = useProfiles();
  const { language, setLanguage } = useI18n();
  const { isDarkMode, toggleTheme } = useTheme();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [addressCount, setAddressCount] = useState(0);

  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    if (typeof window === 'undefined') return 'profiles';
    try {
      const stored = window.localStorage.getItem('daymohk-admin-section');
      if (stored && ['profiles', 'complaints', 'users', 'addresses', 'letters', 'filters', 'articles', 'support', 'audit'].includes(stored)) {
        return stored as AdminSection;
      }
    } catch {}
    return 'profiles';
  });

  useEffect(() => {
    try { window.localStorage.setItem('daymohk-admin-section', activeSection); } catch {}
  }, [activeSection]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/addresses', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.addresses)) setAddressCount(data.addresses.length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeSection]);

  const openComplaints = complaints.filter((complaint) => complaint.status === 'open');

  if (!isCurrentUserAdmin) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-slate-50 dark:bg-zinc-950">
        <Navbar />
        <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center p-6 text-center pt-24 pb-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{L('Панель администратора', 'Администраторан панель')}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-500">{L('Доступ только для mr.hamzik1026@gmail.com, nabis95@gmail.com', 'Доступ башха: mr.hamzik1026@gmail.com, nabis95@gmail.com')}</p>
          {!account && <button onClick={() => void signInWithGoogle()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">{L('Войти через Google', 'Google чуйаха')}</button>}
          <Link href="/" className="mt-4 text-xs font-semibold text-slate-500 hover:underline">{L('Вернуться в каталог', 'Каталоге юхаверза')}</Link>
        </main>
        <BottomNav isAdmin={false} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />
      <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 px-3.5 pb-20 pt-18 sm:pb-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label={L('Вернуться в каталог', 'Каталоге юхаверза')} className="flex h-9 w-9 shrink-0 items-center justify-center smk-field text-slate-700 transition hover:bg-slate-50  dark:text-zinc-400"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{L('Панель администратора', 'Администраторан панель')}</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Подтверждения, скрытые анкеты, жалобы, пользователи и адреса', 'ТIечIагIдарш, къайлайаьхна анкеташ, арзаш, лелошхой а, адресаш а')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex smk-field p-0.5 shadow-sm ">
              {(['ru', 'ce'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={`rounded-lg px-2.5 py-1.5 smk-text-label font-bold uppercase transition ${language === l ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                  title={l === 'ru' ? 'Русский' : 'Нохчийн'}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center smk-field text-slate-600 shadow-sm transition hover:bg-slate-50  dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label={isDarkMode ? 'Светлая тема' : 'Тёмная тема'}
              title={isDarkMode ? 'Светлая тема' : 'Тёмная тема'}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <hr className="smk-orn mb-5" />

        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {([
            ['profiles', L('Анкеты', 'Анкеташ'), profiles.length],
            ['complaints', L('Жалобы', 'Арзаш'), openComplaints.length],
            ['users', L('Пользователи', 'Лелошхой'), users.length],
            ['addresses', L('Адреса', 'Адресаш'), addressCount],
            ['letters', L('Письма', 'Кехаташ'), 0],
            ['filters', L('Фильтры', 'Фильтраш'), 0],
            ['articles', L('Статьи', 'Статьяш'), 0],
            ['support', L('Помощь', 'ГIо'), 0],
            ['audit', L('Журнал', 'Журнал'), 0],
          ] as const).map(([section, label, count]) => (
            <button key={section} type="button" onClick={() => setActiveSection(section)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeSection === section ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{label}<span className={`rounded-full px-1.5 py-0.5 smk-text-label ${activeSection === section ? 'bg-white/20' : 'bg-slate-100 dark:bg-zinc-800'}`}>{count}</span></button>
          ))}
        </nav>

        {activeSection === 'profiles' && <AdminProfilesSection />}
        {activeSection === 'complaints' && <AdminComplaintsSection />}
        {activeSection === 'users' && <AdminUsersSection />}
        {activeSection === 'addresses' && <AdminAddressesSection />}
        {activeSection === 'letters' && <AdminLettersSection />}
        {activeSection === 'filters' && <AdminFiltersSection />}
        {activeSection === 'articles' && <AdminArticlesSection />}
        {activeSection === 'support' && <AdminSupportSection />}
        {activeSection === 'audit' && <AdminAuditSection language={language} />}
      </main>

      <BottomNav onOpenMenu={() => setIsMenuDrawerOpen(true)} onOpenCreate={() => setIsCreateSheetOpen(true)} isAdmin={isCurrentUserAdmin} />
      <MobileMenuDrawer isOpen={isMenuDrawerOpen} onClose={() => setIsMenuDrawerOpen(false)} isAdmin={isCurrentUserAdmin} />
      <CreateActionModal isOpen={isCreateSheetOpen} onClose={() => setIsCreateSheetOpen(false)} onOpenCreateProfile={() => {}} />
    </div>
  );
}
