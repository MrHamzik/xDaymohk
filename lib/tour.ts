'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Связь гида с живым интерфейсом.
 *
 * Часть шагов просит человека сделать что-то самому: нажать «Каталог» и
 * пролистать список, открыть меню, заглянуть в меню плюса. Гид должен
 * узнать, что это произошло, — иначе он либо мешает карточкой, либо
 * никогда не покажет следующий шаг.
 *
 * Провайдер здесь не нужен и вреден: события шлют компоненты из разных
 * веток дерева (нижняя панель, выезд меню, меню плюса), и заворачивать
 * ради этого всё приложение в ещё один контекст — лишняя перерисовка на
 * каждое событие. Поэтому — крошечная внешняя шина с подпиской.
 */

export type TourEvent =
  | 'menu-open'
  | 'menu-close'
  | 'menu-scroll'
  | 'plus-open'
  | 'plus-close';

/**
 * Команды в обратную сторону: гид просит интерфейс что-то сделать.
 *
 * События выше идут снизу вверх («человек открыл меню»), а команды —
 * сверху вниз («закрой меню», «открой меню плюса»). Без них гид умел
 * только ждать: на шаге про виджет поверх карточки оставалось открытым
 * боковое меню, а шаг про «+» заставлял нажимать кнопку дважды.
 *
 *   'menu-close' — закрыть выезд бокового меню, если открыт;
 *   'plus-open'  — открыть меню плюса;
 *   'plus-close' — закрыть меню плюса.
 */
export type TourCommand = 'menu-close' | 'plus-open' | 'plus-close';

type Listener = (event: TourEvent) => void;
type CommandListener = (command: TourCommand) => void;

const listeners = new Set<Listener>();
const commandListeners = new Set<CommandListener>();
const activeListeners = new Set<() => void>();

let active = false;

/** Сообщить интерфейсу, что гид идёт (или закончился). */
export function setTourActive(next: boolean) {
  if (active === next) return;
  active = next;
  for (const notify of activeListeners) notify();
}

function subscribeActive(notify: () => void) {
  activeListeners.add(notify);
  return () => { activeListeners.delete(notify); };
}

/**
 * Идёт ли гид прямо сейчас.
 *
 * Нужен кнопкам, которые во время гида должны открываться, но ничего не
 * делать: человек смотрит, как устроено меню плюса, и не должен случайно
 * улететь в создание анкеты на середине обучения.
 */
export function useTourActive(): boolean {
  return useSyncExternalStore(
    subscribeActive,
    () => active,
    () => false, // на сервере гида нет
  );
}

/** Отправить событие гиду. Вне гида вызов ничего не стоит. */
export function emitTourEvent(event: TourEvent) {
  if (!active) return;
  for (const listener of listeners) listener(event);
}

/** Подписка гида на события интерфейса. */
export function useTourEvents(handler: Listener) {
  useEffect(() => {
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, [handler]);
}

/**
 * Гид отдаёт команду интерфейсу.
 *
 * Вне гида не делает ничего: страницы подписаны на команды всегда, но
 * получать их должны только во время обучения.
 */
export function sendTourCommand(command: TourCommand) {
  if (!active) return;
  for (const listener of commandListeners) listener(command);
}

/**
 * Подписка страницы на команды гида.
 *
 * Обработчик нужно оборачивать в useCallback — иначе подписка будет
 * пересоздаваться на каждый рендер страницы.
 */
export function useTourCommands(handler: CommandListener) {
  useEffect(() => {
    commandListeners.add(handler);
    return () => { commandListeners.delete(handler); };
  }, [handler]);
}
