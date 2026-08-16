/**
 * Пользовательские настройки карты. Хранятся локально (localStorage),
 * переключаются из панели быстрых настроек (SettingsControlsBar).
 */

export const COMPACT_MAP_KEY = 'samashki-compact-map';
export const COMPACT_MAP_EVENT = 'samashki-compact-map-changed';

/** «Компактная карта»: тонкие цифры домов без фона/теней, мелкие кластеры. */
export function isCompactMapEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(COMPACT_MAP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCompactMapEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(COMPACT_MAP_KEY, enabled ? '1' : '0');
    // Уведомляем уже открытые карты, чтобы они пересобрали слои.
    window.dispatchEvent(new Event(COMPACT_MAP_EVENT));
  } catch {}
}
