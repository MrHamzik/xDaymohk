/**
 * Понятные сообщения об ошибках (п.26).
 *
 * Раньше в лицо человеку летел текст от базы данных: «duplicate key
 * value violates unique constraint», «JWT expired», «*=type». Такое
 * сообщение бесполезно вдвойне — человек не понимает, что случилось,
 * и не может внятно рассказать об этом в поддержку.
 *
 * Здесь техническая ошибка превращается в обычную фразу: что
 * произошло и что делать дальше. Исходный текст не выбрасывается —
 * он уходит в консоль (для разработчика) и остаётся в `technical`,
 * чтобы человек мог приложить его к обращению.
 *
 * Правило простое: наружу — человеческий язык, в журнал — подробности.
 */

/** Язык интерфейса: сообщения нужны на обоих. */
export type ErrorLang = 'ru' | 'ce';

interface Rule {
  /** Признак ошибки в исходном тексте (нижний регистр). */
  match: RegExp;
  ru: string;
  ce: string;
}

/**
 * Разбор частых ошибок Postgres/Supabase и сети.
 *
 * Порядок важен: правила проверяются сверху вниз, первое совпадение
 * побеждает. Поэтому частные случаи стоят выше общих.
 */
const RULES: Rule[] = [
  {
    // 23505 — нарушение уникальности.
    match: /duplicate key|already exists|23505|unique constraint/,
    ru: 'Такая запись уже есть. Проверьте, не сохранили ли вы её раньше.',
    ce: 'ХIара яздар хиллехь ду. Хьажа, хьалха ца яздина хилча.',
  },
  {
    // 23503 — ссылка на несуществующую запись.
    match: /foreign key|23503|violates foreign key/,
    ru: 'Запись, на которую вы ссылаетесь, не найдена. Обновите страницу и попробуйте снова.',
    ce: 'Хьо тIетовжуш йолу яздар ца карийна. АгIо керлаян а, юха дlахьажа.',
  },
  {
    // RLS: человек пытается тронуть чужие данные.
    match: /row-level security|rls|permission denied|42501|not authorized|forbidden/,
    ru: 'Недостаточно прав для этого действия. Войдите заново или обратитесь к администратору.',
    ce: 'ХIокху дийраннна бакъонаш тоьаш яц. Юха чугIо я администраторе кхайкха.',
  },
  {
    // Просроченный или битый токен входа.
    match: /jwt|token|session|expired|invalid claim/,
    ru: 'Срок входа истёк. Войдите в аккаунт заново.',
    ce: 'Чугlоран хан чекхъелла. Юха дIачугIо.',
  },
  {
    // Ошибки схемы: колонка или таблица не найдена.
    match: /column .* does not exist|relation .* does not exist|42703|42p01|schema cache/,
    ru: 'Ошибка на стороне сайта: не хватает поля в базе данных. Сообщите об этом в поддержку.',
    ce: 'Сайтан агIор гIалат: хlуманийн бухехь меттиг ца тоьа. ГIоьнан декъе хаийта.',
  },
  {
    // Нарушение проверки или неверный тип значения.
    match: /invalid input syntax|check constraint|22p02|23514|type .* does not match/,
    ru: 'Одно из полей заполнено неверно. Проверьте введённые данные.',
    ce: 'Цхьа меттиг нийса ца юьзна. Хьажа шайга язйинчу хIуманашка.',
  },
  {
    // Обязательное поле пустое.
    match: /null value|not-null|23502/,
    ru: 'Заполнены не все обязательные поля.',
    ce: 'Дерриге а магийна меттигаш ца юьзна.',
  },
  {
    // Слишком много запросов.
    match: /rate limit|too many requests|429/,
    ru: 'Слишком много попыток подряд. Подождите минуту и повторите.',
    ce: 'Дукха гIортарш хилла. Цхьа минот сацийта а, юха дlахьажа.',
  },
  {
    // Файл не помещается в лимит хранилища.
    match: /payload too large|file size|413|exceeded the maximum/,
    ru: 'Файл слишком большой. Выберите файл поменьше.',
    ce: 'Файл чIогIа боккха бу. Кегийра файл харжа.',
  },
  {
    // Сеть недоступна.
    match: /failed to fetch|network|econnrefused|timeout|fetch failed|networkerror/,
    ru: 'Нет связи с сервером. Проверьте интернет и попробуйте снова.',
    ce: 'Серверца зIе яц. Интернет хьажа а, юха дlахьажа.',
  },
  {
    // Сервер упал.
    match: /internal server error|500|502|503|504/,
    ru: 'Сервер временно не отвечает. Попробуйте через пару минут.',
    ce: 'Сервер хIинцца жоп ца ло. Шина минотал тIаьхьа дlахьажа.',
  },
];

/** Запасной текст, когда правило не подошло. */
const FALLBACK = {
  ru: 'Не удалось выполнить действие. Попробуйте ещё раз, а если повторится — сообщите в поддержку.',
  ce: 'Дан ца делира. Юха дlахьажа, юха а хилча — гIоьнан декъе хаийта.',
};

/** Достаёт текст из чего угодно, что прилетело в catch. */
function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const bag = error as Record<string, unknown>;
    // Supabase кладёт подробности в message/details/hint/code.
    const parts = [bag.message, bag.details, bag.hint, bag.code]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);
    if (parts.length > 0) return parts.join(' ');
  }
  return '';
}

export interface HumanError {
  /** Что показать человеку. */
  message: string;
  /** Исходный текст — для обращения в поддержку. Пустой, если его не было. */
  technical: string;
}

/**
 * Превращает любую ошибку в понятную фразу.
 *
 * @param error что угодно из catch;
 * @param lang язык интерфейса;
 * @param context короткая метка места («Сохранение анкеты») — попадает
 *   только в консоль, человеку не показывается.
 */
export function humanError(error: unknown, lang: ErrorLang = 'ru', context?: string): HumanError {
  const technical = rawMessage(error);
  const probe = technical.toLowerCase();

  // Подробности — разработчику в консоль, чтобы причина не потерялась.
  if (technical && typeof console !== 'undefined') {
    console.error(`[${context ?? 'ошибка'}]`, error);
  }

  const rule = technical ? RULES.find((item) => item.match.test(probe)) : undefined;
  const message = rule ? rule[lang] : FALLBACK[lang];
  return { message, technical };
}

/** Короткий вызов, когда нужен только текст для показа. */
export function humanErrorMessage(error: unknown, lang: ErrorLang = 'ru', context?: string): string {
  return humanError(error, lang, context).message;
}
