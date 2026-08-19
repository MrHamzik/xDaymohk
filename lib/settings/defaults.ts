import {
  FONT_FAMILIES,
  MAX_CUSTOM_THEMES,
  NOTIFICATION_GROUPS,
  type CustomTheme,
  type FontFamilyId,
  type NotificationGroup,
  type NotificationPref,
  type ThemeColors,
  type UserSettings,
  type EffectSettings,
  DEFAULT_EFFECTS,
  EFFECT_KEYS,
} from '@/lib/settings/types';
import {
  deriveCardInset, deriveDivider, deriveField, deriveNotes, derivePanel,
} from '@/lib/settings/derive';

/**
 * Умолчания живут здесь, а не в DEFAULT-ах колонок Postgres.
 *
 * Причина: настройка, которой пользователь не касался, должна вести
 * себя как «включено» даже после добавления новой группы уведомлений.
 * Если бы умолчания фиксировались в БД при первом сохранении, любая
 * новая категория молчала бы у всех, кто открывал настройки раньше.
 */

/** Показываем и звучим по умолчанию: звук — только у важного. */
export const DEFAULT_NOTIFICATION_PREF: NotificationPref = { show: true, sound: false };

/** Звук по умолчанию включён там, где ждут быстрой реакции:
    задание могут перехватить, а такси — уехать. */
const SOUND_ON_BY_DEFAULT: NotificationGroup[] = ['tasks', 'taxi'];

export function defaultNotificationPrefs(): Record<NotificationGroup, NotificationPref> {
  const result = {} as Record<NotificationGroup, NotificationPref>;
  for (const group of NOTIFICATION_GROUPS) {
    result[group] = {
      show: true,
      sound: SOUND_ON_BY_DEFAULT.includes(group),
    };
  }
  return result;
}

export const DEFAULT_SETTINGS: UserSettings = {
  notificationPrefs: defaultNotificationPrefs(),
  autoActiveOnOpen: false,
  autoApproveExecutor: false,
  advancedMode: false,
  hideHints: false,
  themeId: 'light',
  customThemes: [],
  fontScale: 100,
  fontFamily: 'manrope',
  effects: { ...DEFAULT_EFFECTS },
};

/** Настройка группы с подстановкой умолчания для незаполненных ключей. */
export function prefFor(
  settings: UserSettings,
  group: NotificationGroup,
): NotificationPref {
  const stored = settings.notificationPrefs?.[group];
  if (!stored) {
    return { show: true, sound: SOUND_ON_BY_DEFAULT.includes(group) };
  }
  return {
    show: stored.show !== false,
    sound: stored.sound === true,
  };
}

/* ===========================================================================
   Готовые темы
   ---------------------------------------------------------------------------
   Светлая и тёмная повторяют текущее оформление приложения один в один —
   они не «ещё две темы», а то, что пользователь видит сегодня. «Космос» и
   «Закат» строятся по тем же слотам, поэтому переключение не ломает
   вёрстку: меняются только значения переменных.
   =========================================================================== */

/** Общие смысловые цвета: одинаковы во всех пресетах, но правятся в своих темах. */
const SEMANTIC = {
  // «Автоматический» = главный цвет темы: режим по расписанию — это
  // состояние «по умолчанию», и оно должно читаться как часть темы,
  // а не как ещё один смысловой сигнал.
  statusAuto: '#059669',
  statusActive: '#10b981',
  statusBreak: '#f59e0b',
  statusFlexible: '#0ea5e9',
  statusOffline: '#a1a1aa',
  roleSpecialist: '#10b981',
  roleAdmin: '#ef4444',
  roleVerified: '#3b82f6',
  danger: '#f43f5e',
  ui: '#059669',
};

export const PRESET_THEMES: Record<
  string,
  { name: string; isDark: boolean; glass?: boolean; colors: ThemeColors }
> = {
  light: {
    name: 'Светлая',
    isDark: false,
    colors: {
      bg: '#f8fafc',
      card: '#ffffff',
      surface: '#ffffff',
      panel: '#ececec',
      cardAlt: '#ffffff',
      cardLine: '#f5f5f5',
      divider: '#f3f3f3',
      cardInset: '#eaeaea',
      field: '#fcfcfc',
      text: '#0f172a',
      muted: '#57667c',
      icon: '#465369',
      accent: '#ffae00',
      accentSoft: '#ffedc4',
      accentDeep: '#ffcd6d',
      ...SEMANTIC,
      heroFrom: '#059669',
      heroTo: '#14b8a6',
      mapCluster: '#059669',
      mapHouse: '#f59e0b',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#1e5771',
      noteInfoBg: '#bfe6f7',
      noteWarn: '#71521e',
      noteWarnBg: '#f7e2bf',
      noteDanger: '#711e2c',
      noteDangerBg: '#f7bfc9',
      noteSuccess: '#1e7155',
      noteSuccessBg: '#bff7e4',
    },
  },
  dark: {
    name: 'Тёмная',
    isDark: true,
    colors: {
      bg: '#131313',
      card: '#1c1c20',
      surface: '#1c1c20',
      panel: '#25252a',
      cardAlt: '#161619',
      cardLine: '#25252a',
      divider: '#2b2b2e',
      cardInset: '#35353d',
      field: '#2e2e35',
      text: '#ffffff',
      muted: '#96969e',
      icon: '#b3b3b9',
      accent: '#ffae00',
      accentSoft: '#ffedc4',
      accentDeep: '#ffcd6d',
      ...SEMANTIC,
      heroFrom: '#047857',
      heroTo: '#0f766e',
      mapCluster: '#059669',
      mapHouse: '#f59e0b',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#86c3df',
      noteInfoBg: '#0b425b',
      noteWarn: '#dfbe86',
      noteWarnBg: '#5b3d0b',
      noteDanger: '#df8695',
      noteDangerBg: '#5b0b19',
      noteSuccess: '#86dfc1',
      noteSuccessBg: '#0b5b40',
    },
  },
  /**
   * Космос — глубокий космический синий.
   *
   * Круг RYB: база синий 240°, отход ±30° даёт звёздно-голубой 210°
   * (акцент) и индиго-фиолет 270° (интерфейс). Фон намеренно очень
   * тёмный и слегка синий, а не серый: «космос» — это глубина, поэтому
   * светлота полотна опущена до 5 %, насыщенность сохранена. Серые
   * здесь тоже синеватые — нейтрального серого в теме нет.
   */
  space: {
    name: 'Космос',
    isDark: true,
    colors: {
      bg: '#080713',
      card: '#121127',
      surface: '#121127',
      panel: '#181734',
      cardAlt: '#0d0b1d',
      cardLine: '#181734',
      divider: '#232232',
      cardInset: '#22204a',
      field: '#1e1c40',
      text: '#ebedfa',
      muted: '#9292bf',
      icon: '#81adda',
      accent: '#4cacf0',
      accentSoft: '#bfe0fb',
      accentDeep: '#2a6fa8',
      ui: '#6552e0',
      statusAuto: '#6552e0',
      statusActive: '#3fc9b0',
      statusBreak: '#e0a63c',
      statusFlexible: '#4cacf0',
      statusOffline: '#565578',
      roleSpecialist: '#3fc9b0',
      roleAdmin: '#c265e8',
      roleVerified: '#6552e0',
      danger: '#e05575',
      heroFrom: '#2a1f78',
      heroTo: '#2a6fa8',
      mapCluster: '#6552e0',
      mapHouse: '#4cacf0',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#86badf',
      noteInfoBg: '#0b3a5b',
      noteWarn: '#dfbf86',
      noteWarnBg: '#5b3e0b',
      noteDanger: '#df869b',
      noteDangerBg: '#5b0b1e',
      noteSuccess: '#86dfcf',
      noteSuccessBg: '#0b5b4c',
    },
  },
  /**
   * Закат — цвета настоящего заката, а не абстрактный «красный».
   *
   * Круг RYB: база красный 5°, отход ±30° даёт закатный алый 8°
   * (интерфейс) и солнечное золото 38° (акцент), плюс розовая дымка
   * 335° у второстепенных ролей. Полотно — тёплый винный сумрак:
   * то, во что окрашивается небо сразу после захода солнца.
   */
  sunset: {
    name: 'Закат',
    isDark: true,
    colors: {
      bg: '#1b090e',
      card: '#2e151b',
      surface: '#2e151b',
      panel: '#3b1b23',
      cardAlt: '#250e14',
      cardLine: '#3b1b23',
      divider: '#3c292d',
      cardInset: '#572833',
      field: '#4c232d',
      text: '#fbf2e9',
      muted: '#cba79a',
      icon: '#e2ba8d',
      accent: '#f6ae31',
      accentSoft: '#fcdfa8',
      accentDeep: '#ad421f',
      ui: '#e5472e',
      statusAuto: '#e5472e',
      statusActive: '#e58c2b',
      statusBreak: '#f6ae31',
      statusFlexible: '#3f9fa8',
      statusOffline: '#8a6259',
      roleSpecialist: '#e58c2b',
      roleAdmin: '#e0537f',
      roleVerified: '#f6ae31',
      danger: '#e5472e',
      heroFrom: '#8f1f2e',
      heroTo: '#e58c2b',
      mapCluster: '#e5472e',
      mapHouse: '#f6ae31',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#86d7df',
      noteInfoBg: '#0b545b',
      noteWarn: '#dfbe86',
      noteWarnBg: '#5b3d0b',
      noteDanger: '#df9286',
      noteDangerBg: '#5b160b',
      noteSuccess: '#86dfab',
      noteSuccessBg: '#0b5b2c',
    },
  },
  /**
   * Чёрный — не «тёмно-серый», а настоящий чёрный.
   *
   * Полотно #000: карточка отличается от фона не заливкой, а тонкой
   * светлой линией. Минимализм здесь означает почти полное отсутствие
   * цвета — единственный акцент белый, поэтому текст обязан быть
   * по-настоящему контрастным, иначе интерфейс станет нечитаемым.
   * Смысловые цвета оставлены (статусы), но приглушены до пастели:
   * на чистом чёрном насыщенные тона «звенят».
   */
  black: {
    name: 'Чёрный',
    isDark: true,
    colors: {
      bg: '#000000',
      card: '#0a0a0a',
      surface: '#0a0a0a',
      panel: '#141414',
      cardAlt: '#050505',
      cardLine: '#141414',
      divider: '#0f0f0f',
      cardInset: '#131313',
      field: '#111111',
      text: '#fafafa',
      muted: '#8f8f8f',
      // Акцент — белый: на чёрном он работает как золото на светлом.
      icon: '#b4b4b4',
      accent: '#ffffff',
      accentSoft: '#e5e5e5',
      accentDeep: '#a3a3a3',
      ui: '#3f3f46',
      statusAuto: '#3f3f46',
      statusActive: '#4ade80',
      statusBreak: '#facc15',
      statusFlexible: '#60a5fa',
      statusOffline: '#525252',
      roleSpecialist: '#e5e5e5',
      roleAdmin: '#f87171',
      roleVerified: '#a3a3a3',
      danger: '#ef4444',
      heroFrom: '#171717',
      heroTo: '#000000',
      mapCluster: '#3f3f46',
      mapHouse: '#a3a3a3',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#86aedf',
      noteInfoBg: '#0b2f5b',
      noteWarn: '#dfcd86',
      noteWarnBg: '#5b4b0b',
      noteDanger: '#df8686',
      noteDangerBg: '#5b0b0b',
      noteSuccess: '#86dfa7',
      noteSuccessBg: '#0b5b29',
    },
  },
  /**
   * Монохромный — светлая тема без единого цветного пятна.
   *
   * Отличается от «Чёрного» не яркостью, а подходом: там чёрный фон и
   * белый акцент, здесь бумажно-серая шкала. Цвет остаётся только у
   * статусов и опасного действия — убрать его совсем нельзя, иначе
   * «работает» и «не работает» будут неразличимы для пользователя.
   */
  mono: {
    name: 'Монохромный',
    isDark: false,
    colors: {
      bg: '#f7f7f8',
      card: '#ffffff',
      surface: '#ffffff',
      panel: '#ececec',
      cardAlt: '#fbfbfc',
      cardLine: '#f5f5f5',
      divider: '#f3f3f3',
      cardInset: '#eaeaea',
      field: '#fcfcfc',
      // Самый тёмный тон — графит, а не почти-чёрный: тема должна
      // читаться как «серая бумага», а не как чёрный текст на белом.
      text: '#3a3a42',
      muted: '#666670',
      icon: '#60606a',
      accent: '#6e6e78',
      accentSoft: '#dededf',
      accentDeep: '#55555e',
      ui: '#6e6e78',
      // Единственные цветные элементы: без них статус читался бы
      // только по подписи, а точка теряет смысл. Тона приглушены,
      // чтобы не спорить с серой гаммой.
      statusAuto: '#6e6e78',
      statusActive: '#4b9e6a',
      statusBreak: '#c0954a',
      statusFlexible: '#5b83b8',
      statusOffline: '#b4b4bc',
      roleSpecialist: '#6e6e78',
      roleAdmin: '#9a7278',
      roleVerified: '#7b7b86',
      danger: '#b1585c',
      heroFrom: '#8b8b95',
      heroTo: '#b4b4bc',
      mapCluster: '#6e6e78',
      mapHouse: '#b4b4bc',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#1e4271',
      noteInfoBg: '#bfd8f7',
      noteWarn: '#71531e',
      noteWarnBg: '#f7e3bf',
      noteDanger: '#711e22',
      noteDangerBg: '#f7bfc2',
      noteSuccess: '#1e713d',
      noteSuccessBg: '#bff7d4',
    },
  },
  /**
   * Стеклянный — серебристо-белый с прозрачными карточками.
   *
   * glass: true включает backdrop-filter: карточки пропускают фон и
   * размывают его. Поэтому фон намеренно не плоский, а голубовато-
   * серый: сквозь абсолютно белое полотно «стекло» не читалось бы.
   */
  glass: {
    name: 'Стеклянный',
    isDark: false,
    glass: true,
    colors: {
      bg: '#e8edf2',
      card: '#ffffff',
      surface: '#ffffff',
      panel: '#ececec',
      cardAlt: '#f6f9fc',
      cardLine: '#f5f5f5',
      divider: '#f3f3f3',
      cardInset: '#eaeaea',
      field: '#fcfcfc',
      text: '#1e293b',
      muted: '#526177',
      // Серебро с холодным отливом.
      icon: '#4c5a6f',
      accent: '#f2a60d',
      accentSoft: '#fce7b8',
      accentDeep: '#b87c07',
      ui: '#0ea5e9',
      statusAuto: '#0ea5e9',
      statusActive: '#0d9488',
      statusBreak: '#f59e0b',
      statusFlexible: '#0ea5e9',
      statusOffline: '#94a3b8',
      roleSpecialist: '#0d9488',
      roleAdmin: '#e11d48',
      roleVerified: '#0284c7',
      danger: '#e11d48',
      heroFrom: '#64748b',
      heroTo: '#0ea5e9',
      mapCluster: '#0ea5e9',
      mapHouse: '#94a3b8',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#1e5771',
      noteInfoBg: '#bfe6f7',
      noteWarn: '#71521e',
      noteWarnBg: '#f7e2bf',
      noteDanger: '#711e30',
      noteDangerBg: '#f7bfcc',
      noteSuccess: '#1e7140',
      noteSuccessBg: '#bff7d6',
    },
  },
  /**
   * Природа — светлая, небесная и позитивная.
   *
   * Круг RYB: база зелёный 130° (интерфейс — лист), отход даёт
   * небесно-голубой 195° (акцент).
   *
   * Поверхности осветлены: карточка #fbfefc, фон #edf8f2. Это НЕ
   * чистый белый и не нейтральный серый — у обоих зелёный подтон,
   * иначе тема распадается на «цветные пятна по холодной бумаге».
   * Текст при этом остаётся достаточно тёмным: осветлять его вместе
   * с фоном нельзя, контраст ушёл бы ниже нормы читаемости.
   */
  nature: {
    name: 'Природа',
    isDark: false,
    colors: {
      bg: '#edf8f2',
      card: '#fbfefc',
      surface: '#fbfefc',
      panel: '#dcf6e5',
      cardAlt: '#f4faf7',
      cardLine: '#ecfaf1',
      divider: '#edf5ef',
      cardInset: '#d9f6e3',
      field: '#fafefb',
      text: '#305545',
      muted: '#4b6f5e',
      icon: '#476c5b',
      accent: '#36a2c9',
      accentSoft: '#d6edf5',
      accentDeep: '#2f7893',
      ui: '#389f5d',
      statusAuto: '#389f5d',
      statusActive: '#38a85e',
      statusBreak: '#e49e25',
      statusFlexible: '#3ea6cc',
      statusOffline: '#a4b7ad',
      roleSpecialist: '#389f5d',
      roleAdmin: '#c96a5c',
      roleVerified: '#36a2c9',
      danger: '#c96a5c',
      heroFrom: '#389f5d',
      heroTo: '#36a2c9',
      mapCluster: '#389f5d',
      mapHouse: '#36a2c9',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#1e5b71',
      noteInfoBg: '#bfe8f7',
      noteWarn: '#71521e',
      noteWarnBg: '#f7e2bf',
      noteDanger: '#71291e',
      noteDangerBg: '#f7c7bf',
      noteSuccess: '#1e713a',
      noteSuccessBg: '#bff7d2',
    },
  },
  /**
   * Янтарь — светлая, тёплая и солнечная.
   *
   * Круг RYB: база жёлтый 50°, отход ±30° даёт охру 28° (интерфейс) и
   * лимонно-оливковый 80° (статус «работает»); акцент — золото 45°.
   *
   * Поверхности кремовые: карточка #fefdfb, фон #fbf6ea. Белый здесь
   * тёплый — на холодной бумаге золото и охра смотрелись бы
   * наклейками. Текст остаётся тёмным ради читаемости.
   */
  amber: {
    name: 'Янтарь',
    isDark: false,
    colors: {
      bg: '#fbf6ea',
      card: '#fefdfb',
      surface: '#fefdfb',
      panel: '#f6eedc',
      cardAlt: '#fcfaf2',
      cardLine: '#faf5ec',
      divider: '#f5f2ed',
      cardInset: '#f6ecd9',
      field: '#fefcfa',
      text: '#58442d',
      muted: '#78664c',
      icon: '#6f5d44',
      accent: '#1face0',
      accentSoft: '#c7ecf8',
      accentDeep: '#12789f',
      ui: '#db7924',
      statusAuto: '#db7924',
      statusActive: '#7c9f38',
      statusBreak: '#ecab13',
      statusFlexible: '#3d9ec2',
      statusOffline: '#b4ac9c',
      roleSpecialist: '#7c9f38',
      roleAdmin: '#c96248',
      roleVerified: '#db7924',
      danger: '#c96248',
      heroFrom: '#db7924',
      heroTo: '#edb91d',
      mapCluster: '#db7924',
      mapHouse: '#edb91d',
      // Подсказки: общий фон и четыре смысловых цвета текста
      // (контраст к фону не ниже 4.5 — текст мелкий).
      noteInfo: '#1e5a71',
      noteInfoBg: '#bfe8f7',
      noteWarn: '#71581e',
      noteWarnBg: '#f7e6bf',
      noteDanger: '#712f1e',
      noteDangerBg: '#f7cbbf',
      noteSuccess: '#55711e',
      noteSuccessBg: '#e4f7bf',
    },
  },
};

export const PRESET_THEME_IDS = Object.keys(PRESET_THEMES);

/** Тема по идентификатору: пресет или пользовательская. */
export function resolveTheme(
  themeId: string,
  customThemes: CustomTheme[],
): { name: string; isDark: boolean; glass?: boolean; colors: ThemeColors } {
  if (themeId.startsWith('custom:')) {
    const id = themeId.slice('custom:'.length);
    const found = customThemes.find((theme) => theme.id === id);
    if (found) {
      return {
        name: found.name, isDark: found.isDark, glass: found.glass, colors: found.colors,
      };
    }
    // Тему удалили, а ссылка осталась — не роняем интерфейс.
    return PRESET_THEMES.light;
  }
  return PRESET_THEMES[themeId] ?? PRESET_THEMES.light;
}

/* ===========================================================================
   Нормализация
   ---------------------------------------------------------------------------
   Данные приходят из БД (jsonb) и из localStorage — оба источника может
   испортить старая версия клиента или ручная правка. Поэтому всё, что
   попадает в состояние, проходит через приведение к допустимым значениям.
   =========================================================================== */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
}

export function normalizeColors(raw: unknown, base: ThemeColors): ThemeColors {
  const input = (raw ?? {}) as Partial<Record<keyof ThemeColors, unknown>>;
  const pick = (key: keyof ThemeColors) => safeColor(input[key], base[key]);
  return {
    bg: pick('bg'),
    card: pick('card'),
    surface: pick('surface'),
    cardAlt: pick('cardAlt'),
    cardLine: pick('cardLine'),
    divider: pick('divider'),
    cardInset: pick('cardInset'),
    field: pick('field'),
    panel: pick('panel'),
    icon: pick('icon'),
    text: pick('text'),
    muted: pick('muted'),
    accent: pick('accent'),
    accentSoft: pick('accentSoft'),
    accentDeep: pick('accentDeep'),
    danger: pick('danger'),
    ui: pick('ui'),
    statusAuto: pick('statusAuto'),
    statusActive: pick('statusActive'),
    statusBreak: pick('statusBreak'),
    statusFlexible: pick('statusFlexible'),
    statusOffline: pick('statusOffline'),
    roleSpecialist: pick('roleSpecialist'),
    roleAdmin: pick('roleAdmin'),
    roleVerified: pick('roleVerified'),
    heroFrom: pick('heroFrom'),
    heroTo: pick('heroTo'),
    mapCluster: pick('mapCluster'),
    mapHouse: pick('mapHouse'),
    noteInfo: pick('noteInfo'),
    noteInfoBg: pick('noteInfoBg'),
    noteWarn: pick('noteWarn'),
    noteWarnBg: pick('noteWarnBg'),
    noteDanger: pick('noteDanger'),
    noteDangerBg: pick('noteDangerBg'),
    noteSuccess: pick('noteSuccess'),
    noteSuccessBg: pick('noteSuccessBg'),
  };
}

function normalizeCustomThemes(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CUSTOM_THEMES)
    .map((item, index) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const isDark = entry.isDark !== false;
      const base = isDark ? PRESET_THEMES.dark.colors : PRESET_THEMES.light.colors;
      const colors = normalizeColors(entry.colors, base);
      // Темы, сохранённые до появления слота «Разделители», приходят без
      // него — и подставился бы divider ЧУЖОЙ темы (пресета-основы),
      // то есть линия от светлой темы внутри тёмной карточки. Выводим
      // его из карточки самой темы по общему правилу.
      const stored = (entry.colors ?? {}) as Record<string, unknown>;
      if (typeof stored.divider !== 'string') {
        colors.divider = deriveDivider(colors.card, isDark);
      }
      // То же для слота «Автоматический»: у тем, созданных до его
      // появления, он подтянулся бы от пресета-основы — зелёный из
      // светлой темы в фиолетовой пользовательской. Берём главный цвет
      // самой темы, как и во всех пресетах.
      if (typeof stored.statusAuto !== 'string') {
        colors.statusAuto = colors.ui;
      }
      // Панель у светлых тем раньше считалась как обводка и упиралась в
      // потолок — подвал карточки сливался с полотном. Пересчитываем
      // только если пользователь не задал цвет вручную.
      if (typeof stored.panel !== 'string') {
        colors.panel = derivePanel(colors.card, isDark);
      }
      // Разделители и подложка пересчитываются по смягчённым формулам:
      // прежние значения резали карточку на полосы. Ручные правки
      // пользователя не трогаем.
      if (typeof stored.divider !== 'string') {
        colors.divider = deriveDivider(colors.card, isDark);
      }
      if (typeof stored.cardInset !== 'string') {
        colors.cardInset = deriveCardInset(colors.card, isDark);
      }
      // Слот полей появился позже: у старых тем его нет, и без вывода
      // подставился бы цвет пресета-основы — светлое поле в тёмной теме.
      if (typeof stored.field !== 'string') {
        colors.field = deriveField(colors.card, isDark);
      }
      // Каркас (шапка, меню) до этого совпадал с карточкой — так и
      // оставляем, иначе интерфейс у существующих тем поедет.
      if (typeof stored.surface !== 'string') {
        colors.surface = colors.card;
      }
      // Подсказки — новые слоты. У старых тем их нет, и без вывода
      // подставились бы цвета пресета-основы: светлый фон подсказки
      // внутри тёмной пользовательской темы. Считаем из её же карточки
      // и главного цвета.
      const notes = deriveNotes(colors.card, colors.ui, isDark, {
        statusFlexible: colors.statusFlexible,
        statusBreak: colors.statusBreak,
        danger: colors.danger,
        statusActive: colors.statusActive,
      });
      if (typeof stored.noteInfo !== 'string') colors.noteInfo = notes.noteInfo;
      if (typeof stored.noteWarn !== 'string') colors.noteWarn = notes.noteWarn;
      if (typeof stored.noteDanger !== 'string') colors.noteDanger = notes.noteDanger;
      if (typeof stored.noteSuccess !== 'string') colors.noteSuccess = notes.noteSuccess;
      // Фоны подсказок появились позже текстов: у тем с прошлой версии
      // был один общий noteBg. Его не переносим — он и был проблемой,
      // из-за которой все четыре типа выглядели одинаково.
      if (typeof stored.noteInfoBg !== 'string') colors.noteInfoBg = notes.noteInfoBg;
      if (typeof stored.noteWarnBg !== 'string') colors.noteWarnBg = notes.noteWarnBg;
      if (typeof stored.noteDangerBg !== 'string') colors.noteDangerBg = notes.noteDangerBg;
      if (typeof stored.noteSuccessBg !== 'string') colors.noteSuccessBg = notes.noteSuccessBg;
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : `theme-${index}`,
        name: typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim().slice(0, 40)
          : `Моя тема ${index + 1}`,
        isDark,
        glass: entry.glass === true,
        colors,
      };
    });
}

function normalizePrefs(raw: unknown): Partial<Record<NotificationGroup, NotificationPref>> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const result: Partial<Record<NotificationGroup, NotificationPref>> = {};
  for (const group of NOTIFICATION_GROUPS) {
    const entry = input[group] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== 'object') continue;
    result[group] = {
      show: entry.show !== false,
      sound: entry.sound === true,
    };
  }
  return result;
}

/**
 * Эффекты: каждое значение 0–100.
 *
 * Отсутствующий ключ = включён полностью. Так новые эффекты начинают
 * работать сразу, а не молчат из-за пустого объекта в старых записях.
 */
function normalizeEffects(raw: unknown): EffectSettings {
  const input = (raw ?? {}) as Record<string, unknown>;
  const result = { ...DEFAULT_EFFECTS };
  for (const key of EFFECT_KEYS) {
    const value = Number(input[key]);
    if (Number.isFinite(value)) {
      result[key] = Math.min(100, Math.max(0, Math.round(value)));
    }
  }
  return result;
}

function normalizeFontFamily(raw: unknown): FontFamilyId {
  return typeof raw === 'string' && raw in FONT_FAMILIES
    ? (raw as FontFamilyId)
    : 'manrope';
}

function normalizeFontScale(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 100;
  // Шаг 5 % и жёсткие границы: произвольные дроби давали бы дрожание
  // вёрстки без пользы для читаемости.
  return Math.min(150, Math.max(50, Math.round(value / 5) * 5));
}

/** Приводит произвольный объект к валидным настройкам. */
export function normalizeSettings(raw: unknown): UserSettings {
  const input = (raw ?? {}) as Record<string, unknown>;
  const customThemes = normalizeCustomThemes(input.customThemes);
  const themeId = typeof input.themeId === 'string' ? input.themeId : 'light';
  const themeExists = themeId.startsWith('custom:')
    ? customThemes.some((theme) => `custom:${theme.id}` === themeId)
    : PRESET_THEME_IDS.includes(themeId);

  return {
    notificationPrefs: normalizePrefs(input.notificationPrefs),
    autoActiveOnOpen: input.autoActiveOnOpen === true,
    autoApproveExecutor: input.autoApproveExecutor === true,
    advancedMode: input.advancedMode === true,
    hideHints: input.hideHints === true,
    themeId: themeExists ? themeId : 'light',
    customThemes,
    fontScale: normalizeFontScale(input.fontScale),
    fontFamily: normalizeFontFamily(input.fontFamily),
    effects: normalizeEffects(input.effects),
  };
}

/** Строка БД (snake_case) → настройки приложения. */
export function settingsFromDb(row: Record<string, unknown> | null): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return normalizeSettings({
    notificationPrefs: row.notification_prefs,
    autoActiveOnOpen: row.auto_active_on_open,
    autoApproveExecutor: row.auto_approve_executor,
    advancedMode: row.advanced_mode,
    hideHints: row.hide_hints,
    themeId: row.theme_id,
    customThemes: row.custom_themes,
    fontScale: row.font_scale,
    fontFamily: row.font_family,
    effects: row.effects,
  });
}

/** Настройки приложения → строка БД. */
export function settingsToDb(settings: UserSettings): Record<string, unknown> {
  return {
    notification_prefs: settings.notificationPrefs,
    auto_active_on_open: settings.autoActiveOnOpen,
    auto_approve_executor: settings.autoApproveExecutor,
    advanced_mode: settings.advancedMode,
    hide_hints: settings.hideHints,
    theme_id: settings.themeId,
    custom_themes: settings.customThemes,
    font_scale: settings.fontScale,
    font_family: settings.fontFamily,
    effects: settings.effects,
  };
}
