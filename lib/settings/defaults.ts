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
      cardAlt: '#ffffff',
      cardLine: '#e8d9b0',
      cardInset: '#f8fafc',
      text: '#0f172a',
      muted: '#64748b',
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
      cardAlt: '#161619',
      cardLine: '#0f0f12',
      cardInset: '#26262c',
      text: '#ffffff',
      muted: '#8a8a93',
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
   * Космос — фиолетовая база, но НЕ монохром.
   *
   * В светлой и тёмной темах работают два независимых цвета: золото
   * (акцент карточек, звезда) и зелёный (интерфейс: меню, кнопки).
   * Первая версия «Космоса» красила и то и другое в один фиолетовый —
   * глаз не за что зацепить, всё сливается.
   *
   * Здесь триада: фиолетовый (интерфейс) + циан (акцент, лежит
   * напротив по кругу) + розовый (тревожное и роли). Статусы разнесены
   * по трём разным тонам, чтобы «работает» и «перерыв» различались
   * не только положением.
   */
  /**
   * Космос — построен по цветовому кругу: база синий (225°), отход
   * ±30° даёт голубой 195° и фиолетовый 255°, дальше пурпур 280°.
   * Раньше оттенки подбирались на глаз, и половина палитры лежала
   * в одном фиолетовом секторе.
   */
  space: {
    name: 'Космос',
    isDark: true,
    colors: {
      bg: '#0e0c18',
      card: '#191727',
      cardAlt: '#131120',
      cardLine: '#0a0912',
      cardInset: '#272438',
      text: '#eeecfa',
      muted: '#948eb8',
      // Акцент — голубой: холодный край семьи, контраст к фиолетовому.
      accent: '#42b2d7',
      accentSoft: '#b8e4f2',
      accentDeep: '#2a7fa0',
      // Интерфейс — фиолетовый (отход +30 от базы).
      ui: '#7a54d4',
      statusActive: '#3bc2ce',   // циан
      statusBreak: '#d9a441',    // единственный тёплый
      statusFlexible: '#3945d0', // индиго — база круга
      statusOffline: '#5f5a7d',
      roleSpecialist: '#3bc2ce',
      roleAdmin: '#ac61d1',      // пурпур
      roleVerified: '#3945d0',
      danger: '#e05575',
      heroFrom: '#3d2a8f',
      heroTo: '#2a7fa0',
      mapCluster: '#7a54d4',
      mapHouse: '#42b2d7',
    },
  },
  /**
   * Закат — тёплая половина круга: база красный (0°), отход ±30° даёт
   * розовый 330° и оранжевый 30°, дальше золото 42°. Алые и багровые
   * тона, как и просили, но собранные по правилу, а не наугад.
   */
  sunset: {
    name: 'Закат',
    isDark: true,
    colors: {
      bg: '#190b0e',
      card: '#281519',
      cardAlt: '#1f1013',
      cardLine: '#12080a',
      cardInset: '#3a2227',
      text: '#ffeef1',
      muted: '#c2919b',
      // Акцент — золото: классическая пара к алому.
      accent: '#eeb32b',
      accentSoft: '#fbe3a4',
      accentDeep: '#b8801a',
      // Интерфейс — кармин (база круга).
      ui: '#db243c',
      statusActive: '#e77823',   // оранжевый, тёплый край
      statusBreak: '#eeb32b',    // золото
      statusFlexible: '#3fa8b5', // единственный холодный
      statusOffline: '#8a5f66',
      roleSpecialist: '#e77823',
      roleAdmin: '#db4382',      // роза
      roleVerified: '#eeb32b',
      danger: '#e24932',
      heroFrom: '#9c1730',
      heroTo: '#e77823',
      mapCluster: '#db243c',
      mapHouse: '#eeb32b',
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
      cardAlt: '#050505',
      cardLine: '#121212',
      cardInset: '#1a1a1a',
      text: '#fafafa',
      muted: '#8f8f8f',
      // Акцент — белый: на чёрном он работает как золото на светлом.
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
      cardAlt: '#fbfbfc',
      cardLine: '#e0e0e4',
      cardInset: '#f2f2f4',
      // Самый тёмный тон — графит, а не почти-чёрный: тема должна
      // читаться как «серая бумага», а не как чёрный текст на белом.
      text: '#3a3a42',
      muted: '#75757f',
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
      cardAlt: '#f6f9fc',
      cardLine: '#c9d4e0',
      cardInset: '#eef3f8',
      text: '#1e293b',
      muted: '#64748b',
      // Серебро с холодным отливом.
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
   * Природа — построена по цветовому кругу RYB.
   *
   * База — зелёный (130° в HSL), от него отход на ±30°: салатовый 100°
   * и бирюза 160°, плюс голубой 195° как дальний холодный акцент.
   * Насыщенность и светлота подобраны так, чтобы соседние оттенки
   * различались, но читались как одна семья.
   */
  nature: {
    name: 'Природа',
    isDark: true,
    colors: {
      bg: '#0d1712',
      card: '#16221c',
      cardAlt: '#111c16',
      cardLine: '#0a120e',
      cardInset: '#213029',
      text: '#e8f5ee',
      muted: '#8aa89a',
      // Акцент — бирюза (холодный край семьи).
      accent: '#37ae97',
      accentSoft: '#a7e0d4',
      accentDeep: '#25806e',
      // Интерфейс — лист (база круга).
      ui: '#389f49',
      statusActive: '#68c639',   // салат, тёплый край
      statusBreak: '#d9a441',    // единственный тёплый: контраст к зелени
      statusFlexible: '#3ea8cc', // голубой
      statusOffline: '#5d7a6d',
      roleSpecialist: '#68c639',
      roleAdmin: '#d96a5a',
      roleVerified: '#3ea8cc',
      danger: '#d9564a',
      heroFrom: '#1f6b45',
      heroTo: '#2f8f86',
      mapCluster: '#389f49',
      mapHouse: '#37ae97',
    },
  },
  /**
   * Янтарь — тёплая половина того же круга.
   *
   * База — жёлтый (50°), отход ±30°: оранжевая охра 28° и лимонный 74°.
   * Холодных тонов почти нет — только «произвольный график», иначе все
   * четыре статуса слились бы в один медовый градиент.
   */
  amber: {
    name: 'Янтарь',
    isDark: true,
    colors: {
      bg: '#18130c',
      card: '#231d15',
      cardAlt: '#1c170f',
      cardLine: '#120e08',
      cardInset: '#312a21',
      text: '#fdf3e3',
      muted: '#b09a7c',
      // Акцент — золото (сердце семьи).
      accent: '#f1c927',
      accentSoft: '#fbe9a8',
      accentDeep: '#b8901a',
      // Интерфейс — охра: темнее акцента, не спорит с ним.
      ui: '#da741b',
      statusActive: '#aacf30',   // лимон, холодный край
      statusBreak: '#eda71d',    // янтарь
      statusFlexible: '#4bb3c4', // единственный холодный
      statusOffline: '#7d6b52',
      roleSpecialist: '#aacf30',
      roleAdmin: '#e0553c',
      roleVerified: '#f1c927',
      danger: '#e0553c',
      heroFrom: '#a34e10',
      heroTo: '#e0a020',
      mapCluster: '#da741b',
      mapHouse: '#f1c927',
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
