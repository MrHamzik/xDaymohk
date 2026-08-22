'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';
import { useLockBody } from '@/lib/hooks/useLockBody';

export interface TaxiPoint {
  lat: number;
  lng: number;
  label?: string;
}

interface TaxiMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  from?: TaxiPoint | null;
  to?: TaxiPoint | null;
  /** Режим выбора точки: клик по карте возвращает координаты. */
  pick?: 'from' | 'to' | null;
  onPick?: (point: { lat: number; lng: number }) => void;
  pickHint?: string;
}

/**
 * Карта для ВайТакси: показывает маршрут А→Б (линия по прямой между
 * точками, п.14) или даёт ткнуть в карту, чтобы поставить точку
 * «откуда/куда» (п.13). Отдельный лёгкий компонент, чтобы не тащить
 * весь InteractiveMap с домами и кластерами.
 */
export default function TaxiMapModal({ isOpen, onClose, from, to, pick = null, onPick, pickHint }: TaxiMapModalProps) {
  useLockBody(isOpen);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!isOpen || !boxRef.current) return;

    const map = L.map(boxRef.current, { zoomControl: true });
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const points: TaxiPoint[] = [from, to].filter((p): p is TaxiPoint => Boolean(p));
    for (const p of points) {
      L.circleMarker([p.lat, p.lng], {
        radius: 9,
        color: p === from ? '#059669' : '#dc2626',
        fillColor: p === from ? '#059669' : '#dc2626',
        fillOpacity: 0.9,
      }).addTo(map).bindPopup(p.label ?? '');
    }
    if (from && to) {
      L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
        color: '#059669', weight: 4, dashArray: '8 6',
      }).addTo(map);
      map.fitBounds(L.latLngBounds([[from.lat, from.lng], [to.lat, to.lng]]).pad(0.3));
    } else if (points.length > 0) {
      map.setView([points[0].lat, points[0].lng], 15);
    } else {
      // Даймохк по умолчанию.
      map.setView([43.288024, 45.298989], 13);
    }

    if (pick && onPick) {
      map.on('click', (event: L.LeafletMouseEvent) => {
        onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [isOpen, from?.lat, from?.lng, to?.lat, to?.lng, pick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="smk-sheet relative h-[70dvh] w-full max-w-2xl overflow-hidden rounded-3xl shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть карту"
          className="absolute right-3 top-3 z-[500] flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-slate-700 shadow dark:bg-zinc-900/90 dark:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
        {pick && pickHint && (
          <p className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-xl bg-emerald-600/95 px-3 py-1.5 text-xs font-bold text-white shadow">
            {pickHint}
          </p>
        )}
        <div ref={boxRef} className="h-full w-full" />
      </div>
    </div>
  );
}
