'use client';

import { useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import SidebarNav from '@/components/SidebarNav';
import { emitTourEvent, useTourCommands, type TourCommand } from '@/lib/tour';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

/**
 * Мобильный выезд — та же колонка, что и на ПК.
 * Дублировать пункты здесь нельзя: лайт-режим и четыре виджета
 * жили бы в двух местах и разъезжались бы после любой правки.
 */
export default function MobileMenuDrawer({ isOpen, onClose, isAdmin = false }: MobileMenuDrawerProps) {
  const pathname = usePathname();

  useLockBody(isOpen);

  useEffect(() => {
    if (!isOpen) {
      emitTourEvent('menu-close');
      return;
    }
    emitTourEvent('menu-open');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    onClose();
  }, [pathname]);

  /**
   * Гид просит закрыть меню (п.4).
   *
   * На шаге про виджет открытый выезд перекрывает карточку. Закрывать
   * его самому человеку — лишнее действие посреди обучения.
   */
  const onCommand = useCallback((command: TourCommand) => {
    if (command === 'menu-close') onClose();
  }, [onClose]);
  useTourCommands(onCommand);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-start bg-zinc-950/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-drawer-title"
      // data-tour-drawer — гид по этой метке узнаёт, что выезд УЖЕ
      // открыт, и не просит открыть его повторно (баг от 22.08:
      // подсказка «нажмите меню» появлялась при открытом меню, а кнопка
      // меню была перекрыта шторкой).
      data-tour-drawer
      onClick={onClose}
    >
      <div
        className="flex h-full w-[min(23rem,75vw)] flex-col overflow-hidden bg-[var(--smk-surface)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="menu-drawer-title" className="sr-only">Меню</h2>
        <SidebarNav onClose={onClose} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
