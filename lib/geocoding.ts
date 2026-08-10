import type { MapPosition } from './types';

export interface AddressSuggestion extends MapPosition {
  displayName: string;
  precision?: string;
}

const SAMASHKI_VIEWBOX = '45.20,43.35,45.38,43.22';
const ADDRESS_PART_KEYS = ['country', 'state', 'region', 'county', 'municipality', 'city', 'town', 'village', 'road', 'house_number'];

function formatAddress(address: Record<string, string> | undefined, fallback: string) {
  if (!address) return fallback;

  const street = address.road;
  const house = address.house_number;
  if (street) {
    const streetName = street.toLowerCase().includes('ул') ? street : `ул. ${street}`;
    return house ? `${streetName}, д. ${house}` : streetName;
  }

  const parts: string[] = [];
  ADDRESS_PART_KEYS.forEach((key) => {
    const value = address[key];
    if (value && !parts.includes(value)) parts.push(value);
  });

  return parts.length > 0 ? parts.join(', ') : fallback;
}

async function searchNominatim(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'ru',
    limit: '8',
    bounded: '1',
    viewbox: SAMASHKI_VIEWBOX,
    q: `${query}, Самашки, Чеченская Республика`,
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    signal,
    headers: { 'Accept-Language': 'ru' },
  });
  if (!response.ok) throw new Error('Не удалось получить подсказки адреса.');

  const results = await response.json() as Array<{ display_name?: string; address?: Record<string, string>; lat: string; lon: string }>;
  return results.map((result) => ({
    displayName: formatAddress(result.address, result.display_name ?? query),
    lat: Number(result.lat),
    lng: Number(result.lon),
  })).filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng));
}

export async function searchAddresses(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  try {
    const providerResponse = await fetch(`/api/geocode?q=${encodeURIComponent(trimmedQuery)}`, { signal });
    if (providerResponse.ok) {
      const payload = await providerResponse.json() as { results?: AddressSuggestion[] };
      if (payload.results && payload.results.length > 0) return payload.results;
    }
  } catch {
    // Fall back to Nominatim when the optional DaData token is not configured.
  }

  return searchNominatim(trimmedQuery, signal);
}

async function reverseNominatim(position: MapPosition, signal?: AbortSignal) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    zoom: '18',
    addressdetails: '1',
    lat: String(position.lat),
    lon: String(position.lng),
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    signal,
    headers: { 'Accept-Language': 'ru' },
  });
  if (!response.ok) throw new Error('Не удалось определить адрес точки.');

  const result = await response.json() as { display_name?: string; address?: Record<string, string> };
  return formatAddress(result.address, result.display_name ?? `Самашки, ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
}

export async function reverseGeocode(position: MapPosition, signal?: AbortSignal) {
  try {
    const providerResponse = await fetch(`/api/geocode?lat=${position.lat}&lon=${position.lng}`, { signal });
    if (providerResponse.ok) {
      const payload = await providerResponse.json() as { results?: AddressSuggestion[] };
      if (payload.results?.[0]?.displayName) return payload.results[0].displayName;
    }
  } catch {
    // Fall back to Nominatim when the optional DaData token is not configured.
  }

  return reverseNominatim(position, signal);
}
