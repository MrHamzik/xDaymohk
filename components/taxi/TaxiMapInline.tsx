'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useProfiles } from '@/components/ProfilesProvider';
import { fetchEffectiveHouseAddresses, type SamashkiHouseAddress } from '@/lib/samashki-addresses';
import { reverseGeocode } from '@/lib/geocoding';

export interface TaxiPoint {
  lat: number;
  lng: number;
  label?: string;
}

interface TaxiMapInlineProps {
  from: TaxiPoint | null;
  to: TaxiPoint | null;
  /** Куда поставить точку: клик по маркеру слоя даёт его адрес, клик по
      пустой карте — обратное геокодирование (улица + координаты). */
  onPick: (point: TaxiPoint, target: 'from' | 'to') => void;
  pickTarget: 'from' | 'to';
}

type BaseLayer = 'schema' | 'sate' | 'hybrid';

/**
 * Живая карта заказа такси (п.9, п.12 замечаний 23.08): во весь экран
 * над полями «откуда/куда».
 *
 *  · режимы: схема / спутник / гибрид;
 *  · включаемые слои: дома, «другое» (объекты), анкеты — клик по
    маркеру подставляет его адрес в поле (автозаполнение);
 *  · клик по пустой карте — обратное геокодинг: ближайшая улица +
    компактные координаты, а не «Точка на карте»;
 *  · маршрут А→Б рисуется автоматически, когда обе точки заданы.
 */
export default function TaxiMapInline({ from, to, onPick, pickTarget }: TaxiMapInlineProps) {
  const { profiles } = useProfiles();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.TileLayer | null>(null);
  const drawRef = useRef<L.LayerGroup | null>(null);
  const [base, setBase] = useState<BaseLayer>('schema');
  const [showHouses, setShowHouses] = useState(true);
  const [showPlaces, setShowPlaces] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [houses, setHouses] = useState<SamashkiHouseAddress[]>([]);

  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const targetRef = useRef(pickTarget);
  targetRef.current = pickTarget;

  useEffect(() => {
    fetchEffectiveHouseAddresses().then((list) => {
      if (Array.isArray(list)) setHouses(list);
    }).catch(() => {});
  }, []);

  // Инициализация карты.
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { zoomControl: true });
    mapRef.current = map;
    map.setView([43.288024, 45.298989], 14);
    drawRef.current = L.layerGroup().addTo(map);

    map.on('click', async (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      // Ближайшая улица + компактные координаты вместо «Точка на карте».
      let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const geo = await reverseGeocode({ lat, lng });
        if (geo) label = geo;
      } catch { /* останутся компактные координаты */ }
      pickRef.current({ lat, lng, label }, targetRef.current);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      baseRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // Базовый слой: схема / спутник / гибрид.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    baseRef.current?.remove();
    overlayRef.current?.remove();
    if (base === 'schema') {
      baseRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map);
    } else {
      baseRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: '© Esri', maxZoom: 19 },
      ).addTo(map);
      if (base === 'hybrid') {
        overlayRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          opacity: 0.35, maxZoom: 19,
        }).addTo(map);
      }
    }
  }, [base]);

  // Маркеры и маршрут.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.clearLayers();

    if (from) {
      L.circleMarker([from.lat, from.lng], {
        radius: 9, color: '#059669', fillColor: '#059669', fillOpacity: 0.9,
      }).addTo(draw).bindPopup(from.label ?? '');
    }
    if (to) {
      L.circleMarker([to.lat, to.lng], {
        radius: 9, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9,
      }).addTo(draw).bindPopup(to.label ?? '');
    }
    if (from && to) {
      L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
        color: '#059669', weight: 4, dashArray: '8 6',
      }).addTo(draw);
      mapRef.current?.fitBounds(
        L.latLngBounds([[from.lat, from.lng], [to.lat, to.lng]]).pad(0.25),
      );
    }
  }, [from?.lat, from?.lng, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Слои точек.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer((layer) => {
      if ((layer as L.Marker & { options?: { smkLayer?: string } }).options?.smkLayer) {
        map.removeLayer(layer);
      }
    });
    const addMarker = (lat: number, lng: number, label: string, color: string, target: 'from' | 'to') => {
      const marker = L.circleMarker([lat, lng], {
        radius: 6, color, fillColor: color, fillOpacity: 0.7,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      (marker.options as { smkLayer?: string }).smkLayer = 'smk';
      marker.bindPopup(label);
      marker.on('click', () => pickRef.current({ lat, lng, label }, target));
      marker.addTo(map);
    };
    if (showHouses) {
      for (const h of houses) {
        if (h.isNotHouse) continue;
        addMarker(Number(h.lat), Number(h.lng), h.fullAddress, '#0284c7', targetRef.current);
      }
    }
    if (showPlaces) {
      for (const h of houses) {
        if (!h.isNotHouse) continue;
        addMarker(Number(h.lat), Number(h.lng), h.fullAddress, '#7c3aed', targetRef.current);
      }
    }
    if (showProfiles) {
      for (const p of profiles) {
        const coords = p.workplaceCoords;
        if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
          addMarker(coords.lat, coords.lng, p.fullName || p.professionTitle || '', '#d97706', targetRef.current);
        }
      }
    }
  }, [showHouses, showPlaces, showProfiles, houses, profiles]);

  const chip = (on: boolean) => `rounded-lg px-2 py-1 text-[11px] font-bold transition ${
    on ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white/90 text-slate-600 hover:bg-white dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:bg-zinc-900'
  }`;

  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="h-full w-full" />
      {/* Режимы карты */}
      <div className="absolute left-3 top-3 z-[500] flex gap-1">
        {(['schema', 'sate', 'hybrid'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setBase(mode)}
            className={chip(base === mode)}
          >
            {mode === 'schema' ? 'Схема' : mode === 'sate' ? 'Спутник' : 'Гибрид'}
          </button>
        ))}
      </div>
      {/* Слои точек */}
      <div className="absolute right-3 top-3 z-[500] flex gap-1">
        <button type="button" onClick={() => setShowHouses((v) => !v)} className={chip(showHouses)}>
          Дома
        </button>
        <button type="button" onClick={() => setShowPlaces((v) => !v)} className={chip(showPlaces)}>
          Другое
        </button>
        <button type="button" onClick={() => setShowProfiles((v) => !v)} className={chip(showProfiles)}>
          Анкеты
        </button>
      </div>
    </div>
  );
}
