'use client';

import { useState } from 'react';
import {
  Bell, BookMarked, BookOpen, Bot, CarFront, Clock, Compass, Crown, Globe2,
  HandHeart, Home, Landmark, LifeBuoy, MapPin, Palette, ScrollText,
  Settings as SettingsIcon, ShieldAlert, ShieldBan, Sparkles, Type, UserRound, Users, Wrench,
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
  about: Sparkles,
  admin: ShieldAlert,
  qibla: Compass,
  quran: BookOpen,
  hijri: Sparkles,
  sira: BookMarked,
  profile: UserRound,
  gullaq: Wrench,
  go: HandHeart,
  vaynakh: Landmark,
  taxi: CarFront,
  vpn: Globe2,
  djanna: Bot,
  settings: SettingsIcon,
  pro: Crown,
  guide: BookOpen,
  help: LifeBuoy,
  legal: ScrollText,
  invite: Users,
  blacklist: ShieldBan,
};

/**
 * Четыре слота как шторка телефона: удержал значок и перетащил в слот.
 */
export default function QuickWidgetsEditor() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [dragId, setDragId] = useState<QuickWidgetId | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const place = (slot: number, id: QuickWidgetId) => {
    const next = [...settings.quickWidgets];
    const taken = next.findIndex((item, index) => item === id && index !== slot);
    if (taken >= 0) next[taken] = next[slot];
    next[slot] = id;
    update({ quickWidgets: next.slice(0, 4) });
    setDragId(null);
    setOver(null);
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
          const hot = over === index;
          return (
            <div
              key={`${id}-${index}`}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(index);
              }}
              onDragLeave={() => setOver((current) => (current === index ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = (event.dataTransfer.getData('text/plain') || dragId) as QuickWidgetId;
                if (QUICK_WIDGET_IDS.includes(dropped)) place(index, dropped);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition-shadow ${
                hot ? 'bg-emerald-600 text-white smk-quick-hot' : 'smk-field text-slate-700 dark:text-zinc-200'
              } ${dragId && !hot ? 'smk-quick-armed' : ''}`}
            >
              <Icon className="h-4 w-4" />
              <span className="w-full truncate text-center smk-text-label font-bold">
                {widgetLabel(id, t)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="smk-text-label text-slate-500 dark:text-zinc-500">{t.settingsWidgetsDrag}</p>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {QUICK_WIDGET_IDS.map((id) => {
          const Icon = ICONS[id];
          const used = settings.quickWidgets.includes(id);
          return (
            <button
              key={id}
              type="button"
              draggable
              onDragStart={(event) => {
                setDragId(id);
                event.dataTransfer.setData('text/plain', id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragId(null);
                setOver(null);
              }}
              onClick={() => {
                const empty = settings.quickWidgets.findIndex((item) => !item);
                const slot = empty >= 0 ? empty : 0;
                place(slot, id);
              }}
              className={`flex cursor-grab items-center gap-1.5 rounded-xl px-2 py-2 text-left transition active:cursor-grabbing ${
                used ? 'smk-field text-emerald-700 dark:text-emerald-300' : 'smk-field text-slate-700 dark:text-zinc-200'
              } ${dragId === id ? 'smk-quick-dragging' : ''}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate smk-text-label font-bold">{widgetLabel(id, t)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
