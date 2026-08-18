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

/* ===========================================================================
   Палитра из одного «Главного цвета»
   ---------------------------------------------------------------------------
   Пользователь выбирает ОДИН цвет, остальные 25 слотов выводятся по
   правилам ниже. Это стандартный для дизайн-систем подход (Material
   You, Radix Colors): человек задаёт намерение, система считает
   производные — и тема остаётся согласованной, чего вручную по 25
   пикерам почти не добиться.

   Что важно в этих формулах:

   1. ОТТЕНОК ведущий, а не случайный. Фон, карточки, текст и серые
      берут оттенок главного цвета — поэтому в теме нет «чужого»
      нейтрального серого, всё в одной семье. Насыщенность у них низкая:
      подтон читается, но не спорит с контентом.

   2. НАПРАВЛЕНИЕ задаёт isDark. На тёмной основе поверхности идут вверх
      от почти чёрного, текст — светлый; на светлой всё зеркально. Одна
      арифметика на оба случая давала белое на белом.

   3. АКЦЕНТ берётся отходом по кругу RYB (художественному), а не HSL:
      в HSL 90° — салатовый, а не жёлтый, и «дополнительный» цвет
      получался грязным. Отход +40° по RYB даёт соседний тёплый тон.

   4. СМЫСЛОВЫЕ цвета (статусы, роли, опасное действие) НЕ выводятся из
      главного: зелёный «работает» и красный «удалить» — договорённость
      с пользователем, а не оформление. Их только подстраивают по
      светлоте под основу, чтобы они не выбивались яркостью.
   =========================================================================== */

/**
 * Круг RYB (художественный) → HSL.
 *
 * В HSL «жёлтый» стоит на 60°, а «зелёный» на 120°, из-за чего
 * равномерные отходы дают неожиданные цвета: 90° — салатовый. Художники
 * же считают по кругу красный–жёлтый–синий. Таблица переводит один круг
 * в другой по опорным точкам с линейной интерполяцией между ними.
 */
const RYB_TO_HSL: Array<[number, number]> = [
  [0, 0], [30, 18], [60, 48], [90, 60], [120, 75], [150, 96],
  [180, 120], [210, 160], [240, 225], [270, 260], [300, 290],
  [330, 330], [360, 360],
];

function rybToHsl(rybHue: number): number {
  const hue = ((rybHue % 360) + 360) % 360;
  for (let i = 0; i < RYB_TO_HSL.length - 1; i += 1) {
    const [fromR, fromH] = RYB_TO_HSL[i];
    const [toR, toH] = RYB_TO_HSL[i + 1];
    if (hue >= fromR && hue <= toR) {
      const ratio = (hue - fromR) / (toR - fromR);
      return (fromH + (toH - fromH) * ratio) % 360;
    }
  }
  return hue;
}

function hslToRyb(hslHue: number): number {
  const hue = ((hslHue % 360) + 360) % 360;
  for (let i = 0; i < RYB_TO_HSL.length - 1; i += 1) {
    const [fromR, fromH] = RYB_TO_HSL[i];
    const [toR, toH] = RYB_TO_HSL[i + 1];
    if (hue >= fromH && hue <= toH) {
      const ratio = (hue - fromH) / (toH - fromH);
      return (fromR + (toR - fromR) * ratio) % 360;
    }
  }
  return hue;
}

/** Оттенок фирменного золота (#ffae00) — цель для акцента. */
const GOLD_HUE = 41;

/**
 * Сместить оттенок `from` в сторону `to` по кратчайшей дуге на долю
 * `ratio`. Идём кратчайшим путём: через дальнюю сторону круга золото
 * ушло бы в зелень.
 */
function towardHue(from: number, to: number, ratio: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  delta *= ratio;
  return ((from + delta) % 360 + 360) % 360;
}

/** Сдвиг оттенка по кругу RYB на заданный угол. */
function shiftRyb(hslHue: number, degrees: number): number {
  return rybToHsl(hslToRyb(hslHue) + degrees);
}

/** Собрать цвет: оттенок главного, своя насыщенность и яркость (0–240). */
function tone(h: number, saturation: number, lightness240: number): string {
  return hslToHex({ h, s: saturation, l: lightness240 / LIGHTNESS_SCALE });
}

/** Подогнать готовый смысловой цвет под светлоту основы. */
function fit(hex: string, isDark: boolean): string {
  const { h, s, l } = hexToHsl(hex);
  // На тёмном фоне насыщенный «чистый» цвет выглядит кислотным, на
  // светлом — наоборот, тонет. Сдвигаем светлоту к рабочему коридору.
  const target = isDark
    ? Math.max(l, 0.55)
    : Math.min(l, 0.52);
  return hslToHex({ h, s: Math.min(s, 0.82), l: target });
}

/** Готовые смысловые цвета: одинаковый смысл во всех темах. */
const SEMANTIC_BASE = {
  statusActive: '#10b981',
  statusBreak: '#f59e0b',
  statusFlexible: '#0ea5e9',
  statusOffline: '#a1a1aa',
  roleSpecialist: '#10b981',
  roleAdmin: '#ef4444',
  roleVerified: '#3b82f6',
  danger: '#f43f5e',
};

/** Все слоты палитры, кроме главного цвета, выведенные из него. */
export interface DerivedPalette {
  bg: string;
  card: string;
  cardAlt: string;
  cardLine: string;
  divider: string;
  cardInset: string;
  panel: string;
  text: string;
  muted: string;
  icon: string;
  accent: string;
  accentSoft: string;
  accentDeep: string;
  statusActive: string;
  statusBreak: string;
  statusFlexible: string;
  statusOffline: string;
  roleSpecialist: string;
  roleAdmin: string;
  roleVerified: string;
  danger: string;
  heroFrom: string;
  heroTo: string;
  mapCluster: string;
  mapHouse: string;
}

/**
 * Построить палитру из главного цвета.
 *
 * Значения светлоты подобраны по девяти готовым темам: «Космос» и
 * «Закат» ложатся в эти же коридоры, то есть правило описывает уже
 * работающие темы, а не придумано с нуля.
 */
export function derivePalette(ui: string, isDark: boolean): DerivedPalette {
  const { h, s } = hexToHsl(ui);

  // Подтон поверхностей: заметен, но не спорит с содержимым. У очень
  // блёклого главного цвета не «дорисовываем» насыщенность, иначе
  // серая тема стала бы цветной против воли пользователя.
  const surfaceSat = Math.min(s * 0.55, isDark ? 0.42 : 0.3);
  const textSat = Math.min(s * 0.5, 0.6);
  const mutedSat = Math.min(s * 0.4, 0.3);

  // Поверхности. Шкала 0–240; шаги взяты из «Космоса» и «Заката».
  const bg = isDark ? tone(h, surfaceSat, 12) : tone(h, surfaceSat * 0.55, 228);
  const card = isDark ? tone(h, surfaceSat * 0.9, 26) : tone(h, surfaceSat * 0.35, 238);
  const panel = deriveCardLine(card);
  const cardInset = isDark ? tone(h, surfaceSat * 0.85, 34) : tone(h, surfaceSat * 0.3, 233);

  // Текст: светлый на тёмной основе и наоборот. Второстепенный отходит
  // к середине — он обязан читаться, но тише основного.
  const text = isDark ? tone(h, textSat * 0.35, 228) : tone(h, textSat * 0.5, 26);
  const muted = isDark ? tone(h, mutedSat, 158) : tone(h, mutedSat, 92);
  // Иконки чуть ярче подписей: они мельче и теряются наравне с текстом.
  const icon = isDark ? tone(h, mutedSat * 1.2, 172) : tone(h, mutedSat * 1.1, 80);

  // Акцент тянется к ЗОЛОТУ, а не отходит от главного цвета на
  // фиксированный угол. Золото — фирменная деталь проекта (засечки
  // заголовков, орнаментальные разделители, звезда рейтинга), и во всех
  // готовых темах акцент именно тёплый. Отход «главный +40° по RYB»
  // пробовался первым и уводил зелёный главный цвет в синий акцент —
  // тема переставала быть узнаваемой.
  //
  // Подмешиваем 10 % оттенка главного цвета: золото получает подтон
  // темы и не выглядит наклейкой. На «Закате» (главный 8°) формула
  // даёт 38° — ровно тот акцент, что подобран в теме вручную.
  const accentHue = towardHue(GOLD_HUE, h, 0.1);
  const accentSat = Math.max(Math.min(s * 1.05, 0.92), 0.62);
  const accent = tone(accentHue, accentSat, isDark ? 138 : 126);
  const accentSoft = tone(accentHue, Math.min(accentSat, 0.8), isDark ? 208 : 216);
  const accentDeep = tone(accentHue, accentSat, isDark ? 108 : 96);

  return {
    bg,
    card,
    cardAlt: isDark ? tone(h, surfaceSat * 0.9, 21) : card,
    cardLine: deriveCardLine(card),
    divider: deriveDivider(card, isDark),
    cardInset,
    panel,
    text,
    muted,
    icon,
    accent,
    accentSoft,
    accentDeep,
    statusActive: fit(SEMANTIC_BASE.statusActive, isDark),
    statusBreak: fit(SEMANTIC_BASE.statusBreak, isDark),
    statusFlexible: fit(SEMANTIC_BASE.statusFlexible, isDark),
    // «Не работает» — единственный намеренно нейтральный статус:
    // он должен гаснуть, поэтому берёт подтон темы, а не свой цвет.
    statusOffline: isDark ? tone(h, mutedSat * 0.6, 120) : tone(h, mutedSat * 0.6, 132),
    roleSpecialist: fit(SEMANTIC_BASE.roleSpecialist, isDark),
    roleAdmin: fit(SEMANTIC_BASE.roleAdmin, isDark),
    roleVerified: fit(SEMANTIC_BASE.roleVerified, isDark),
    danger: fit(SEMANTIC_BASE.danger, isDark),
    // Шапка каталога — градиент от главного цвета к соседнему по RYB:
    // два тона одной семьи вместо случайной пары.
    heroFrom: tone(h, Math.min(s, 0.8), isDark ? 72 : 108),
    heroTo: tone(shiftRyb(h, -25), Math.min(s, 0.75), isDark ? 88 : 126),
    // Карта: кластеры — главным цветом, дома — акцентом. Так метки
    // разных типов различаются и без подписи.
    mapCluster: ui,
    mapHouse: accent,
  };
}
