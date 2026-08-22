import { describe, expect, it } from 'vitest';
import {
  estimateRide, haversineKm, surgeAt, tariffAllowed, type CarRequirements,
} from '@/lib/taxi/pricing';

/**
 * ВайТакси: цена = подача + км + минуты × тариф × спрос; межгород,
 * детское кресло, отмена; блокировка тарифов по году машины (п.9).
 */

const FARE = {
  baseFare: 50, perKm: 15, perMin: 2, minFare: 100, roadFactor: 1.3,
  childSeatFee: 50, intercityFromKm: 30, intercityPerKm: 25, cancelFee: 100,
};
const ECONOMY = { multiplier: 1, baseFare: null, perKm: null, perMin: null };

// Самашки → Грозный (~32 км прямой → ~42 по дороге: межгород).
const SAMASHKI = { lat: 43.288024, lng: 45.298989 };
const GROZNY = { lat: 43.317, lng: 45.692 };
const VILLAGE_A = { lat: 43.288, lng: 45.299 };
const VILLAGE_B = { lat: 43.298, lng: 45.301 };

describe('haversineKm', () => {
  it('село → Грозный около 30+ км прямой', () => {
    const km = haversineKm(SAMASHKI.lat, SAMASHKI.lng, GROZNY.lat, GROZNY.lng);
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(45);
  });

  it('симметрична и нулевая на той же точке', () => {
    const ab = haversineKm(VILLAGE_A.lat, VILLAGE_A.lng, VILLAGE_B.lat, VILLAGE_B.lng);
    const ba = haversineKm(VILLAGE_B.lat, VILLAGE_B.lng, VILLAGE_A.lat, VILLAGE_A.lng);
    expect(ab).toBeCloseTo(ba, 9);
    expect(haversineKm(43, 45, 43, 45)).toBe(0);
  });
});

describe('surgeAt', () => {
  const slots = [
    { startHour: 7, endHour: 9, multiplier: 1.5 },
    { startHour: 22, endHour: 24, multiplier: 1.2 },
    { startHour: 0, endHour: 6, multiplier: 1.2 },
  ];

  it('час внутри слота даёт множитель слота', () => {
    expect(surgeAt(slots, 8)).toBe(1.5);
    expect(surgeAt(slots, 23)).toBe(1.2);
  });

  it('вне слотов — 1; конец интервала не входит', () => {
    expect(surgeAt(slots, 12)).toBe(1);
    expect(surgeAt(slots, 9)).toBe(1);
    expect(surgeAt([], 8)).toBe(1);
  });
});

describe('estimateRide', () => {
  const noon = new Date('2026-08-22T12:00:00');
  const peak = new Date('2026-08-22T08:00:00');
  const slots = [{ startHour: 7, endHour: 9, multiplier: 1.5 }];

  it('короткая поездка — не ниже минималки', () => {
    const e = estimateRide(VILLAGE_A, VILLAGE_B, FARE, ECONOMY, [], noon);
    expect(e.price).toBeGreaterThanOrEqual(FARE.minFare);
    expect(e.cancelFee).toBe(100);
  });

  it('межгород: км сверх порога дороже', () => {
    const e = estimateRide(SAMASHKI, GROZNY, FARE, ECONOMY, [], noon);
    expect(e.distanceKm).toBeGreaterThan(FARE.intercityFromKm);
    const noInter = estimateRide(SAMASHKI, GROZNY, { ...FARE, intercityFromKm: 1000 }, ECONOMY, [], noon);
    expect(e.price).toBeGreaterThan(noInter.price);
  });

  it('детское кресло — доплата', () => {
    const plain = estimateRide(VILLAGE_A, VILLAGE_B, FARE, ECONOMY, [], noon);
    const child = estimateRide(VILLAGE_A, VILLAGE_B, FARE, ECONOMY, [], noon, ['child_seat']);
    expect(child.price - plain.price).toBe(FARE.childSeatFee);
  });

  it('в пик цена умножается на спрос (допуск на округление)', () => {
    const plain = estimateRide(SAMASHKI, GROZNY, FARE, ECONOMY, [], noon);
    const surged = estimateRide(SAMASHKI, GROZNY, FARE, ECONOMY, slots, peak);
    expect(surged.surge).toBe(1.5);
    expect(Math.abs(surged.price - plain.price * 1.5)).toBeLessThanOrEqual(15);
  });

  it('свои параметры тарифа заменяют сетку × множитель', () => {
    const own = { multiplier: 1, baseFare: 90, perKm: 20, perMin: 3 };
    const a = estimateRide(SAMASHKI, GROZNY, FARE, ECONOMY, [], noon);
    const b = estimateRide(SAMASHKI, GROZNY, FARE, own, [], noon);
    expect(b.price).toBeGreaterThan(a.price);
  });
});

describe('tariffAllowed — таблица требований', () => {
  const req: CarRequirements = {
    yearEconomy: 2011, yearComfort: 2015, yearBusiness: 2016, isMinivan: false,
  };

  it('старая машина не проходит в комфорт и бизнес', () => {
    expect(tariffAllowed('economy', 2012, req)).toBe(true);
    expect(tariffAllowed('comfort', 2012, req)).toBe(false);
    expect(tariffAllowed('business', 2016, req)).toBe(true);
  });

  it('«—» (null) — тариф машине не положен', () => {
    expect(tariffAllowed('business', 2024, { ...req, yearBusiness: null })).toBe(false);
  });

  it('минивэн — только из списка', () => {
    expect(tariffAllowed('minivan', 2020, req)).toBe(false);
    expect(tariffAllowed('minivan', 2020, { ...req, isMinivan: true })).toBe(true);
  });

  it('нет требований или года — не блокируем заранее', () => {
    expect(tariffAllowed('comfort', null, req)).toBe(true);
    expect(tariffAllowed('comfort', 2010, null)).toBe(true);
  });
});
