'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import InteractiveMap from '@/components/InteractiveMapLazy';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { type MapLayerMode } from '@/components/InteractiveMap';
import { findClosestSamashkiHouse, getEffectiveHouseAddresses } from '@/lib/samashki-addresses';
import { getMapCategories } from '@/lib/map-categories';
import { MapPosition } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

interface WorkplaceSectionProps {
  workplaceAddress: string;
  setWorkplaceAddress: (value: string) => void;
  workplaceCoords: MapPosition | null;
  setWorkplaceCoords: (value: MapPosition | null) => void;
  fallbackLat?: number;
  fallbackLng?: number;
}

export default function WorkplaceSection({
  workplaceAddress,
  setWorkplaceAddress,
  workplaceCoords,
  setWorkplaceCoords,
  fallbackLat = 43.2880,
  fallbackLng = 45.2989,
}: WorkplaceSectionProps) {
  const { t } = useI18n();
  const [showMap, setShowMap] = useState(false);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('streets');
  const [showHouses, setShowHouses] = useState(true);
  const [showPlaces, setShowPlaces] = useState(true);
  const [placesCategory, setPlacesCategory] = useState('');
  // Справочник категорий берём из общего источника, а не из уже
  // загруженных адресов: иначе список пуст, пока объектов нет.
  const placeCategories = useMemo(
    () => getMapCategories(getEffectiveHouseAddresses().filter((a) => a.isNotHouse).map((a) => a.category)),
    [],
  );

  const handleMapSelect = (position: MapPosition, explicitAddress?: string) => {
    if (explicitAddress) {
      setWorkplaceCoords(position);
      setWorkplaceAddress(explicitAddress);
      return;
    }
    // Use effective address database (including admin customisations)
    try {
      const all = getEffectiveHouseAddresses();
      if (all && all.length > 0) {
        let closest = all[0];
        let min = Infinity;
        for (const house of all) {
          const dLat = house.lat - position.lat;
          const dLng = house.lng - position.lng;
          const d = dLat * dLat + dLng * dLng;
          if (d < min) {
            min = d;
            closest = house;
          }
        }
        if (closest) {
          setWorkplaceCoords({ lat: closest.lat, lng: closest.lng });
          setWorkplaceAddress(closest.fullAddress);
          return;
        }
      }
    } catch {
      // Fall through to built-in lookup
    }
    const closest = findClosestSamashkiHouse(position);
    setWorkplaceCoords({ lat: closest.lat, lng: closest.lng });
    setWorkplaceAddress(closest.fullAddress);
  };

  const handleAddressSelect = (suggestion: { displayName: string; lat: number; lng: number }) => {
    setWorkplaceCoords({ lat: suggestion.lat, lng: suggestion.lng });
  };

  const openInMapsLat = workplaceCoords?.lat ?? fallbackLat;
  const openInMapsLng = workplaceCoords?.lng ?? fallbackLng;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label htmlFor="profile-address" className="block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.workplaceAddressLabel}</label>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMap((isShown) => !isShown)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            <MapPin className="h-3 w-3" />
            {showMap ? t.hideMap : t.showMap}
          </button>
          <a
            href={`geo:${openInMapsLat},${openInMapsLng}?q=${openInMapsLat},${openInMapsLng}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Открыть карту в новой вкладке"
            className="text-emerald-600 dark:text-emerald-400"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      {showMap && (
        <div className="mb-2.5 space-y-2">
          {/* Слои карты вынесены НАД картой — единый сегмент-стиль как на
              странице «Карта» */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-slate-400">{t.showLabel}</span>
            <MapSegmentedControl
              ariaLabel="Тип карты"
              active={[mapLayerMode]}
              onSelect={setMapLayerMode}
              options={[
                { value: 'streets' as MapLayerMode, label: t.mapLayerStreets },
                { value: 'satellite' as MapLayerMode, label: t.mapLayerSatellite },
                { value: 'hybrid' as MapLayerMode, label: t.mapLayerHybrid },
              ]}
            />
          </div>
          <InteractiveMap
            selectedPosition={workplaceCoords}
            onSelect={handleMapSelect}
            showControls={false}
            showProfiles={false}
            showHouses={showHouses}
            showPlaces={showPlaces}
            placesCategory={placesCategory}
            mapLayerMode={mapLayerMode}
            onMapLayerModeChange={setMapLayerMode}
            className="h-56 sm:h-72"
          />
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[10px] font-bold text-slate-400">{t.showLabel}</span>
            {/* Независимые переключатели (можно включить оба) в том же
                сегмент-стиле. */}
            <MapSegmentedControl
              ariaLabel="Слои объектов"
              // Независимые тумблеры: дома и «другое» можно включить вместе.
              radio={false}
              active={[
                ...(showHouses ? (['houses'] as const) : []),
                ...(showPlaces ? (['places'] as const) : []),
              ]}
              onSelect={(value) => {
                if (value === 'houses') setShowHouses((v) => !v);
                else setShowPlaces((v) => !v);
              }}
              options={[
                { value: 'houses' as const, label: t.layerHouses },
                { value: 'places' as const, label: t.layerOther },
              ]}
            />
          </div>

          {/* Категории объектов «Другое» — тот же справочник, что и на
              странице «Карта» (админка → «Адреса» → «Поиск и категории»). */}
          {showPlaces && placeCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <span className="text-[10px] font-bold text-slate-400">Категория:</span>
              {(['', ...placeCategories]).map((cat) => (
                <button
                  key={cat || 'all'}
                  type="button"
                  onClick={() => setPlacesCategory(cat)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
                    placesCategory === cat
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {cat || 'Все'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <AddressAutocomplete
        id="profile-address"
        value={workplaceAddress}
        onChange={setWorkplaceAddress}
        onSelect={handleAddressSelect}
      />
    </div>
  );
}
