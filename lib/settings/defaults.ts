import {
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

/** Звук по умолчанию включён там, где ждут быстрой реакции. */
const SOUND_ON_BY_DEFAULT: NotificationGroup[] = ['tasks'];

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

export const PRESET_THEMES: Record<string, { name: string; isDark: boolean; colors: ThemeColors }> = {
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
      cardInset: '#1f1f23',
      text: '#ffffff',
      muted: '#8a8a93',
      accent: '#ffae00',
      accentSoft: '#ffedc4',
      accentDeep: '#ffcd6d',
    },
  },
  space: {
    name: 'Космос',
    isDark: true,
    colors: {
      bg: '#0d0b1a',
      card: '#1a1530',
      cardAlt: '#141026',
      cardLine: '#0a0814',
      cardInset: '#221b3d',
      text: '#f0ecff',
      muted: '#9a8fc4',
      accent: '#a78bfa',
      accentSoft: '#ddd4ff',
      accentDeep: '#7c5cf0',
    },
  },
  sunset: {
    name: 'Закат',
    isDark: true,
    colors: {
      bg: '#1a0c0c',
      card: '#2b1414',
      cardAlt: '#210f0f',
      cardLine: '#140808',
      cardInset: '#361a1a',
      text: '#fff0ec',
      muted: '#c99a94',
      accent: '#f2683c',
      accentSoft: '#ffc9b3',
      accentDeep: '#c2410c',
    },
  },
};

export const PRESET_THEME_IDS = Object.keys(PRESET_THEMES);

/** Тема по идентификатору: пресет или пользовательская. */
export function resolveTheme(
  themeId: string,
  customThemes: CustomTheme[],
): { name: string; isDark: boolean; colors: ThemeColors } {
  if (themeId.startsWith('custom:')) {
    const id = themeId.slice('custom:'.length);
    const found = customThemes.find((theme) => theme.id === id);
    if (found) return { name: found.name, isDark: found.isDark, colors: found.colors };
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
  return {
    bg: safeColor(input.bg, base.bg),
    card: safeColor(input.card, base.card),
    cardAlt: safeColor(input.cardAlt, base.cardAlt),
    cardLine: safeColor(input.cardLine, base.cardLine),
    cardInset: safeColor(input.cardInset, base.cardInset),
    text: safeColor(input.text, base.text),
    muted: safeColor(input.muted, base.muted),
    accent: safeColor(input.accent, base.accent),
    accentSoft: safeColor(input.accentSoft, base.accentSoft),
    accentDeep: safeColor(input.accentDeep, base.accentDeep),
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
  return raw === 'inter' || raw === 'georgia' || raw === 'system' || raw === 'manrope'
    ? raw
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
