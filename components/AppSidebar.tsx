'use client';

import SidebarNav from '@/components/SidebarNav';

/**
 * Боковая панель на ПК.
 *
 * Не sticky: у страниц стоит overflow-x-hidden на корне, и sticky
 * из-за этого съезжает при прокрутке карточек. fixed держит панель
 * на месте, а пустой столбец 290px не даёт контенту заехать под неё.
 */
export default function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <aside className="hidden w-[290px] shrink-0 lg:block" aria-label="Боковое меню">
      <div className="fixed top-24 z-40 h-[calc(100vh-8rem)] w-[290px]">
        <div className="smk-lux flex h-full min-h-0 flex-col overflow-hidden no-scrollbar">
          <SidebarNav isAdmin={isAdmin} />
        </div>
      </div>
    </aside>
  );
}
