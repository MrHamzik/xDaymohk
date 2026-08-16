'use client';

import { useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import InteractiveMap from '@/components/InteractiveMapLazy';
import { type MapLayerMode } from '@/components/InteractiveMap';
import { findClosestSamashkiHouse, getEffectiveHouseAddresses } from '@/lib/samashki-addresses';
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
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-zinc-800" role="tablist" aria-label="Тип карты">
              <button
                type="button"
                role="tab"
                aria-selected={mapLayerMode === 'streets'}
                onClick={() => setMapLayerMode('streets')}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${mapLayerMode === 'streets' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
              >
                {t.mapLayerStreets}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mapLayerMode === 'satellite'}
                onClick={() => setMapLayerMode('satellite')}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${mapLayerMode === 'satellite' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
              >
                {t.mapLayerSatellite}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mapLayerMode === 'hybrid'}
                onClick={() => setMapLayerMode('hybrid')}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${mapLayerMode === 'hybrid' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
              >
                {t.mapLayerHybrid}
              </button>
            </div>
          </div>
          <InteractiveMap
            selectedPosition={workplaceCoords}
            onSelect={handleMapSelect}
            showControls={false}
            showProfiles={false}
            showHouses={showHouses}
            showPlaces={showPlaces}
            mapLayerMode={mapLayerMode}
            onMapLayerModeChange={setMapLayerMode}
            className="h-56 sm:h-72"
          />
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[10px] font-bold text-slate-400">{t.showLabel}</span>
            {/* Независимые переключатели (можно включить оба) в том же
                сегмент-стиле. */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-zinc-800" aria-label="Слои объектов">
              <button
                type="button"
                aria-pressed={showHouses}
                onClick={() => setShowHouses((v) => !v)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${showHouses ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
              >
                {t.layerHouses}
              </button>
              <button
                type="button"
                aria-pressed={showPlaces}
                onClick={() => setShowPlaces((v) => !v)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${showPlaces ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
              >
                {t.layerOther}
              </button>
            </div>
          </div>
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
