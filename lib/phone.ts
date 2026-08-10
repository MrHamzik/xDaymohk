/**
 * Phone normalization helpers shared between AccountModal and profile page.
 */

export function extractPhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 10 && (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function formatPhone(value: string): string {
  const digits = extractPhoneDigits(value);
  if (!digits) return '';
  let formatted = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) formatted += `) ${digits.slice(3, 6)}`;
  if (digits.length >= 6) formatted += `-${digits.slice(6, 8)}`;
  if (digits.length >= 8) formatted += `-${digits.slice(8, 10)}`;
  return formatted;
}

export function isValidCyrillicName(name: string): boolean {
  if (!name.trim()) return false;
  return /^[А-ЯЁа-яё\-]+$/u.test(name.trim()) && name.trim().length >= 2 && name.trim().length <= 30;
}
