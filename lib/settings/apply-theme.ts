import { FONT_FAMILIES, type FontFamilyId, type ThemeColors } from '@/lib/settings/types';

/**
 * Применение темы и шрифта к документу.
 *
 * Почему именно так
 * -----------------
 * Первая версия подменяла только --color-zinc-* и --smk-*. Это давало
 * «слой поверх тёмной темы»: семантические переменные --background и
 * --foreground объявлены ДВАЖДЫ — в :root (светлые значения) и в
 * html.dark (через var(--color-zinc-*)). Светлая кастомная тема не
 * получает класс .dark, поэтому её фон брался из :root и подмена
 * --color-zinc-950 не доходила до страницы.
 *
 * Теперь выставляем сами семантические слоты (--background,
 * --foreground, --surface*), а не их источники. Инлайновый стиль на
 * :root по специфичности бьёт оба блока, поэтому результат одинаков
 * и для светлой, и для тёмной основы.
 */

/** #rrggbb → "r g b" для rgb(var(--x) / a). */
function hexToRgbChannels(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** Смешивает цвет с белым/чёрным — для производных оттенков. */
function mix(hex: string, target: '#ffffff' | '#000000', amount: number): string {
  const from = hex.replace('#', '');
  const to = target.replace('#', '');
  const channel = (index: number) => {
    const a = parseInt(from.slice(index * 2, index * 2 + 2), 16);
    const b = parseInt(to.slice(index * 2, index * 2 + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** Все переменные, которыми управляет пользовательская тема. */
const MANAGED_PROPERTIES = [
  '--background', '--foreground', '--surface', '--surface-card', '--surface-subtle',
  '--border-subtle', '--border-dark-soft', '--border-dark-card',
  '--smk-card-a', '--smk-card-b', '--smk-card-line', '--smk-card-inset',
  '--smk-muted', '--smk-muted-bright', '--smk-surface', '--smk-surface-soft',
  '--smk-gold', '--smk-gold-soft', '--smk-gold-deep', '--smk-gold-rgb',
  '--smk-hairline', '--smk-hairline-strong',
  '--color-zinc-950', '--color-zinc-900', '--color-zinc-800', '--color-zinc-700',
  '--smk-status-active', '--smk-status-active-deep',
  '--smk-status-break', '--smk-status-break-deep',
  '--smk-status-flexible', '--smk-status-flexible-deep',
  '--smk-status-offline', '--smk-status-offline-deep',
  '--smk-role-specialist', '--smk-role-admin', '--smk-role-verified',
  '--smk-hero-from', '--smk-hero-to',
  '--smk-map-cluster', '--smk-map-house',
  '--smk-danger', '--smk-danger-rgb',
  // Акцент интерфейса: Tailwind v4 держит палитру в переменных, поэтому
  // подмена --color-emerald-* перекрашивает все утилиты emerald разом.
  '--color-emerald-400', '--color-emerald-500', '--color-emerald-600',
  '--color-emerald-700', '--color-emerald-800',
  '--color-teal-400', '--color-teal-500', '--color-teal-600',
];

export function applyThemeColors(colors: ThemeColors, isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  // Класс .dark по-прежнему нужен: на нём держатся сотни dark:-утилит
  // Tailwind, переписать их темой невозможно.
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';

  // ── Семантические слоты: именно они рисуют фон и текст страницы ──
  set('--background', colors.bg);
  set('--foreground', colors.text);
  set('--surface', colors.card);
  set('--surface-card', colors.card);
  set('--surface-subtle', colors.cardAlt);
  set('--border-subtle', colors.cardLine);
  set('--border-dark-soft', colors.cardLine);
  set('--border-dark-card', colors.cardLine);

  // ── Источники, на которые ссылаются утилиты zinc ────────────────
  set('--color-zinc-950', colors.bg);
  set('--color-zinc-900', colors.cardAlt);
  set('--color-zinc-800', colors.card);
  set('--color-zinc-700', colors.cardInset);

  // ── Карточка ────────────────────────────────────────────────────
  set('--smk-card-a', colors.card);
  set('--smk-card-b', colors.cardAlt);
  set('--smk-card-line', colors.cardLine);
  set('--smk-card-inset', colors.cardInset);
  set('--smk-muted', colors.muted);
  set('--smk-muted-bright', colors.text);
  set('--smk-surface', colors.card);
  set('--smk-surface-soft', colors.cardInset);

  // Волосяные линии выводим из основы: на тёмной теме нужен белый
  // штрих, на светлой — чёрный, иначе разделители пропадают.
  const hair = isDark ? '255 255 255' : '15 23 42';
  set('--smk-hairline', `rgb(${hair} / 0.08)`);
  set('--smk-hairline-strong', `rgb(${hair} / 0.16)`);

  // ── Акцент ──────────────────────────────────────────────────────
  set('--smk-gold', colors.accent);
  set('--smk-gold-soft', colors.accentSoft);
  set('--smk-gold-deep', colors.accentDeep);
  set('--smk-gold-rgb', hexToRgbChannels(colors.accent));

  // ── Статусы и роли ──────────────────────────────────────────────
  set('--smk-status-active', colors.statusActive);
  set('--smk-status-active-deep', mix(colors.statusActive, '#000000', 0.28));
  set('--smk-status-break', colors.statusBreak);
  set('--smk-status-break-deep', mix(colors.statusBreak, '#000000', 0.28));
  set('--smk-status-flexible', colors.statusFlexible);
  set('--smk-status-flexible-deep', mix(colors.statusFlexible, '#000000', 0.28));
  set('--smk-status-offline', colors.statusOffline);
  set('--smk-status-offline-deep', mix(colors.statusOffline, '#000000', 0.28));

  set('--smk-role-specialist', colors.roleSpecialist);
  set('--smk-role-admin', colors.roleAdmin);
  set('--smk-role-verified', colors.roleVerified);

  set('--smk-danger', colors.danger);
  set('--smk-danger-rgb', hexToRgbChannels(colors.danger));

  // ── Акцент интерфейса (зелёный по умолчанию) ────────────────────
  // Утилиты вида bg-emerald-600 компилируются в var(--color-emerald-600),
  // поэтому одним ключом темы перекрашиваются иконки меню, ползунки,
  // кнопки и кольца фокуса — без правки сотен классов в разметке.
  set('--color-emerald-600', colors.ui);
  set('--color-emerald-500', mix(colors.ui, '#ffffff', 0.14));
  set('--color-emerald-400', mix(colors.ui, '#ffffff', 0.3));
  set('--color-emerald-700', mix(colors.ui, '#000000', 0.16));
  set('--color-emerald-800', mix(colors.ui, '#000000', 0.32));
  // Бирюзовый идёт парой с зелёным в градиентах — держим в той же гамме.
  set('--color-teal-600', mix(colors.ui, '#000000', 0.08));
  set('--color-teal-500', mix(colors.ui, '#ffffff', 0.1));
  set('--color-teal-400', mix(colors.ui, '#ffffff', 0.26));

  // ── Главная карточка каталога и карта ───────────────────────────
  set('--smk-hero-from', colors.heroFrom);
  set('--smk-hero-to', colors.heroTo);
  set('--smk-map-cluster', colors.mapCluster);
  set('--smk-map-house', colors.mapHouse);
}

/**
 * Снятие инлайновых переменных.
 *
 * Нужно при возврате к светлой/тёмной теме: без этого значения
 * пользовательской темы остаются на :root и перебивают каскад из
 * globals.css — именно отсюда брались «глюки» после выключения
 * расширенного режима.
 */
export function clearThemeColors(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const property of MANAGED_PROPERTIES) root.style.removeProperty(property);
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
