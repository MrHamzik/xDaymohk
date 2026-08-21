'use client';

import { useEffect } from 'react';

/**
 * Полная блокировка интерфейса на время гида (п.17/п.18).
 *
 * Прежний подход — прозрачные слои-«ловушки» поверх страницы — не
 * работал. Слой лежит на своём z-index, и всё, что оказалось выше
 * (выезд меню, шторки, модальные окна), спокойно принимало нажатия.
 * На шаге с каталогом слой и вовсе снимался целиком, чтобы не мутить
 * список, — и человек мог нажать что угодно.
 *
 * Здесь сделано ровно то, о чём просили: по умолчанию во время гида не
 * работает НИЧЕГО, а каждый шаг сам открывает то, что ему нужно.
 *
 * Как: один обработчик на document в фазе перехвата (capture). Он
 * старше любых обработчиков внутри страницы независимо от z-index,
 * порталов и вложенности, поэтому обойти его нельзя. Событие гасится
 * до того, как о нём узнает интерфейс.
 *
 * Что разрешает шаг:
 *   scroll — прокрутка (колесо, палец, клавиши-стрелки, PageUp/Down);
 *   allow  — CSS-селекторы островков, которые остаются живыми
 *            (подсвеченная кнопка, карточки анкет, окно анкеты).
 *
 * Само окно гида не блокируется никогда: его разметка помечена
 * атрибутом data-tour-ui, иначе человек не смог бы нажать «Дальше».
 */

/** События указателя и клавиатуры, которые глушим целиком. */
const POINTER_EVENTS = [
  'click', 'auxclick', 'dblclick',
  'mousedown', 'mouseup',
  'pointerdown', 'pointerup',
  'touchstart', 'touchend',
  'contextmenu',
  'submit',
] as const;

/** Клавиши прокрутки — их пропускаем, когда шаг разрешил скролл. */
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar',
]);

export interface TourLockOptions {
  /** Гид идёт: пока false, ничего не блокируется. */
  active: boolean;
  /** Разрешить прокрутку страницы и списков. */
  scroll?: boolean;
  /** Селекторы островков, которые остаются рабочими. */
  allow?: string[];
}

export function useTourLock({ active, scroll = false, allow }: TourLockOptions) {
  // Список селекторов приходит новым массивом на каждый рендер —
  // сравниваем по строке, иначе эффект перезапускался бы постоянно и
  // снимал блокировку на кадр.
  const allowKey = (allow ?? []).join('|');

  useEffect(() => {
    if (!active) return;

    const selectors = allowKey ? allowKey.split('|') : [];

    /** Разрешено ли трогать этот элемент. */
    const isAllowed = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      const el = target instanceof Element ? target : target.parentElement;
      if (!el) return false;
      // Окно гида работает всегда — иначе не нажать «Дальше».
      if (el.closest('[data-tour-ui]')) return true;
      return selectors.some((selector) => {
        try {
          return Boolean(el.closest(selector));
        } catch {
          // Кривой селектор не должен ронять блокировку.
          return false;
        }
      });
    };

    const swallow = (event: Event) => {
      if (isAllowed(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      // stopImmediatePropagation — чтобы не сработали обработчики,
      // навешанные на сам document раньше нашего.
      event.stopImmediatePropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Escape не глушим: это аварийный выход из зависшего окна, и
      // отбирать его у человека нельзя.
      if (event.key === 'Escape') return;
      if (scroll && SCROLL_KEYS.has(event.key) && !isAllowed(event.target)) return;
      swallow(event);
    };

    const onWheel = (event: Event) => {
      if (scroll) return;
      swallow(event);
    };

    const onTouchMove = (event: Event) => {
      if (scroll) return;
      swallow(event);
    };

    for (const type of POINTER_EVENTS) {
      document.addEventListener(type, swallow, true);
    }
    document.addEventListener('keydown', onKeyDown, true);
    // passive: false обязателен — иначе preventDefault не подействует.
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });

    // Когда прокрутка запрещена, дополнительно держим страницу: одного
    // preventDefault мало, полосу прокрутки можно тянуть мышью.
    const root = document.documentElement;
    if (!scroll) root.style.overflow = 'hidden';

    return () => {
      for (const type of POINTER_EVENTS) {
        document.removeEventListener(type, swallow, true);
      }
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('wheel', onWheel, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      // Возвращаем ПУСТУЮ строку, а не прежнее значение: эффект
      // перезапускается на каждом шаге и «прежним» оказался бы уже
      // выставленный hidden — страница осталась бы заблокированной.
      root.style.overflow = '';
    };
  }, [active, scroll, allowKey]);
}
