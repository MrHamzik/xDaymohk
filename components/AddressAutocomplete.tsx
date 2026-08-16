'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { lookupSamashkiAddress, fetchEffectiveHouseAddresses, type SamashkiHouseAddress } from '@/lib/samashki-addresses';

export interface DbAddressSuggestion {
  displayName: string;
  lat: number;
  lng: number;
  /** true — это объект («Не дом»), а не дом. */
  isPlace?: boolean;
}

interface AddressAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: DbAddressSuggestion) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Строгий адресный ввод: подсказки ТОЛЬКО из базы (домов и объектов,
 * добавленных админом). Произвольный текст не принимается — при
 * отправке формы адрес должен точно совпадать с одним из вариантов БД.
 * Формат: «Даймохк, ул. {улица}, д. {номер}» либо «Даймохк, {объект}».
 */
export default function AddressAutocomplete({ id, value, onChange, onSelect, onFocus, onBlur }: AddressAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Свежие адреса с сервера (источник истины — БД, не локальный кэш).
  const [houses, setHouses] = useState<SamashkiHouseAddress[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchEffectiveHouseAddresses().then((addr) => {
      if (!cancelled && Array.isArray(addr)) setHouses(addr);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const dbSuggestions = useMemo<DbAddressSuggestion[]>(() => {
    const places = houses.filter((h) => h.isNotHouse);
    const realHouses = houses.filter((h) => !h.isNotHouse);
    const list: DbAddressSuggestion[] = [
      ...realHouses.map((h) => ({
        displayName: h.fullAddress,
        lat: Number(h.lat),
        lng: Number(h.lng),
        isPlace: false,
      })),
      ...places.map((h) => ({
        displayName: h.fullAddress,
        lat: Number(h.lat),
        lng: Number(h.lng),
        isPlace: true,
      })),
    ];
    return list;
  }, [houses]);

  const query = value.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (query.length < 2) return [];
    const pool = dbSuggestions.filter((s) => s.displayName.toLowerCase().includes(query));
    if (pool.length > 0) return pool.slice(0, 12);
    // fallback: поиск по lookupSamashkiAddress (свежая база с сервера)
    const houses = lookupSamashkiAddress(value);
    return houses.map((h) => ({
      displayName: h.fullAddress,
      lat: Number(h.lat),
      lng: Number(h.lng),
      isPlace: Boolean(h.isNotHouse),
    })).slice(0, 12);
  }, [dbSuggestions, query, value]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          required
          value={value}
          onFocus={() => { setIsOpen(true); onFocus?.(); }}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 180);
            onBlur?.();
          }}
          onChange={(event) => { onChange(event.target.value); setIsOpen(true); }}
          placeholder="Даймохк, ул. …, д. … или объект"
          autoComplete="off"
          className="w-full rounded-xl border border-slate-200/70 bg-white py-2.5 pl-10 pr-4 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
        />
      </div>
      {isOpen && filtered.length > 0 && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          {filtered.map((suggestion) => (
            <button
              key={suggestion.displayName}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(suggestion.displayName); onSelect(suggestion); setIsOpen(false); }}
              className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-emerald-50 dark:text-zinc-400 dark:hover:bg-emerald-950/40"
            >
              <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${suggestion.isPlace ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span className="break-words">{suggestion.displayName}</span>
            </button>
          ))}
        </div>
      )}
      {isOpen && query.length >= 2 && filtered.length === 0 && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Адрес не найден в базе. Выберите из списка или отметьте точку на карте.
          </p>
        </div>
      )}
    </div>
  );
}
