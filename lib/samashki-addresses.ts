export interface SamashkiHouseAddress {
  id: string;
  street: string;
  houseNumber: string;
  fullAddress: string;
  lat: number;
  lng: number;
  postalCode: string;
  isNotHouse?: boolean;
  category?: string;
}

const CUSTOM_KEY = 'daymohk-custom-addresses';

/**
 * The seed dataset (data/samashki-houses.json) was removed: the user
 * asked for addresses to live ONLY in the database, edited through
 * the admin panel. This empty array is the fall-back used when
 * localStorage is unset AND the API doesn't return anything.
 */
export const SAMASHKI_HOUSE_ADDRESSES: SamashkiHouseAddress[] = [];

export function getEffectiveHouseAddresses(): SamashkiHouseAddress[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(CUSTOM_KEY);
      // If the admin ever wrote anything to localStorage (even an
      // empty array meaning "I deleted everything"), respect that
      // and don't fall back to the seed dataset. Otherwise the
      // admin's full delete would reappear after every page load.
      if (raw !== null) {
        const parsed = JSON.parse(raw) as SamashkiHouseAddress[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
  }
  return SAMASHKI_HOUSE_ADDRESSES;
}

export async function fetchEffectiveHouseAddresses(): Promise<SamashkiHouseAddress[]> {
  try {
    const res = await fetch('/api/admin/addresses', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.addresses && Array.isArray(data.addresses)) {
        try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(data.addresses)); } catch {}
        return data.addresses as SamashkiHouseAddress[];
      }
    }
  } catch {}
  return getEffectiveHouseAddresses();
}

export interface SamashkiPlaceObject {
  id: string;
  title: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
}

export const SAMASHKI_PLACE_OBJECTS: SamashkiPlaceObject[] = [
  // Очищено по требованию: почта, образование, мечеть и т.д. удалены из базы
  // Теперь админ добавляет такие объекты через админку как "Не дом" -> категория Другое
];

/**
 * Умный поиск адресов по трём ключам: населённый пункт, улица и номер дома.
 *
 * Запрос бьётся на токены (пробелы/запятые/точки). Каждый токен
 * классифицируется:
 *   - начинается с цифры («28», «28а», «28/2») → матчится против номера
 *     дома (префиксное совпадение);
 *   - служебные слова («ул», «улица», «д», «дом», «с», «г», «даймохк»,
 *     «самашки») пропускаются — населённый пункт один, они не сужают поиск;
 *   - остальные текстовые → матчатся против слов улицы (префикс слова,
 *     затем подстрока) и против названия объектов («Не дом»).
 *
 * Связка токенов — AND: «зав 28» и «28 зав» оба находят
 * «с. Самашки, ул. Заводская, д. 28», потому что «зав» — префикс слова
 * улицы, а «28» — префикс номера дома. Результаты сортируются по
 * релевантности (точность номера дома и длина совпавших префиксов улицы).
 */
const ADDRESS_TOKEN_SPLIT = /[\s,.;:]+/;
const ADDRESS_SKIP_TOKENS = new Set([
  'ул', 'улица', 'д', 'дом', 'с', 'г', 'п', 'пос', 'поселок', 'р-н', 'рн',
  'даймохк', 'самашки',
]);

const stripStreetPrefix = (street: string) => street.replace(/^(ул\.?|улица)\s+/i, '');

export function searchHouseAddresses(
  query: string,
  pool?: SamashkiHouseAddress[],
): SamashkiHouseAddress[] {
  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return [];
  const source = pool ?? getEffectiveHouseAddresses();

  const tokens = clean
    .split(ADDRESS_TOKEN_SPLIT)
    .filter(Boolean)
    .filter((token) => !ADDRESS_SKIP_TOKENS.has(token));

  // Запрос целиком из служебных слов («ул», «самашки») — деградируем в
  // простой substring-поиск, иначе фильтр съест все адреса.
  if (tokens.length === 0) {
    return source
      .filter((item) => item.fullAddress.toLowerCase().includes(clean))
      .slice(0, 50);
  }

  const scored: Array<{ item: SamashkiHouseAddress; score: number }> = [];
  for (const item of source) {
    const streetLower = item.street.toLowerCase();
    const streetWords = stripStreetPrefix(streetLower).split(ADDRESS_TOKEN_SPLIT).filter(Boolean);
    const houseLower = (item.houseNumber ?? '').trim().toLowerCase();
    const fullLower = item.fullAddress.toLowerCase();

    let score = 0;
    let allMatch = true;
    for (const token of tokens) {
      if (/^\d/.test(token)) {
        // Числовой токен → номер дома, префиксное совпадение.
        if (!item.isNotHouse && houseLower.startsWith(token)) {
          // Чем точнее номер (меньше «хвост»), тем выше ранг.
          score += 120 - Math.min((houseLower.length - token.length) * 5, 60);
        } else {
          allMatch = false;
          break;
        }
      } else if (streetWords.some((word) => word.startsWith(token))) {
        // Префикс слова улицы — самый сильный текстовый сигнал.
        score += 80 + token.length * 10;
      } else if (!item.isNotHouse && streetLower.includes(token)) {
        // Подстрока в названии улицы.
        score += 30 + token.length * 5;
      } else if (item.isNotHouse && fullLower.includes(token)) {
        // Объект («Не дом»): название/категория лежат в fullAddress.
        score += 20 + token.length * 3;
      } else {
        allMatch = false;
        break;
      }
    }
    if (allMatch) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}

export function lookupSamashkiAddress(query: string): SamashkiHouseAddress[] {
  return searchHouseAddresses(query);
}

export function findClosestSamashkiHouse(position: { lat: number; lng: number }): SamashkiHouseAddress {
  const pool = getEffectiveHouseAddresses();
  if (pool.length === 0) {
    return {
      id: 'fallback',
      street: 'Даймохк',
      houseNumber: '',
      fullAddress: 'Даймохк',
      lat: position.lat,
      lng: position.lng,
      postalCode: '366602',
    };
  }
  let closest = pool[0];
  let minDistance = Infinity;

  for (const house of pool) {
    const dLat = house.lat - position.lat;
    const dLng = house.lng - position.lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDistance) {
      minDistance = dist;
      closest = house;
    }
  }
  return closest;
}
