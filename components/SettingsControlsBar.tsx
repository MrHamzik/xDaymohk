'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock, Coffee, Moon, PowerOff, Sparkles, Sun, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n';
import NotificationCenter from '@/components/NotificationCenter';
import { HintMark } from '@/components/settings/SettingsPrimitives';
import ThemePickerButton from '@/components/settings/ThemePickerButton';
import { useSettings } from '@/components/SettingsProvider';
import { UserMasterStatus } from '@/lib/types';

export default function SettingsControlsBar() {
  const { account, setMasterStatus } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { settings, update } = useSettings();
  // Иконку рисуем по themeId — тому же полю, которое применяет
  // SettingsProvider. isDarkMode из ThemeProvider отставал на шаг.
  const isThemeDark = settings.themeId === 'dark';
  const { language, toggleLanguage } = useI18n();

  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<UserMasterStatus>('auto');
  const statusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    };
    if (isStatusMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStatusMenuOpen]);

  const currentStatusId = account?.statusOverride || localStatus;

  const handleSelectStatus = async (statusId: UserMasterStatus) => {
    setLocalStatus(statusId);
    setIsStatusMenuOpen(false);
    if (account) {
      await setMasterStatus(statusId);
    }
  };

  const getStatusBgClass = () => {
    switch (currentStatusId) {
      case 'active':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30';
      case 'break':
        return 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30';
      case 'offline':
        return 'bg-zinc-600 hover:bg-zinc-700 text-white shadow-zinc-600/30';
      case 'auto':
      default:
        return 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30';
    }
  };

  const getStatusIcon = () => {
    switch (currentStatusId) {
      case 'break':
        return <Coffee className="h-5 w-5 text-white" />;
      case 'offline':
        return <PowerOff className="h-5 w-5 text-white" />;
      case 'active':
        return <Sparkles className="h-5 w-5 text-white" />;
      case 'auto':
      default:
        return <Clock className="h-5 w-5 text-white" />;
    }
  };

  // Иконка и цвет для каждого режима — ряд из 4 кнопок.
  // Partial: 'flexible' задаётся в самой анкете, а не тумблером.
  const STATUS_ICONS: Partial<Record<UserMasterStatus, typeof Clock>> = {
    auto: Clock,
    active: Sparkles,
    break: Coffee,
    offline: PowerOff,
  };
  const STATUS_ACTIVE_BG: Partial<Record<UserMasterStatus, string>> = {
    auto: 'bg-emerald-600',
    active: 'bg-emerald-600',
    break: 'bg-amber-500',
    offline: 'bg-zinc-600',
  };

  // Strictly 4 options: Автоматическое, Работает, Перерыв, Не работает
  const statusOptions: Array<{
    id: UserMasterStatus;
    label: string;
    description: string;
    dotColor: string;
  }> = [
    {
      id: 'auto',
      label: language === 'ce' ? '🟢 Автоматан раж' : '🟢 Автоматическое',
      description: language === 'ce' ? 'Расписанца ша шех хийцало' : 'Переключается автоматически по часам',
      dotColor: 'bg-emerald-500',
    },
    {
      id: 'active',
      label: language === 'ce' ? '🟢 Болх беш ву' : '🟢 Работает',
      description: language === 'ce' ? 'Анкета къамелашна а, тIечIагIдаршна а схьайиллина ю' : 'Анкета открыта для заказов и звонков',
      dotColor: 'bg-emerald-500',
    },
    {
      id: 'break',
      label: language === 'ce' ? '🟠 Сацар' : '🟠 Перерыв',
      description: language === 'ce' ? 'Дена юкъахь ханна сацар' : 'Временный перерыв в течение дня',
      dotColor: 'bg-amber-500',
    },
    {
      id: 'offline',
      label: language === 'ce' ? '⚫ Болх ца бо' : '⚫ Не работает',
      description: language === 'ce' ? 'Болх ца бен де йа садаIар' : 'Выходной или закрыто',
      dotColor: 'bg-zinc-500',
    },
  ];

  return (
    <div className="smk-panel w-full p-2">
      {/* Заголовок с подсказкой: тумблер перекрывает расписание из
          анкет, и об этом надо сказать явно — иначе непонятно, почему
          статус не совпадает с рабочими часами. */}
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <span className="smk-sheet-label">
          {language === 'ce' ? 'Болхан раж' : 'Режим работы'}
        </span>
        <HintMark text={language === 'ce'
          ? 'ХIара низам массо хьайн анкетина тIедоьрзу — анкетан расписани хийца. Автоматан раж — сохьташца; Болх беш ву — анкета схьайиллина; Сацар — ханна сацар; Болх ца бо — садаIар.'
          : 'Этот переключатель действует на все ваши анкеты специалиста и перекрывает их расписание. Автоматически — статус считается по рабочим часам; Работает — анкета открыта для звонков; Перерыв — временно отошли; Не работает — выходной.'}
        />
      </div>
      <div className="flex w-full items-center justify-between gap-2">
      {/* 1. Status Button */}
      {/* 1. Режим работы — компактный ряд из 4 иконок.
             Выпадающее меню лежало absolute внутри контейнера бокового
             меню с overflow-hidden и обрезалось. Ряд иконок помещается
             в панель целиком и не требует всплывающего слоя. */}
      <div className="flex flex-1 items-center gap-1" ref={statusRef}>
        {statusOptions.map((opt) => {
          const isActive = currentStatusId === opt.id;
          const Icon = STATUS_ICONS[opt.id] ?? Clock;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelectStatus(opt.id)}
              aria-pressed={isActive}
              title={`${opt.label} — ${opt.description}`}
              aria-label={opt.label}
              className={`flex h-9 flex-1 items-center justify-center rounded-lg transition active:scale-95 ${
                isActive
                  ? `${STATUS_ACTIVE_BG[opt.id] ?? 'bg-emerald-600'} text-white shadow-sm`
                  : 'text-slate-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* 2. Language Button */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={toggleLanguage}
          title={language === 'ru' ? 'Переключить на нохчийн мотт' : 'Переключить на русский язык'}
          aria-label={`Язык: ${language === 'ru' ? 'Русский' : 'Нохчийн'}`}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 font-extrabold text-xs text-white shadow-sm shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-95"
        >
          {language === 'ru' ? 'RU' : 'CE'}
        </button>
      </div>

      {/* 3. Notifications Button */}
      <div className="flex-1 flex justify-center">
        <NotificationCenter />
      </div>

      {/* 4. Theme Button
             В расширенном режиме простой переключатель «светлая/тёмная»
             заменяется палитрой: тем больше двух, и перебор по нажатию
             стал бы неудобным. */}
      <div className="flex-1 flex justify-center">
        {settings.advancedMode ? <ThemePickerButton /> : (
        <button
          type="button"
          onClick={() => {
            // Пишем В ОБА места: settings.themeId — источник истины для
            // применения (там же живут пользовательские темы), а
            // toggleTheme сохраняет выбор в daymohk-theme, откуда его
            // читает первый кадр до загрузки настроек.
            update({ themeId: isThemeDark ? 'light' : 'dark' });
            toggleTheme();
          }}
          title={isThemeDark ? 'Тёмная тема (переключить на светлую)' : 'Светлая тема (переключить на тёмную)'}
          aria-label={isThemeDark ? 'Тёмная тема' : 'Светлая тема'}
          className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all active:scale-95 ${
            isThemeDark
              ? 'bg-sky-500 text-white shadow-sky-500/25 hover:bg-sky-400'
              : 'bg-amber-400 text-amber-950 shadow-amber-400/25 hover:bg-amber-500'
          }`}
        >
          {isThemeDark ? (
            <Moon className="h-5 w-5 fill-white text-white" />
          ) : (
            <Sun className="h-5 w-5 fill-amber-950 text-amber-950" />
          )}
        </button>
        )}
      </div>

      </div>
    </div>
  );
}
