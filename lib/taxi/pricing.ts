/**
 * ВайТакси: расчёт цены «как в Яндексе».
 *
 * Цена = подача + км·«за км» + минуты·«за мин», сверху множитель
 * тарифа и часовой множитель спроса. Параметры цены могут быть свои
 * у каждого тарифа (п.9 замечаний 23.08); глобальная тарифная сетка —
 * дефолт, пока у тарифа не заполнены свои поля.
 *
 * Доплаты (решения владельца 23.08):
 *  · межгород: километры сверх порога считаются по повышенной ставке;
 *  · детское кресло: фиксированная доплата (опция child_seat);
 *  · отмена после принятия: информативная плата (нал/СБП мимо сервиса).
 */

export interface TaxiFare {
  baseFare: number;
  perKm: number;
  perMin: number;
  minFare: number;
  roadFactor: number;
  /** Доплата за детское кресло, ₽. */
  childSeatFee?: number;
  /** С какого километра начинается межгород. */
  intercityFromKm?: number;
  /** Ставка за км межгорода, ₽. */
  intercityPerKm?: number;
  /** Плата за отмену после принятия заказа, ₽. */
  cancelFee?: number;
}

export interface TaxiTariff {
  id: string;
  labelRu: string;
  labelCe: string;
  multiplier: number;
  sortOrder: number;
  isActive: boolean;
  /** Свои параметры цены тарифа (иначе — глобальная сетка × множитель). */
  baseFare?: number | null;
  perKm?: number | null;
  perMin?: number | null;
}

export interface SurgeSlot {
  startHour: number;
  endHour: number;
  multiplier: number;
}

export interface RideEstimate {
  distanceKm: number;
  minutes: number;
  /** Итог с тарифом, спросом и доплатами, округлён до 10 ₽. */
  price: number;
  surge: number;
  /** Плата за отмену после принятия (информативно). */
  cancelFee: number;
}

/** Расстояние по прямой (хаверсин), км. */
export function haversineKm(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Множитель спроса на заданный час. Слоты не пересекаются; если час
 * не попал ни в один — 1 (обычный спрос).
 */
export function surgeAt(slots: SurgeSlot[], hour: number): number {
  const slot = slots.find((s) => hour >= s.startHour && hour < s.endHour);
  return slot ? Number(slot.multiplier) : 1;
}

/**
 * Оценка поездки.
 *
 *  · расстояние — прямая × дорожный коэффициент;
 *  · минуты — расстояние со средней 30 км/ч;
 *  · км сверх порога межгорода — по повышенной ставке;
 *  · опция child_seat — доплата за кресло;
 *  · цена округляется до 10 ₽.
 */
export function estimateRide(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  fare: TaxiFare,
  tariff: Pick<TaxiTariff, 'multiplier' | 'baseFare' | 'perKm' | 'perMin'>,
  slots: SurgeSlot[],
  now: Date,
  options: string[] = [],
): RideEstimate {
  const straight = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const distanceKm = Math.round(straight * fare.roadFactor * 10) / 10;
  const minutes = Math.max(1, Math.round((distanceKm / 30) * 60));

  // Свои параметры тарифа, иначе глобальная сетка × множитель тарифа.
  const base = tariff.baseFare ?? fare.baseFare * tariff.multiplier;
  const perKm = tariff.perKm ?? fare.perKm * tariff.multiplier;
  const perMin = tariff.perMin ?? fare.perMin * tariff.multiplier;

  // Межгород: км сверх порога — по повышенной ставке.
  const intercityFrom = fare.intercityFromKm ?? Number.POSITIVE_INFINITY;
  const intercityPer = fare.intercityPerKm ?? perKm;
  const cityKm = Math.min(distanceKm, intercityFrom);
  const intercityKm = Math.max(0, distanceKm - intercityFrom);

  const surge = surgeAt(slots, now.getHours());
  const raw = Math.max(
    fare.minFare,
    base + cityKm * perKm + intercityKm * intercityPer + minutes * perMin,
  ) * surge
    + (options.includes('child_seat') ? (fare.childSeatFee ?? 0) : 0);

  return {
    distanceKm,
    minutes,
    price: Math.max(10, Math.round(raw / 10) * 10),
    surge,
    cancelFee: fare.cancelFee ?? 0,
  };
}

/**
 * Требования к машине по тарифам (таблица Яндекса, сведённая к нашим
 * четырём: п.9). Год машины ниже порога — тариф недоступен; «—»
 * (null) — тариф машине не положен вовсе. Минивэн — отдельный список.
 */
export interface CarRequirements {
  yearEconomy: number | null;
  yearComfort: number | null;
  yearBusiness: number | null;
  isMinivan: boolean;
}

export function tariffAllowed(
  tariffId: string,
  carYear: number | null,
  req: CarRequirements | null,
): boolean {
  if (tariffId === 'minivan') return Boolean(req?.isMinivan);
  if (!req) return true; // требований нет — не блокируем
  const min = tariffId === 'economy'
    ? req.yearEconomy
    : tariffId === 'comfort'
      ? req.yearComfort
      : tariffId === 'business'
        ? req.yearBusiness
        : null;
  if (min == null) return false; // «—» в таблице
  if (carYear == null) return true; // год не указан — не блокируем заранее
  return carYear >= min;
}
