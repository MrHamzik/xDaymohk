import housesData from '@/data/samashki-houses.json';

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
 * Comprehensive database of Samashki streets and house numbers with
 * geocoded coordinates. Loaded from data/samashki-houses.json so the
 * bundle stays small and the dataset can be updated without rebuild.
 */
export const SAMASHKI_HOUSE_ADDRESSES: SamashkiHouseAddress[] = housesData as SamashkiHouseAddress[];

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

  return SAMASHKI_HOUSE_ADDRESSES.filter((item) => (
    item.fullAddress.toLowerCase().includes(clean)
    || item.street.toLowerCase().includes(clean)
  ));
}

export function findClosestSamashkiHouse(position: { lat: number; lng: number }): SamashkiHouseAddress {
  let closest = SAMASHKI_HOUSE_ADDRESSES[0];
  let minDistance = Infinity;

  for (const house of SAMASHKI_HOUSE_ADDRESSES) {
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
