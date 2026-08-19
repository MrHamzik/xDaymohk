'use client';

import { useEffect } from 'react';

/** Регистрирует оффлайн-кэш. Ошибки молча: без SW приложение живёт. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
