/** Поделиться ссылкой: системный лист или копирование в буфер. */
export async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location.origin) return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://daymohk.xyz';
}
