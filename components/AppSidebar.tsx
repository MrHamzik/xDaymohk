'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SidebarNav from '@/components/SidebarNav';
import { useSettings } from '@/components/SettingsProvider';
import { useI18n } from '@/lib/i18n';

const RAIL_KEY = 'daymohk-rail-open';

/**
 * Боковая панель на ПК.
 *
 * Своя стрелка сворачивает и разворачивает подписи и толкает
 * основной контент на всю оставшуюся ширину.
 */
export default function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (settings.lightMode) {
      setOpen(true);
      return;
    }
    try {
      setOpen(window.localStorage.getItem(RAIL_KEY) === '1');
    } catch { /* private */ }
  }, [settings.lightMode]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      try { window.localStorage.setItem(RAIL_KEY, next ? '1' : '0'); } catch { /* private */ }
      return next;
    });
  };

  return (
    <aside className={`smk-rail-slot ${open ? 'smk-rail-slot--open' : ''}`} aria-label="Боковое меню">
      <div className={`smk-rail-dock ${open ? 'smk-rail--open' : ''}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t.railCollapse : t.railExpand}
          title={open ? t.railCollapse : t.railExpand}
          className="smk-rail-toggle"
        >
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="smk-rail-panel flex min-h-0 flex-col overflow-hidden no-scrollbar">
          <SidebarNav rail isAdmin={isAdmin} />
        </div>
      </div>
    </aside>
  );
}
