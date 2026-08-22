'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

export interface SwipeTabDef {
  id: string;
  label: string;
}

interface SwipeTabsProps {
  tabs: SwipeTabDef[];
  active: string;
  onChange: (id: string) => void;
  /** Панели по id вкладки. */
  panels: Record<string, React.ReactNode>;
  /** Контент сразу под панелью вкладок (над активной панелью). */
  underBar?: React.ReactNode;
}

/**
 * Горизонтальные вкладки как в референсе владельца: на телефоне
 * листаются свайпом влево/вправо, на десктопе — кнопками
 * (сегмент-контрол).
 *
 * Панели держатся смонтированными после первого открытия (п.5
 * замечаний: «имеет смысл загрузить в память, но скрыть, чтобы
 * переключения были быстрыми»): скрытая — display:none, состояние
 * (фильтры, списки) не теряется, повторное открытие мгновенное.
 * До первого визита панель не рендерится вовсе, чтобы не грузить
 * тяжёлые списки заранее.
 */
export default function SwipeTabs({ tabs, active, onChange, panels, underBar }: SwipeTabsProps) {
  const { t } = useI18n();
  const [visited, setVisited] = useState<Set<string>>(() => new Set([active]));
  useEffect(() => {
    setVisited((current) => (current.has(active) ? current : new Set([...current, active])));
  }, [active]);

  // Свайп: запоминаем X на касании, на отпускании — порог 60px.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    touchX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    if (start == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(delta) < 60) return;
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = delta < 0 ? index + 1 : index - 1;
    if (next < 0 || next >= tabs.length) return;
    onChange(tabs[next].id);
  };

  return (
    <div>
      {/* Сегмент-контрол: кнопки на всех экранах, свайп — дополнение. */}
      <div
        className="smk-field mb-3 flex gap-1 rounded-2xl p-1"
        role="tablist"
        aria-label={t.swipeTabsLabel}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => onChange(tab.id)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${
              tab.id === active
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {underBar}

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            hidden={tab.id !== active}
            /* Лёгкое появление при переключении — без layout-прыжка. */
            className={tab.id === active ? 'smk-enter' : undefined}
            aria-label={tab.label}
          >
            {/* Тяжёлые панели рендерим после первого визита. */}
            {visited.has(tab.id) ? panels[tab.id] : null}
          </div>
        ))}
      </div>
    </div>
  );
}
