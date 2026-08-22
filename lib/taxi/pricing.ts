/**
 * ВайТакси v1: расчёт цены «как в Яндексе» — подача + километры +
 * минуты, сверху множитель тарифа и часовой множитель спроса.
 *
 * Чистые функции: сервер (эндпоинт заказа) и тесты используют одно и
 * то же; цена фиксируется при заказе и не меняется в пути.
 */

export interface TaxiFare {
  baseFare: number;
  perKm: number;
  perMin: number;
  minFare: number;
  roadFactor: number;
}

export interface TaxiTariff {
  id: string;
  labelRu: string;
  labelCe: string;
  multiplier: number;
  sortOrder: number;
  isActive: boolean;
}

export interface SurgeSlot {
  startHour: number;
  endHour: number;
  multiplier: number;
}

export interface RideEstimate {
  distanceKm: number;
  minutes: number;
  /** Итог с тарифом и спросом, округлён до 10 ₽. */
  price: number;
  surge: number;
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
 *  · расстояние — прямая × дорожный коэффициент (сельские петли);
 *  · минуты — расстояние со средней 30 км/ч (село, не трасса);
 *  · цена — max(минималка, подача + км·тариф + мин·тариф) × множители,
 *    округление до 10 ₽, чтобы не возиться с мелочью наличными.
 */
export function estimateRide(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  fare: TaxiFare,
  tariffMultiplier: number,
  slots: SurgeSlot[],
  now: Date,
): RideEstimate {
  const straight = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const distanceKm = Math.round(straight * fare.roadFactor * 10) / 10;
  const minutes = Math.max(1, Math.round((distanceKm / 30) * 60));

  const surge = surgeAt(slots, now.getHours());
  const raw = Math.max(
    fare.minFare,
    fare.baseFare + distanceKm * fare.perKm * tariffMultiplier
      + minutes * fare.perMin * tariffMultiplier,
  ) * surge;

  return {
    distanceKm,
    minutes,
    price: Math.max(10, Math.round(raw / 10) * 10),
    surge,
  };
}
