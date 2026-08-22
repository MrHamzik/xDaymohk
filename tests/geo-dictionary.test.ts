import { describe, expect, it } from 'vitest';
import {
  EMPTY_GEO_SELECTION, GEO_CITIES, GEO_DISTRICTS, GEO_VILLAGES,
  geoSelectionCount, geoSelectionIsEmpty, matchesGeoSelection,
} from '@/lib/geo-dictionary';

/**
 * Гео-фильтр каталога «города / районы / сёла» (п.3 Этапа 2-каталог):
 * матчер топонимов по адресу анкеты.
 */

const SAMASHKI = 'Даймохк, Самашки, ул. Кирова, 15';
const GROZNY = 'г. Грозный, пр. Путина, 1';
const DISTRICT_TEXT = 'Ачхой-Мартановский район, с. Катаяма';
const NOWHERE = 'Даймохк';

describe('matchesGeoSelection', () => {
  it('пустой выбор пропускает всех', () => {
    expect(matchesGeoSelection(NOWHERE, EMPTY_GEO_SELECTION)).toBe(true);
    expect(geoSelectionIsEmpty(EMPTY_GEO_SELECTION)).toBe(true);
  });

  it('город ищет себя в адресе, регистр не важен', () => {
    const sel = { ...EMPTY_GEO_SELECTION, cities: ['Грозный'] };
    expect(matchesGeoSelection(GROZNY, sel)).toBe(true);
    expect(matchesGeoSelection(SAMASHKI, sel)).toBe(false);
  });

  it('село совпадает по имени', () => {
    const sel = { ...EMPTY_GEO_SELECTION, villages: ['Самашки'] };
    expect(matchesGeoSelection(SAMASHKI, sel)).toBe(true);
    expect(matchesGeoSelection(GROZNY, sel)).toBe(false);
  });

  it('район включает свои сёла и собственное имя', () => {
    const sel = { ...EMPTY_GEO_SELECTION, districts: ['achkhoy'] };
    expect(matchesGeoSelection(SAMASHKI, sel)).toBe(true);
    expect(matchesGeoSelection(DISTRICT_TEXT, sel)).toBe(true);
    // Чужое село района не даёт совпадения.
    expect(matchesGeoSelection(GROZNY, sel)).toBe(false);
  });

  it('выборы из разных групп работают как ИЛИ', () => {
    const sel = {
      cities: ['Грозный'],
      districts: [],
      villages: ['Самашки'],
    };
    expect(matchesGeoSelection(GROZNY, sel)).toBe(true);
    expect(matchesGeoSelection(SAMASHKI, sel)).toBe(true);
    expect(geoSelectionCount(sel)).toBe(2);
  });

  it('пустой адрес не совпадает ни с чем при непустом выборе', () => {
    const sel = { ...EMPTY_GEO_SELECTION, villages: ['Самашки'] };
    expect(matchesGeoSelection('  ', sel)).toBe(false);
  });
});

describe('словарь непротиворечив', () => {
  it('село входит ровно в один район', () => {
    const seen = new Map<string, string>();
    for (const district of GEO_DISTRICTS) {
      for (const village of district.villages) {
        expect(seen.get(village), `село ${village} в двух районах`).toBeUndefined();
        seen.set(village, district.id);
      }
    }
  });

  it('города и сёла не пересекаются', () => {
    for (const city of GEO_CITIES) {
      expect(GEO_VILLAGES).not.toContain(city);
    }
  });

  it('плоский список сёл совпадает с районами', () => {
    expect(GEO_VILLAGES.length).toBe(
      GEO_DISTRICTS.reduce((sum, d) => sum + d.villages.length, 0),
    );
  });
});
