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

/** Семейства шрифтов, доступные в расширенном режиме. */
export type FontFamilyId = 'manrope' | 'inter' | 'georgia' | 'system';

export const FONT_FAMILIES: Record<FontFamilyId, string> = {
  manrope: "'Manrope', 'Inter', system-ui, sans-serif",
  inter: "'Inter', 'Manrope', system-ui, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

/**
 * Цвета пользовательской темы.
 *
 * Полная палитра, как и просили: правится всё, что видно на экране.
 * Ключи совпадают с CSS-переменными --smk-* и подставляются в :root.
 */
export interface ThemeColors {
  /** Фон страницы. */
  bg: string;
  /** Полотно карточки. */
  card: string;
  /** Низ градиента карточки. */
  cardAlt: string;
  /** Обводка карточки. */
  cardLine: string;
  /** Подложка строк внутри карточки. */
  cardInset: string;
  /** Основной текст. */
  text: string;
  /** Приглушённый текст. */
  muted: string;
  /** Акцент: кнопки, активные элементы. */
  accent: string;
  /** Мягкий оттенок акцента. */
  accentSoft: string;
  /** Тёмный оттенок акцента. */
  accentDeep: string;
}

export interface CustomTheme {
  /** Стабильный идентификатор, ссылка из themeId как 'custom:<id>'. */
  id: string;
  name: string;
  /** Тёмная ли основа: от неё зависят системные тени и class="dark". */
  isDark: boolean;
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
