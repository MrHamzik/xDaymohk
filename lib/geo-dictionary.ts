/**
 * Справочник топонимов Чеченской Республики для фильтра каталога
 * «Города / Районы / Сёла» (решение владельца, Этап 2-каталог, п.3).
 *
 * Статичный словарь, а не данные из БД: населённые пункты ЧР —
 * константа, а адресная книга проекта содержит только дома Самашек.
 * Список правится здесь одной правкой; выбор РАЙОНА включает все его
 * сёла (владелец подтвердил).
 *
 * Фильтр ищет топоним подстрокой в адресе анкеты (поселение + адрес
 * места работы), регистр не важен.
 */

export interface District {
  id: string;
  name: string;
  /** Сёла, входящие в район. */
  villages: string[];
}

export const GEO_CITIES: string[] = [
  'Грозный', 'Аргун', 'Гудермес', 'Урус-Мартан', 'Шали', 'Курчалой',
];

export const GEO_DISTRICTS: District[] = [
  {
    id: 'achkhoy',
    name: 'Ачхой-Мартановский',
    villages: ['Самашки', 'Катаяма', 'Давыденко', 'Новый Шарой', 'Ачхой-Мартан', 'Янди', 'Бамут', 'Закан-Юрт', 'Кулары'],
  },
  {
    id: 'sunzha',
    name: 'Сунженский',
    villages: ['Серноводское', 'Ассиновская', 'Бердкел'],
  },
  {
    id: 'urus',
    name: 'Урус-Мартановский',
    villages: ['Гехи', 'Рошни-Чу', 'Гой-Чу', 'Танги-Чу'],
  },
  {
    id: 'gudermes',
    name: 'Гудермесский',
    villages: ['Джалка', 'Илсхан-Юрт', 'Кошкельды', 'Ойсхара'],
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
    id: 'grozny-district',
    name: 'Грозненский',
    villages: ['Старые Атаги', 'Алхан-Кала', 'Толстой-Юрт'],
  },
  {
    id: 'naur',
    name: 'Наурский',
    villages: ['Наурская', 'Ищерская'],
  },
  {
    id: 'shelkovskoy',
    name: 'Шелковской',
    villages: ['Шелковская', 'Гребенская', 'Червленная'],
  },
];

/** Все сёла плоским списком (для группы «Сёла»). */
export const GEO_VILLAGES: string[] = GEO_DISTRICTS.flatMap((d) => d.villages);

export type GeoGroup = 'city' | 'district' | 'village';

export interface GeoSelection {
  cities: string[];
  districts: string[];
  villages: string[];
}

export const EMPTY_GEO_SELECTION: GeoSelection = { cities: [], districts: [], villages: [] };

export function geoSelectionIsEmpty(sel: GeoSelection): boolean {
  return sel.cities.length === 0 && sel.districts.length === 0 && sel.villages.length === 0;
}

/** Суммарное число выбранных топонимов — для счётчика в фильтре. */
export function geoSelectionCount(sel: GeoSelection): number {
  return sel.cities.length + sel.districts.length + sel.villages.length;
}

/**
 * Совпадает ли адрес анкеты с выбором. Пустой выбор — совпадает всё.
 * Район раскрывается в свои сёла + собственное имя («Ачхой-Мартановский
 * район» в адресе тоже засчитывается).
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
