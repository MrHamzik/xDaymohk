import { NextResponse } from 'next/server';

interface DadataSuggestion {
  value?: string;
  unrestricted_value?: string;
  data?: {
    street_with_type?: string;
    street?: string;
    house?: string;
    settlement_with_type?: string;
    city_with_type?: string;
    geo_lat?: string;
    geo_lon?: string;
    qc_geo?: string;
  };
}

function compactDadataAddress(suggestion: DadataSuggestion) {
  const data = suggestion.data ?? {};
  const street = data.street_with_type || data.street;
  const house = data.house;
  if (street) return house ? `${street}, д. ${house}` : street;
  return data.settlement_with_type || data.city_with_type || suggestion.value || suggestion.unrestricted_value || 'Самашки';
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
        query: `${query}, Самашки, Чеченская Республика`,
        count: 8,
        locations: [{ region: 'Чеченская Республика' }],
      }),
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      console.warn(`DaData suggestions returned ${response.status}`);
      return NextResponse.json({ results: [], fallback: true });
    }

    const payload = await response.json() as { suggestions?: DadataSuggestion[] };
    const results = (payload.suggestions ?? []).map(parseDadataSuggestion).filter(Boolean);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.warn('DaData suggestions are unavailable:', error.message);
    }
    return NextResponse.json({ results: [], fallback: true });
  }
}
