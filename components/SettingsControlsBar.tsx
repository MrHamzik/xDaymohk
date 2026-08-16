'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock, Coffee, Minimize2, Moon, PowerOff, Sparkles, Sun, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n';
import { isCompactMapEnabled, setCompactMapEnabled } from '@/lib/map-prefs';
import NotificationCenter from '@/components/NotificationCenter';
import { UserMasterStatus } from '@/lib/types';

export default function SettingsControlsBar() {
  const { account, setMasterStatus } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useI18n();

  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<UserMasterStatus>('auto');
  // «Компактная карта»: тонкие цифры домов без фона, мелкие кластеры.
  const [compactMap, setCompactMap] = useState(false);
  useEffect(() => {
    setCompactMap(isCompactMapEnabled());
  }, []);
  const statusRef = useRef<HTMLDivElement | null>(null);

  const handleToggleCompactMap = () => {
    const next = !compactMap;
    setCompactMap(next);
    setCompactMapEnabled(next);
  };

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
    <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50/90 p-2 dark:border-zinc-700 dark:bg-zinc-900 border border-slate-200/80" >
      {/* 1. Status Button */}
      <div className="relative flex-1 flex justify-center" ref={statusRef}>
        <button
          type="button"
          onClick={() => setIsStatusMenuOpen((prev) => !prev)}
          title={language === 'ce' ? `Балхан хьал: ${currentStatusId}` : `Статус: ${currentStatusId}`}
          aria-label={language === 'ce' ? `Балхан хьал: ${currentStatusId}` : `Статус: ${currentStatusId}`}
          className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all active:scale-95 ${getStatusBgClass()}`}
        >
          {getStatusIcon()}
        </button>

        {isStatusMenuOpen && (
          <div className="absolute left-0 top-full z-[100] mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-slate-100 px-3 py-2.5 dark:border-zinc-800">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {language === 'ce' ? 'Болхан раж' : 'Режим работы'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                {language === 'ce' ? 'Хьан хIинцалера болхан хьал хийцар' : 'Переключает ваш текущий рабочий статус'}
              </p>
            </div>

            <div className="mt-1 space-y-1">
              {statusOptions.map((opt) => {
                const isSelected = opt.id === currentStatusId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectStatus(opt.id)}
                    className={`flex w-full items-start gap-2.5 rounded-xl p-2 text-left text-xs transition ${
                      isSelected
                        ? 'bg-emerald-50 font-bold text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${opt.dotColor}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span>{opt.label}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-500">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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

      {/* 4. Theme Button */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={toggleTheme}
          title={isDarkMode ? 'Тёмная тема (переключить на светлую)' : 'Светлая тема (переключить на тёмную)'}
          aria-label={isDarkMode ? 'Тёмная тема' : 'Светлая тема'}
          className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all active:scale-95 ${
            isDarkMode
              ? 'bg-sky-500 text-white shadow-sky-500/25 hover:bg-sky-400'
              : 'bg-amber-400 text-amber-950 shadow-amber-400/25 hover:bg-amber-500'
          }`}
        >
          {isDarkMode ? (
            <Moon className="h-5 w-5 fill-white text-white" />
          ) : (
            <Sun className="h-5 w-5 fill-amber-950 text-amber-950" />
          )}
        </button>
      </div>

      {/* 5. Компактная карта (тумблер): тонкие цифры без фона, мелкие кластеры */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={handleToggleCompactMap}
          role="switch"
          aria-checked={compactMap}
          title={language === 'ce'
            ? (compactMap ? 'Гӏеза карта: юкъдаккха' : 'Гӏеза карта: ялата')
            : (compactMap ? 'Компактная карта: включено (выключить)' : 'Компактная карта: выключено (включить)')}
          aria-label={language === 'ce' ? 'Гӏеза карта' : 'Компактная карта'}
          className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all active:scale-95 ${
            compactMap
              ? 'bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700'
              : 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600'
          }`}
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
