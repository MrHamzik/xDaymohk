'use client';

import { createPortal } from 'react-dom';
import {
  Ban,
  Bell,
  CarFront,
  Eye,
  EyeOff,
  MessageSquare,
  Reply,
  ShieldAlert,
  Star,
  ThumbsUp,
  LifeBuoy,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AppNotification, notificationCategory } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import LetterPreview from '@/components/LetterPreview';

function iconFor(notification: AppNotification) {
  switch (notification.type) {
    case 'user_blocked': return { Icon: Ban, cls: 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400' };
    case 'user_unblocked': return { Icon: UserCheck, cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' };
    case 'profile_hidden': return { Icon: EyeOff, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' };
    case 'profile_visible': return { Icon: Eye, cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' };
    case 'review_received': return { Icon: Star, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' };
    case 'question_commented': return { Icon: MessageSquare, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400' };
    case 'comment_replied': return { Icon: Reply, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400' };
    case 'like_received': return { Icon: ThumbsUp, cls: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400' };
    case 'complaint_result': return { Icon: ShieldAlert, cls: 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400' };
    // Ответ поддержки — свой значок, иначе письмо приходило с общим
    // колокольчиком и не отличалось от системного.
    case 'support_answered': return { Icon: LifeBuoy, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400' };
    case 'taxi_request':
    case 'taxi_info': return { Icon: CarFront, cls: 'bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400' };
    default: return { Icon: Bell, cls: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300' };
  }
}

const CATEGORY_LABEL: Record<string, { ru: string; ce: string }> = {
  system: { ru: 'Система', ce: 'Система' },
  activity: { ru: 'Активность', ce: 'Жималла' },
  complaint: { ru: 'Жалобы', ce: 'Арз' },
  support: { ru: 'Помощь', ce: 'ГIо' },
  task: { ru: 'Задания', ce: 'ТIедилларш' },
  taxi: { ru: 'Такси', ce: 'Такси' },
};

/** Fallback-переводы заголовков для старых писем без ce-полей. */
const TITLE_CE_FALLBACK: Record<string, string> = {
  'Жалоба отклонена': 'Арз дIаяьккхина',
  'Жалоба о нарушении': 'Бакъонаш хьакхарна арз',
  'Спасибо за сигнал': 'Баркалла сигналан',
  'Анкета сохранена': 'Анкета дIаязйина',
  'Анкета проверена': 'Анкета теллина',
  'Анкета скрыта': 'Анкета къайлайаьккхина',
  'Анкета снова опубликована': 'Анкета юха зорбане яьккхина',
  'Аккаунт заблокирован': 'Аккаунт билсена яьлла',
  'Аккаунт разблокирован': 'Аккаунт дIаяьккхина',
  'Новый отзыв': 'Керла хастам',
  'Новый комментарий': 'Керла комментарий',
  'Уведомление': 'Хаам',
  'Система': 'Система',
};

function localizedTitle(notification: AppNotification, language: string): string {
  if (language === 'ce') {
    return notification.titleCe || TITLE_CE_FALLBACK[notification.title] || notification.title;
  }
  return notification.title;
}

function localizedMessage(notification: AppNotification, language: string): string {
  return language === 'ce' ? (notification.messageCe || notification.message) : notification.message;
}

interface NotificationLetterModalProps {
  notification: AppNotification | null;
  onClose: () => void;
  onDelete?: (notification: AppNotification) => void;
}

/**
 * Красиво оформленное «письмо» уведомления: иконка по типу, тема, текст,
 * разделители. Внешний вид — единый компонент LetterPreview (тот же, что
 * используется как превью-редактор в админ-панели).
 */
export default function NotificationLetterModal({ notification, onClose, onDelete }: NotificationLetterModalProps) {
  const { language } = useI18n();
  if (!notification) return null;

  const icon = iconFor(notification);
  const category = notificationCategory(notification.type);
  const catLabel = CATEGORY_LABEL[category]?.[language] ?? CATEGORY_LABEL.system[language];

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* max-w-md = ровно 28rem (как было раньше), чтобы ширина модалки
          не зависела от вложенности flex-обёртки. Длинные письма — с
          невидимым скроллом, если не влезают в экран. */}
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <LetterPreview
          categoryLabel={catLabel}
          fromLabel={language === 'ce' ? 'Царара:' : 'От:'}
          themeLabel={language === 'ce' ? 'Хаттар' : 'Тема'}
          textLabel={language === 'ce' ? 'Хьажорг' : 'Текст письма'}
          readLabel={language === 'ce' ? 'Дешна ду' : 'Прочитано'}
          unreadLabel={language === 'ce' ? 'Дешна дац' : 'Не прочитано'}
          sender={notification.sender || 'Даймохк'}
          title={localizedTitle(notification, language)}
          message={localizedMessage(notification, language)}
          isRead={Boolean(notification.isRead)}
          createdAt={notification.createdAt}
          icon={icon}
          headerActions={
            <div className="flex shrink-0 items-center gap-1.5">
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(notification)}
                  aria-label={language === 'ce' ? 'ДIаяккха' : 'Удалить'}
                  title={language === 'ce' ? 'ДIаяккха' : 'Удалить'}
                  className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="smk-hit flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 transition hover:bg-slate-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          }
        />
      </div>
    </div>,
    document.body,
  );
}
