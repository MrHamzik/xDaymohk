'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Bell, BookMarked, BookOpen, Bot, CarFront, Clock, Coffee, Compass, Crown, Globe2,
  HandHeart, Home, Landmark, LifeBuoy, MapPin, Moon, PowerOff, ScrollText,
  Settings as SettingsIcon, ShieldAlert, ShieldBan, Sparkles, Sun,
  UserRound, Users, Wrench,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n';
import { useNotifications } from '@/components/NotificationsProvider';
import ThemePickerButton from '@/components/settings/ThemePickerButton';
import QiblaModal from '@/components/QiblaModal';
import { useSettings } from '@/components/SettingsProvider';
import { widgetLabel } from '@/lib/settings/widgets';
import { UserMasterStatus } from '@/lib/types';

const TILE =
  'flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all active:scale-95';

export default function SettingsControlsBar() {
  const { account, setMasterStatus } = useAuth();
  const { toggleTheme } = useTheme();
  const { settings, update } = useSettings();
  const { unreadCount } = useNotifications();
  const isThemeDark = settings.themeId === 'dark';
  const { language, toggleLanguage, t } = useI18n();

  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<UserMasterStatus>('auto');
  const [isQiblaOpen, setIsQiblaOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number } | null>(null);

  const placeMenu = useCallback(() => {
    const anchor = statusRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = 220;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    setMenuBox({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!isStatusMenuOpen) return;
    placeMenu();
    const onScroll = () => placeMenu();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isStatusMenuOpen, placeMenu]);

  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isStatusMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (statusRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStatusMenuOpen]);

  const currentStatusId = account?.statusOverride || localStatus;

  const handleSelectStatus = async (statusId: UserMasterStatus) => {
    setLocalStatus(statusId);
    setIsStatusMenuOpen(false);
    if (account) await setMasterStatus(statusId);
  };

  const getStatusBgClass = () => {
    switch (currentStatusId) {
      case 'break': return 'smk-status-bg--break text-white';
      case 'offline': return 'smk-status-bg--offline text-white';
      case 'active': return 'smk-status-bg--active text-white';
      case 'auto':
      default: return 'smk-status-bg--auto text-white';
    }
  };

  const getStatusIcon = () => {
    switch (currentStatusId) {
      case 'break': return <Coffee className="h-5 w-5 text-white" />;
      case 'offline': return <PowerOff className="h-5 w-5 text-white" />;
      case 'active': return <Sparkles className="h-5 w-5 text-white" />;
      case 'auto':
      default: return <Clock className="h-5 w-5 text-white" />;
    }
  };

  const STATUS_ICONS: Partial<Record<UserMasterStatus, typeof Clock>> = {
    auto: Clock, active: Sparkles, break: Coffee, offline: PowerOff,
  };
  const STATUS_ACTIVE_BG: Partial<Record<UserMasterStatus, string>> = {
    auto: 'smk-status-bg--auto',
    active: 'smk-status-bg--active',
    break: 'smk-status-bg--break',
    offline: 'smk-status-bg--offline',
  };

  const statusOptions: Array<{
    id: UserMasterStatus;
    label: string;
    description: string;
  }> = [
    {
      id: 'auto',
      label: language === 'ce' ? '🟢 Автоматан раж' : '🟢 Автоматическое',
      description: language === 'ce' ? 'Расписанца ша шех хийцало' : 'Переключается автоматически по часам',
    },
    {
      id: 'active',
      label: language === 'ce' ? '🟢 Болх беш ву' : '🟢 Работает',
      description: language === 'ce' ? 'Анкета къамелашна а, тIечIагIдаршна а схьайиллина ю' : 'Анкета открыта для заказов и звонков',
    },
    {
      id: 'break',
      label: language === 'ce' ? '🟠 Сацар' : '🟠 Перерыв',
      description: language === 'ce' ? 'Дена юкъахь ханна сацар' : 'Временный перерыв в течение дня',
    },
    {
      id: 'offline',
      label: language === 'ce' ? '⚫ Болх ца бо' : '⚫ Не работает',
      description: language === 'ce' ? 'Болх ца бен де йа садаIар' : 'Выходной или закрыто',
    },
  ];

  const openConsent = () => {
    window.dispatchEvent(new Event('daymohk-open-consent'));
  };

  const navTile = (href: string, label: string, icon: ReactNode) => (
    <Link href={href} title={label} aria-label={label} className={`${TILE} bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700`}>
      {icon}
    </Link>
  );

  const renderWidget = (id: string) => {
    switch (id) {
      case 'status':
        return (
          <div className="relative" ref={statusRef}>
            <button
              type="button"
              onClick={() => setIsStatusMenuOpen((prev) => !prev)}
              title={widgetLabel('status', t)}
              aria-label={`${widgetLabel('status', t)}: ${currentStatusId}`}
              className={`${TILE} ${getStatusBgClass()}`}
            >
              {getStatusIcon()}
            </button>
            {isStatusMenuOpen && menuBox && typeof document !== 'undefined' && createPortal(
              <div
                ref={menuRef}
                style={{ top: menuBox.top, left: menuBox.left }}
                className="smk-solid fixed z-[111] rounded-2xl p-2 shadow-2xl"
              >
                <div className="mb-1.5 px-1">
                  <span className="smk-sheet-label">{t.widgetStatus}</span>
                </div>
                <div className="flex items-center gap-1">
                  {statusOptions.map((opt) => {
                    const isSelected = opt.id === currentStatusId;
                    const Icon = STATUS_ICONS[opt.id] ?? Clock;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectStatus(opt.id)}
                        aria-pressed={isSelected}
                        title={`${opt.label} — ${opt.description}`}
                        aria-label={opt.label}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl transition active:scale-95 ${
                          isSelected
                            ? `${STATUS_ACTIVE_BG[opt.id] ?? 'bg-emerald-600'} text-white shadow-sm`
                            : 'text-slate-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 max-w-[15rem] px-1 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-400">
                  {language === 'ce'
                    ? 'ХIара низам массо хьайн говзанчин анкетина тIедоьрзу — анкетан расписани хийца. Сохьташца — расписанца; Болх беш ву — схьайиллина; Сацар — ханна; Болх ца бо — садаIар.'
                    : 'Действует на все ваши анкеты специалиста и перекрывает их расписание. По расписанию — статус по рабочим часам; Работает — открыт для звонков; Перерыв — временно отошли; Не работает — выходной.'}
                </p>
              </div>,
              document.body,
            )}
          </div>
        );
      case 'lang':
        return (
          <button
            type="button"
            onClick={toggleLanguage}
            title={language === 'ru' ? 'Переключить на нохчийн мотт' : 'Переключить на русский язык'}
            aria-label={`${t.widgetLang}: ${language === 'ru' ? 'Русский' : 'Нохчийн'}`}
            className={`${TILE} bg-emerald-600 font-extrabold text-xs text-white shadow-emerald-600/30 hover:bg-emerald-700`}
          >
            {language === 'ru' ? 'RU' : 'CE'}
          </button>
        );
      case 'notify':
        return (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('daymohk-open-mail'))}
            title={t.settingsSectionNotifications}
            aria-label={t.settingsSectionNotifications}
            className={`relative ${TILE} ${
              unreadCount > 0
                ? 'bg-orange-500 text-white shadow-orange-500/30 hover:bg-orange-600'
                : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 smk-text-label font-black text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        );
      case 'theme':
        return (settings.advancedMode || settings.proTier !== 'none') ? <ThemePickerButton /> : (
          <button
            type="button"
            onClick={() => {
              update({ themeId: isThemeDark ? 'light' : 'dark' });
              toggleTheme();
            }}
            title={isThemeDark ? 'Тёмная тема (переключить на светлую)' : 'Светлая тема (переключить на тёмную)'}
            aria-label={t.settingsThemes}
            className={`${TILE} ${
              isThemeDark
                ? 'bg-sky-500 text-white shadow-sky-500/25 hover:bg-sky-400'
                : 'bg-amber-500 text-white shadow-amber-500/25 hover:bg-amber-600'
            }`}
          >
            {isThemeDark
              ? <Moon className="h-5 w-5 fill-white text-white" />
              : <Sun className="h-5 w-5 fill-white text-white" />}
          </button>
        );
      case 'light':
        return (
          <button
            type="button"
            onClick={() => update({ lightMode: !settings.lightMode })}
            title={t.lightMode}
            aria-label={t.lightMode}
            aria-pressed={settings.lightMode}
            className={`${TILE} ${
              settings.lightMode
                ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            <Sparkles className="h-5 w-5" />
          </button>
        );
      case 'home':
        return navTile('/', t.navMain, <Home className="h-5 w-5" />);
      case 'catalog':
        return navTile('/catalog', t.catalog, <Users className="h-5 w-5" />);
      case 'map':
        return navTile('/map', t.map, <MapPin className="h-5 w-5" />);
      case 'qibla':
        return (
          <button
            type="button"
            onClick={() => setIsQiblaOpen(true)}
            title={t.navQibla}
            aria-label={t.navQibla}
            className={`${TILE} bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700`}
          >
            <Compass className="h-5 w-5" />
          </button>
        );
      case 'quran':
        return navTile('/quran', t.navQuran, <BookOpen className="h-5 w-5" />);
      case 'sira':
        return navTile('/sira', t.navSira, <BookMarked className="h-5 w-5" />);
      case 'profile':
        return account
          ? navTile('/profile', t.profile, <UserRound className="h-5 w-5" />)
          : (
            <button
              type="button"
              onClick={openConsent}
              title={t.signIn}
              aria-label={t.signIn}
              className={`${TILE} bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700`}
            >
              <UserRound className="h-5 w-5" />
            </button>
          );
      case 'gullaq':
        return navTile('/vayghullakh', t.gullaqTitle, <Wrench className="h-5 w-5" />);
      case 'go':
        return navTile('/vaygo', t.goTitle, <HandHeart className="h-5 w-5" />);
      case 'vaynakh':
        return navTile('/vaynakh', t.vaynakhTitle, <Landmark className="h-5 w-5" />);
      case 'taxi':
        return navTile('/', t.taxiTitle, <CarFront className="h-5 w-5" />);
      case 'vpn':
        return navTile('/', t.vpnTitle, <Globe2 className="h-5 w-5" />);
      case 'djanna':
        return navTile('/', t.djannaTitle, <Bot className="h-5 w-5" />);
      default:
        return null;
    }
  };

  const slots = settings.quickWidgets.slice(0, 4);

  return (
    <div className="smk-panel smk-widgets flex w-full items-center justify-between gap-2 p-2">
      {slots.map((id, index) => (
        <div key={`${id}-${index}`} className="flex flex-1 justify-center">
          {renderWidget(id)}
        </div>
      ))}
      <QiblaModal isOpen={isQiblaOpen} onClose={() => setIsQiblaOpen(false)} />
    </div>
  );
}
