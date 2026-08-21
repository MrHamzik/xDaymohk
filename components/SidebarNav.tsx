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
  Clock,
  Home,
  Landmark,
  Languages,
  LifeBuoy,
  MapPin,
  Palette,
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
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';
import { LOCKED_MENU_IDS, widgetLabel } from '@/lib/settings/widgets';
import { WORK_STATUS_BG, WORK_STATUS_IDS, workStatusText } from '@/lib/settings/work-status';
import type { UserMasterStatus } from '@/lib/types';
import { emitTourEvent } from '@/lib/tour';

interface SidebarNavProps {
  onClose?: () => void;
  isAdmin?: boolean;
  /** ПК-рейка: иконки, подписи при наведении. В выезде на телефоне выкл. */
  rail?: boolean;
}

type MenuAction =
  | 'qibla' | 'hijri' | 'blacklist' | 'invite' | 'notify'
  // Быстрые настройки строками (п.12).
  | 'lang' | 'status' | 'theme';

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
      // href нет: раздел ещё не сделан. Раньше стояло href: '/', и на
      // главной эти пункты подсвечивались как активные вместе с
      // «Главная» — pathname совпадал.
      { id: 'taxi', icon: CarFront, chip: 'dev' as const },
      { id: 'vpn', icon: Globe2, chip: 'dev' as const },
      { id: 'vaynakh', href: '/vaynakh', icon: Landmark },
      { id: 'go', href: '/goncholla', icon: HandHeart },
      { id: 'gullaq', href: '/temshik', icon: Wrench },
      { id: 'djanna', icon: Bot, chip: 'plan' as const },
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
      { id: 'blacklist', action: 'blacklist', icon: ShieldBan, danger: true },
      // Быстрые настройки (п.12). В обычном меню их не видно: те же
      // четыре переключателя стоят плиткой в шапке, а строками они
      // нужны не каждому. Все четыре скрыты умолчанием hiddenMenu и
      // включаются глазиком в лайт-режиме.
      { id: 'notify', action: 'notify', icon: Bell },
      { id: 'lang', action: 'lang', icon: Languages },
      { id: 'status', action: 'status', icon: Clock },
      { id: 'theme', action: 'theme', icon: Palette },
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
  const { language, toggleLanguage, t } = useI18n();
  const { settings, update } = useSettings();
  const { toggleTheme } = useTheme();
  const { account, setMasterStatus } = useAuth();
  const currentStatusId: UserMasterStatus = account?.statusOverride || 'auto';

  const [isQiblaOpen, setIsQiblaOpen] = useState(false);
  const [isSpecialDaysOpen, setIsSpecialDaysOpen] = useState(false);
  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

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
    // «Уведомления» (п.12). Пункт в меню был, а обработчика у него не
    // было вовсе: нажатие просто ничего не делало. Открываем ту же
    // почту, что и колокольчик в плитке настроек.
    if (action === 'notify') {
      onClose?.();
      window.dispatchEvent(new Event('daymohk-open-mail'));
    }
    if (action === 'lang') toggleLanguage();
    // Тема строкой — простое переключение светлая/тёмная. Богатый
    // выбор с пользовательскими темами живёт в плитке (ThemePickerButton)
    // и в настройках: дублировать выпадающий список внутри
    // прокручиваемого меню незачем.
    if (action === 'theme') {
      update({ themeId: settings.themeId === 'dark' ? 'light' : 'dark' });
      toggleTheme();
    }
    // «Режим работы» раскрывается списком прямо под строкой: четыре
    // статуса — это выбор, а не переключатель.
    if (action === 'status') setIsStatusOpen((prev) => !prev);
  };

  const handleSelectStatus = async (statusId: UserMasterStatus) => {
    setIsStatusOpen(false);
    if (account) await setMasterStatus(statusId);
  };

  const renderItem = (item: MenuItem) => {
    if (item.adminOnly && !isAdmin) return null;
    const isHidden = hidden.has(item.id);
    if (!editing && isHidden) return null;

    const locked = LOCKED_MENU_IDS.has(item.id);
    const label = widgetLabel(item.id, t);
    const active = Boolean(item.href && pathname === item.href);
    const Icon = item.icon;
    // Зелёным горит только значок выбранного раздела (п.23/30).
    // Раньше зелёными были все сразу, и на «Главной» казалось, что
    // подсвечено полменю. У активной строки фон уже зелёный, поэтому
    // её значок делаем белым — иначе он тонет в подложке.
    // Цвет значков (п.14).
    //
    // Обычные значки красим цветом ТЕМЫ (--smk-icon — та же переменная,
    // что уже красит значки в узкой рейке и в .smk-act). Серый
    // text-slate-400, стоявший здесь раньше, темы не слушал и выглядел
    // выцветшим, а в тёмном оформлении почти пропадал.
    //
    // Исключения:
    //  · активная строка — фон уже залит акцентом, значок белый, иначе
    //    он тонет в подложке;
    //  · «Админ» и «Чёрный список» — всегда красные независимо от темы:
    //    это опасные разделы, и их цвет не должен зависеть от вкуса.
    const iconCls = rail
      ? 'smk-rail-ico'
      : active
        ? 'h-4 w-4 shrink-0 text-white'
        : item.danger
          ? 'h-4 w-4 shrink-0 text-red-600 dark:text-red-400'
          : 'h-4 w-4 shrink-0 text-[var(--smk-icon)]';

    // Быстрым настройкам показываем текущее значение справа: строка
    // «Язык» без «RU» рядом ничего не сообщает, пока её не нажмёшь.
    const valueBadge =
      item.id === 'lang' ? (language === 'ru' ? 'RU' : 'CE')
        : item.id === 'theme' ? (settings.themeId === 'dark' ? t.themeDarkShort : t.themeLightShort)
          : item.id === 'status' ? workStatusText(currentStatusId, language).label
            : null;

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
        {valueBadge && (
          <span className="ml-2 shrink-0 smk-text-label font-bold text-slate-500 dark:text-zinc-400">{valueBadge}</span>
        )}
        {item.chip === 'dev' && <span className="smk-chip smk-note-warn">{t.inDevelopment}</span>}
        {item.chip === 'plan' && <span className="smk-chip smk-note-info">{t.inPlans}</span>}
      </>
    );

    // Метка для гида. На ПК нижней панели нет, и «Каталог» с «Картой»
    // он подсвечивает здесь — в боковой колонке.
    const tourMark = item.id === 'catalog' || item.id === 'map' ? item.id : undefined;

    const inner = item.href ? (
      <Link
        href={item.href}
        onClick={onClose}
        data-tour={tourMark}
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

    // Список статусов под строкой «Режим работы» (п.12). В рейке, где
    // видны одни значки, разворачивать его негде — там строка работает
    // как раньше.
    const statusList = item.id === 'status' && isStatusOpen && !rail ? (
      <div className="mt-0.5 space-y-0.5 pl-9">
        {WORK_STATUS_IDS.map((id) => {
          const text = workStatusText(id, language);
          const selected = id === currentStatusId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => void handleSelectStatus(id)}
              aria-pressed={selected}
              title={text.description}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left smk-text-label font-bold transition ${
                selected
                  ? `${WORK_STATUS_BG[id] ?? 'bg-emerald-600'} text-white`
                  : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <span className="truncate">{text.label}</span>
            </button>
          );
        })}
      </div>
    ) : null;

    return (
      <div key={item.id} className={editing && isHidden ? 'opacity-45' : undefined}>
        <div className="flex items-center gap-1">
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
        {statusList}
      </div>
    );
  };

  return (
    <>
      <div className={`flex h-full w-full flex-col overflow-hidden ${rail ? 'px-1.5 py-2.5' : 'p-3.5'}`}>
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5 no-scrollbar"
          // Гид на шаге про меню ждёт, пока человек пролистает список:
          // так он видит, что разделов больше, чем помещается на экран.
          onScroll={(event) => {
            if (event.currentTarget.scrollTop > 80) emitTourEvent('menu-scroll');
          }}
        >
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
