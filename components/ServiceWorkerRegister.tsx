'use client';

import { useEffect } from 'react';
import { BUILD_MARK } from '@/lib/build-info';

/**
 * Регистрирует оффлайн-кэш. Ошибки молча: без SW приложение живёт.
 *
 * ТОЛЬКО В ПРОДАКШЕНЕ (и это принципиально).
 *
 * В dev-режиме имена чанков СТАБИЛЬНЫ (main-app.js, layout.js, page.js),
 * а стратегия для /_next/static — cache-first. SW, оставшийся от
 * прошлого запуска dev-сервера, годами отдавал СТАРЫЕ чанки: страница
 * получала новый HTML, но старый JavaScript — отсюда «правки не
 * применяются», «подсказка не закрывается», Hydration failed при
 * чистом git. Поэтому в dev не просто не регистрируем, а активно
 * снимаем все прежние регистрации.
 *
 * Заодно объявляет метку сборки в консоли — парная к <meta
 * name="daymohk-build"> в исходнике страницы (см. lib/build-info.ts):
 * по двум этим отметкам видно, совпадают ли серверный и клиентский
 * код, или на машине смешались две версии.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    console.info(`[daymohk] сборка: ${BUILD_MARK}`);

    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            void registration.unregister();
          }
        })
        .catch(() => {});
      return;
    }

    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
