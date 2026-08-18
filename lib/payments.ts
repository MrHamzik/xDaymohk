/**
 * Способы оплаты задания и ссылки в банковские приложения.
 *
 * Главное ограничение, которое определило всю эту реализацию
 * ---------------------------------------------------------
 * Собрать ссылку «переведи Ахмеду 500 ₽ по СБП» НЕЛЬЗЯ. Схема
 * `bank100000000111://qr.nspk.ru/...` работает только с QR-кодом,
 * зарегистрированным банком-эквайером; произвольные ссылки НСПК не
 * обрабатывает. Прямые диплинки банков (например Сбера
 * `payments/p2p?type=card_number`) открывают форму перевода, но поля в
 * ней НЕ заполняются — это подтверждают и разработчики, и практика.
 *
 * Поэтому оплата сделана в два шага:
 *   1. Скопировать реквизиты и сумму — работает всегда, на любом
 *      устройстве, независимо от банка.
 *   2. Открыть приложение банка — удобство поверх первого шага.
 *
 * Исключение — ЮMoney: у него есть настоящая ссылка вида
 * yoomoney.ru/to/<кошелёк>/<сумма>, которая открывает страницу оплаты с
 * уже подставленной суммой. Для него второй шаг работает полноценно.
 *
 * Сервис в расчётах НЕ участвует: деньги идут напрямую между людьми
 * (ИП на НПД не вправе быть посредником, ст. 4 ч. 2 п. 5 422-ФЗ).
 */

export const PAYMENT_METHODS = ['cash', 'sbp', 'card', 'yoomoney'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Реквизиты исполнителя для прямого перевода. */
export interface PayoutMethods {
  /**
   * Согласие показывать реквизиты заказчику.
   *
   * Выключено — сервер отдаёт пустые реквизиты, даже если поля
   * заполнены: человек мог передумать, и его номер карты не должен
   * продолжать показываться только потому, что строка осталась в БД.
   */
  isEnabled: boolean;
  sbpPhone: string;
  sbpBank: string;
  cardNumber: string;
  cardBank: string;
  yoomoneyWallet: string;
}

export const EMPTY_PAYOUT: PayoutMethods = {
  isEnabled: false,
  sbpPhone: '', sbpBank: '', cardNumber: '', cardBank: '', yoomoneyWallet: '',
};

/**
 * Банки для выбора при переводе.
 *
 * `scheme` — схема диплинка приложения. Она открывает банк, но НЕ
 * подставляет сумму и номер: у российских банков нет публичного
 * протокола для этого. Поэтому в интерфейсе рядом всегда стоит
 * копирование, а кнопка банка подписана честно.
 */
export interface BankOption {
  id: string;
  name: string;
  /** Схема для мобильного приложения (Android/iOS). */
  scheme?: string;
}

export const BANKS: BankOption[] = [
  { id: 'sber', name: 'Сбербанк', scheme: 'btripsexpenses://' },
  { id: 'tbank', name: 'Т-Банк', scheme: 'tinkoffbank://' },
  { id: 'vtb', name: 'ВТБ', scheme: 'vtb24://' },
  { id: 'alfa', name: 'Альфа-Банк', scheme: 'alfabank://' },
  { id: 'raif', name: 'Райффайзен', scheme: 'raiffeisennews://' },
  { id: 'gazprom', name: 'Газпромбанк', scheme: 'gazprombank://' },
  { id: 'rshb', name: 'Россельхозбанк', scheme: 'rshb://' },
  { id: 'otkritie', name: 'Открытие', scheme: 'open-bank://' },
  { id: 'psb', name: 'Промсвязьбанк', scheme: 'psbmobile://' },
  { id: 'sovcom', name: 'Совкомбанк', scheme: 'sovcombank://' },
  { id: 'mkb', name: 'МКБ' },
  { id: 'other', name: 'Другой банк' },
];

export function bankName(id: string): string {
  return BANKS.find((b) => b.id === id)?.name ?? id;
}

export function bankScheme(id: string): string | undefined {
  return BANKS.find((b) => b.id === id)?.scheme;
}

/** Оставить только цифры (номера телефонов, карт, кошельков). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Телефон в формате +7XXXXXXXXXX.
 * Возвращает пустую строку, если номер не похож на российский.
 */
export function normalizePhone(value: string): string {
  let digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length === 11 && digits.startsWith('7') ? `+${digits}` : '';
}

/** Читаемый номер: +7 (999) 123-45-67. */
export function formatPhone(value: string): string {
  const normalized = normalizePhone(value);
  if (!normalized) return value;
  const d = normalized.slice(2);
  return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

/** Карта группами по 4: 2202 2002 1234 5678. */
export function formatCard(value: string): string {
  const digits = digitsOnly(value);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/** Скрытый номер карты для показа третьим лицам: •••• 5678. */
export function maskCard(value: string): string {
  const digits = digitsOnly(value);
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '';
}

export function isValidCard(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 16 && digits.length <= 19;
}

export function isValidWallet(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 11 && digits.length <= 16;
}

/**
 * Ссылка на оплату ЮMoney с подставленной суммой.
 *
 * Единственный способ из четырёх, где сумма реально подставляется:
 * ЮMoney принимает её прямо в пути ссылки. Открывается и в браузере, и
 * в приложении, если оно установлено.
 */
export function yoomoneyLink(wallet: string, amount: number): string {
  const digits = digitsOnly(wallet);
  const sum = Math.max(1, Math.round(amount));
  return `https://yoomoney.ru/to/${digits}/${sum}`;
}
