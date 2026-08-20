'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookMarked,
  Bell,
  BookOpen,
  Bot,
  CarFront,
  Compass,
  Crown,
  Eye,
  EyeOff,
  Globe2,
  HandHeart,
  Home,
  Landmark,
  LifeBuoy,
  MapPin,
  ScrollText,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldBan,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import MenuProfileCard from '@/components/MenuProfileCard';
import NotificationCenter from '@/components/NotificationCenter';
import SettingsControlsBar from '@/components/SettingsControlsBar';
import PrayerTimesBar from '@/components/PrayerTimesBar';
import QiblaModal from '@/components/QiblaModal';
import SpecialDaysModal from '@/components/SpecialDaysModal';
import BlacklistModal from '@/components/BlacklistModal';
import { useSettings } from '@/components/SettingsProvider';
import { useI18n } from '@/lib/i18n';
import { shareLink, siteOrigin } from '@/lib/share';
import { LOCKED_MENU_IDS, widgetLabel } from '@/lib/settings/widgets';

interface SidebarNavProps {
  onClose?: () => void;
  isAdmin?: boolean;
  /** ПК-рейка: иконки, подписи при наведении. В выезде на телефоне выкл. */
  rail?: boolean;
}

type MenuAction = 'qibla' | 'hijri' | 'blacklist' | 'invite' | 'notify';

interface MenuItem {
  id: string;
  href?: string;
  action?: MenuAction;
  icon: LucideIcon;
  adminOnly?: boolean;
  danger?: true;
  chip?: 'dev' | 'plan';
}

interface MenuSection {
  id: string;
  titleRu: string;
  titleCe: string;
  items: MenuItem[];
}

const SECTIONS: MenuSection[] = [
  {
    id: 'nav',
    titleRu: 'Навигация',
    titleCe: 'Навигаци',
    items: [
      { id: 'home', href: '/', icon: Home },
      { id: 'catalog', href: '/catalog', icon: Users },
      { id: 'map', href: '/map', icon: MapPin },
      { id: 'admin', href: '/admin', icon: ShieldAlert, adminOnly: true, danger: true },
      { id: 'about', href: '/about', icon: Sparkles },
    ],
  },
  {
    id: 'deen',
    titleRu: 'Религия и ислам',
    titleCe: 'Дин а, ислам а',
    items: [
      { id: 'qibla', action: 'qibla', icon: Compass },
      { id: 'quran', href: '/quran', icon: BookOpen },
      { id: 'hijri', action: 'hijri', icon: Sparkles },
      { id: 'sira', href: '/sira', icon: BookMarked },
    ],
  },
  {
    id: 'services',
    titleRu: 'Сервисы экосистемы',
    titleCe: 'Вай сервисаш',
    items: [
      { id: 'taxi', href: '/', icon: CarFront, chip: 'dev' },
      { id: 'vpn', href: '/', icon: Globe2, chip: 'dev' },
      { id: 'vaynakh', href: '/vaynakh', icon: Landmark },
      { id: 'go', href: '/vaygo', icon: HandHeart },
      { id: 'gullaq', href: '/vayghullakh', icon: Wrench },
      { id: 'djanna', href: '/', icon: Bot, chip: 'plan' },
    ],
  },
  {
    id: 'more',
    titleRu: 'Дополнительно',
    titleCe: 'Кхиндерш',
    items: [
      { id: 'settings', href: '/settings', icon: SettingsIcon },
      { id: 'pro', href: '/pro', icon: Crown },
      { id: 'guide', href: '/guide', icon: BookOpen },
      { id: 'help', href: '/help', icon: LifeBuoy },
      { id: 'legal', href: '/legal', icon: ScrollText },
      { id: 'invite', action: 'invite', icon: Users },
      { id: 'notify', action: 'notify', icon: Bell },
      { id: 'blacklist', action: 'blacklist', icon: ShieldBan, danger: true },
    ],
  },
];

function rowClass(active: boolean, danger?: boolean) {
  if (active && danger) return 'bg-red-600 text-white shadow-sm';
  if (active) return 'bg-emerald-600 text-white shadow-sm';
  if (danger) return 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-zinc-800';
  return 'text-slate-800 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800';
}

function railItemClass(active: boolean, danger?: boolean) {
  const on = active ? 'smk-rail-item--on' : '';
  const bad = danger ? 'smk-rail-item--danger' : '';
  return `smk-rail-item ${on} ${bad}`.trim();
}

export default function SidebarNav({ onClose, isAdmin = false, rail = false }: SidebarNavProps) {
  const pathname = usePathname();
  const { language, t } = useI18n();
  const { settings, update } = useSettings();

  const [isQiblaOpen, setIsQiblaOpen] = useState(false);
  const [isSpecialDaysOpen, setIsSpecialDaysOpen] = useState(false);
  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);

  useEffect(() => {
    const openHijri = () => setIsSpecialDaysOpen(true);
    const openBlacklist = () => setIsBlacklistOpen(true);
    window.addEventListener('daymohk-open-hijri', openHijri);
    window.addEventListener('daymohk-open-blacklist', openBlacklist);
    return () => {
      window.removeEventListener('daymohk-open-hijri', openHijri);
      window.removeEventListener('daymohk-open-blacklist', openBlacklist);
    };
  }, []);

  const editing = settings.lightMode;
  const hidden = new Set(settings.hiddenMenu);

  const toggleHidden = (id: string) => {
    if (LOCKED_MENU_IDS.has(id)) return;
    const next = hidden.has(id)
      ? settings.hiddenMenu.filter((item) => item !== id)
      : [...settings.hiddenMenu, id];
    update({ hiddenMenu: next });
  };

  const runAction = (action: MenuAction) => {
    if (action === 'qibla') setIsQiblaOpen(true);
    if (action === 'hijri') setIsSpecialDaysOpen(true);
    if (action === 'blacklist') {
      onClose?.();
      setIsBlacklistOpen(true);
    }
    if (action === 'invite') {
      void shareLink(t.siteName, t.inviteNeighbor, `${siteOrigin()}/catalog`);
    }
  };

  const renderItem = (item: MenuItem) => {
    if (item.adminOnly && !isAdmin) return null;
    const isHidden = hidden.has(item.id);
    if (!editing && isHidden) return null;

    const locked = LOCKED_MENU_IDS.has(item.id);
    const label = widgetLabel(item.id, t);
    const active = Boolean(item.href && pathname === item.href);
    const Icon = item.icon;
    const iconCls = rail
      ? 'smk-rail-ico'
      : item.danger
        ? 'h-4 w-4 shrink-0 text-red-600 dark:text-red-400'
        : 'h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400';

    const body = rail ? (
      <>
        <Icon className={iconCls} />
        <span className="smk-rail-label truncate">{label}</span>
        {item.chip === 'dev' && <span className="smk-rail-label smk-chip smk-note-warn">{t.inDevelopment}</span>}
        {item.chip === 'plan' && <span className="smk-rail-label smk-chip smk-note-info">{t.inPlans}</span>}
      </>
    ) : (
      <>
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className={iconCls} />
          <span className="truncate">{label}</span>
        </div>
        {item.chip === 'dev' && <span className="smk-chip smk-note-warn">{t.inDevelopment}</span>}
        {item.chip === 'plan' && <span className="smk-chip smk-note-info">{t.inPlans}</span>}
      </>
    );

    const inner = item.href ? (
      <Link
        href={item.href}
        onClick={onClose}
        title={rail ? label : undefined}
        className={rail
          ? railItemClass(active, item.danger)
          : `flex min-w-0 flex-1 items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${rowClass(active, item.danger)}`}
      >
        {body}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => item.action && runAction(item.action)}
        title={rail ? label : undefined}
        className={rail
          ? railItemClass(false, item.danger)
          : `flex min-w-0 flex-1 items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${rowClass(false, item.danger)}`}
      >
        {body}
      </button>
    );

    return (
      <div
        key={item.id}
        className={`flex items-center gap-1 ${editing && isHidden ? 'opacity-45' : ''}`}
      >
        {inner}
        {editing && (
          <button
            type="button"
            disabled={locked}
            onClick={() => toggleHidden(item.id)}
            aria-label={isHidden ? t.menuShowItem : t.menuHideItem}
            title={locked ? t.settings : (isHidden ? t.menuShowItem : t.menuHideItem)}
            className="smk-hit flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            {locked || !isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={`flex h-full w-full flex-col overflow-hidden ${rail ? 'px-1.5 py-2.5' : 'p-3.5'}`}>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5 no-scrollbar">
          <div className={rail ? 'smk-rail-extra' : undefined}>
            <SettingsControlsBar />
            <div className="mt-3">
              <PrayerTimesBar />
            </div>
          </div>

          {editing && (
            <p className="smk-note smk-note-info px-3 py-2">{t.menuEditMode}</p>
          )}

          {SECTIONS.map((section) => {
            const nodes = section.items
              .map((item) => renderItem(item))
              .filter(Boolean) as ReactNode[];
            if (nodes.length === 0) return null;
            return (
              <div
                key={section.id}
                className={`space-y-0.5 ${section.id === 'nav' || rail ? '' : 'smk-hr border-t border-slate-100 pt-2'}`}
              >
                <span className={`${rail ? 'smk-rail-extra' : ''} block px-2 py-1 smk-text-label font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-200`}>
                  {language === 'ce' ? section.titleCe : section.titleRu}
                </span>
                <div className="flex flex-col space-y-0.5">{nodes}</div>
              </div>
            );
          })}
        </div>
        {editing && (
          <button
            type="button"
            onClick={() => toggleHidden('profile')}
            className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left smk-text-label font-bold text-slate-500"
          >
            <span>{t.profile}</span>
            {hidden.has('profile') ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
        {(editing || !hidden.has('profile')) && (
          <div className={editing && hidden.has('profile') ? 'opacity-45' : undefined}>
            <MenuProfileCard />
          </div>
        )}
      </div>

      <div className="sr-only">
        <NotificationCenter />
      </div>
      <QiblaModal isOpen={isQiblaOpen} onClose={() => setIsQiblaOpen(false)} />
      <SpecialDaysModal isOpen={isSpecialDaysOpen} onClose={() => setIsSpecialDaysOpen(false)} />
      <BlacklistModal isOpen={isBlacklistOpen} onClose={() => setIsBlacklistOpen(false)} />
    </>
  );
}
