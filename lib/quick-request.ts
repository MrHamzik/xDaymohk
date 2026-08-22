/**
 * Быстрая заявка с каталога (лендинг по макету Этапа 2-каталог).
 *
 * Форма «имя + телефон + описание» не создаёт собственный механизм:
 * она собирает пресет для штатной формы задания (CreateTaskModal,
 * «ГIончалла» — безвозмездно).
 */

export interface QuickRequestFields {
  name: string;
  phone: string;
  description: string;
}

export interface QuickTaskPreset {
  title?: string;
  description?: string;
  /** «Сбор рабочих» — задание «на дату» (решение владельца). */
  kind?: 'urgent' | 'scheduled';
  /** Быстрые карточки каталога: готовая категория (п.7 замечаний). */
  category?: string;
}

/** Ограничение заголовка — как у серверного лимита названий заданий. */
const TITLE_LIMIT = 80;

/**
 * Собрать пресет задания из полей формы.
 *
 * Заголовок — первая строка описания (или дефолт), тело — описание
 * плюс строка контактов: имя/телефон из формы могут отличаться от
 * аккаунта (заявку оставляют и за родственника), поэтому они идут
 * текстом в описание, а не подменяют контакты профиля.
 */
/** Результат сборки: титул и тело всегда на месте. */
export interface BuiltQuickPreset extends QuickTaskPreset {
  title: string;
  description: string;
}

export function buildQuickTaskPreset(
  fields: QuickRequestFields,
  words: { defaultTitle: string; contactsWord: string },
): BuiltQuickPreset {
  const description = fields.description.trim();
  const name = fields.name.trim();
  const phone = fields.phone.trim();

  const contacts = [name, phone].filter(Boolean).join(', ');
  const body = contacts
    ? `${description}\n\n${words.contactsWord}: ${contacts}`
    : description;

  const firstLine = description.split('\n')[0]?.trim() ?? '';
  const title = (firstLine || words.defaultTitle).slice(0, TITLE_LIMIT);

  return { title, description: body };
}
