'use client';

import { useState } from 'react';
import InteractiveMap from '@/components/InteractiveMapLazy';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { type MapLayerMode } from '@/components/InteractiveMap';
import { useI18n } from '@/lib/i18n';

interface AdminPickMapProps {
  /** Текущая широта из формы. NaN — точка ещё не задана. */
  lat: number;
  /** Текущая долгота из формы. */
  lng: number;
  onPick: (lat: number, lng: number) => void;
}

/**
 * Карта выбора координат для редактора адресов в админ-панели.
 *
 * Отличие от карты в анкете и в задании: здесь точка НЕ приводится к
 * ближайшему известному дому. Наоборот — админ ставит координаты там,
 * где дома ещё нет: новый объект, родник, магазин на отшибе. Привязка
 * к справочнику здесь всё бы сломала: новую точку невозможно было бы
 * поставить рядом с существующей.
 *
 * Слои домов и объектов включены, чтобы видеть, что уже отмечено, и не
 * ставить дубль поверх существующей записи.
 */
export default function AdminPickMap({ lat, lng, onPick }: AdminPickMapProps) {
  const { t } = useI18n();
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('streets');

  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="smk-sheet-label">{t.showLabel}</span>
        <MapSegmentedControl
          ariaLabel={t.mapTypeAria}
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
        selectedPosition={hasPoint ? { lat, lng } : null}
        // Берём координаты КАК ЕСТЬ: ни ближайшего дома, ни адреса —
        // админ размечает новое место, а не выбирает из готового.
        onSelect={(position) => onPick(position.lat, position.lng)}
        showControls={false}
        showProfiles={false}
        showHouses
        showPlaces
        mapLayerMode={mapLayerMode}
        onMapLayerModeChange={setMapLayerMode}
        className="h-64 overflow-hidden rounded-xl sm:h-80"
      />
    </div>
  );
}
