'use client';

import { useState } from 'react';
import {
  Bell, BookMarked, BookOpen, Bot, CarFront, Clock, Compass, Globe2,
  HandHeart, Home, Landmark, MapPin, Palette, Sparkles, Type, UserRound, Users, Wrench,
} from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { useI18n } from '@/lib/i18n';
import SettingsControlsBar from '@/components/SettingsControlsBar';
import { QUICK_WIDGET_IDS, widgetLabel, type QuickWidgetId } from '@/lib/settings/widgets';

const ICONS: Record<QuickWidgetId, typeof Clock> = {
  status: Clock,
  lang: Type,
  notify: Bell,
  theme: Palette,
  light: Sparkles,
  home: Home,
  catalog: Users,
  map: MapPin,
  qibla: Compass,
  quran: BookOpen,
  sira: BookMarked,
  profile: UserRound,
  gullaq: Wrench,
  go: HandHeart,
  vaynakh: Landmark,
  taxi: CarFront,
  vpn: Globe2,
  djanna: Bot,
};

/**
 * Выбор четырёх значков — как превью письма в админке:
 * сверху живая панель, ниже слоты, ещё ниже сетка замены.
 */
export default function QuickWidgetsEditor() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [slot, setSlot] = useState<number | null>(null);

  const pick = (id: QuickWidgetId) => {
    if (slot === null) return;
    const next = [...settings.quickWidgets];
    const taken = next.findIndex((item, index) => item === id && index !== slot);
    if (taken >= 0) next[taken] = next[slot];
    next[slot] = id;
    update({ quickWidgets: next.slice(0, 4) });
    setSlot(null);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">{t.settingsWidgets}</p>
        <p className="mt-0.5 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-500">
          {t.settingsWidgetsHint}
        </p>
      </div>

      <SettingsControlsBar />

      <div className="grid grid-cols-4 gap-1.5">
        {settings.quickWidgets.slice(0, 4).map((id, index) => {
          const Icon = ICONS[id as QuickWidgetId] ?? Clock;
          const on = slot === index;
          return (
            <button
              key={`${id}-${index}`}
              type="button"
              onClick={() => setSlot(on ? null : index)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition ${
                on
                  ? 'bg-emerald-600 text-white'
                  : 'smk-field text-slate-700 hover:brightness-95 dark:text-zinc-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="w-full truncate text-center smk-text-label font-bold">
                {widgetLabel(id, t)}
              </span>
            </button>
          );
        })}
      </div>

      {slot !== null && (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {QUICK_WIDGET_IDS.map((id) => {
            const Icon = ICONS[id];
            const used = settings.quickWidgets.includes(id);
            const current = settings.quickWidgets[slot] === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className={`flex items-center gap-1.5 rounded-xl px-2 py-2 text-left transition ${
                  current
                    ? 'bg-emerald-600 text-white'
                    : used
                      ? 'smk-field text-slate-400'
                      : 'smk-field text-slate-700 hover:brightness-95 dark:text-zinc-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate smk-text-label font-bold">{widgetLabel(id, t)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
