import { NextResponse } from 'next/server';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Автоперевод для админ-панели (жалобы, письма): русский → чеченский.
 *
 * Для ВСЕХ языков (включая чеченский) сначала Google (gtx — без API-ключа),
 * при неудаче — fallback на публичный endpoint Яндекс.Переводчика.
 * Админ всегда может поправить текст вручную.
 *
 * POST { text, from?, to? } → { translated }
 */

async function translateGoogle(text: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return null;
    const data = (await response.json()) as { 0?: unknown[][] };
    const segments = data?.[0] ?? [];
    const translated = segments
      .map((segment) => (Array.isArray(segment) ? String(segment[0] ?? '') : ''))
      .join('');
    return translated.trim() ? translated : null;
  } catch {
    return null;
  }
}

async function translateYandex(text: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://translate.yandex.net/api/v1/tr.json/translate?id=translate.yandex.ru&srv=tr-text&lang=${encodeURIComponent(from)}-${encodeURIComponent(to)}&text=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://translate.yandex.ru/' },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { text?: string[] };
    const translated = (data.text ?? []).join('');
    return translated.trim() ? translated : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { limit: 60, windowMs: 60_000 , scope: 'translate' });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 60 },
    );
  }

  let body: { text?: string; from?: string; to?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ error: 'text обязателен' }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: 'Слишком длинный текст' }, { status: 400 });
  }
  // Белый список языков — не даём мусор на внешний API перевода.
  const ALLOWED_LANGS = new Set(['ru', 'ce', 'en', 'ar', 'tr', 'de', 'fr', 'it', 'es', 'uk', 'be', 'kk', 'az', 'uz']);
  const fromRaw = String(body.from ?? 'ru').toLowerCase();
  const toRaw = String(body.to ?? 'ce').toLowerCase();
  const from = ALLOWED_LANGS.has(fromRaw) ? fromRaw : 'ru';
  const to = ALLOWED_LANGS.has(toRaw) ? toRaw : 'ce';

  // Для всех языков (включая ce) Google первым, Яндекс — резерв.
  const translated = (await translateGoogle(text, from, to)) ?? (await translateYandex(text, from, to));
  if (!translated) {
    return NextResponse.json({ error: 'Переводчик недоступен. Попробуйте позже или заполните вручную.' }, { status: 502 });
  }
  return NextResponse.json({ translated });
}
