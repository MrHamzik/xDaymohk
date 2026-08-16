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

const CUSTOM_KEY = 'samashki-custom-addresses';

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

export function lookupSamashkiAddress(query: string): SamashkiHouseAddress[] {
  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return [];

  // Search the live list (DB-backed), not the (now empty) seed
  // dataset, so admin-added houses show up in autocomplete.
  const pool = getEffectiveHouseAddresses();
  return pool.filter((item) => (
    item.fullAddress.toLowerCase().includes(clean)
    || item.street.toLowerCase().includes(clean)
  ));
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
