/**
 * Производные цвета линий: обводка и разделители.
 *
 * Обе линии выводятся из слота «Карточки и поля», но по разным
 * правилам, потому что решают разные задачи:
 *
 *  • Обводка (cardLine) очерчивает КОНТУР карточки, поля, всплывающего
 *    слоя. Она должна быть еле заметна — иначе интерфейс превращается в
 *    таблицу. Правило: та же яркость, что у карточки, плюс 9 единиц по
 *    шкале 0–240 (у самых светлых карточек, где потолок мешает, — минус
 *    9). Оттенок и насыщенность не меняются.
 *
 *  • Разделитель (divider) — линия ВНУТРИ блока: между строками, между
 *    секциями листа, орнаментальные полосы. Её задача обратная: она
 *    структурирует содержимое и обязана читаться. Правило:
 *    насыщенность делится пополам, яркость удваивается на тёмных темах
 *    и уменьшается на 19 единиц (0–240) на светлых.
 *
 * Шкала 0–240 — та, что показывают палитры Windows и Photoshop, а не
 * доля 0–1: пользователь задаёт правило именно в этих единицах.
 */

const LIGHTNESS_SCALE = 240;
/** Выше этой яркости прибавка упирается в потолок — идём вниз. */
const LIGHTNESS_CEILING = 231;
/** Шаг обводки от карточки, в единицах шкалы 0–240. */
const OUTLINE_STEP = 9;
/** Шаг разделителя вниз на светлых темах, в единицах шкалы 0–240. */
const DIVIDER_LIGHT_STEP = 19;

export interface Hsl {
  /** Оттенок, 0–360. */
  h: number;
  /** Насыщенность, 0–1. */
  s: number;
  /** Светлота, 0–1. */
  l: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function hexToHsl(hex: string): Hsl {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = clamp01(s);
  const light = clamp01(l);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];

  const channel = (value: number) =>
    Math.round((value + m) * 255).toString(16).padStart(2, '0');

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Обводка: яркость карточки ±9 по шкале 0–240, оттенок и насыщенность те же. */
export function deriveCardLine(card: string): string {
  const { h, s, l } = hexToHsl(card);
  const scaled = l * LIGHTNESS_SCALE;
  const next = scaled > LIGHTNESS_CEILING ? scaled - OUTLINE_STEP : scaled + OUTLINE_STEP;
  return hslToHex({ h, s, l: next / LIGHTNESS_SCALE });
}

/**
 * Разделитель: насыщенность/2; яркость ×2 на тёмной основе и −19 по
 * шкале 0–240 на светлой.
 *
 * Направление зависит от основы, а не от формулы: на тёмной карточке
 * линия обязана быть светлее, на светлой — темнее. Одна арифметика на
 * оба случая давала белое на белом.
 */
export function deriveDivider(card: string, isDark: boolean): string {
  const { h, s, l } = hexToHsl(card);
  const scaled = l * LIGHTNESS_SCALE;
  const next = isDark ? scaled * 2 : scaled - DIVIDER_LIGHT_STEP;
  return hslToHex({
    h,
    s: s / 2,
    l: Math.min(LIGHTNESS_SCALE, Math.max(0, next)) / LIGHTNESS_SCALE,
  });
}
