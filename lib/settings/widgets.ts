/** Словарь i18n: только чтение ключей, без импорта клиента. */
type Dict = Record<string, string>;

/**
 * Слоты быстрой панели и пункты бокового меню.
 *
 * Два списка нарочно разные: в четыре значка не кладут «настройки»
 * (их нельзя прятать) и не кладут редкие ссылки вроде правовых
 * соглашений. В меню же прячут как раз длинный хвост разделов.
 */

export const QUICK_WIDGET_IDS = [
  'status', 'lang', 'notify', 'theme', 'light',
  'home', 'catalog', 'map', 'qibla', 'quran', 'sira', 'profile',
  'gullaq', 'go', 'vaynakh', 'taxi', 'vpn', 'djanna',
] as const;

export type QuickWidgetId = (typeof QUICK_WIDGET_IDS)[number];

export const QUICK_WIDGET_ID_SET = new Set<string>(QUICK_WIDGET_IDS);

export const MENU_IDS = [
  'home', 'catalog', 'map', 'about', 'admin',
  'qibla', 'quran', 'hijri', 'sira',
  'taxi', 'vpn', 'vaynakh', 'go', 'gullaq', 'djanna',
  'settings', 'pro', 'guide', 'help', 'legal', 'invite', 'blacklist',
  'profile',
] as const;

export type MenuId = (typeof MENU_IDS)[number];

export const MENU_ID_SET = new Set<string>(MENU_IDS);

/** Настройки всегда остаются в меню — иначе человек сам себя запрёт. */
export const LOCKED_MENU_IDS = new Set<string>(['settings']);

export function widgetLabel(id: string, t: Dict): string {
  switch (id) {
    case 'status': return t.widgetStatus;
    case 'lang': return t.widgetLang;
    case 'notify': return t.settingsSectionNotifications;
    case 'theme': return t.settingsThemes;
    case 'light': return t.lightMode;
    case 'home': return t.navMain;
    case 'catalog': return t.catalog;
    case 'map': return t.map;
    case 'qibla': return t.navQibla;
    case 'quran': return t.navQuran;
    case 'sira': return t.navSira;
    case 'hijri': return t.navHijri;
    case 'profile': return t.profile;
    case 'gullaq': return t.gullaqTitle;
    case 'go': return t.goTitle;
    case 'vaynakh': return t.vaynakhTitle;
    case 'taxi': return t.taxiTitle;
    case 'vpn': return t.vpnTitle;
    case 'djanna': return t.djannaTitle;
    case 'about': return t.about;
    case 'admin': return t.admin;
    case 'settings': return t.settings;
    case 'pro': return t.proTitle;
    case 'guide': return t.navGuide;
    case 'help': return t.navHelp;
    case 'legal': return t.navLegal;
    case 'invite': return t.inviteNeighbor;
    case 'blacklist': return t.blacklist;
    default: return id;
  }
}
