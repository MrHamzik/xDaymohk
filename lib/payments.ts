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
  { id: 'ozon', name: 'Озон Банк', scheme: 'ozonbank://' },
  { id: 'yandex', name: 'Яндекс Банк' },
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
export function yoomoneyLink(
  wallet: string,
  amount: number,
  comment?: string,
): string {
  const digits = digitsOnly(wallet);
  const sum = Math.max(1, Math.round(amount));

  // Форма Quickpay, а не короткая ссылка /to/<кошелёк>/<сумма>.
  //
  // Разница принципиальная: короткая ссылка ведёт на страницу перевода
  // МЕЖДУ КОШЕЛЬКАМИ и требует войти в ЮMoney. Quickpay с
  // paymentType=AC открывает оплату БАНКОВСКОЙ КАРТОЙ — регистрация не
  // нужна, заказчик вводит только данные карты. Сумма и получатель уже
  // подставлены, вручную ничего копировать не надо.
  const params = new URLSearchParams({
    receiver: digits,
    'quickpay-form': 'button',
    paymentType: 'AC',
    sum: String(sum),
  });
  if (comment) params.set('targets', comment.slice(0, 150));
  return `https://yoomoney.ru/quickpay/confirm?${params.toString()}`;
}

/**
 * Та же оплата, но из кошелька ЮMoney (paymentType=PC).
 *
 * Нужна тем, у кого кошелёк уже есть: комиссии между кошельками нет,
 * тогда как с карты ЮMoney берёт около 1 %.
 */
export function yoomoneyWalletLink(
  wallet: string,
  amount: number,
  comment?: string,
): string {
  const params = new URLSearchParams({
    receiver: digitsOnly(wallet),
    'quickpay-form': 'button',
    paymentType: 'PC',
    sum: String(Math.max(1, Math.round(amount))),
  });
  if (comment) params.set('targets', comment.slice(0, 150));
  return `https://yoomoney.ru/quickpay/confirm?${params.toString()}`;
}

/**
 * Ссылка внутри QR «реквизиты кодом».
 *
 * Это не платёжный QR НСПК: такой регистрирует только банк, собрать его
 * из номера телефона нельзя. Камера открывает обычный https.
 *
 *   ЮMoney — готовая форма Quickpay с суммой.
 *   СБП / карта — страница /r, реквизиты в hash (на сервер не уходят).
 *
 * origin берём с текущего сайта: код должен открывать тот же хост,
 * с которого его показали. Без origin (SSR) для СБП/карты — null.
 */
export function payoutQrHref(
  method: PaymentMethod,
  payout: PayoutMethods,
  amount: number,
  comment?: string,
  origin?: string,
): string | null {
  if (!payout.isEnabled) return null;
  const sum = Math.max(1, Math.round(amount));
  if (!Number.isFinite(sum) || sum > 10_000_000) return null;

  if (method === 'yoomoney') {
    const wallet = digitsOnly(payout.yoomoneyWallet);
    if (!isValidWallet(wallet)) return null;
    return yoomoneyLink(wallet, sum, comment);
  }

  if (method !== 'sbp' && method !== 'card') return null;

  const host = (origin
    ?? (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');
  if (!host.startsWith('https://') && !host.startsWith('http://')) return null;

  const params = new URLSearchParams();
  params.set('m', method);
  params.set('s', String(sum));

  if (method === 'sbp') {
    const phone = normalizePhone(payout.sbpPhone);
    if (!phone) return null;
    params.set('p', phone);
    if (payout.sbpBank) params.set('b', payout.sbpBank.slice(0, 60));
  } else {
    const card = digitsOnly(payout.cardNumber);
    if (!isValidCard(card)) return null;
    params.set('c', card);
    if (payout.cardBank) params.set('b', payout.cardBank.slice(0, 60));
  }

  return `${host}/r#${params.toString()}`;
}

/** То, что страница /r читает из hash. Серверу этот объект не нужен. */
export interface PayoutQrPayload {
  method: 'sbp' | 'card';
  amount: number;
  phone: string;
  card: string;
  bank: string;
}

/** Разобрать hash страницы /r. Мусор и чужие ключи отбрасываются. */
export function parsePayoutQrHash(hash: string): PayoutQrPayload | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const method = params.get('m');
  if (method !== 'sbp' && method !== 'card') return null;

  const amount = Math.round(Number(params.get('s')));
  if (!Number.isFinite(amount) || amount < 1 || amount > 10_000_000) return null;

  const bank = (params.get('b') ?? '').slice(0, 60);

  if (method === 'sbp') {
    const phone = normalizePhone(params.get('p') ?? '');
    if (!phone) return null;
    return { method, amount, phone, card: '', bank };
  }

  const card = digitsOnly(params.get('c') ?? '');
  if (!isValidCard(card)) return null;
  return { method, amount, phone: '', card, bank };
}

/**
 * Какой реквизит обязателен для способа оплаты.
 *
 * Наличные не требуют ничего — расчёт при встрече. Для остальных
 * исполнитель обязан заранее заполнить реквизиты, иначе заказчику
 * некуда переводить, и задание зависает после выполнения.
 */
export function payoutFieldFor(method: PaymentMethod): keyof PayoutMethods | null {
  switch (method) {
    case 'sbp': return 'sbpPhone';
    case 'card': return 'cardNumber';
    case 'yoomoney': return 'yoomoneyWallet';
    case 'cash':
    default: return null;
  }
}

/**
 * Может ли исполнитель взять задание с таким способом оплаты.
 *
 * Проверяем И согласие (`isEnabled`), И сам реквизит: человек мог
 * выключить приём переводов, оставив данные в полях.
 */
export function canAcceptPayment(
  method: PaymentMethod,
  payout: PayoutMethods | null | undefined,
): boolean {
  const field = payoutFieldFor(method);
  if (!field) return true;
  if (!payout?.isEnabled) return false;
  return Boolean(String(payout[field] ?? '').trim());
}
