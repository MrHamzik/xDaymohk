import type { EffectSettings } from '@/lib/settings/types';
import { ensureFontLoaded } from '@/lib/fonts';
import {
  DEFAULT_GRADIENTS, FONT_FAMILIES,
  type FontFamilyId, type ThemeColors, type ThemeGradients,
} from '@/lib/settings/types';

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
function mix(hex: string, target: string, amount: number): string {
  const from = hex.replace('#', '');
  const to = target.replace('#', '');
  const channel = (index: number) => {
    const a = parseInt(from.slice(index * 2, index * 2 + 2), 16);
    const b = parseInt(to.slice(index * 2, index * 2 + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * Ступени шкалы Tailwind относительно базового цвета (ступень 600).
 *
 * Значения подобраны так, чтобы 50/100 оставались очень светлыми
 * подложками, а 900/950 — почти чёрными фонами для тёмной темы:
 * именно в таком качестве их использует разметка.
 * Отрицательное число — подмешиваем белый, положительное — чёрный.
 */
const RAMP: Array<[step: number, amount: number]> = [
  [50, -0.94], [100, -0.86], [200, -0.7], [300, -0.5], [400, -0.28],
  [500, -0.13], [600, 0], [700, 0.18], [800, 0.36], [900, 0.52], [950, 0.68],
];

function applyRamp(
  set: (name: string, value: string) => void,
  name: 'emerald' | 'teal' | 'green' | 'slate',
  base: string,
): void {
  for (const [step, amount] of RAMP) {
    const value = amount === 0
      ? base
      : mix(base, amount < 0 ? '#ffffff' : '#000000', Math.abs(amount));
    set(`--color-${name}-${step}`, value);
  }
}

/**
 * Нейтральная шкала slate под оттенок темы.
 *
 * В светлой теме идёт как обычно: 50 — почти фон, 900 — почти текст.
 * В тёмной — переворачивается: разметка пишет bg-slate-50 для светлых
 * подложек, и если оставить их светлыми, тёмная тема пойдёт белыми
 * заплатками. Поэтому там 50 = самый тёмный конец.
 */
function applyNeutralRamp(
  set: (name: string, value: string) => void,
  colors: ThemeColors,
  isDark: boolean,
): void {
  // Только светлый конец шкалы: 50…400 — это фоны, подложки и границы,
  // они обязаны подхватывать оттенок темы.
  //
  // Ступени 500…950 НЕ трогаем. В разметке они означают «тёмное»
  // независимо от темы: bg-slate-900 у всплывающей подсказки идёт в
  // паре с text-white, а bg-slate-900/60 — это затемняющая подложка
  // модальных окон. Инвертировав их в тёмных темах, мы сделали бы
  // подсказку белой с белым текстом, а подложку — светлой вспышкой.
  const steps = [50, 100, 200, 300];
  for (const [index, step] of steps.entries()) {
    const t = index / (steps.length - 1); // 0 → ближе к фону, 1 → к тексту
    const value = isDark
      // Тёмная: от полотна вглубь, к подложкам карточек.
      ? mix(colors.bg, colors.text, 0.05 + t * 0.16)
      // Светлая: от фона страницы к границам.
      : mix(colors.bg, colors.text, 0.02 + t * 0.34);
    set(`--color-slate-${step}`, value);
  }

  // Ступень 400 — исключение: в разметке это ТЕКСТ, а не поверхность.
  // 115 упоминаний text-slate-400 (счётчик символов «120/500», подписи
  // «Категория:», плейсхолдеры) против одного bg-slate-400.
  //
  // Пока она считалась по общей формуле, на тёмных темах выходила
  // mix(bg, text, 0.21) — то есть почти цвет фона. Отсюда замечание:
  // подписи под полями «описание», «WhatsApp», «Telegram» оставались
  // тёмными и не подчинялись теме. Берём приглушённый текст темы и
  // гасим его на четверть — он остаётся тише основного, но читается.
  set('--color-slate-400', mix(colors.muted, colors.card, 0.25));
}

/** Все переменные, которыми управляет пользовательская тема. */
const MANAGED_PROPERTIES = [
  '--background', '--foreground', '--border-dark-soft',
  '--smk-panel',
  '--smk-card-a', '--smk-card-b', '--smk-card-line', '--smk-card-inset',
  '--smk-field',
  '--smk-divider',
  '--smk-muted', '--smk-muted-bright', '--smk-icon',
  '--smk-surface', '--smk-surface-soft',
  '--smk-gold', '--smk-gold-soft', '--smk-gold-deep', '--smk-gold-rgb',
  '--smk-hairline', '--smk-hairline-strong',
  '--color-zinc-950', '--color-zinc-900', '--color-zinc-800', '--color-zinc-700',
  '--color-zinc-100', '--color-zinc-200', '--color-zinc-300',
  '--color-zinc-400', '--color-zinc-500', '--color-zinc-600',
  '--smk-status-auto', '--smk-status-auto-deep',
  '--smk-status-active', '--smk-status-active-deep',
  '--smk-status-break', '--smk-status-break-deep',
  '--smk-status-flexible', '--smk-status-flexible-deep',
  '--smk-status-offline', '--smk-status-offline-deep',
  '--smk-role-specialist', '--smk-role-admin', '--smk-role-verified',
  '--smk-map-cluster',
  '--smk-note-info', '--smk-note-info-bg',
  '--smk-note-warn', '--smk-note-warn-bg',
  '--smk-note-danger', '--smk-note-danger-bg',
  '--smk-note-success', '--smk-note-success-bg',
  '--smk-danger-rgb',
  // Акцент интерфейса: Tailwind v4 держит палитру в переменных, поэтому
  // подмена --color-emerald-* перекрашивает все утилиты emerald разом.
  // Нужна ВСЯ шкала: светлые 50/100 идут на подложки бейджей
  // («Личная анкета», время до намаза), тёмные 900/950 — на их
  // ночные варианты. Без них зелёный оставался в десятках мест.
  '--color-emerald-50', '--color-emerald-100', '--color-emerald-200',
  '--color-emerald-300', '--color-emerald-400', '--color-emerald-500',
  '--color-emerald-600', '--color-emerald-700', '--color-emerald-800',
  '--color-emerald-900', '--color-emerald-950',
  '--color-teal-50', '--color-teal-100', '--color-teal-200',
  '--color-teal-300', '--color-teal-400', '--color-teal-500',
  '--color-teal-600', '--color-teal-700', '--color-teal-800',
  '--color-teal-900', '--color-teal-950',
  '--color-green-50', '--color-green-100', '--color-green-200',
  '--color-green-300', '--color-green-400', '--color-green-500',
  '--color-green-600', '--color-green-700', '--color-green-800',
  '--color-green-900', '--color-green-950',
  // Нейтральная шкала: в разметке это 1550 упоминаний — фон страницы,
  // подложки, текст, границы. Без её подмены светлые темы оставались
  // «цветными пятнами на холодном сером», а белый — чисто белым.
  '--color-slate-50', '--color-slate-100', '--color-slate-200',
  '--color-slate-300', '--color-slate-400', '--color-slate-500',
  '--color-slate-600', '--color-slate-700', '--color-slate-800',
  '--color-slate-900', '--color-slate-950',
  // Семантические переменные проекта, завязанные на зелёный.
  '--border-green-dark',
  '--smk-hero-gradient',
  '--smk-rail-gradient',
  // Градиенты поверхностей (п.21). Сбрасывать обязательно: иначе
  // переход, включённый в одной теме, останется висеть в следующей.
  '--smk-grad-bg',
  '--smk-grad-card',
  '--smk-grad-surface',
  '--smk-grad-button',
];

export function applyThemeColors(
  colors: ThemeColors,
  isDark: boolean,
  glass = false,
  gradients?: ThemeGradients,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  // Сначала СНИМАЕМ всё, что писала прошлая тема, и только потом
  // пишем заново.
  //
  // Без этого смена основы «тёмная ↔ светлая» ломала оформление:
  // текстовые ступени zinc-100…600 задаются только в тёмной ветке, а
  // slate-500…900 — только в светлой. При переключении инлайновые
  // значения прошлой ветки оставались на :root и перебивали каскад из
  // globals.css — светлая тема получала белый текст от тёмной, и
  // наоборот. Свойство, которое новая ветка не выставит, обязано
  // вернуться к значению из CSS, а не «залипнуть».
  for (const property of MANAGED_PROPERTIES) root.style.removeProperty(property);

  // Класс .dark по-прежнему нужен: на нём держатся сотни dark:-утилит
  // Tailwind, переписать их темой невозможно.
  root.classList.toggle('dark', isDark);
  // Стеклянный режим — отдельный класс: прозрачность и backdrop-filter
  // описаны в globals.css и выводятся из тех же переменных темы.
  root.classList.toggle('smk-glass', glass);
  // Тема активна — включаем правила для поверхностей (.bg-white и др.).
  root.classList.add('smk-themed');
  root.style.colorScheme = isDark ? 'dark' : 'light';

  // Порядок ступеней обязан оставаться монотонным: 700 — самая светлая
  // поверхность, 950 — самая тёмная. Раньше 700 получал cardInset
  // (подложку строк), которая почти равна карточке, — и выключенный
  // тумблер с границами пропадал, хотя в светлой теме был виден.
  //
  // Теперь 700 выводим отдельно: отступаем от карточки в сторону
  // текста. Для тёмной темы это шаг к белому, для светлой — к чёрному,
  // поэтому одна формула работает в обеих.
  const surfaceStep = mix(colors.card, isDark ? '#ffffff' : '#000000', 0.13);

  // ── Семантические слоты: именно они рисуют фон и текст страницы ──
  set('--background', colors.bg);
  set('--foreground', colors.text);
  // Все обводки читают один слот. --smk-hairline-strong задаётся ниже
  // из cardLine, поэтому «Обводка» в палитре действительно меняет ВСЕ
  // рамки: карточек, панелей, полей и списков.
  set('--border-dark-soft', colors.cardLine);

  // ── Источники, на которые ссылаются утилиты zinc ────────────────
  // Нейтральная шкала zinc в разметке используется ПО СМЫСЛУ, а не по
  // номеру: 950 и 900 — это фоны панелей (мини-профиль, виджет намаза,
  // выпадающие списки), 800 — карточки и поля, 700 — границы и тумблер.
  //
  // Поэтому 900 привязан к фону, а не к «карточке (низ)»: раньше он
  // получал cardAlt, и слот «Карточка (низ)» красил панели бокового
  // меню — пользователь справедливо не понимал, где этот цвет вообще
  // применяется.
  set('--color-zinc-950', colors.bg);
  // 900 — панели (мини-профиль, виджет намаза, блок иконок).
  set('--color-zinc-900', colors.panel);
  // zinc-800 в разметке — это вторичные ПОВЕРХНОСТИ: кнопки-иконки,
  // плитки времён намаза, блоки колокольчика (16 div и 10 button
  // против единичных input). Поэтому здесь подложка строк, а не поля
  // ввода: привязка к field заставляла слот «Поля заполнения» красить
  // половину интерфейса. Сами input красит правило в globals.css.
  set('--color-zinc-800', colors.cardInset);
  set('--color-zinc-700', surfaceStep);

  // Текстовые ступени. Разметка пишет dark:text-zinc-300/400 для
  // приглушённых подписей — до этого они оставались стандартно-серыми,
  // и слот «Приглушённый текст» не давал видимого эффекта.
  if (isDark) {
    // 100/200 — основной текст, 300/400 — второстепенный.
    // Между собой их НЕ смешиваем: иначе правка «Основного текста»
    // тянула за собой подписи, и наоборот.
    set('--color-zinc-100', colors.text);
    set('--color-zinc-200', colors.text);
    set('--color-zinc-300', colors.muted);
    set('--color-zinc-400', colors.muted);
    set('--color-zinc-500', mix(colors.muted, colors.card, 0.25));
    set('--color-zinc-600', mix(colors.muted, colors.card, 0.5));
  }

  // Светлые темы пишут текст через slate-500…900.
  if (!isDark) {
    // 500/600 — второстепенный текст, 800/900 — основной.
    // 700 промежуточная: её разметка использует и там, и там.
    set('--color-slate-500', colors.muted);
    set('--color-slate-600', colors.muted);
    set('--color-slate-700', mix(colors.muted, colors.text, 0.5));
    set('--color-slate-800', colors.text);
    set('--color-slate-900', colors.text);
  }

  // ── Карточка ────────────────────────────────────────────────────
  set('--smk-panel', colors.panel);
  set('--smk-card-a', colors.card);
  set('--smk-card-b', colors.cardAlt);
  set('--smk-card-line', colors.cardLine);
  // Разделитель — линия ВНУТРИ блока. Отдельный слот: контур карточки
  // должен быть еле заметен, а линия между строками обязана читаться,
  // и одно значение на две задачи всегда проигрывало одной из них.
  set('--smk-divider', colors.divider);
  set('--smk-card-inset', colors.cardInset);
  // Поля заполнения: свой слот, мягче подложки строк.
  set('--smk-field', colors.field);
  set('--smk-muted', colors.muted);
  // Иконки строк, звезда рейтинга, стрелка карточки. Отдельный слот:
  // раньше значение смешивалось из text и muted, и настроить иконки
  // независимо было нельзя — они тянулись за текстом.
  set('--smk-muted-bright', colors.icon);
  set('--smk-icon', colors.icon);
  // Каркас: шапка, нижняя навигация, боковое меню. Свой слот — правка
  // карточек больше не перекрашивает оболочку приложения.
  set('--smk-surface', colors.surface);
  set('--smk-surface-soft', colors.cardInset);

  // Волосяные линии выводим из основы: на тёмной теме нужен белый
  // штрих, на светлой — чёрный, иначе разделители пропадают.
  // Штрих выводим из слота «Обводка»: он и есть единственный источник
  // для всех линий. Слабый вариант — тот же цвет с меньшей плотностью.
  set('--smk-hairline', mix(colors.card, colors.cardLine, 0.55));
  set('--smk-hairline-strong', colors.cardLine);

  // ── Акцент ──────────────────────────────────────────────────────
  set('--smk-gold', colors.accent);
  set('--smk-gold-soft', colors.accentSoft);
  set('--smk-gold-deep', colors.accentDeep);
  set('--smk-gold-rgb', hexToRgbChannels(colors.accent));

  // ── Статусы и роли ──────────────────────────────────────────────
  set('--smk-status-auto', colors.statusAuto);
  set('--smk-status-auto-deep', mix(colors.statusAuto, '#000000', 0.28));
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

  set('--smk-danger-rgb', hexToRgbChannels(colors.danger));

  // ── Подсказки и предупреждения ──────────────────────────────────
  // Четыре ПАРЫ «текст + свой фон»: блок целиком окрашен смыслом, а не
  // отличается одной буквой. Раньше эти блоки красились утилитами
  // bg-sky-50 / bg-amber-50 / bg-rose-50 и в тёмных темах оставались
  // светлыми пятнами с нечитаемым текстом.
  set('--smk-note-info', colors.noteInfo);
  set('--smk-note-info-bg', colors.noteInfoBg);
  set('--smk-note-warn', colors.noteWarn);
  set('--smk-note-warn-bg', colors.noteWarnBg);
  set('--smk-note-danger', colors.noteDanger);
  set('--smk-note-danger-bg', colors.noteDangerBg);
  set('--smk-note-success', colors.noteSuccess);
  set('--smk-note-success-bg', colors.noteSuccessBg);

  // ── Акцент интерфейса (зелёный по умолчанию) ────────────────────
  // Утилиты вида bg-emerald-600 компилируются в var(--color-emerald-600),
  // поэтому подмена переменных перекрашивает иконки меню, ползунки,
  // кнопки и кольца фокуса без правки сотен классов в разметке.
  //
  // Генерируем ВСЮ шкалу 50…950: светлые ступени используются как
  // подложки («Личная анкета», время до намаза, карточка «Даймохк»),
  // тёмные — их ночные варианты. Раньше подменялись только 400–800,
  // и в этих местах оставался исходный зелёный.
  applyRamp(set, 'emerald', colors.ui);
  // teal и green идут парой с emerald в градиентах и старых классах —
  // держим их в той же гамме, иначе на фоне темы они выпадают.
  applyRamp(set, 'teal', mix(colors.ui, '#000000', 0.06));
  applyRamp(set, 'green', colors.ui);

  // --color-white НЕ подменяем. Tailwind отдаёт из него и bg-white, и
  // text-white (386 упоминаний в разметке): подменив его цветом
  // карточки, мы красили белый текст в цвет фона — в тёмных темах он
  // становился почти чёрным и пропадал. Поверхности перекрашивает
  // правило .bg-white ниже, а текст остаётся белым.

  // ── Нейтральная шкала под оттенок темы ──────────────────────────
  // Серые в теме не бывают «просто серыми»: у Природы они зеленоватые,
  // у Янтаря кремовые, у Космоса синеватые. Строим шкалу от muted —
  // он уже несёт нужный подтон, — а белый заменяем цветом карточки.
  //
  // Для тёмных тем шкала инвертируется: там slate-50 должен быть
  // тёмным (это подложка), а slate-900 — светлым (это текст).
  applyNeutralRamp(set, colors, isDark);

  // Семантические переменные проекта, завязанные на зелёный.
  set('--border-green-dark', mix(colors.ui, '#000000', 0.34));
  // Градиент шапки — между двумя настроенными цветами, с СИММЕТРИЧНЫМ
  // затемнением обоих краёв на 12 %.
  //
  // История: сначала формула брала не те цвета и гасила края по-разному
  // (начало на 55 %, конец на 20 %) — обе крайние точки выходили темнее
  // середины, отсюда «уходит в тёмное на краях». Слот «Шапка каталога
  // (начало)» при этом не использовался вовсе: вместо него шёл главный
  // цвет, и правка heroFrom не давала эффекта.
  //
  // Чистый heroFrom → heroTo убрал перелом, но открыл вторую проблему:
  // тёмные края маскировали слабый контраст белого текста, и на светлых
  // темах («Янтарь», «Моно») он падал до 1.8 при норме WCAG AA 4.5.
  // Поэтому возвращаем затемнение — но одинаковое с обеих сторон, так
  // что перелома яркости не возникает, а цвета остаются узнаваемыми.
  const HERO_SHADE = 0.12;
  set(
    '--smk-hero-gradient',
    `linear-gradient(135deg, ${mix(colors.heroFrom, '#000000', HERO_SHADE)} 0%, ${mix(colors.heroTo, '#000000', HERO_SHADE)} 100%)`,
  );
  // Боковое меню на ПК — тот же цвет, что и выезжающее меню на телефоне
  // (п.10). На телефоне подложка берётся из --smk-surface («каркас»:
  // шапка, меню), а на ПК стоял --smk-panel — подложка панелей и
  // подвалов карточек. В светлой теме это #f5f5f5 против #ffffff:
  // меню на компьютере выглядело серым рядом с белым на телефоне.
  //
  // Переменная всё ещё объявлена, поэтому сбрасывать её при смене темы
  // (RESET_VARS) по-прежнему нужно.
  set('--smk-rail-gradient', colors.surface);

  // ── Главная карточка каталога и карта ───────────────────────────
  set('--smk-map-cluster', colors.mapCluster);

  applyThemeGradients(colors, isDark, gradients, set);
}

/**
 * Градиенты крупных поверхностей (п.21).
 *
 * Второй цвет не хранится в теме, а выводится из основного: сдвигаем
 * светлоту на strength. Так пользователю не нужно подбирать по паре
 * согласованных цветов на каждую поверхность — достаточно включить
 * переход и задать силу.
 *
 * Направление сдвига зависит от основы темы: на тёмных уводим край
 * вверх (к белому), на светлых — вниз (к чёрному). Одинаковая
 * арифметика для обоих случаев давала бы либо грязь на светлых темах,
 * либо неразличимый переход на тёмных.
 *
 * Выключенная поверхность получает СПЛОШНОЙ цвет тем же свойством, а
 * не пустую строку: CSS-правило одно, и ему всегда есть что показать.
 */
function applyThemeGradients(
  colors: ThemeColors,
  isDark: boolean,
  gradients: ThemeGradients | undefined,
  set: (name: string, value: string) => void,
): void {
  const config = gradients ?? DEFAULT_GRADIENTS;
  // Сила 0..100 → сдвиг светлоты не больше 45 %: дальше поверхность
  // перестаёт быть собой и спорит с соседними.
  const amount = Math.min(Math.max(config.strength, 0), 100) / 100 * 0.45;
  const edge = isDark ? '#ffffff' : '#000000';
  const angle = config.angle;

  const paint = (name: string, base: string, on: boolean) => {
    set(name, on ? `linear-gradient(${angle}deg, ${base} 0%, ${mix(base, edge, amount)} 100%)` : base);
  };

  paint('--smk-grad-bg', colors.bg, config.bg);
  paint('--smk-grad-card', colors.card, config.card);
  paint('--smk-grad-surface', colors.surface, config.surface);
  paint('--smk-grad-button', colors.ui, config.button);
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
  root.classList.remove('smk-glass');
  root.classList.remove('smk-themed');
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

  // Выбранное семейство догружается только сейчас: Manrope стоит в
  // <head> всегда, остальные раньше тянулись одним блокирующим
  // @import на каждого посетителя (см. lib/fonts.ts).
  ensureFontLoaded(fontFamily);
}

/**
 * Применение визуальных эффектов.
 *
 * Каждый эффект — это множитель 0…1 в CSS-переменной. Правила в
 * globals.css умножают на него свои значения, поэтому выключение
 * эффекта не требует отдельных классов и не ломает раскладку: тень
 * просто становится нулевой, размытие — нулевым, анимация — мгновенной.
 *
 * Почему переменные, а не классы вроде .no-shadow: эффектов шесть, и
 * комбинаций у них 2^6. Классами это превратилось бы в кашу, а
 * множитель позволяет ещё и промежуточные значения — «тени послабее».
 */
export function applyEffects(effects: EffectSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const ratio = (value: number) => String(Math.min(100, Math.max(0, value)) / 100);

  root.style.setProperty('--fx-shadow', ratio(effects.shadow));
  root.style.setProperty('--fx-glow', ratio(effects.glow));
  root.style.setProperty('--fx-gradient', ratio(effects.gradient));
  root.style.setProperty('--fx-pattern', ratio(effects.pattern));
  root.style.setProperty('--fx-motion', ratio(effects.motion));

  // Размытие задаём в пикселях: backdrop-filter не умножается на
  // безразмерный множитель, ему нужна конкретная длина.
  root.style.setProperty('--fx-blur', `${(effects.blur / 100) * 18}px`);

  // Полное отключение анимаций — отдельным классом: свойство
  // animation-duration: 0s надёжнее множителя, оно останавливает и
  // бесконечные анимации вроде пульсации статуса.
  root.classList.toggle('fx-no-motion', effects.motion === 0);
}

/** Множитель скругления карточек: 0 — углы, 200 — вдвое круглее. */
export function applyRadiusScale(scale: number): void {
  if (typeof document === 'undefined') return;
  const value = Math.min(200, Math.max(0, Number.isFinite(scale) ? scale : 100));
  document.documentElement.style.setProperty('--smk-radius-scale', String(value / 100));
}
