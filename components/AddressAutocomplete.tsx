'use client';

import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { searchAddresses, AddressSuggestion } from '@/lib/geocoding';
import { SAMASHKI_ADDRESS_SUGGESTIONS, SAMASHKI_STREETS } from '@/lib/types';

interface AddressAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const SAMASHKI_CENTER_COORDS = { lat: 43.288024, lng: 45.298989 };

export default function AddressAutocomplete({ id, value, onChange, onSelect, onFocus, onBlur }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const remoteSuggestions = await searchAddresses(query, controller.signal);
        setSuggestions(remoteSuggestions);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const cleanQuery = value.trim().toLowerCase();
  const hasQuery = cleanQuery.length >= 2;

  // Extract street and house number from query if typed
  const houseNumberMatch = cleanQuery.match(/\d+[\wа-яА-Я]*/);
  const houseNumber = houseNumberMatch ? houseNumberMatch[0] : '';
  const queryWithoutNumber = cleanQuery.replace(/\d+[\wа-яА-Я]*/, '').replace(/^(ул\.|улица|пер\.|переулок)\s*/, '').trim();

  const matchingSuggestions: AddressSuggestion[] = [];
  const addedNames = new Set<string>();

  if (hasQuery) {
    // 1. Direct match with preset addresses
    SAMASHKI_ADDRESS_SUGGESTIONS.forEach((address) => {
      if (address.toLowerCase().includes(cleanQuery) && !addedNames.has(address)) {
        addedNames.add(address);
        matchingSuggestions.push({ displayName: address, ...SAMASHKI_CENTER_COORDS });
      }
    });

    // 2. Street matches with user-entered house number or default street entry
    SAMASHKI_STREETS.forEach((street) => {
      const streetLower = street.toLowerCase();
      const prefix = street.toLowerCase().startsWith('пер') ? '' : 'ул. ';
      if (queryWithoutNumber && streetLower.includes(queryWithoutNumber)) {
        const formattedAddress = houseNumber
          ? `${prefix}${street}, д. ${houseNumber}`
          : `${prefix}${street}`;
        if (!addedNames.has(formattedAddress)) {
          addedNames.add(formattedAddress);
          matchingSuggestions.push({ displayName: formattedAddress, ...SAMASHKI_CENTER_COORDS });
        }
      }
    });
  }

  const displayedSuggestions = suggestions.length > 0 ? suggestions : matchingSuggestions.slice(0, 10);

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
          placeholder="Улица, дом или объект"
          autoComplete="street-address"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
        />
      </div>
      {isOpen && (isLoading || displayedSuggestions.length > 0) && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          {isLoading && <p className="px-3 py-2 text-xs text-slate-500">Ищем адрес…</p>}
          {!isLoading && displayedSuggestions.map((suggestion) => (
            <button
              key={`${suggestion.displayName}-${suggestion.lat}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(suggestion.displayName); onSelect(suggestion); setIsOpen(false); }}
              className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-emerald-50 dark:text-zinc-400 dark:hover:bg-emerald-950/40"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{suggestion.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
