'use client';

import { useCallback, useRef, useState } from 'react';

/** Потянуть вниз у верха ленты — обновить. */
export function usePullRefresh(onRefresh: () => Promise<void> | void) {
  const startY = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    if (typeof window === 'undefined') return;
    if (window.scrollY > 8) return;
    startY.current = event.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(async (event: React.TouchEvent) => {
    if (startY.current === null || refreshing) return;
    const dy = event.changedTouches[0].clientY - startY.current;
    startY.current = null;
    if (dy < 80) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  return { refreshing, onTouchStart, onTouchEnd };
}
