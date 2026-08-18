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
 *    секциями листа, орнаментальные полосы. Она структурирует
 *    содержимое, но не должна спорить с ним. Правило: насыщенность
 *    делится пополам, яркость умножается на 1.5 на тёмных темах и
 *    уменьшается на 11 единиц (0–240) на светлых.
 *
 *    Изначально было ×2 и −19 — на тёмных темах линии выходили с
 *    контрастом 1.5 и «резали» карточку на полосы. Вдвое мягче (1.20)
 *    достаточно, чтобы граница читалась, но карточка осталась цельной.
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
const DIVIDER_LIGHT_STEP = 11;
/** Множитель светлоты разделителя на тёмных темах. */
const DIVIDER_DARK_FACTOR = 1.5;

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
  const next = isDark ? scaled * DIVIDER_DARK_FACTOR : scaled - DIVIDER_LIGHT_STEP;
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

/** Относительная яркость по WCAG — основа расчёта контраста. */
function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(clean.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Коэффициент контраста двух цветов (1 — совпадают, 21 — чёрный/белый). */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Подогнать светлоту цвета так, чтобы контраст к фону был не ниже
 * заданного.
 *
 * Нужно потому, что HSL-светлота НЕ равна воспринимаемой яркости: при
 * одинаковой L жёлтый выглядит much светлее синего. Из-за этого акцент
 * с фиксированной L=126 на светлом фоне давал контраст 1.37 для
 * жёлтого и 3.0 для оранжевого — то есть «золото» местами пропадало.
 * Двигаем светлоту шагами, пока не наберём нужный контраст.
 */
function ensureContrast(
  hex: string,
  background: string,
  minRatio: number,
  darken: boolean,
): string {
  const { h, s, l } = hexToHsl(hex);
  let lightness = l;
  for (let step = 0; step < 60; step += 1) {
    const candidate = hslToHex({ h, s, l: lightness });
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
    lightness += darken ? -0.01 : 0.01;
    if (lightness <= 0 || lightness >= 1) break;
  }
  return hslToHex({ h, s, l: Math.min(1, Math.max(0, lightness)) });
}

/** Собрать цвет: оттенок главного, своя насыщенность и яркость (0–240). */
function tone(h: number, saturation: number, lightness240: number): string {
  return hslToHex({ h, s: saturation, l: lightness240 / LIGHTNESS_SCALE });
}

/**
 * Подогнать смысловой цвет под тему.
 *
 * Смысл цвета сохраняется (красный «удалить» остаётся красным), но он
 * должен выглядеть частью темы, а не наклейкой из другого набора.
 * В готовых темах это видно прямо: «Админ» в «Космосе» — сиреневый
 * #c265e8, а не универсальный красный #ef4444; «Специалист» в «Закате»
 * — оранжевый #e58c2b. Раньше эти слоты не тонировались вовсе, и на
 * любой пользовательской теме оставались стандартные цвета — отсюда
 * замечание «админ и другие иконки не меняются».
 *
 * Оттенок тянем к главному цвету на `pull` (кратчайшей дугой), а
 * светлоту ставим в рабочий коридор темы.
 */
function tint(
  hex: string,
  uiHue: number,
  uiSat: number,
  isDark: boolean,
  pull: number,
  maxShift = 30,
): string {
  const { h, s, l } = hexToHsl(hex);
  // Долю сдвига ограничиваем ещё и абсолютом в градусах. Без потолка
  // доля 0.35 от красного к зелёному главному цвету (142°) давала 50° —
  // «Админ» становился жёлтым и переставал читаться как предупреждение.
  // 30° — ширина соседнего сектора на цветовом круге: подтон виден,
  // смысл цвета цел.
  const shift = ((uiHue - h + 540) % 360) - 180;
  const limited = Math.max(-maxShift, Math.min(maxShift, shift * pull));
  const hue = ((h + limited) % 360 + 360) % 360;
  // Насыщенность подтягиваем к главному цвету наполовину: у блёклого
  // ui смысловые цвета тоже приглушаются, у сочного — остаются сочными.
  const sat = Math.min(s * 0.6 + uiSat * 0.4, 0.85);
  const lightness = isDark ? Math.max(l, 0.56) : Math.min(l, 0.5);
  return hslToHex({ h: hue, s: sat, l: lightness });
}

/* ---------------------------------------------------------------------------
   Подсказки и предупреждения
   ---------------------------------------------------------------------------
   Блок-подсказка — это НЕ поверхность и не поле: у него своя задача —
   объяснить правило или предостеречь. Поэтому пять отдельных слотов:
   один общий фон и четыре цвета текста по смыслу сообщения.

   Почему фон один. Раньше каждый блок красился своей утилитой
   (bg-sky-50, bg-amber-50, bg-rose-50, bg-emerald-50) — в карточке
   задания подряд шли четыре разных по яркости пятна, и она рябила.
   Общий фон даёт им читаться одной семьёй, а смысл различают цвет
   текста и золотая засечка слева.

   Требование к контрасту: текст подсказки — мелкий (11 px), значит по
   WCAG AA нужен коэффициент 4.5. Ниже он и обеспечивается доводкой
   через ensureContrast.
--------------------------------------------------------------------------- */

/** Светлота фона подсказки по шкале 0–240: отход от карточки. */
const NOTE_BG_DARK_FACTOR = 1.5;
const NOTE_BG_LIGHT_STEP = 8;
/** Минимальный контраст текста подсказки к её фону (WCAG AA, мелкий текст). */
const NOTE_TEXT_MIN_CONTRAST = 4.5;

/**
 * Фон блока-подсказки: между полотном карточки и полем.
 *
 * Заметнее разделителя (иначе блок не читается как отдельный), но
 * мягче поля — подсказку не заполняют, её читают.
 */
export function deriveNoteBg(card: string, isDark: boolean): string {
  const { h, s, l } = hexToHsl(card);
  const scaled = l * LIGHTNESS_SCALE;
  const next = isDark
    ? Math.min(LIGHTNESS_SCALE, scaled * NOTE_BG_DARK_FACTOR)
    : Math.max(0, scaled - NOTE_BG_LIGHT_STEP);
  // Насыщенность чуть выше карточки: подтон темы в подсказке должен
  // читаться, иначе на светлых темах блок выходит просто серым.
  return hslToHex({ h, s: Math.min(s * 1.35, 0.7), l: next / LIGHTNESS_SCALE });
}

/** Опорные тона текста подсказок: смысл одинаков во всех темах. */
const NOTE_TEXT_BASE = {
  info: '#0369a1',
  warn: '#b45309',
  danger: '#be123c',
  success: '#047857',
};

/**
 * Цвет текста подсказки: смысловой тон, подтонированный темой и
 * доведённый по контрасту к фону подсказки.
 *
 * Подтон слабый (0.14) и с узким потолком: «опасно» обязано остаться
 * красным, иначе предупреждение перестаёт работать как сигнал.
 */
function deriveNoteText(
  base: string,
  noteBg: string,
  uiHue: number,
  uiSat: number,
  isDark: boolean,
): string {
  const tinted = tint(base, uiHue, uiSat, isDark, 0.14, 14);
  return ensureContrast(tinted, noteBg, NOTE_TEXT_MIN_CONTRAST, !isDark);
}

/** Все пять слотов подсказок разом: фон из карточки, тексты — из главного цвета. */
export interface NoteColors {
  noteBg: string;
  noteInfo: string;
  noteWarn: string;
  noteDanger: string;
  noteSuccess: string;
}

export function deriveNotes(card: string, ui: string, isDark: boolean): NoteColors {
  const noteBg = deriveNoteBg(card, isDark);
  const { h, s } = hexToHsl(ui);
  return {
    noteBg,
    noteInfo: deriveNoteText(NOTE_TEXT_BASE.info, noteBg, h, s, isDark),
    noteWarn: deriveNoteText(NOTE_TEXT_BASE.warn, noteBg, h, s, isDark),
    noteDanger: deriveNoteText(NOTE_TEXT_BASE.danger, noteBg, h, s, isDark),
    noteSuccess: deriveNoteText(NOTE_TEXT_BASE.success, noteBg, h, s, isDark),
  };
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
  field: string;
  panel: string;
  text: string;
  muted: string;
  icon: string;
  accent: string;
  accentSoft: string;
  accentDeep: string;
  statusAuto: string;
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
  noteBg: string;
  noteInfo: string;
  noteWarn: string;
  noteDanger: string;
  noteSuccess: string;
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

  // Насыщенность поверхностей берём ДОЛЕЙ от главного цвета, а не
  // «сколько-нибудь». Доли сняты с готовых тем — отношение S слота к
  // S главного цвета:
  //
  //            Космос  Закат  Природа  Янтарь
  //   bg        0.64    0.64    0.92     0.95
  //   card      0.56    0.48    1.25     0.84
  //   cardInset 0.47    0.34    0.81     0.85
  //   muted     0.37    0.41    0.40     0.31
  //   icon      0.78    0.76    0.43     0.33
  //
  // Прошлая версия сначала резала насыщенность вдвое (s * 0.55), а
  // затем умножала ещё на 0.35 — у светлых тем от подтона оставалось
  // 0…7 % вместо 60…85 %, и поверхности выходили почти серыми:
  // «глобальные цвета как будто не меняются». Потолок оставляем, но
  // высокий — он нужен лишь против кислотных значений.
  const surfaceSat = (ratio: number) => Math.min(s * ratio, 0.75);

  // Светлые темы держат подтон именно на насыщенности: белая карточка
  // #fbfefc в «Природе» имеет S=60 % при светлоте 238 — поэтому она
  // читается зеленоватой, а не белой.
  const bg = isDark ? tone(h, surfaceSat(0.64), 12) : tone(h, surfaceSat(0.93), 228);
  const card = isDark ? tone(h, surfaceSat(0.52), 26) : tone(h, surfaceSat(1.0), 238);
  // Панель на светлых темах уходит ВНИЗ от карточки: вверх упирается в
  // потолок и подвал сливается с полотном.
  const panel = derivePanel(card, isDark);
  // Подложка блоков заметнее разделителя: иначе карточка выглядит
  // одним сплошным пятном (см. deriveCardInset).
  const cardInset = deriveCardInset(card, isDark);
  // Подсказки: фон из карточки, тексты доводятся по контрасту к нему.
  const notes = deriveNotes(card, ui, isDark);

  // Текст: светлый на тёмной основе и наоборот. Светлота 228/63 взята
  // из эталонов — она даёт контраст к карточке около 15 на тёмных
  // темах и 8.5 на светлых, то есть выше требований WCAG AA с запасом.
  const text = isDark ? tone(h, surfaceSat(0.86), 228) : tone(h, surfaceSat(0.5), 63);
  const muted = isDark ? tone(h, surfaceSat(0.38), 158) : tone(h, surfaceSat(0.36), 90);
  // Иконки заметно цветнее подписей: в «Космосе» доля 0.78 против 0.37
  // у muted — именно это делает иконки «живыми», а не серыми. На
  // светлых темах они, наоборот, приглушены.
  const icon = isDark ? tone(h, surfaceSat(0.77), 168) : tone(h, surfaceSat(0.4), 82);

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
  // Светлота по шкале — только отправная точка: HSL-яркость не равна
  // воспринимаемой, и жёлтое золото при той же L тонуло на белом, а
  // синий акцент был слишком тёмным. Доводим по контрасту к карточке:
  // ориентиры взяты с готовых тем (светлые ~1.8, тёмные ~9).
  const accentRaw = tone(accentHue, accentSat, isDark ? 138 : 126);
  const accent = ensureContrast(accentRaw, card, isDark ? 7 : 1.8, !isDark);
  const accentSoft = tone(accentHue, Math.min(accentSat, 0.8), isDark ? 208 : 216);
  const accentDeep = ensureContrast(
    tone(accentHue, accentSat, isDark ? 108 : 96),
    card,
    isDark ? 4.5 : 3,
    !isDark,
  );

  return {
    bg,
    card,
    cardAlt: isDark ? tone(h, surfaceSat(0.52), 21) : card,
    cardLine: deriveCardLine(card),
    divider: deriveDivider(card, isDark),
    cardInset,
    field: deriveField(card, isDark),
    panel,
    text,
    muted,
    icon,
    accent,
    accentSoft,
    accentDeep,
    // «Автоматический» — это режим по умолчанию, а не сигнал: он
    // берёт ровно главный цвет темы и потому всегда «свой».
    statusAuto: ui,
    // Остальные статусы тянем к теме слабо (0.18): «работает» обязан
    // остаться узнаваемо зелёным, иначе значение статуса теряется.
    statusActive: tint(SEMANTIC_BASE.statusActive, h, s, isDark, 0.18),
    statusBreak: tint(SEMANTIC_BASE.statusBreak, h, s, isDark, 0.18),
    statusFlexible: tint(SEMANTIC_BASE.statusFlexible, h, s, isDark, 0.18),
    // «Не работает» — единственный намеренно нейтральный статус:
    // он должен гаснуть, поэтому берёт подтон темы, а не свой цвет.
    statusOffline: isDark
      ? tone(h, surfaceSat(0.25), 120)
      : tone(h, surfaceSat(0.25), 150),
    // Роли — бейджи оформления, а не сигналы безопасности, поэтому
    // подтон сильнее (0.35). Но «Админ» и «Опасное действие» держат
    // узкий потолок сдвига (14°): красный, уехавший на 30°, читается
    // уже как оранжевый, а предупреждение обязано оставаться красным.
    roleSpecialist: tint(SEMANTIC_BASE.roleSpecialist, h, s, isDark, 0.35),
    roleAdmin: tint(SEMANTIC_BASE.roleAdmin, h, s, isDark, 0.35, 14),
    // «Проверен» совпадает с главным цветом — как в «Космосе» и
    // «Янтаре», где roleVerified в точности равен ui.
    roleVerified: ui,
    danger: tint(SEMANTIC_BASE.danger, h, s, isDark, 0.12, 14),
    // Шапка каталога — градиент от главного цвета к соседнему по RYB:
    // два тона одной семьи вместо случайной пары.
    heroFrom: tone(h, Math.min(s, 0.8), isDark ? 72 : 108),
    heroTo: tone(shiftRyb(h, -25), Math.min(s, 0.75), isDark ? 88 : 126),
    // Карта: кластеры — главным цветом, дома — акцентом. Так метки
    // разных типов различаются и без подписи.
    mapCluster: ui,
    mapHouse: accent,
    // Подсказки: общий фон плюс четыре смысловых цвета текста,
    // доведённых по контрасту именно к этому фону.
    ...notes,
  };
}

/**
 * Читаемый цвет текста/иконки поверх произвольной подложки.
 *
 * Нужен там, где фон задаёт ПОЛЬЗОВАТЕЛЬ через палитру, а контент
 * поверх него рисуем мы. Жёстко белый значок ломался в теме «Чёрный»:
 * там акцент — чистый #ffffff, и белая иконка на белой плитке давала
 * контраст 1.00, то есть исчезала полностью.
 *
 * Сравниваем ФАКТИЧЕСКИЙ контраст обоих вариантов, а не яркость с
 * порогом 0.5: на средних тонах (голубой #4cacf0, серо-синий #94a3b8)
 * порог уверенно выбирает белый, хотя тёмный там читается лучше.
 */
export function readableOn(background: string): string {
  const dark = '#0a0a0a';
  const light = '#ffffff';
  return contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;
}

/** Шаг панели вниз на светлых темах, в единицах шкалы 0–240. */
const PANEL_LIGHT_STEP = 18;

/**
 * Панель и подвал карточки.
 *
 * Раньше панель считалась той же формулой, что обводка (карточка +9), и
 * на светлых темах упиралась в потолок: белая карточка #ffffff давала
 * #f5f5f5 при контрасте 1.09 — подвал сливался с полотном и визуально
 * пропадал.
 *
 * Направление зависит от основы. На тёмной теме панель светлее карточки
 * (там есть куда расти вверх, и это выглядит как приподнятая
 * поверхность). На светлой — темнее на 18 единиц: вверх от белого расти
 * некуда, а лёгкая тень снизу читается как отдельный блок.
 */
export function derivePanel(card: string, isDark: boolean): string {
  if (isDark) return deriveCardLine(card);
  const { h, s, l } = hexToHsl(card);
  const scaled = l * LIGHTNESS_SCALE - PANEL_LIGHT_STEP;
  return hslToHex({ h, s, l: Math.max(0, scaled) / LIGHTNESS_SCALE });
}

/** Шаг подложки строк вниз на светлых темах, шкала 0–240. */
const INSET_LIGHT_STEP = 20;
/** Множитель светлоты подложки на тёмных темах. */
const INSET_DARK_FACTOR = 1.9;

/**
 * Подложка строк и блоков внутри карточки (`cardInset`).
 *
 * Отличается от разделителя по задаче: разделитель — тонкая линия, ей
 * достаточно едва читаться; подложка занимает площадь и должна ЯВНО
 * отделять блок от полотна, иначе карточка выглядит одним сплошным
 * пятном — ровно та «монотонность», на которую жаловался заказчик.
 *
 * Поэтому шаг здесь вдвое больше, чем у разделителя: контраст к
 * карточке 1.15–1.40 против 1.10–1.25 у линии. Вместе они дают
 * иерархию: полотно → блок → линия внутри блока.
 */
export function deriveCardInset(card: string, isDark: boolean): string {
  const { h, s, l } = hexToHsl(card);
  const scaled = l * LIGHTNESS_SCALE;
  const next = isDark
    ? Math.min(LIGHTNESS_SCALE, scaled * INSET_DARK_FACTOR)
    : Math.max(0, scaled - INSET_LIGHT_STEP);
  return hslToHex({ h, s, l: next / LIGHTNESS_SCALE });
}

/**
 * Светлота поля на светлых темах — почти белая, но не белая (шкала 0–240).
 *
 * Раньше поле считалось шагом ВНИЗ от карточки (−14). У светлых тем фон
 * страницы (228) оказывался светлее поля (224): поле сливалось с фоном,
 * и форма читалась как одно пятно. Теперь поле — самая светлая
 * поверхность темы: выше карточки и заметно выше фона.
 *
 * 237 из 240 — «почти белый»: до чистого белого остаётся ровно тот зазор,
 * который нужен, чтобы поле не спорило с белыми иконками и текстом.
 */
const FIELD_LIGHT_TARGET = 237;
/**
 * Насыщенность поля на светлых темах — множитель к насыщенности карточки.
 *
 * На светлоте 237 подтон почти не виден: без усиления «Природа» и
 * «Янтарь» получали одинаково белые поля. Множитель возвращает оттенок
 * темы, потолок 0.6 не даёт полю стать цветным пятном.
 */
const FIELD_LIGHT_SAT_FACTOR = 1.6;
const FIELD_LIGHT_SAT_MAX = 0.6;
/** Множитель светлоты поля ввода на тёмных темах. */
const FIELD_DARK_FACTOR = 1.65;

/**
 * Поля заполнения (`field`): input, select, textarea и блоки, которые
 * читаются как «место для данных» — адрес в карточке задания, сведения
 * о человеке в анкете.
 *
 * Направление РАЗНОЕ у тёмных и светлых тем, и это намеренно.
 *
 *  • Тёмные: поле светлее карточки (×1.65) — «углубление» на тёмном
 *    подсвечивается, иначе его вовсе не видно.
 *  • Светлые: поле — самая светлая поверхность (237 из 240, почти
 *    белая), с усиленным подтоном темы. Прежний шаг вниз (−14) делал
 *    поле темнее фона страницы, и оно с ним сливалось.
 */
export function deriveField(card: string, isDark: boolean): string {
  const { h, s, l } = hexToHsl(card);
  if (isDark) {
    const next = Math.min(LIGHTNESS_SCALE, l * LIGHTNESS_SCALE * FIELD_DARK_FACTOR);
    return hslToHex({ h, s, l: next / LIGHTNESS_SCALE });
  }
  return hslToHex({
    h,
    s: Math.min(s * FIELD_LIGHT_SAT_FACTOR, FIELD_LIGHT_SAT_MAX),
    l: FIELD_LIGHT_TARGET / LIGHTNESS_SCALE,
  });
}
