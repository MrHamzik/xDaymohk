/* Даймохк: кэш статики и уже открытых страниц.
 *
 * Стратегия разная для разного содержимого (п.13):
 *
 *  · /_next/static/** и /_next/image — cache-first. Эти файлы
 *    неизменяемы: имя содержит хеш сборки, новая версия приезжает под
 *    новым именем. Раньше они шли network-first, и КАЖДЫЙ переход
 *    между страницами ждал сеть ради файлов, которые уже лежали в
 *    кэше. Именно из-за этого страницы стали открываться медленно.
 *
 *  · навигации и RSC-запросы — сеть напрямую, без участия кэша.
 *    Ответы Next на переходы зависят от заголовков (RSC, Next-Url),
 *    и класть их в общий кэш по одному URL нельзя: браузеру
 *    возвращался бы кусок не той страницы.
 *
 *  · остальное того же origin — network-first с откатом в кэш, чтобы
 *    сайт открывался без сети.
 */
const CACHE = 'daymohk-offline-v3';

/** Файлы, которые нужны, чтобы показать хоть что-то без сети. */
const PRECACHE = ['/', '/catalog', '/icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Отдельные адреса могут не ответить (например, редирект) —
      // из-за одного промаха установка целиком падать не должна.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Неизменяемая статика сборки: имя файла меняется вместе с содержимым. */
function isImmutable(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/image');
}

/** Переход между страницами: полноценная навигация или RSC-догрузка. */
function isNavigation(request, url) {
  return request.mode === 'navigate'
    || request.headers.get('RSC') === '1'
    || url.searchParams.has('_rsc');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Переходы отдаём браузеру как есть: так работает штатный роутер
  // Next со своим префетчем, и он всегда быстрее нашего посредника.
  if (isNavigation(req, url)) {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
    return;
  }

  // Cache-first для неизменяемых файлов: мгновенно и без сети.
  if (isImmutable(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  event.respondWith(
    fetch(req).then((res) => {
      // Кэшируем только удачные ответы: иначе 404 или ошибка сервера
      // залипала бы в кэше и показывалась вместо страницы.
      if (res.ok) {
        const copy = res.clone();
        void caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
  );
});
