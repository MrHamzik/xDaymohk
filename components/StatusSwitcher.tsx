'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock, Check, Coffee, PowerOff, Sparkles } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { UserMasterStatus } from '@/lib/types';

export default function StatusSwitcher() {
  const { account, setMasterStatus } = useAuth();
  const { language, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<UserMasterStatus>('auto');
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentStatusId = account?.statusOverride || localStatus;

  const handleSelect = async (statusId: UserMasterStatus) => {
    setLocalStatus(statusId);
    setIsOpen(false);
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
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={language === 'ce' ? `Балхан хьал: ${currentStatusId}` : `Статус: ${currentStatusId}`}
        aria-label={language === 'ce' ? `Балхан хьал: ${currentStatusId}` : `Статус: ${currentStatusId}`}
        aria-expanded={isOpen}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all active:scale-95 ${getStatusBgClass()}`}
      >
        {getStatusIcon()}
      </button>

      {isOpen && (
        <div className="fixed inset-x-4 top-20 z-[95] w-auto overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-800 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72">
          <div className="border-b border-slate-100 px-3 py-2.5 text-left dark:border-zinc-800">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {language === 'ce' ? 'Болхан раж' : t.filterWorkStatus}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500">
              {language === 'ce' ? 'Хьан хIинцалера болхан хьал хийцар' : 'Переключает ваш текущий рабочий статус'}
            </p>
          </div>

          <div className="mt-1 space-y-1">
            {statusOptions.map((option) => {
              const isSelected = option.id === currentStatusId;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  className={`flex w-full items-start gap-2.5 rounded-2xl p-2.5 text-left transition ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-950 dark:bg-zinc-800 dark:text-emerald-300 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-800/80'
                  }`}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-zinc-800">
                    <span className={`h-2.5 w-2.5 rounded-full ${option.dotColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs">{option.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                    </div>
                    <p className="text-[10px] font-normal leading-tight text-slate-500 dark:text-zinc-500">
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
