import { log } from '@/lib/logger';

/**
 * Отправка SMS через SMS.RU.
 *
 * Без SMSRU_API_ID ничего не уходит — это не «тестовый режим», а
 * честный отказ. Код в лог не пишем.
 */
export async function sendSmsRu(phoneDigits: string, text: string): Promise<{ ok: true } | { ok: false; reason: 'no_provider' | 'send_failed' }> {
  const apiId = process.env.SMSRU_API_ID?.trim();
  if (!apiId) return { ok: false, reason: 'no_provider' };

  const body = new URLSearchParams({
    api_id: apiId,
    to: phoneDigits,
    msg: text,
    json: '1',
  });

  try {
    const res = await fetch('https://sms.ru/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as {
      status?: string;
      status_code?: number;
      sms?: Record<string, { status?: string; status_code?: number }>;
    };
    const item = data.sms?.[phoneDigits];
    if (data.status === 'OK' && item?.status === 'OK') return { ok: true };
    log.warn('sms.ru rejected', { status: data.status_code, item: item?.status_code });
    return { ok: false, reason: 'send_failed' };
  } catch (e) {
    log.warn('sms.ru failed', { message: String(e) });
    return { ok: false, reason: 'send_failed' };
  }
}
