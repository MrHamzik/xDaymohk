import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * Прокси маршрутизации (п.10 замечаний 23.08): клиент больше не ходит
 * в OSRM напрямую (демо-сервер нестабилен и иногда «прокалывает
 * прямой»). Сервер пробует два публичных инстанса OSRM (FOSSGIS —
 * основной, project-osrm — запасной) и отдаёт геометрию по улицам.
 * Кэш 10 минут, ключ — округлённые координаты.
 */

const CACHE_TTL = 10 * 60_000;
const cache = new Map<string, { at: number; body: unknown }>();

const PROVIDERS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
];

function parsePoint(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  const [latS, lngS] = raw.split(',');
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'route:get', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const url = new URL(request.url);
  const from = parsePoint(url.searchParams.get('from'));
  const to = parsePoint(url.searchParams.get('to'));
  if (!from || !to) return NextResponse.json({ error: 'Нужны точки from и to' }, { status: 400 });

  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return withRateLimitHeaders(NextResponse.json(hit.body), { ...limit, limit: 60 });
  }

  const path = `/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  for (const base of PROVIDERS) {
    try {
      const res = await fetch(base + path, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const route = data?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length > 1) {
        const body = {
          coordinates: coords.map(([lng, lat]: [number, number]) => [lat, lng]),
          distanceKm: Math.round((Number(route.distance) / 1000) * 10) / 10,
          minutes: Math.max(1, Math.round(Number(route.duration) / 60)),
        };
        if (cache.size > 200) cache.clear();
        cache.set(key, { at: Date.now(), body });
        return withRateLimitHeaders(NextResponse.json(body), { ...limit, limit: 60 });
      }
    } catch (e) {
      log.warn('route:GET', 'provider failed', { base, message: e instanceof Error ? e.message : String(e) });
    }
  }
  // Оба провайдера молчат — клиент нарисует прямую как фолбэк.
  return withRateLimitHeaders(NextResponse.json({ coordinates: null }), { ...limit, limit: 60 });
}
