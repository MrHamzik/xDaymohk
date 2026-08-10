/**
 * Runtime validation helpers for the most sensitive API and form inputs.
 * We avoid pulling in zod for the smallest inputs and keep these helpers
 * dependency-free. Replace with zod if schemas become more complex.
 */

const PHONE_DIGITS_REGEX = /^\d{10}$/;

export function isValidRuPhoneDigits(digits: string): boolean {
  return PHONE_DIGITS_REGEX.test(digits);
}

const REASON_MAX_LENGTH = 500;

export function sanitizeReason(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, REASON_MAX_LENGTH);
}

export function parseLatLngPair(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== 'string') return null;
  const [latStr, lngStr] = value.split(',');
  if (!latStr || !lngStr) return null;
  const lat = Number(latStr.trim());
  const lng = Number(lngStr.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function isValidCyrillicName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return false;
  return /^[А-ЯЁа-яё\-]+$/u.test(trimmed);
}

export function isNonEmptyString(value: unknown, maxLength = 1000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}
