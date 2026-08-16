'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
// leaflet.markercluster регистрирует L.markerClusterGroup на том же инстансе.
// Статический импорт гарантирует один экземпляр Leaflet (динамический import
// плагина в Next.js может дать второй инстанс — тогда кластеризация молча
// отключается). Компонент рендерится только на клиенте (dynamic ssr:false),
// поэтому импорт на сервере не выполняется.
import 'leaflet.markercluster';
import type * as Leaflet from 'leaflet';
import type { MapMarker, MapPosition } from '@/lib/types';
import { SAMASHKI_HOUSE_ADDRESSES, SAMASHKI_PLACE_OBJECTS, getEffectiveHouseAddresses, fetchEffectiveHouseAddresses, findClosestSamashkiHouse, type SamashkiHouseAddress } from '@/lib/samashki-addresses';
import { escapeHtml } from '@/lib/sanitize';
import { COMPACT_MAP_EVENT, isCompactMapEnabled } from '@/lib/map-prefs';
import MapSegmentedControl from '@/components/MapSegmentedControl';

export type MapLayerMode = 'streets' | 'satellite' | 'hybrid';

/** Какой слой объектов показывать на карте (radio-переключатель; 'none' — всё выключено). */
export type MapObjectMode = 'profiles' | 'houses' | 'places' | 'none';

export interface InteractiveMapProps {
  selectedPosition?: MapPosition | null;
  onSelect?: (position: MapPosition, explicitAddress?: string) => void;
  onClearSelection?: () => void;
  markers?: MapMarker[];
  className?: string;
  locateOnLoad?: boolean;
  showControls?: boolean;
  /** Включён ли слой (для совместимости); активный слой задаёт objectMode. */
  showProfiles?: boolean;
  showHouses?: boolean;
  showPlaces?: boolean;
  /** Активный слой объектов: 'profiles' | 'houses' | 'places' | 'none' (один за раз). */
  objectMode?: MapObjectMode;
  /** Фильтр категории для слоя «Другое» (как в админке); пусто — все категории. */
  placesCategory?: string;
  mapLayerMode?: MapLayerMode;
  onMapLayerModeChange?: (mode: MapLayerMode) => void;
  locationRequestKey?: number;
}

const SAMASHKI_CENTER: MapPosition = { lat: 43.288024, lng: 45.298989 };

// Центр села (фолбэк координат из houses_center.csv / импорта).
// Дома с такими координатами — «заглушки», их не показываем на карте:
// настоящие координаты должны быть вбиты вручную в админке.
const VILLAGE_CENTER = { lat: 43.291081, lng: 45.301384 };
const isCenterFallback = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat - VILLAGE_CENTER.lat) < 1e-3 &&
  Math.abs(lng - VILLAGE_CENTER.lng) < 1e-3;

/**
 * Точка пригодна для отображения на карте только с настоящими координатами.
 * Отсекаем: NaN/undefined/строки (из БД координата может прийти пустой),
 * нулевые координаты (0,0 — «нет координат»), значения вне диапазона и
 * координаты-заглушки центра села из массового импорта. Такие адреса на
 * карту не загружаются вообще — их уточняют вручную в админке.
 */
const hasRealCoords = (lat: unknown, lng: unknown): boolean => {
  const latNum = typeof lat === 'number' ? lat : Number(lat);
  const lngNum = typeof lng === 'number' ? lng : Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  if (Math.abs(latNum) < 1e-6 && Math.abs(lngNum) < 1e-6) return false;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return false;
  return !isCenterFallback(latNum, lngNum);
};

type LeafletModule = typeof import('leaflet');

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
  // ВАЖНО: без дефолта. Если objectMode не передан (например, в анкете —
  // WorkplaceSection), слоями управляют showProfiles/showHouses/showPlaces
  // независимо друг от друга. Дефолт 'profiles' здесь глушил слои домов и
  // объектов — карта в анкетах оставалась без маркеров.
  objectMode,
  placesCategory = '',
  mapLayerMode: controlledMapLayerMode,
  onMapLayerModeChange,
  locationRequestKey = 0,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const selectedLayerRef = useRef<Leaflet.Marker | Leaflet.CircleMarker | null>(null);
  const userLayerRef = useRef<Leaflet.CircleMarker | null>(null);
  // Последняя известная геопозиция пользователя — чтобы перерисовывать
  // точку «Вы здесь» при смене слоя (в режиме Спутник маркеры скрыты).
  const lastUserPosRef = useRef<MapPosition | null>(null);
  // ОДНА кластерная группа на все слои объектов (анкеты/дома/другое).
  // Раньше их было три, и все три висели на карте одновременно: в анкете
  // (showHouses + showPlaces) над одной и той же точкой рисовались два
  // независимых кластера — визуально «дубли». Один слой = один кластер.
  const objectClusterRef = useRef<Leaflet.MarkerClusterGroup | null>(null);
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
  // Тик при каждом moveend/zoomend — рендерим дома только в видимой области,
  // чтобы тысячи адресов не вешали карту при приближении.
  const [viewportTick, setViewportTick] = useState(0);
  const [effectiveHouses, setEffectiveHouses] = useState(SAMASHKI_HOUSE_ADDRESSES);
  // «Компактная карта» — пользовательская настройка (тонкие цифры без
  // фона, маленькие кластеры). При смене карта пересобирается, потому что
  // размер иконок кластеров задаётся в iconCreateFunction при создании.
  const [compactMode, setCompactMode] = useState(isCompactMapEnabled);
  const mapLayerMode = controlledMapLayerMode ?? localMapLayerMode;
  // Актуальный режим слоя для колбэков (locate), созданных в mount-эффекте.
  const mapLayerModeRef = useRef(mapLayerMode);
  mapLayerModeRef.current = mapLayerMode;

  useEffect(() => {
    const refresh = () => setCompactMode(isCompactMapEnabled());
    window.addEventListener(COMPACT_MAP_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(COMPACT_MAP_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
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

    if (cancelled || !containerRef.current || mapRef.current) return;

    const leaflet = L as unknown as LeafletModule;
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

      // ОДНА кластерная группа на все слои объектов. Тысячи точек
      // схлопываются в кластеры, точки вне экрана выгружаются и
      // подгружаются при панорамировании.
      //
      // Почему одна, а не три: три группы, добавленные на карту
      // одновременно, кластеризуют свои точки независимо, поэтому над
      // одним и тем же местом оказывались два-три диска с цифрами —
      // именно это выглядело как «дублированные кластеры».
      //
      // Кастомная иконка: свой iconSize + класс smk-cluster-* (оформление
      // в globals.css) вместо дефолтного .marker-cluster, у которого фон
      // есть и у внешнего, и у внутреннего div — второй «двойной диск».
      const clusterSizes = compactMode
        ? { small: 18, medium: 21, large: 25 }
        : { small: 22, medium: 27, large: 32 };
      const makeClusterIcon = (cluster: { getChildCount(): number }) => {
        const count = cluster.getChildCount();
        const tier = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';
        const size = clusterSizes[tier];
        return leaflet.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `smk-cluster smk-cluster-${tier}`,
          iconSize: [size, size] as [number, number],
        });
      };
      objectClusterRef.current = L.markerClusterGroup({
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        // Без анимации схлопывания: при быстрой перерисовке слоёв
        // (clearLayers во время анимации) markercluster оставлял на карте
        // «застрявшие» иконки-призраки рядом с новыми — ещё один источник
        // визуальных дублей.
        animate: false,
        disableClusteringAtZoom: 18,
        iconCreateFunction: makeClusterIcon,
      }).addTo(map);
      map.on('click', (event) => {
        onSelectRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
        onClearSelectionRef.current?.();
      });
      // При каждом движении/зуме перерисовываем дома только видимой области.
      map.on('moveend', () => setViewportTick((t) => t + 1));
      map.on('zoomend', () => setViewportTick((t) => t + 1));

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
          setLocationStatus('Показываем Даймохк');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
            if (!mapRef.current || !leafletRef.current) return;
            lastUserPosRef.current = userPosition;
            mapRef.current.setView([userPosition.lat, userPosition.lng], 16);
            userLayerRef.current?.remove();
            userLayerRef.current = null;
            // В спутниковом режиме маркеры не рисуем — чистая карта.
            if (mapLayerModeRef.current === 'satellite') {
              setLocationStatus('Ваше местоположение');
              return;
            }
            userLayerRef.current = leafletRef.current.circleMarker([userPosition.lat, userPosition.lng], {
              radius: 8,
              color: '#2563eb',
              fillColor: '#60a5fa',
              fillOpacity: 0.9,
              weight: 3,
            }).addTo(mapRef.current).bindPopup('Вы здесь');
            setLocationStatus('Ваше местоположение');
          },
          () => setLocationStatus('Показываем Даймохк'),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
        );
      };

      if (locateOnLoad) locate();
      else setLocationStatus('Даймохк');

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      setIsReady(false);
    };
    // compactMode: смена настройки пересобирает карту (размеры кластеров
    // задаются при создании слоёв).
  }, [locateOnLoad, compactMode]);

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

  // В спутниковом режиме точка «Вы здесь» скрыта (чистая карта); при
  // возврате на Карту/Гибрид восстанавливаем её по последней геопозиции.
  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet || !isReady) return;
    if (mapLayerMode === 'satellite') {
      userLayerRef.current?.remove();
      userLayerRef.current = null;
      return;
    }
    const pos = lastUserPosRef.current;
    if (!pos || userLayerRef.current) return;
    userLayerRef.current = leaflet.circleMarker([pos.lat, pos.lng], {
      radius: 8,
      color: '#2563eb',
      fillColor: '#60a5fa',
      fillOpacity: 0.9,
      weight: 3,
    }).addTo(map).bindPopup('Вы здесь');
  }, [mapLayerMode, isReady]);

  // ЕДИНЫЙ рендер всех слоёв объектов в одну кластерную группу.
  //
  // Раньше это были три независимых эффекта, писавших в три группы,
  // висящих на карте одновременно. Отсюда «дубли»: над одним местом
  // рисовалось несколько кластеров сразу (в анкете дома и «другое»
  // включены вместе), а частичные clearLayers во время анимации
  // markercluster оставляли иконки-призраки. Теперь состав слоя
  // пересобирается атомарно: очистили → собрали список → addLayers.
  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    const cluster = objectClusterRef.current;
    if (!map || !leaflet || !cluster) return;

    cluster.clearLayers();

    // Спутник — чистая карта без единого маркера (по требованию).
    if (mapLayerMode === 'satellite') return;

    // objectMode (страница «Карта») выбирает ровно один слой; если его нет
    // (карта в анкете), слоями рулят независимые showHouses/showPlaces.
    const wantProfiles = showProfiles && (objectMode === undefined || objectMode === 'profiles');
    const wantHouses = showHouses && (objectMode === undefined || objectMode === 'houses');
    const wantPlaces = showPlaces && (objectMode === undefined || objectMode === 'places');
    if (!wantProfiles && !wantHouses && !wantPlaces) return;

    const layers: Leaflet.Layer[] = [];
    // Дедупликация по «слой + координата + подпись»: один и тот же дом,
    // пришедший из БД дважды (пересечение seed/localStorage/сервера), не
    // должен давать две иконки и раздувать счётчик кластера.
    const seen = new Set<string>();
    const dedupe = (key: string) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };

    // ===== Дома =====
    if (wantHouses) {
      // Только видимая область (+40% запаса): тысячи адресов сразу не
      // рендерим, остальное подхватывается на moveend/zoomend.
      const bounds = map.getBounds().pad(0.4);
      // Адреса без настоящих координат («нет координат», нули, заглушка
      // центра села) на карту не загружаются вообще — их уточняют вручную
      // в админке (Админка → Адреса).
      const visibleHouses = effectiveHouses.filter(
        (h) => !h.isNotHouse
          && hasRealCoords(h.lat, h.lng)
          && bounds.contains([h.lat, h.lng])
          && dedupe(`h|${h.id}`),
      );

      const makeHouseMarker = (house: SamashkiHouseAddress) => {
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
        return houseMarker;
      };

      // Дома с одинаковыми координатами (вся улица получила координаты
      // улицы) раздвигаем по спирали, чтобы они не наслаивались.
      const byCoord = new Map<string, SamashkiHouseAddress[]>();
      for (const h of visibleHouses) {
        const k = `${h.lat.toFixed(5)}|${h.lng.toFixed(5)}`;
        const arr = byCoord.get(k);
        if (arr) arr.push(h); else byCoord.set(k, [h]);
      }
      byCoord.forEach((group) => {
        group.forEach((house, idx) => {
          if (group.length <= 1) { layers.push(makeHouseMarker(house)); return; }
          // Спираль золотым углом: ~6 метров на шаг.
          const angle = idx * 2.399;
          const radius = Math.sqrt(idx) * 0.00006;
          layers.push(makeHouseMarker({
            ...house,
            lat: house.lat + Math.cos(angle) * radius,
            lng: house.lng + Math.sin(angle) * radius,
          }));
        });
      });
    }

    // ===== Другие объекты («не дом») =====
    if (wantPlaces) {
      SAMASHKI_PLACE_OBJECTS
        .filter((p) => hasRealCoords(p.lat, p.lng) && dedupe(`p|${p.id}`))
        .forEach((place) => {
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
          placeMarker.bindTooltip(
            `<strong>${escapeHtml(place.title)}</strong><br><span style="font-size: 11px;">${escapeHtml(place.address)}</span>`,
            { direction: 'top', offset: [0, -8] },
          );
          placeMarker.on('click', (e) => {
            leaflet.DomEvent.stopPropagation(e);
            onSelectRef.current?.({ lat: place.lat, lng: place.lng });
          });
          layers.push(placeMarker);
        });

      effectiveHouses
        .filter((h) =>
          h.isNotHouse
          && hasRealCoords(h.lat, h.lng)
          && (!placesCategory || (h.category || 'Другое') === placesCategory)
          && dedupe(`o|${h.id}`),
        )
        .forEach((house) => {
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
          m.bindTooltip(`${escapeHtml(house.fullAddress)} (${escapeHtml(categoryLabel)})`, {
            direction: 'top',
            offset: [0, -8],
          });
          m.on('click', (e) => {
            leaflet.DomEvent.stopPropagation(e);
            onSelectRef.current?.({ lat: house.lat, lng: house.lng });
          });
          layers.push(m);
        });
    }

    // ===== Анкеты =====
    if (wantProfiles) {
      markers
        .filter((marker) => hasRealCoords(marker.position.lat, marker.position.lng))
        .forEach((marker) => {
          const isSelected = Boolean(selectedPosition)
            && Math.abs(selectedPosition!.lat - marker.position.lat) < 0.00005
            && Math.abs(selectedPosition!.lng - marker.position.lng) < 0.00005;

          const statusColor = marker.status === 'flexible'
            ? { fill: '#0ea5e9', label: '🔵 Произвольный' }
            : marker.status === 'break'
            ? { fill: '#f59e0b', label: '🟠 Перерыв' }
            : marker.status === 'offline'
            ? { fill: '#6b7280', label: '⚫ Не работает' }
            : { fill: '#10b981', label: '🟢 Работает' };

          // divIcon, а не circleMarker: markercluster корректно
          // кластеризует/анимирует только L.Marker, векторные слои внутри
          // группы оставляли на карте «залипшие» точки поверх кластеров.
          const profileIcon = leaflet.divIcon({
            className: 'bg-transparent border-none',
            html: `
              <div class="samashki-marker-wrapper">
                <div class="samashki-profile-badge${isSelected ? ' selected' : ''}"
                     style="background:${statusColor.fill};border-color:#ffffff"></div>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const profileMarker = leaflet.marker([marker.position.lat, marker.position.lng], { icon: profileIcon });
          if (marker.description) {
            profileMarker.bindTooltip(
              `${escapeHtml(marker.label)} (${statusColor.label}) · ${escapeHtml(marker.description)}`,
              { permanent: false, direction: 'top', offset: [0, -8] },
            );
          }
          if (marker.onClick) {
            profileMarker.on('click', (e) => {
              leaflet.DomEvent.stopPropagation(e);
              marker.onClick?.();
            });
          }
          layers.push(profileMarker);
        });
    }

    if (layers.length > 0) cluster.addLayers(layers);
  }, [
    mapLayerMode,
    showProfiles,
    showHouses,
    showPlaces,
    objectMode,
    placesCategory,
    markers,
    selectedPosition,
    effectiveHouses,
    isReady,
    isFarZoom,
    viewportTick,
  ]);

  // Маркер выбранной точки.
  //
  // Что исправлено: маркер больше не появляется «сам по себе» на каждый
  // клик по карте и НИКОГДА не открывает попап автоматически (раньше
  // openPopup дёргал панораму — карта прыгала на «выбранное место»).
  // Никакого setView/panTo здесь нет вовсе: фокус двигает только явное
  // действие пользователя («Моё место»).
  //
  // Подпись в попапе — по требованию: заголовок «ул. N, д. N», второй
  // строкой «Жителей — N, Специалистов — N» (влезает в узкий экран).
  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;

    selectedLayerRef.current?.remove();
    selectedLayerRef.current = null;
    if (!selectedPosition) return;
    if (!hasRealCoords(selectedPosition.lat, selectedPosition.lng)) return;
    // Спутниковый режим — чистая карта без маркеров (по требованию).
    if (mapLayerMode === 'satellite') return;

    // Если в этой точке уже стоит маркер анкеты — второй кружок не нужен.
    const isMarker = markers.some(
      (m) => Math.abs(m.position.lat - selectedPosition.lat) < 0.00005
        && Math.abs(m.position.lng - selectedPosition.lng) < 0.00005,
    );
    if (isMarker) return;

    // Ближайший дом из базы (координаты анкет привязаны к координатам
    // дома, поэтому поиск по близости надёжен). Максимум ~250 м — иначе
    // подпись не показываем, чтобы не приписать точке чужой адрес.
    const MAX_SNAP_DEG = 0.003;
    let title = '';
    let anchor = selectedPosition;
    const pool = effectiveHouses.filter((h) => hasRealCoords(h.lat, h.lng));
    if (pool.length > 0) {
      let closest = pool[0];
      let best = Infinity;
      for (const house of pool) {
        const dLat = house.lat - selectedPosition.lat;
        const dLng = house.lng - selectedPosition.lng;
        const d = dLat * dLat + dLng * dLng;
        if (d < best) { best = d; closest = house; }
      }
      if (best <= MAX_SNAP_DEG * MAX_SNAP_DEG) {
        anchor = { lat: closest.lat, lng: closest.lng };
        title = !closest.isNotHouse && closest.houseNumber
          ? `${closest.street}, д. ${closest.houseNumber}`
          : closest.fullAddress;
      }
    }
    if (!title) return;

    // Счётчики анкет по этому адресу (markers — анкеты активного слоя).
    const near = markers.filter(
      (m) => Math.abs(m.position.lat - anchor.lat) < 0.0002
        && Math.abs(m.position.lng - anchor.lng) < 0.0002,
    );
    const specialists = near.filter((m) => m.isSpecialist).length;
    const residents = near.length - specialists;

    selectedLayerRef.current = leaflet.circleMarker([selectedPosition.lat, selectedPosition.lng], {
      radius: compactMode ? 5 : 7,
      color: '#0f172a',
      fillColor: '#f59e0b',
      fillOpacity: 0.95,
      weight: compactMode ? 2 : 3,
    })
      .addTo(map)
      .bindPopup(
        `<strong>${escapeHtml(title)}</strong><br>`
        + `<span style="font-size:11px">Жителей — ${residents}, Специалистов — ${specialists}</span>`,
        // autoPan: false — открытие попапа не двигает карту.
        { autoPan: false, closeButton: true },
      );
  }, [selectedPosition, markers, isReady, mapLayerMode, effectiveHouses, compactMode]);

  const locateAgain = () => {
    if (!navigator.geolocation || !mapRef.current) {
      setLocationStatus('Показываем Даймохк');
      mapRef.current?.setView([SAMASHKI_CENTER.lat, SAMASHKI_CENTER.lng], 16);
      return;
    }

    setLocationStatus('Ищем ваше местоположение…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
        // «Моё место» фокусирует карту на ближайшем доме вокруг реального
        // местоположения пользователя и подставляет его адрес (улицу и дом)
        // через onSelect — так родительский компонент автоматически выбирает
        // улицу и дом пользователя вместо произвольной точки на карте.
        let focusPosition = userPosition;
        let focusAddress: string | undefined;
        try {
          const closest = findClosestSamashkiHouse(userPosition);
          if (closest && closest.fullAddress) {
            focusPosition = { lat: closest.lat, lng: closest.lng };
            focusAddress = closest.fullAddress;
          }
        } catch {
          // Падаем на центр карты, если база адресов недоступна.
        }
        mapRef.current?.setView([focusPosition.lat, focusPosition.lng], 17);
        lastUserPosRef.current = userPosition;
        userLayerRef.current?.remove();
        userLayerRef.current = null;
        // В спутниковом режиме маркеры не рисуем — чистая карта.
        if (mapLayerModeRef.current !== 'satellite' && leafletRef.current && mapRef.current) {
          userLayerRef.current = leafletRef.current.circleMarker([userPosition.lat, userPosition.lng], {
            radius: 8,
            color: '#2563eb',
            fillColor: '#60a5fa',
            fillOpacity: 0.9,
            weight: 3,
          }).addTo(mapRef.current).bindPopup('Вы здесь');
        }
        setLocationStatus('Ваше местоположение');
        // Сообщаем родителю ближайший дом, чтобы он записал адрес в поле
        onSelectRef.current?.(focusPosition, focusAddress);
      },
      () => {
        mapRef.current?.setView([SAMASHKI_CENTER.lat, SAMASHKI_CENTER.lng], 16);
        setLocationStatus('Показываем Даймохк');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  locateAgainRef.current = locateAgain;
  useEffect(() => {
    if (locationRequestKey > 0) locateAgainRef.current?.();
  }, [locationRequestKey]);

  return (
    <div className={`relative z-0 isolate w-full overflow-hidden rounded-2xl ${compactMode ? 'compact-map ' : ''}${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {showControls && (
        <div className="absolute left-3 right-3 top-3 z-[400] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-md backdrop-blur dark:bg-zinc-950/95 dark:text-zinc-300">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate">{locationStatus}</span>
            <button type="button" onClick={locateAgain} className="shrink-0 text-emerald-700 hover:underline dark:text-emerald-400">Моё место</button>
          </div>
          <MapSegmentedControl
            ariaLabel="Тип карты"
            active={[mapLayerMode]}
            onSelect={selectMapLayerMode}
            options={[
              { value: 'streets' as MapLayerMode, label: 'Карта' },
              { value: 'satellite' as MapLayerMode, label: 'Спутник' },
              { value: 'hybrid' as MapLayerMode, label: 'Гибрид' },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default function InteractiveMap(props: InteractiveMapProps) {
  return <LeafletMap {...props} />;
}
