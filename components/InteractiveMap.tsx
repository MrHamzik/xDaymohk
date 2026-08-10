'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { MapMarker, MapPosition } from '@/lib/types';
import { SAMASHKI_HOUSE_ADDRESSES, SAMASHKI_PLACE_OBJECTS, getEffectiveHouseAddresses, fetchEffectiveHouseAddresses } from '@/lib/samashki-addresses';
import { escapeHtml } from '@/lib/sanitize';

export type MapLayerMode = 'streets' | 'satellite' | 'hybrid';

export interface InteractiveMapProps {
  selectedPosition?: MapPosition | null;
  onSelect?: (position: MapPosition) => void;
  onClearSelection?: () => void;
  markers?: MapMarker[];
  className?: string;
  locateOnLoad?: boolean;
  showControls?: boolean;
  showProfiles?: boolean;
  showHouses?: boolean;
  showPlaces?: boolean;
  mapLayerMode?: MapLayerMode;
  onMapLayerModeChange?: (mode: MapLayerMode) => void;
  locationRequestKey?: number;
}

const SAMASHKI_CENTER: MapPosition = { lat: 43.288024, lng: 45.298989 };

type LeafletModule = typeof import('leaflet');

function extractHouseNumber(value: string) {
  const match = value.match(/(?:д\.|дом|,|\s)\s*(\d+[а-яА-Яa-zA-Z\/-]*)/i);
  return match ? match[1] : '';
}

export function LeafletMap({
  selectedPosition,
  onSelect,
  onClearSelection,
  markers = [],
  className = 'h-64 sm:h-80',
  locateOnLoad = true,
  showControls = true,
  showProfiles = true,
  showHouses = true,
  showPlaces = true,
  mapLayerMode: controlledMapLayerMode,
  onMapLayerModeChange,
  locationRequestKey = 0,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const selectedLayerRef = useRef<Leaflet.Marker | Leaflet.CircleMarker | null>(null);
  const userLayerRef = useRef<Leaflet.CircleMarker | null>(null);
  const profileLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const houseNumberLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const placeLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const streetLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const satelliteLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const satelliteLabelsRef = useRef<Leaflet.TileLayer | null>(null);
  const satelliteRoadsRef = useRef<Leaflet.TileLayer | null>(null);
  const cartoLabelsRef = useRef<Leaflet.TileLayer | null>(null);
  const onSelectRef = useRef(onSelect);
  const onClearSelectionRef = useRef(onClearSelection);
  const [isReady, setIsReady] = useState(false);
  const [localMapLayerMode, setLocalMapLayerMode] = useState<MapLayerMode>('streets');
  const [isFarZoom, setIsFarZoom] = useState(false);
  const [effectiveHouses, setEffectiveHouses] = useState(SAMASHKI_HOUSE_ADDRESSES);
  const mapLayerMode = controlledMapLayerMode ?? localMapLayerMode;
  const selectMapLayerMode = (mode: MapLayerMode) => {
    setLocalMapLayerMode(mode);
    onMapLayerModeChange?.(mode);
  };
  const locateAgainRef = useRef<(() => void) | null>(null);
  const [locationStatus, setLocationStatus] = useState('Ищем ваше местоположение…');

  useEffect(() => {
    onSelectRef.current = onSelect;
    onClearSelectionRef.current = onClearSelection;
  }, [onSelect, onClearSelection]);

  useEffect(() => {
    let cancelled = false;

    import('leaflet').then((leaflet) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      leafletRef.current = leaflet;
      const map = leaflet.map(containerRef.current, { zoomControl: false, maxZoom: 19 }).setView([SAMASHKI_CENTER.lat, SAMASHKI_CENTER.lng], 16);
      
      streetLayerRef.current = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        maxNativeZoom: 18,
        maxZoom: 19,
      }).addTo(map);

      satelliteLayerRef.current = leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
        maxNativeZoom: 18,
        maxZoom: 19,
      });

      satelliteLabelsRef.current = leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Labels &copy; Esri',
        maxNativeZoom: 18,
        maxZoom: 19,
      });

      satelliteRoadsRef.current = leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Roads &copy; Esri',
        maxNativeZoom: 18,
        maxZoom: 19,
      });

      cartoLabelsRef.current = leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/" target="_blank" rel="noopener noreferrer">CARTO</a>',
        maxNativeZoom: 18,
        maxZoom: 19,
        opacity: 0.95,
      });

      profileLayerRef.current = leaflet.layerGroup().addTo(map);
      houseNumberLayerRef.current = leaflet.layerGroup().addTo(map);
      placeLayerRef.current = leaflet.layerGroup().addTo(map);
      map.on('click', (event) => {
        onSelectRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
        onClearSelectionRef.current?.();
      });
      
      const updateZoomClass = () => {
        if (!containerRef.current) return;
        const far = map.getZoom() <= 14;
        if (far) {
          containerRef.current.classList.add('zoomed-out');
        } else {
          containerRef.current.classList.remove('zoomed-out');
        }
        setIsFarZoom(far);
      };
      map.on('zoomend', updateZoomClass);
      updateZoomClass();
      try {
        // Render the seed data first so the user sees something
        // immediately, then fetch the server-managed list. Even if
        // the server returns an empty array (the admin deleted all
        // houses), use it — that's the source of truth, not the
        // local seed.
        const eff = getEffectiveHouseAddresses();
        setEffectiveHouses(eff);
        fetchEffectiveHouseAddresses().then((server) => {
          if (server && Array.isArray(server)) setEffectiveHouses(server);
        }).catch(()=>{});
      } catch {}

      mapRef.current = map;
      setIsReady(true);
      window.setTimeout(() => map.invalidateSize(), 0);

      const locate = () => {
        if (!navigator.geolocation) {
          setLocationStatus('Показываем Самашки');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
            if (!mapRef.current || !leafletRef.current) return;
            mapRef.current.setView([userPosition.lat, userPosition.lng], 16);
            userLayerRef.current?.remove();
            userLayerRef.current = leafletRef.current.circleMarker([userPosition.lat, userPosition.lng], {
              radius: 8,
              color: '#2563eb',
              fillColor: '#60a5fa',
              fillOpacity: 0.9,
              weight: 3,
            }).addTo(mapRef.current).bindPopup('Вы здесь');
            setLocationStatus('Ваше местоположение');
          },
          () => setLocationStatus('Показываем Самашки'),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
        );
      };

      if (locateOnLoad) locate();
      else setLocationStatus('Самашки');
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      setIsReady(false);
    };
  }, [locateOnLoad]);

  useEffect(() => {
    const map = mapRef.current;
    const streets = streetLayerRef.current;
    const satellite = satelliteLayerRef.current;
    const labels = satelliteLabelsRef.current;
    const roads = satelliteRoadsRef.current;
    const cartoLabels = cartoLabelsRef.current;
    if (!map || !streets || !satellite || !labels || !roads) return;

    streets.remove();
    satellite.remove();
    labels.remove();
    roads.remove();
    cartoLabels?.remove();

    if (mapLayerMode === 'satellite') {
      satellite.addTo(map);
    } else if (mapLayerMode === 'hybrid') {
      satellite.addTo(map);
      roads.addTo(map);
      labels.addTo(map);
      cartoLabels?.addTo(map);
    } else {
      streets.addTo(map);
    }
  }, [mapLayerMode, isReady]);

  // House numbers layer across Samashki streets (disabled on far zoom)
  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet || !houseNumberLayerRef.current) return;

    houseNumberLayerRef.current.clearLayers();
    if (!showHouses || isFarZoom) return;

    effectiveHouses.filter((h) => !h.isNotHouse).forEach((house) => {
      const houseIcon = leaflet.divIcon({
        className: 'bg-transparent border-none',
        html: `
          <div class="samashki-marker-wrapper">
            <div class="samashki-house-badge light">
              ${escapeHtml(house.houseNumber)}
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const houseMarker = leaflet.marker([house.lat, house.lng], { icon: houseIcon });
      houseMarker.bindTooltip(`${escapeHtml(house.street)}, д. ${escapeHtml(house.houseNumber)}`, {
        direction: 'top',
        offset: [0, -8],
      });
      houseMarker.on('click', (e) => {
        leaflet.DomEvent.stopPropagation(e);
        onSelectRef.current?.({ lat: house.lat, lng: house.lng });
      });
      houseMarker.addTo(houseNumberLayerRef.current!);
    });
  }, [mapLayerMode, showHouses, isReady, isFarZoom, effectiveHouses]);

  // Public and commercial places + non-house (disabled on far zoom)
  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet || !placeLayerRef.current) return;

    placeLayerRef.current.clearLayers();
    if (!showPlaces || isFarZoom) return;

    SAMASHKI_PLACE_OBJECTS.forEach((place) => {
      const placeIcon = leaflet.divIcon({
        className: 'bg-transparent border-none',
        html: `
          <div class="samashki-marker-wrapper">
            <div class="samashki-place-badge light">
              <span class="dot"></span>
              <span>${escapeHtml(place.category)}</span>
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const placeMarker = leaflet.marker([place.lat, place.lng], { icon: placeIcon });
      placeMarker.bindTooltip(`<strong>${escapeHtml(place.title)}</strong><br><span style="font-size: 11px;">${escapeHtml(place.address)}</span>`, {
        direction: 'top',
        offset: [0, -8],
      });
      placeMarker.on('click', (e) => {
        leaflet.DomEvent.stopPropagation(e);
        onSelectRef.current?.({ lat: place.lat, lng: place.lng });
      });
      placeMarker.addTo(placeLayerRef.current!);
    });

    effectiveHouses.filter((h) => h.isNotHouse).forEach((house) => {
      const categoryLabel = house.category || 'Другое';
      const otherIcon = leaflet.divIcon({
        className: 'bg-transparent border-none',
        html: `
          <div class="samashki-marker-wrapper">
            <div class="samashki-place-badge light">
              <span class="dot" style="background:#f59e0b"></span>
              <span>${escapeHtml(categoryLabel)}</span>
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const m = leaflet.marker([house.lat, house.lng], { icon: otherIcon });
      m.bindTooltip(`${escapeHtml(house.fullAddress)} (${escapeHtml(categoryLabel)})`, { direction: 'top', offset: [0,-8] });
      m.on('click', (e) => {
        leaflet.DomEvent.stopPropagation(e);
        onSelectRef.current?.({ lat: house.lat, lng: house.lng });
      });
      m.addTo(placeLayerRef.current!);
    });
  }, [mapLayerMode, showPlaces, isReady, isFarZoom, effectiveHouses]);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet || !profileLayerRef.current) return;

    profileLayerRef.current.clearLayers();
    if (!showProfiles || isFarZoom) return;

    markers.forEach((marker) => {
      const isSelected = selectedPosition && Math.abs(selectedPosition.lat - marker.position.lat) < 0.00005 && Math.abs(selectedPosition.lng - marker.position.lng) < 0.00005;

      const statusColor = marker.status === 'flexible'
        ? { stroke: '#0284c7', fill: '#0ea5e9', label: '🔵 Произвольный' }
        : marker.status === 'break'
        ? { stroke: '#b45309', fill: '#f59e0b', label: '🟠 Перерыв' }
        : marker.status === 'offline'
        ? { stroke: '#374151', fill: '#6b7280', label: '⚫ Не работает' }
        : { stroke: '#047857', fill: '#10b981', label: '🟢 Работает' };

      // Outer ring for selected position
      if (isSelected) {
        leaflet.circleMarker([marker.position.lat, marker.position.lng], {
          radius: 11,
          color: '#0f172a',
          fillColor: '#ffffff',
          fillOpacity: 0.95,
          weight: 3,
        }).addTo(profileLayerRef.current!);
      }

      const circle = leaflet.circleMarker([marker.position.lat, marker.position.lng], {
        radius: isSelected ? 7 : 6,
        color: '#ffffff',
        fillColor: statusColor.fill,
        fillOpacity: 0.95,
        weight: 2,
      }).addTo(profileLayerRef.current!);

      if (marker.description) {
        circle.bindTooltip(`${marker.label} (${statusColor.label}) · ${marker.description}`, {
          permanent: false,
          direction: 'top',
          offset: [0, -8],
        });
      }
      if (marker.onClick) {
        circle.on('click', (e) => {
          leaflet.DomEvent.stopPropagation(e);
          marker.onClick?.();
        });
      }
    });
  }, [markers, showProfiles, selectedPosition, isReady, isFarZoom]);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;

    selectedLayerRef.current?.remove();
    if (!selectedPosition) return;

    const isMarker = markers.some((m) => Math.abs(m.position.lat - selectedPosition.lat) < 0.00005 && Math.abs(m.position.lng - selectedPosition.lng) < 0.00005);

    if (!isMarker) {
      selectedLayerRef.current = leaflet.circleMarker([selectedPosition.lat, selectedPosition.lng], {
        radius: 7,
        color: '#0f172a',
        fillColor: '#f59e0b',
        fillOpacity: 0.95,
        weight: 3,
      }).addTo(map).bindPopup('<strong>Выбранное место</strong><br>Координаты сохранены').openPopup();
    }
  }, [selectedPosition, markers, isReady]);

  const locateAgain = () => {
    if (!navigator.geolocation || !mapRef.current) {
      setLocationStatus('Показываем Самашки');
      mapRef.current?.setView([SAMASHKI_CENTER.lat, SAMASHKI_CENTER.lng], 16);
      return;
    }

    setLocationStatus('Ищем ваше местоположение…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
        mapRef.current?.setView([userPosition.lat, userPosition.lng], 16);
        userLayerRef.current?.remove();
        if (leafletRef.current && mapRef.current) {
          userLayerRef.current = leafletRef.current.circleMarker([userPosition.lat, userPosition.lng], {
            radius: 8,
            color: '#2563eb',
            fillColor: '#60a5fa',
            fillOpacity: 0.9,
            weight: 3,
          }).addTo(mapRef.current).bindPopup('Вы здесь');
        }
        setLocationStatus('Ваше местоположение');
        // Сообщаем родителю координаты, чтобы он мог записать ближайший адрес в поле
        onSelectRef.current?.(userPosition);
      },
      () => {
        mapRef.current?.setView([SAMASHKI_CENTER.lat, SAMASHKI_CENTER.lng], 16);
        setLocationStatus('Показываем Самашки');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  locateAgainRef.current = locateAgain;
  useEffect(() => {
    if (locationRequestKey > 0) locateAgainRef.current?.();
  }, [locationRequestKey]);

  return (
    <div className={`relative z-0 isolate w-full overflow-hidden rounded-2xl ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {showControls && (
        <div className="absolute left-3 right-3 top-3 z-[400] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-md backdrop-blur dark:bg-zinc-950/95 dark:text-zinc-300">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate">{locationStatus}</span>
            <button type="button" onClick={locateAgain} className="shrink-0 text-emerald-700 hover:underline dark:text-emerald-400">Моё место</button>
          </div>
          <div className="flex shrink-0 items-center rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800" role="tablist" aria-label="Тип карты">
            <button
              type="button"
              role="tab"
              aria-selected={mapLayerMode === 'streets'}
              onClick={() => selectMapLayerMode('streets')}
              className={`rounded-md px-2 py-1 text-[11px] transition ${mapLayerMode === 'streets' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
            >
              Карта
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mapLayerMode === 'satellite'}
              onClick={() => selectMapLayerMode('satellite')}
              className={`rounded-md px-2 py-1 text-[11px] transition ${mapLayerMode === 'satellite' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
            >
              Спутник
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mapLayerMode === 'hybrid'}
              onClick={() => selectMapLayerMode('hybrid')}
              className={`rounded-md px-2 py-1 text-[11px] transition ${mapLayerMode === 'hybrid' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
            >
              Гибрид
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InteractiveMap(props: InteractiveMapProps) {
  return <LeafletMap {...props} />;
}
