/** Поделиться ссылкой: системный лист, буфер или запасной prompt. */
export async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  const payload = `${text}\n${url}`.trim();

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const data: ShareData = { title, text, url };
      if (typeof navigator.canShare !== 'function' || navigator.canShare(data)) {
        await navigator.share(data);
        return 'shared';
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'failed';
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return 'copied';
    }
  } catch {
    // ниже — запасной путь
  }

  try {
    const field = document.createElement('textarea');
    field.value = payload;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    if (ok) return 'copied';
  } catch {
    //
  }

  try {
    window.prompt(title, url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location.origin) return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://daymohk.xyz';
}
