import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

interface DadataSuggestion {
  value?: string;
  unrestricted_value?: string;
  data?: {
    street_with_type?: string;
    street?: string;
    house?: string;
    settlement_with_type?: string;
    city_with_type?: string;
    region_with_type?: string;
    region?: string;
    geo_lat?: string;
    geo_lon?: string;
    qc_geo?: string;
  };
}

const ALLOWED_ORIGINS = new Set(
  [process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:3000', 'https://daymohk.vercel.app'].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
);

function compactDadataAddress(suggestion: DadataSuggestion) {
  const data = suggestion.data ?? {};
  const street = data.street_with_type || data.street;
  const house = data.house;
  if (street) return house ? `${street}, д. ${house}` : street;
  return data.settlement_with_type || data.city_with_type || suggestion.value || suggestion.unrestricted_value || 'Даймохк';
}

function parseDadataSuggestion(suggestion: DadataSuggestion) {
  const lat = Number(suggestion.data?.geo_lat);
  const lng = Number(suggestion.data?.geo_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    displayName: compactDadataAddress(suggestion),
    lat,
    lng,
    precision: suggestion.data?.qc_geo ?? 'unknown',
  };
}

export async function GET(request: Request) {
  // Rate limit: 30 req / minute per IP
  const limit = await rateLimit(request, { limit: 30, windowMs: 60_000 , scope: 'geocode' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 30 }
    );
  }

  // Origin / Referer gate
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';
  const token = process.env.DADATA_API_TOKEN;

  if (!query || query.length < 2 || !token) {
    return NextResponse.json({ results: [], fallback: true });
  }

  try {
    const response = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: `${query}, Чеченская Республика`,
        count: 8,
        locations: [{ region: 'Чеченская Республика' }],
      }),
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      log.warn('geocode/suggest', `DaData returned ${response.status}`);
      return NextResponse.json({ results: [], fallback: true });
    }

    const payload = (await response.json()) as { suggestions?: DadataSuggestion[] };
    const results = (payload.suggestions ?? []).map(parseDadataSuggestion).filter(Boolean);
    return withRateLimitHeaders(
      NextResponse.json({ results }),
      { ...limit, limit: 30 }
    );
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      log.warn('DaData suggestions are unavailable:', error.message);
    }
    return NextResponse.json({ results: [], fallback: true });
  }
}


/**
 * Обратный геокодинг по координатам (DaData /address/geocode).
 * GET /api/geocode/reverse?lat=..&lng=..
 */
export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 , scope: 'geocode' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 }
    );
  }

  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const token = process.env.DADATA_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'DaData token not configured' }, { status: 503 });
  }

  let body: { lat?: number; lng?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat/lng обязательны' }, { status: 400 });
  }

  try {
    const response = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address', {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        lat,
        lon: lng,
        radius_meters: 200,
        count: 5,
        locations: [{ region: 'Чеченская Республика' }],
      }),
    });
    if (!response.ok) {
      log.warn('geocode/reverse', `DaData returned ${response.status}`);
      return NextResponse.json({ error: 'Геокодер недоступен' }, { status: 502 });
    }
    const payload = (await response.json()) as { suggestions?: DadataSuggestion[] };
    const results = (payload.suggestions ?? []).map((s) => {
      const d = s.data ?? {};
      return {
        value: s.unrestricted_value || s.value || '',
        region: d.region_with_type || d.region || '',
        settlement: d.settlement_with_type || d.city_with_type || '',
        street: d.street_with_type || d.street || '',
        house: d.house || '',
      };
    }).filter((r) => r.value);
    return withRateLimitHeaders(NextResponse.json({ results }), { ...limit, limit: 60 });
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      log.warn('DaData geolocate unavailable:', error.message);
    }
    return NextResponse.json({ error: 'Геокодер недоступен' }, { status: 502 });
  }
}
