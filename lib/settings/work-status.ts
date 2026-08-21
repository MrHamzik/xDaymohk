import type { UserMasterStatus } from '@/lib/types';

/**
 * Рабочий статус специалиста: один список вариантов на всё приложение.
 *
 * Раньше подписи, описания и цвета статусов жили прямо в
 * SettingsControlsBar. Когда те же четыре варианта понадобились в
 * боковом меню (п.12), список пришлось бы скопировать — а это ровно тот
 * случай, из-за которого правки текстов «не проявляются»: меняешь в
 * одном месте, человек смотрит в другое. Держим в одном модуле.
 */

export const WORK_STATUS_IDS: UserMasterStatus[] = ['auto', 'active', 'break', 'offline'];

/** Класс подложки. Сами цвета — в app/styles/brand.css. */
export const WORK_STATUS_BG: Record<string, string> = {
  auto: 'smk-status-bg--auto',
  active: 'smk-status-bg--active',
  break: 'smk-status-bg--break',
  offline: 'smk-status-bg--offline',
};

interface WorkStatusText {
  label: string;
  description: string;
}

const RU: Record<string, WorkStatusText> = {
  auto: {
    label: '🟢 Автоматическое',
    description: 'Переключается автоматически по часам',
  },
  active: {
    label: '🟢 Работает',
    description: 'Анкета открыта для заказов и звонков',
  },
  break: {
    label: '🟠 Перерыв',
    description: 'Временный перерыв в течение дня',
  },
  offline: {
    label: '⚫ Не работает',
    description: 'Выходной или закрыто',
  },
};

const CE: Record<string, WorkStatusText> = {
  auto: {
    label: '🟢 Автоматан раж',
    description: 'Расписанца ша шех хийцало',
  },
  active: {
    label: '🟢 Болх беш ву',
    description: 'Анкета къамелашна а, тIечIагIдаршна а схьайиллина ю',
  },
  break: {
    label: '🟠 Сацар',
    description: 'Дена юкъахь ханна сацар',
  },
  offline: {
    label: '⚫ Болх ца бо',
    description: 'Болх ца бен де йа садаIар',
  },
};

export function workStatusText(id: string, language: string): WorkStatusText {
  const table = language === 'ce' ? CE : RU;
  return table[id] ?? table.auto;
}

/** Пояснение под списком статусов. */
export function workStatusHint(language: string): string {
  return language === 'ce'
    ? 'ХIара низам массо хьайн говзанчин анкетина тIедоьрзу — анкетан расписани хийца. Сохьташца — расписанца; Болх беш ву — схьайиллина; Сацар — ханна; Болх ца бо — садаIар.'
    : 'Действует на все ваши анкеты специалиста и перекрывает их расписание. По расписанию — статус по рабочим часам; Работает — открыт для звонков; Перерыв — временно отошли; Не работает — выходной.';
}
