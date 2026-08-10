import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { parseLatLngPair } from '@/lib/validation';

// Loose bbox around Samashki and Chechen Republic; tighter than a hemisphere
// but generous enough to allow valid inter-village queries.
const MIN_LAT = 42.5;
const MAX_LAT = 44.0;
const MIN_LNG = 44.5;
const MAX_LNG = 46.5;

function parsePoint(value: string | null) {
  if (!value) return null;
  const [lat, lng] = value.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat < MIN_LAT || lat > MAX_LAT || lng < MIN_LNG || lng > MAX_LNG) return null;
  return { lat, lng };
}

const ALLOWED_ROUTER_HOSTS = new Set([
  'router.project-osrm.org',
]);

function resolveRouterUrl(): string {
  const raw = process.env.OSRM_ROUTER_URL || 'https://router.project-osrm.org';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      return 'https://router.project-osrm.org';
    }
    if (!ALLOWED_ROUTER_HOSTS.has(parsed.hostname)) {
      return 'https://router.project-osrm.org';
    }
    return raw.replace(/\/$/, '');
  } catch {
    return 'https://router.project-osrm.org';
  }
}

export async function GET(request: Request) {
  // Rate limit: 60 req / minute per IP
  const limit = rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 }
    );
  }

  const { searchParams } = new URL(request.url);
  const from = parsePoint(searchParams.get('from')) ?? parseLatLngPair(searchParams.get('from'));
  const to = parsePoint(searchParams.get('to')) ?? parseLatLngPair(searchParams.get('to'));
  if (!from || !to) {
    return NextResponse.json({ error: 'Use from=lat,lng and to=lat,lng within Chechen Republic bbox' }, { status: 400 });
  }

  const routerUrl = resolveRouterUrl();
  const url = `${routerUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;

  try {
    const response = await fetch(url, { next: { revalidate: 30 } });
    if (!response.ok) {
      return withRateLimitHeaders(
        NextResponse.json({ error: 'Маршрутизатор временно недоступен.' }, { status: 502 }),
        { ...limit, limit: 60 }
      );
    }
    const payload = (await response.json()) as {
      code?: string;
      routes?: Array<{ distance: number; duration: number; geometry: unknown }>;
    };
    if (payload.code !== 'Ok' || !payload.routes?.[0]) {
      return withRateLimitHeaders(
        NextResponse.json({ error: 'Маршрут не найден.' }, { status: 404 }),
        { ...limit, limit: 60 }
      );
    }
    const route = payload.routes[0];
    return withRateLimitHeaders(
      NextResponse.json({
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        geometry: route.geometry,
      }),
      { ...limit, limit: 60 }
    );
  } catch {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Маршрутизатор временно недоступен.' }, { status: 502 }),
      { ...limit, limit: 60 }
    );
  }
}
