'use client';

import SidebarNav from '@/components/SidebarNav';
import { useSettings } from '@/components/SettingsProvider';

/**
 * Боковая панель на ПК — рейка по референсу «боковое меню».
 *
 * Узкая колонка иконок, при наведении раскрывается. Слот 76px
 * не даёт контенту заехать под панель; сама рейка fixed.
 * Лайт-режим держит рейку открытой, чтобы глаза были видны.
 */
export default function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const { settings } = useSettings();

  return (
    <aside className="smk-rail-slot" aria-label="Боковое меню">
      <div className={`smk-rail-dock ${settings.lightMode ? 'smk-rail--open' : ''}`}>
        <div className="smk-rail-panel flex min-h-0 flex-col overflow-hidden no-scrollbar">
          <SidebarNav rail isAdmin={isAdmin} />
        </div>
      </div>
    </aside>
  );
}
