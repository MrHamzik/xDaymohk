/**
 * Координаты пользователя: один запрос на сессию вместо запроса на
 * каждой странице.
 *
 * Проблема, которую это решает
 * ----------------------------
 * Виджет времени намаза живёт в боковом меню, то есть монтируется на
 * КАЖДОЙ странице — и каждый раз вызывал getCurrentPosition. Chrome на
 * это отвечает блокировкой: «permission has been blocked as the user
 * has ignored the permission prompt several times», и консоль забивается
 * предупреждениями даже на /admin, где карты нет вовсе.
 *
 * Что делаем:
 *   1. Спрашиваем разрешение ОДИН раз и кешируем результат в модуле —
 *      повторные вызовы получают тот же промис.
 *   2. Через Permissions API заранее проверяем состояние: если доступ
 *      уже отклонён, браузер не тревожим вообще.
 *   3. Результат храним в sessionStorage, чтобы переходы между
 *      страницами не приводили к новому запросу.
 *
 * Времена намаза без геолокации считаются по координатам Самашек —
 * это разумное умолчание для сельского сервиса, поэтому отказ в доступе
 * здесь не ошибка, а нормальный сценарий.
 */

export interface Coords {
  lat: number;
  lng: number;
}

const CACHE_KEY = 'daymohk-coords';

/** Промис текущего запроса: второй вызов переиспользует первый. */
let inFlight: Promise<Coords | null> | null = null;

function readCache(): Coords | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Coords>;
    return typeof parsed.lat === 'number' && typeof parsed.lng === 'number'
      ? { lat: parsed.lat, lng: parsed.lng }
      : null;
  } catch {
    return null;
  }
}

function writeCache(coords: Coords): void {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(coords));
  } catch {
    // Приватный режим — координаты просто не переживут переход.
  }
}

/**
 * Запросить координаты пользователя.
 *
 * Возвращает null, если геолокация недоступна, отклонена или не успела
 * ответить. Вызывающий обязан иметь запасной вариант.
 *
 * @param force — спросить, даже если в кеше пусто и разрешение ещё не
 *   выдано. Используйте для явных действий пользователя («Моё место»);
 *   для фоновых виджетов оставляйте false.
 */
export async function getUserCoords(force = false): Promise<Coords | null> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) return null;

  const cached = readCache();
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // Permissions API есть не везде (Safari до 16), поэтому его
    // отсутствие не должно мешать работе.
    if (!force && 'permissions' in navigator) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        // 'prompt' означает, что окно ещё не показывали. Для фонового
        // виджета не показываем его вовсе: пользователь не понимает, за
        // что его спрашивают, и жмёт «отклонить» — после нескольких
        // таких отказов Chrome блокирует запрос насовсем.
        if (status.state !== 'granted') return null;
      } catch {
        // Не поддержано — идём обычным путём.
      }
    }

    return new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          writeCache(coords);
          resolve(coords);
        },
        () => resolve(null),
        { timeout: 8000, maximumAge: 600_000 },
      );
    });
  })();

  const result = await inFlight;
  // Сбрасываем только при неудаче: успешный результат уже в кеше, а
  // повторять неудачный запрос при следующем явном действии можно.
  if (!result) inFlight = null;
  return result;
}
