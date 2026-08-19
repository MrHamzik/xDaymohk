/** Короткий виброотклик. Без настройки или без поддержки API — тишина. */
export function haptic(enabled: boolean, pattern: number | number[] = 24): void {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Старые WebView бросают, если вибрация запрещена системой.
  }
}
