/** Общие утилиты анкеты: дата отзыва и безопасный YouTube-id. */

export const MAX_REVIEW_TEXT_LENGTH = 500;

export function formatReviewDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ru-RU').format(date);
}

/**
 * Достаёт ID видео из ссылки YouTube (watch?v=, youtu.be/, /embed/, /shorts/).
 * Возвращает null для любых других ссылок — в iframe вставляем ТОЛЬКО
 * youtube-nocookie.com/embed/<id>, произвольные URL не рендерим.
 */
export function youtubeEmbedId(url?: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'www.youtube-nocookie.com') {
    if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.split('/')[2];
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
    const v = parsed.searchParams.get('v');
    return v && /^[A-Za-z0-9_-]{6,}$/.test(v) ? v : null;
  }
  return null;
}
