import { useEffect } from 'react';

/**
 * Блокирует прокрутку страницы, пока открыто модальное окно.
 * На iOS overflow:hidden на body надёжнее, чем на html.
 */
export function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [locked]);
}
