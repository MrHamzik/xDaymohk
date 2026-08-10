import { NextResponse } from 'next/server';

function parsePoint(value: string | null) {
  if (!value) return null;
  const [lat, lng] = value.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = parsePoint(searchParams.get('from'));
  const to = parsePoint(searchParams.get('to'));
  if (!from || !to) return NextResponse.json({ error: 'Use from=lat,lng and to=lat,lng' }, { status: 400 });

  const routerUrl = process.env.OSRM_ROUTER_URL || 'https://router.project-osrm.org';
  const url = `${routerUrl.replace(/\/$/, '')}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;

  try {
    const response = await fetch(url, { next: { revalidate: 30 } });
    if (!response.ok) return NextResponse.json({ error: 'Маршрутизатор временно недоступен.' }, { status: 502 });
    const payload = await response.json() as { code?: string; routes?: Array<{ distance: number; duration: number; geometry: unknown }> };
    if (payload.code !== 'Ok' || !payload.routes?.[0]) return NextResponse.json({ error: 'Маршрут не найден.' }, { status: 404 });
    const route = payload.routes[0];
    return NextResponse.json({ distanceMeters: route.distance, durationSeconds: route.duration, geometry: route.geometry });
  } catch {
    return NextResponse.json({ error: 'Маршрутизатор временно недоступен.' }, { status: 502 });
  }
}
