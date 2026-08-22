import { describe, expect, it } from 'vitest';
import { estimateRide, haversineKm, surgeAt } from '@/lib/taxi/pricing';

/**
 * ВайТакси v1: цена «как в Яндексе» — подача + км + минуты, сверху
 * тариф и часовой множитель. Проверяем математику до UI.
 */

const FARE = { baseFare: 50, perKm: 15, perMin: 2, minFare: 100, roadFactor: 1.3 };

// Самашки → Грозный (примерно 45 км прямой).
const SAMASHKI = { lat: 43.288024, lng: 45.298989 };
const GROZNY = { lat: 43.317, lng: 45.692 };
// Две улицы села: ~1.2 км.
const VILLAGE_A = { lat: 43.288, lng: 45.299 };
const VILLAGE_B = { lat: 43.298, lng: 45.301 };

describe('haversineKm', () => {
  it('село → Грозный около 40+ км прямой', () => {
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
    expect(surgeAt(slots, 3)).toBe(1.2);
  });

  it('вне слотов — обычный спрос', () => {
    expect(surgeAt(slots, 12)).toBe(1);
    expect(surgeAt([], 8)).toBe(1);
  });

  it('граница интервала: конец не входит', () => {
    expect(surgeAt(slots, 9)).toBe(1);
    expect(surgeAt(slots, 6)).toBe(1);
  });
});

describe('estimateRide', () => {
  const noon = new Date('2026-08-22T12:00:00');
  const peak = new Date('2026-08-22T08:00:00');
  const slots = [{ startHour: 7, endHour: 9, multiplier: 1.5 }];

  it('короткая поездка по селу — не ниже минималки', () => {
    const e = estimateRide(VILLAGE_A, VILLAGE_B, FARE, 1, [], noon);
    expect(e.price).toBeGreaterThanOrEqual(FARE.minFare);
    expect(e.distanceKm).toBeGreaterThan(1);
    expect(e.distanceKm).toBeLessThan(3);
  });

  it('дальняя поездка дороже минималки и округлена до 10 ₽', () => {
    const e = estimateRide(SAMASHKI, GROZNY, FARE, 1, [], noon);
    expect(e.price).toBeGreaterThan(500);
    expect(e.price % 10).toBe(0);
    expect(e.surge).toBe(1);
  });

  it('в пик цена умножается на спрос', () => {
    const plain = estimateRide(SAMASHKI, GROZNY, FARE, 1, [], noon);
    const surged = estimateRide(SAMASHKI, GROZNY, FARE, 1, slots, peak);
    expect(surged.surge).toBe(1.5);
    // Допуск на двойное округление до 10 ₽.
    expect(Math.abs(surged.price - plain.price * 1.5)).toBeLessThanOrEqual(15);
  });

  it('тариф комфорт дороже эконома', () => {
    const economy = estimateRide(SAMASHKI, GROZNY, FARE, 1, [], noon);
    const comfort = estimateRide(SAMASHKI, GROZNY, FARE, 1.3, [], noon);
    expect(comfort.price).toBeGreaterThan(economy.price);
  });

  it('минуты считаются от дистанции (30 км/ч)', () => {
    const e = estimateRide(SAMASHKI, GROZNY, FARE, 1, [], noon);
    const expected = Math.max(1, Math.round((e.distanceKm / 30) * 60));
    expect(e.minutes).toBe(expected);
  });
});
