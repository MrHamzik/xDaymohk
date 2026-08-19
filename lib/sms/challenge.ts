import { createHash, randomInt, timingSafeEqual } from 'crypto';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;
const DAILY_SEND_LIMIT = 5;

export const SMS_CODE_TTL_MS = CODE_TTL_MS;
export const SMS_RESEND_MS = RESEND_MS;
export const SMS_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const SMS_DAILY_SEND_LIMIT = DAILY_SEND_LIMIT;

function pepper(): string {
  return (process.env.SMS_CODE_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function hashSmsCode(userId: string, phone: string, code: string): string {
  return createHash('sha256')
    .update(`${pepper()}\n${userId}\n${phone}\n${code}`)
    .digest('hex');
}

export function codesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Шесть цифр, не из Date.now — его угадывают. */
export function makeSmsCode(): string {
  return String(randomInt(100000, 1000000));
}

export function smsExpiresAt(from = Date.now()): string {
  return new Date(from + CODE_TTL_MS).toISOString();
}
