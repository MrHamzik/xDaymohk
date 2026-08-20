import { useEffect } from 'react';

/**
 * Блокирует прокрутку страницы, пока открыто модальное окно.
 * На iOS overflow:hidden на body надёжнее, чем на html.
 *
 * Две вещи, из-за которых прошлая версия не работала:
 *
 * 1. Счётчик вместо «запомнить и вернуть». Раньше хук сохранял значение
 *    overflow на момент запуска и возвращал его при закрытии. Но окна
 *    открываются друг поверх друга: из карточки анкеты — жалоба, из неё
 *    — подтверждение. Второе окно запоминало уже выставленный 'hidden',
 *    а первое при закрытии возвращало пустую строку — блокировка
 *    снималась, хотя окно ещё открыто, и фон снова начинал прокручиваться.
 *    Хуже того, при перезапуске эффекта сохранённым значением могло
 *    оказаться 'hidden', и тогда страница застывала насовсем.
 *    Теперь считаем открытые окна и снимаем блокировку на последнем.
 *
 * 2. Компенсация полосы прокрутки. overflow:hidden убирает полосу, и на
 *    компьютере страница дёргается вправо на её ширину в момент
 *    открытия. Добавляем padding ровно на эту ширину.
 */

let locks = 0;

export function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const html = document.documentElement;
    const body = document.body;
    locks += 1;

    if (locks === 1) {
      const gap = window.innerWidth - html.clientWidth;
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      if (gap > 0) body.style.paddingRight = `${gap}px`;
    }

    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0) {
        html.style.overflow = '';
        body.style.overflow = '';
        body.style.paddingRight = '';
      }
    };
  }, [locked]);
}
