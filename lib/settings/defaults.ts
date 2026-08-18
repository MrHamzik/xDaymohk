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
} from '@/lib/settings/types';

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
  themeId: 'light',
  customThemes: [],
  fontScale: 100,
  fontFamily: 'manrope',
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
      panel: '#e6e6e6',
      cardAlt: '#ffffff',
      cardLine: '#e6e6e6',
      cardInset: '#f8fafc',
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
    },
  },
  dark: {
    name: 'Тёмная',
    isDark: true,
    colors: {
      bg: '#131313',
      card: '#1c1c20',
      panel: '#34343b',
      cardAlt: '#161619',
      cardLine: '#34343b',
      cardInset: '#26262a',
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
      panel: '#22204b',
      cardAlt: '#0d0b1d',
      cardLine: '#22204b',
      cardInset: '#1d1c31',
      text: '#ebedfa',
      muted: '#9292bf',
      icon: '#81adda',
      accent: '#4cacf0',
      accentSoft: '#bfe0fb',
      accentDeep: '#2a6fa8',
      ui: '#6552e0',
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
      panel: '#512530',
      cardAlt: '#250e14',
      cardLine: '#512530',
      cardInset: '#372025',
      text: '#fbf2e9',
      muted: '#cba79a',
      icon: '#e2ba8d',
      accent: '#f6ae31',
      accentSoft: '#fcdfa8',
      accentDeep: '#ad421f',
      ui: '#e5472e',
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
      panel: '#242424',
      cardAlt: '#050505',
      cardLine: '#242424',
      cardInset: '#151515',
      text: '#fafafa',
      muted: '#8f8f8f',
      // Акцент — белый: на чёрном он работает как золото на светлом.
      icon: '#b4b4b4',
      accent: '#ffffff',
      accentSoft: '#e5e5e5',
      accentDeep: '#a3a3a3',
      ui: '#3f3f46',
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
      panel: '#e6e6e6',
      cardAlt: '#fbfbfc',
      cardLine: '#e6e6e6',
      cardInset: '#f2f2f4',
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
      panel: '#e6e6e6',
      cardAlt: '#f6f9fc',
      cardLine: '#e6e6e6',
      cardInset: '#eef3f8',
      text: '#1e293b',
      muted: '#526177',
      // Серебро с холодным отливом.
      icon: '#4c5a6f',
      accent: '#94a3b8',
      accentSoft: '#e2e8f0',
      accentDeep: '#64748b',
      ui: '#0ea5e9',
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
      panel: '#d2f4dd',
      cardAlt: '#f4faf7',
      cardLine: '#d2f4dd',
      cardInset: '#e6f4ed',
      text: '#305545',
      muted: '#4b6f5e',
      icon: '#476c5b',
      accent: '#36a2c9',
      accentSoft: '#d6edf5',
      accentDeep: '#2f7893',
      ui: '#389f5d',
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
      panel: '#f4e9d2',
      cardAlt: '#fcfaf2',
      cardLine: '#f4e9d2',
      cardInset: '#f8f1e2',
      text: '#58442d',
      muted: '#78664c',
      icon: '#6f5d44',
      accent: '#edb91d',
      accentSoft: '#fbf0d0',
      accentDeep: '#af7a1d',
      ui: '#db7924',
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
    cardAlt: pick('cardAlt'),
    cardLine: pick('cardLine'),
    cardInset: pick('cardInset'),
    panel: pick('panel'),
    icon: pick('icon'),
    text: pick('text'),
    muted: pick('muted'),
    accent: pick('accent'),
    accentSoft: pick('accentSoft'),
    accentDeep: pick('accentDeep'),
    danger: pick('danger'),
    ui: pick('ui'),
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
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : `theme-${index}`,
        name: typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim().slice(0, 40)
          : `Моя тема ${index + 1}`,
        isDark,
        glass: entry.glass === true,
        colors: normalizeColors(entry.colors, base),
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
    themeId: themeExists ? themeId : 'light',
    customThemes,
    fontScale: normalizeFontScale(input.fontScale),
    fontFamily: normalizeFontFamily(input.fontFamily),
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
    themeId: row.theme_id,
    customThemes: row.custom_themes,
    fontScale: row.font_scale,
    fontFamily: row.font_family,
  });
}

/** Настройки приложения → строка БД. */
export function settingsToDb(settings: UserSettings): Record<string, unknown> {
  return {
    notification_prefs: settings.notificationPrefs,
    auto_active_on_open: settings.autoActiveOnOpen,
    auto_approve_executor: settings.autoApproveExecutor,
    advanced_mode: settings.advancedMode,
    theme_id: settings.themeId,
    custom_themes: settings.customThemes,
    font_scale: settings.fontScale,
    font_family: settings.fontFamily,
  };
}
