import { FONT_FAMILIES, type FontFamilyId, type ThemeColors } from '@/lib/settings/types';

/**
 * Применение темы и шрифта к документу.
 *
 * Работает через CSS-переменные на :root, а не через подмену классов
 * Tailwind: класс .dark остаётся единственным переключателем «тёмная /
 * светлая» для всех dark:-утилит, которых в проекте сотни. Тема лишь
 * подставляет другие значения в те же слоты --smk-*, поэтому вёрстка
 * не может «разъехаться» — меняются только цвета.
 */

/** #rrggbb → "r g b" для rgb(var(--x) / a). */
function hexToRgbChannels(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function applyThemeColors(colors: ThemeColors, isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';

  // Слоты карточки — те же имена, что в globals.css.
  root.style.setProperty('--smk-card-a', colors.card);
  root.style.setProperty('--smk-card-b', colors.cardAlt);
  root.style.setProperty('--smk-card-line', colors.cardLine);
  root.style.setProperty('--smk-card-inset', colors.cardInset);
  root.style.setProperty('--smk-muted', colors.muted);
  root.style.setProperty('--smk-muted-bright', colors.text);
  root.style.setProperty('--smk-surface', colors.card);

  // Акцент: и как hex, и как каналы — прозрачные блики берут второй.
  root.style.setProperty('--smk-gold', colors.accent);
  root.style.setProperty('--smk-gold-soft', colors.accentSoft);
  root.style.setProperty('--smk-gold-deep', colors.accentDeep);
  root.style.setProperty('--smk-gold-rgb', hexToRgbChannels(colors.accent));

  // Фон страницы: зинки-переменные использует и фон body, и радиальный
  // градиент, поэтому правим их, а не добавляем ещё один слой.
  root.style.setProperty('--color-zinc-950', colors.bg);
  root.style.setProperty('--color-zinc-900', colors.cardAlt);
  root.style.setProperty('--color-zinc-800', colors.card);
  root.style.setProperty('--color-zinc-700', colors.cardInset);

  root.style.setProperty('--smk-theme-bg', colors.bg);
  root.style.setProperty('--smk-theme-text', colors.text);
}

/**
 * Сброс инлайновых переменных.
 *
 * Нужен при возврате к светлой/тёмной теме: без него значения
 * пользовательской темы остались бы висеть на :root и перебивали бы
 * каскад из globals.css.
 */
export function clearThemeColors(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const properties = [
    '--smk-card-a', '--smk-card-b', '--smk-card-line', '--smk-card-inset',
    '--smk-muted', '--smk-muted-bright', '--smk-surface',
    '--smk-gold', '--smk-gold-soft', '--smk-gold-deep', '--smk-gold-rgb',
    '--color-zinc-950', '--color-zinc-900', '--color-zinc-800', '--color-zinc-700',
    '--smk-theme-bg', '--smk-theme-text',
  ];
  for (const property of properties) root.style.removeProperty(property);
}

/** Базовый кегль body до масштабирования (см. globals.css). */
const BASE_FONT_SIZE_PX = 13;

/**
 * Масштаб шрифта и семейство.
 *
 * Масштабируем ДВА значения:
 *  - --smk-font-size-base — кегль body (13px в проекте, не rem);
 *  - font-size на <html> — база для всех rem-размеров в утилитах.
 *
 * Только html недостаточно: body жёстко задаёт 13px и перебивает
 * унаследованный размер. Только body — тоже: тогда не сдвинутся
 * text-xs / text-lg, которые считаются в rem.
 */
export function applyTypography(fontScale: number, fontFamily: FontFamilyId): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const scale = Math.min(150, Math.max(50, fontScale || 100));

  if (scale === 100) {
    root.style.fontSize = '';
    root.style.removeProperty('--smk-font-size-base');
  } else {
    root.style.fontSize = `${(16 * scale) / 100}px`;
    root.style.setProperty('--smk-font-size-base', `${(BASE_FONT_SIZE_PX * scale) / 100}px`);
  }

  root.style.setProperty('--smk-font-family', FONT_FAMILIES[fontFamily] ?? FONT_FAMILIES.manrope);
}
