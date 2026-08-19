'use client';

import { useCallback, useRef } from 'react';

/**
 * Свайп вниз по шапке шторки закрывает модалку.
 * Горизонтальный жест и короткий тап игнорируем.
 */
export function useSheetSwipe(onClose: () => void) {
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    startY.current = touch.clientY;
    startX.current = touch.clientX;
  }, []);

  const onTouchEnd = useCallback((event: React.TouchEvent) => {
    if (startY.current === null || startX.current === null) return;
    const touch = event.changedTouches[0];
    const dy = touch.clientY - startY.current;
    const dx = Math.abs(touch.clientX - startX.current);
    startY.current = null;
    startX.current = null;
    if (dy > 72 && dy > dx * 1.4) onClose();
  }, [onClose]);

  return { onTouchStart, onTouchEnd };
}
