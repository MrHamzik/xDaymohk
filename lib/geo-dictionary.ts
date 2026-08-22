/**
 * Справочник топонимов Чеченской Республики для гео-фильтров
 * («Города / Районы / Сёла» в фильтрах каталога, карты и Темщика).
 *
 * Статусы актуализированы по 2026 год [Википедия, реестр АТД ЧР]:
 * городами стали Ачхой-Мартан (2023), Курчалой (2021), Ойсхара,
 * Серноводское, Наурская, Шелковская (2024). В «сёлах» их больше нет.
 */

export const GEO_CITIES: string[] = [
  'Грозный', 'Аргун', 'Ачхой-Мартан', 'Курчалой', 'Урус-Мартан',
  'Шали', 'Гудермес', 'Ойсхара', 'Серноводское', 'Наурская', 'Шелковская',
];

export interface GeoDistrict {
  id: string;
  name: string;
  /** Сёла, входящие в район. */
  villages: string[];
}

export const GEO_DISTRICTS: GeoDistrict[] = [
  {
    id: 'achkhoy',
    name: 'Ачхой-Мартановский',
    villages: [
      'Самашки', 'Катаяма', 'Давыденко', 'Новый Шарой', 'Янди', 'Бамут',
      'Закан-Юрт', 'Кулары', 'Валерик', 'Шаами-Юрт', 'Старый Ачхой',
      'Хамби-Ирзи', 'Катар-Юрт',
    ],
  },
  {
    id: 'sunzha',
    name: 'Сунженский',
    villages: ['Ассиновская', 'Бердкел'],
  },
  {
    id: 'urus',
    name: 'Урус-Мартановский',
    villages: ['Гехи', 'Рошни-Чу', 'Гой-Чу', 'Танги-Чу'],
  },
  {
    id: 'gudermes',
    name: 'Гудермесский',
    villages: ['Джалка', 'Илсхан-Юрт', 'Кошкельды'],
  },
  {
    id: 'shali',
    name: 'Шалинский',
    villages: ['Автуры', 'Сержень-Юрт', 'Новые Атаги'],
  },
  {
    id: 'kurchaloy',
    name: 'Курчалоевский',
    villages: ['Ахмат-Юрт', 'Майртуп', 'Цоци-Юрт'],
  },
  {
    id: 'grozny',
    name: 'Грозненский',
    villages: ['Старые Атаги', 'Алхан-Кала', 'Толстой-Юрт'],
  },
  {
    id: 'naur',
    name: 'Наурский',
    villages: ['Ищерская', 'Чернокозово', 'Мекенское'],
  },
  {
    id: 'shelkovskoy',
    name: 'Шелковской',
    villages: ['Гребенская', 'Червленная'],
  },
];

/** Все сёла плоским списком. */
export const GEO_VILLAGES: string[] = GEO_DISTRICTS.flatMap((d) => d.villages);

/**
 * Требования к машинам по тарифам живут в БД (car_requirements,
 * миграция 80); здесь — только топонимы для фильтров.
 */
export interface GeoSelection {
  cities: string[];
  districts: string[];
  villages: string[];
}

export const EMPTY_GEO_SELECTION: GeoSelection = { cities: [], districts: [], villages: [] };

export function geoSelectionIsEmpty(sel: GeoSelection): boolean {
  return sel.cities.length === 0 && sel.districts.length === 0 && sel.villages.length === 0;
}

/**
 * Совпадает ли адрес анкеты с выбором. Пустой выбор = «Даймохк —
 * Чеченская Республика» (охватывает всё, п.11 замечаний 23.08).
 * Район раскрывается в свои сёла + собственное имя.
 */
export function matchesGeoSelection(
  haystackRaw: string,
  sel: GeoSelection,
): boolean {
  if (geoSelectionIsEmpty(sel)) return true;
  const haystack = haystackRaw.toLowerCase();
  if (!haystack.trim()) return false;
  const hit = (name: string) => haystack.includes(name.toLowerCase());
  if (sel.cities.some(hit)) return true;
  if (sel.villages.some(hit)) return true;
  return sel.districts.some((id) => {
    const district = GEO_DISTRICTS.find((d) => d.id === id);
    if (!district) return false;
    if (hit(district.name)) return true;
    return district.villages.some(hit);
  });
}

/** Число выбранных топонимов — для счётчика в кнопке «Фильтры». */
export function geoSelectionCount(sel: GeoSelection): number {
  return sel.cities.length + sel.districts.length + sel.villages.length;
}
