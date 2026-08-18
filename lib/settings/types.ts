import type { NotificationType } from '@/lib/types';

/**
 * Настройки пользователя.
 *
 * Уведомления сгруппированы, а не расписаны по всем 27 типам: список
 * типов растёт с каждой функцией, и страница из 54 тумблеров стала бы
 * нечитаемой. Группа отражает то, как человек думает о приложении
 * («задания», «жалобы»), а не то, как устроен enum в коде.
 */

/** Группы уведомлений — единица управления в настройках. */
export type NotificationGroup =
  | 'profile'     // анкета: создана, скрыта, проверена
  | 'activity'    // отзывы, комментарии, лайки
  | 'tasks'       // Аренца Темщик / ГIончалла
  | 'complaint'   // результаты жалоб
  | 'taxi'        // ВайТакси
  | 'system';     // системные и админские

export const NOTIFICATION_GROUPS: NotificationGroup[] = [
  'profile', 'activity', 'tasks', 'complaint', 'taxi', 'system',
];

/**
 * Тип уведомления → группа.
 *
 * Держим ОТДЕЛЬНО от notificationCategory() из lib/types.ts: та функция
 * управляет вкладками в колокольчике и не знает про 'profile'. Слить их
 * в одну — значит связать раскладку вкладок с составом настроек, и
 * любое изменение одного ломало бы другое.
 */
export function notificationGroup(type: NotificationType): NotificationGroup {
  switch (type) {
    case 'profile_hidden':
    case 'profile_visible':
      return 'profile';

    case 'review_received':
    case 'question_commented':
    case 'comment_replied':
    case 'like_received':
      return 'activity';

    case 'complaint_result':
      return 'complaint';

    case 'taxi_request':
    case 'taxi_info':
      return 'taxi';

    case 'task_taken':
    case 'task_submitted':
    case 'task_confirmed':
    case 'task_auto_confirmed':
    case 'task_cancel_requested':
    case 'task_cancelled':
    case 'task_expired':
    case 'task_joined':
    case 'task_excluded':
    case 'task_reminder':
    case 'task_rated':
    case 'task_rate_pending':
    case 'task_join_request':
    case 'task_join_approved':
    case 'task_join_rejected':
      return 'tasks';

    // Блокировки и системные сообщения отключать нельзя по смыслу,
    // но группа нужна для единообразия чтения настроек.
    case 'user_blocked':
    case 'user_unblocked':
    case 'system':
    default:
      return 'system';
  }
}

/**
 * Группы, которые нельзя отключить.
 *
 * Блокировка аккаунта и системные сообщения — это уведомления «о вас»,
 * а не «для удобства». Если их выключить, человек не узнает, почему
 * приложение перестало работать.
 */
export const LOCKED_NOTIFICATION_GROUPS: NotificationGroup[] = ['system'];

export interface NotificationPref {
  /** Показывать в колокольчике. */
  show: boolean;
  /** Проигрывать звук при получении. */
  sound: boolean;
}

/**
 * Семейства шрифтов, доступные в расширенном режиме.
 *
 * Обязательное условие — поддержка кириллицы: половина «красивых»
 * веб-шрифтов её не покрывает, и текст рассыпался бы на квадраты.
 * Все перечисленные либо системные, либо уже подключены в globals.css.
 */
export type FontFamilyId =
  | 'manrope' | 'inter' | 'rubik' | 'montserrat' | 'jost' | 'onest'
  | 'pt-serif' | 'georgia' | 'literata'
  | 'roboto-mono' | 'system';

export const FONT_FAMILIES: Record<FontFamilyId, string> = {
  // Без засечек
  manrope: "'Manrope', 'Inter', system-ui, sans-serif",
  inter: "'Inter', 'Manrope', system-ui, sans-serif",
  rubik: "'Rubik', 'Manrope', system-ui, sans-serif",
  montserrat: "'Montserrat', 'Manrope', system-ui, sans-serif",
  jost: "'Jost', 'Manrope', system-ui, sans-serif",
  onest: "'Onest', 'Manrope', system-ui, sans-serif",
  // С засечками
  'pt-serif': "'PT Serif', Georgia, serif",
  georgia: "Georgia, 'Times New Roman', serif",
  literata: "'Literata', Georgia, serif",
  // Моноширинный
  'roboto-mono': "'Roboto Mono', ui-monospace, monospace",
  // Системный
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

/**
 * Цвета пользовательской темы.
 *
 * Разбиты на три группы по смыслу, а не по алфавиту — в редакторе они
 * так и показываются:
 *
 *  1. Глобальные   — полотно, карточки, обводки, текст. То, что задаёт
 *                    общее впечатление от темы.
 *  2. Детали       — акценты: кнопки, иконки, звёзды, опасные действия.
 *  3. Специфические— смысловые цвета, которые нельзя выводить из
 *                    акцента: статусы работы, роли, шапка каталога,
 *                    объекты на карте.
 *
 * Ключи совпадают с CSS-переменными --smk-* и подставляются в :root.
 */
export interface ThemeColors {
  // ── Глобальные ──────────────────────────────────────────────────
  /** Фон страницы. */
  bg: string;
  /** Полотно карточки. */
  card: string;
  /**
   * Панели: мини-профиль, виджет времени намаза, блок четырёх иконок,
   * подвал карточек. Самостоятельный слот — эти поверхности не должны
   * зависеть ни от фона страницы, ни от карточки.
   */
  panel: string;
  /** Низ градиента карточки. */
  cardAlt: string;
  /**
   * Обводка — линия по КОНТУРУ: периметр карточек, всплывающих слоёв,
   * полей ввода. Выводится из карточки прибавкой 9 единиц яркости по
   * шкале 0–240.
   */
  cardLine: string;
  /**
   * Разделители — линии ВНУТРИ блоков: строки карточки, секции листа,
   * орнаментальные полосы. Отдельный слот, потому что у контура и
   * внутренней линии разные задачи: контур очерчивает форму и должен
   * быть еле заметен, разделитель структурирует содержимое и обязан
   * читаться. Выводится из карточки: насыщенность/2, яркость ×2 на
   * тёмных темах и −19 по шкале 0–240 на светлых.
   */
  divider: string;
  /** Подложка строк внутри карточки. */
  cardInset: string;
  /** Основной текст. */
  text: string;
  /** Второстепенный текст: подписи, пояснения, даты. */
  muted: string;
  /**
   * Иконки. Свой слот: раньше их цвет выводился смешиванием основного
   * и второстепенного текста, и подкрутить иконки отдельно было
   * невозможно — они тянулись за текстом.
   */
  icon: string;

  // ── Детали ──────────────────────────────────────────────────────
  /** Акцент: кнопки, активные элементы, звезда рейтинга. */
  accent: string;
  /** Мягкий оттенок акцента. */
  accentSoft: string;
  /** Тёмный оттенок акцента. */
  accentDeep: string;
  /** Опасные действия: «Пожаловаться», «Удалить», ошибки. */
  danger: string;
  /**
   * Акцент интерфейса — тот самый зелёный: иконки бокового меню,
   * ползунки, кнопки «Сохранить», активные вкладки, кольца фокуса.
   * Подменяет переменные Tailwind --color-emerald-*, поэтому один
   * ключ перекрашивает все 800+ мест разом.
   */
  ui: string;

  // ── Специфические ───────────────────────────────────────────────
  /** Статус «Работает». */
  statusActive: string;
  /** Статус «На перерыве». */
  statusBreak: string;
  /** Статус «Произвольный график». */
  statusFlexible: string;
  /** Статус «Не работает». */
  statusOffline: string;
  /** Бейдж «Специалист». */
  roleSpecialist: string;
  /** Бейдж «Админ». */
  roleAdmin: string;
  /** Бейдж «Проверен». */
  roleVerified: string;
  /** Главная карточка каталога — начало градиента. */
  heroFrom: string;
  /** Главная карточка каталога — конец градиента. */
  heroTo: string;
  /** Кластеры на карте. */
  mapCluster: string;
  /** Метки домов на карте. */
  mapHouse: string;
}

/** Группы палитры для редактора тем. */
export type ThemeColorGroup = 'global' | 'details' | 'specific';

export const THEME_COLOR_GROUPS: Record<ThemeColorGroup, Array<keyof ThemeColors>> = {
  // cardAlt в редакторе не показываем: он даёт лишь нижнюю точку
  // градиента карточки и визуально неотличим от card. Значение
  // выводится автоматически при сохранении темы.
  global: ['bg', 'card', 'panel', 'cardInset', 'cardLine', 'divider', 'text', 'muted', 'icon'],
  details: ['accent', 'accentSoft', 'accentDeep', 'ui', 'danger'],
  specific: [
    'statusActive', 'statusBreak', 'statusFlexible', 'statusOffline',
    'roleSpecialist', 'roleAdmin', 'roleVerified',
    'heroFrom', 'heroTo', 'mapCluster', 'mapHouse',
  ],
};

export interface CustomTheme {
  /** Стабильный идентификатор, ссылка из themeId как 'custom:<id>'. */
  id: string;
  name: string;
  /** Тёмная ли основа: от неё зависят системные тени и class="dark". */
  isDark: boolean;
  /**
   * Стеклянный режим: карточки становятся полупрозрачными с размытием
   * фона (backdrop-filter).
   *
   * Отдельный флаг, а не альфа в цветах: значения проверяются как
   * #rrggbb, да и <input type="color"> не умеет прозрачность. Флаг
   * включает CSS-класс, который выводит прозрачность из тех же цветов
   * через color-mix — палитра остаётся единственным источником.
   */
  glass?: boolean;
  colors: ThemeColors;
}

/** Максимум пользовательских тем (ограничение продублировано в SQL). */
export const MAX_CUSTOM_THEMES = 5;

export interface UserSettings {
  notificationPrefs: Partial<Record<NotificationGroup, NotificationPref>>;
  /** Открыл «Аренца Темщик» → автоматически Активен на 30 минут. */
  autoActiveOnOpen: boolean;
  /** Отклики на мои задания одобряются без моего участия. */
  autoApproveExecutor: boolean;
  advancedMode: boolean;
  /** 'light' | 'dark' | 'space' | 'sunset' | 'custom:<id>' */
  themeId: string;
  customThemes: CustomTheme[];
  /** 50..150 (%) */
  fontScale: number;
  fontFamily: FontFamilyId;
}
