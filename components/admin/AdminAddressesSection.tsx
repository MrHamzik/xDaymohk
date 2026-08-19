'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { MapPin, MapPinned, Plus, RotateCcw, Save as SaveIcon, Search, ShieldAlert, Trash2, Upload, X, Pencil } from 'lucide-react';
import AdminPickMap from '@/components/admin/AdminPickMap';
import { useI18n } from '@/lib/i18n';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { SAMASHKI_HOUSE_ADDRESSES, SamashkiHouseAddress, getEffectiveHouseAddresses } from '@/lib/samashki-addresses';
import { SAMASHKI_STREETS } from '@/lib/types';

/**
 * Раздел «Адреса» админки: дома, объекты, импорт, дубли.
 * Вынесен из app/admin/page.tsx вместе со всей своей логикой.
 */

const CUSTOM_ADDRESSES_KEY = 'daymohk-custom-addresses';
const CUSTOM_CATEGORIES_KEY = 'daymohk-custom-categories';
const DEFAULT_ADDRESS_CATEGORIES = ['Дома','Другое','Автосервис','Магазины','Торговля','Школа','Образование','Мечеть','Администрация','Почта','Спорткомплекс','Здравоохранение'];
function decimalToDMSParts(decimal: number, isLat: boolean) {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
  return { deg, min, sec, dir };
}
function decimalToDMSString(lat: number, lng: number): string {
  const latP = decimalToDMSParts(lat, true);
  const lngP = decimalToDMSParts(lng, false);
  return `${latP.deg}°${latP.min}'${latP.sec.toFixed(1)}"${latP.dir} ${lngP.deg}°${lngP.min}'${lngP.sec.toFixed(1)}"${lngP.dir}`;
}
function parseCoordPart(text: string): number | null {
  const upper = text.toUpperCase().trim();
  if (!upper) return null;
  let isNegative = false;
  if (upper.includes('S') || upper.includes('W')) isNegative = true;
  const hasMinus = upper.trim().startsWith('-');
  const nums = upper.match(/[0-9]+(?:\.[0-9]+)?/g);
  if (!nums || nums.length === 0) return null;
  let deg = 0;
  if (nums.length === 1) deg = parseFloat(nums[0]);
  else if (nums.length === 2) deg = parseFloat(nums[0]) + parseFloat(nums[1]) / 60;
  else deg = parseFloat(nums[0]) + parseFloat(nums[1]) / 60 + parseFloat(nums[2]) / 3600;
  if (hasMinus) isNegative = true;
  return isNegative ? -Math.abs(deg) : Math.abs(deg);
}
function parseDMSString(input: string): { lat: number; lng: number } | null {
  if (!input.trim()) return null;
  const normalized = input.trim();
  const combinedRegex = /(.+?[NS])[^0-9A-Z]*([.0-9°'"′″\s]+[EW])/i;
  const m = normalized.match(combinedRegex);
  if (m) {
    const lat = parseCoordPart(m[1]);
    const lng = parseCoordPart(m[2]);
    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    }
  }
  if (normalized.includes(',')) {
    const parts = normalized.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const lat = parseCoordPart(parts[0]);
      const lng = parseCoordPart(parts.slice(1).join(' '));
      if (lat !== null && lng !== null) return { lat, lng };
    }
  }
  const upper = normalized.toUpperCase();
  const nIndex = Math.max(upper.lastIndexOf('N'), upper.lastIndexOf('S'));
  const eIndex = Math.max(upper.lastIndexOf('E'), upper.lastIndexOf('W'));
  if (nIndex > 0 && eIndex > nIndex) {
    const lat = parseCoordPart(normalized.slice(0, nIndex + 1));
    const lng = parseCoordPart(normalized.slice(nIndex + 1));
    if (lat !== null && lng !== null) return { lat, lng };
  }
  const allNums = normalized.match(/-?[0-9]+(?:\.[0-9]+)?/g);
  if (allNums) {
    if (allNums.length === 2) {
      const lat = parseFloat(allNums[0]);
      const lng = parseFloat(allNums[1]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    if (allNums.length >= 6) {
      const lat = parseFloat(allNums[0]) + parseFloat(allNums[1]) / 60 + parseFloat(allNums[2]) / 3600;
      const lng = parseFloat(allNums[3]) + parseFloat(allNums[4]) / 60 + parseFloat(allNums[5]) / 3600;
      return { lat, lng };
    }
  }
  return null;
}

function stripUlPrefix(street: string): string {
  return street.replace(/^ул\.\s*/i, '').trim();
}
function ensureUlPrefix(name: string): string {
  const clean = name.trim().replace(/^ул\.\s*/i, '').trim();
  if (!clean) return 'ул. ';
  return `ул. ${clean}`;
}

/** Нормализует улицу для сравнения: регистр, «ул.», лишние пробелы. */
function normalizeStreetKey(s: string): string {
  return s.trim().toLowerCase().replace(/^ул\.\s*/i, '').replace(/\s+/g, ' ').trim();
}
/** Нормализует номер дома для сравнения: регистр, «д.», пробелы. */
function normalizeHouseKey(n: string): string {
  return n.trim().toLowerCase().replace(/^д\.\s*/i, '').replace(/\s+/g, ' ').trim();
}
/** Нормализует полный адрес для сравнения: регистр и пробелы. */
function normalizeFullKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').trim();
}

let importIdCounter = 0;
/** Уникальный id для импортированных адресов. Date.now()+счётчик могут совпасть
 *  при быстрых повторных импортах (React: duplicate keys) — добавляем random. */
function makeImportId(): string {
  importIdCounter += 1;
  return `addr-imp-${Date.now()}-${importIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Находит дубликаты: новые записи против существующих.
 * Дубль = совпадение (улица + номер) ИЛИ совпадение точного fullAddress.
 * Сравнение регистронезависимое, «ул.»/«д.» отбрасываются.
 */
function findDuplicateAddresses(
  existing: SamashkiHouseAddress[],
  candidates: SamashkiHouseAddress[],
): { existing: SamashkiHouseAddress; candidate: SamashkiHouseAddress }[] {
  const streetMap = new Map<string, SamashkiHouseAddress>();
  const fullMap = new Map<string, SamashkiHouseAddress>();
  for (const e of existing) {
    if (e.isNotHouse) {
      fullMap.set(normalizeFullKey(e.fullAddress), e);
    } else {
      const k = `${normalizeStreetKey(e.street)}|${normalizeHouseKey(e.houseNumber)}`;
      if (!streetMap.has(k)) streetMap.set(k, e);
    }
  }
  const dups: { existing: SamashkiHouseAddress; candidate: SamashkiHouseAddress }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    let ex: SamashkiHouseAddress | undefined;
    if (c.isNotHouse) {
      ex = fullMap.get(normalizeFullKey(c.fullAddress));
    } else {
      ex = streetMap.get(`${normalizeStreetKey(c.street)}|${normalizeHouseKey(c.houseNumber)}`);
      if (!ex) ex = fullMap.get(normalizeFullKey(c.fullAddress));
    }
    if (ex) {
      const k = `${normalizeStreetKey(c.street)}|${normalizeHouseKey(c.houseNumber)}|${normalizeFullKey(c.fullAddress)}`;
      if (!seen.has(k)) { seen.add(k); dups.push({ existing: ex, candidate: c }); }
    }
  }
  return dups;
}

export default function AdminAddressesSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);

  // Addresses
  const [addresses, setAddresses] = useState<SamashkiHouseAddress[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const eff = getEffectiveHouseAddresses();
        // Дедуп по id: старый кэш мог накопить записи с одинаковым id
        // (баги старых версий) — они ломали счётчики удаления (Set).
        const seen = new Set<string>();
        return eff.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
      } catch {}
    }
    return SAMASHKI_HOUSE_ADDRESSES;
  });
  const [streetName, setStreetName] = useState('Заводская');
  // Единое поле «Область, улица, дом» (п.5). Пример: «с. Самашки, ул. Заводская, д. 28».
  const [fullAddressInput, setFullAddressInput] = useState('');
  const parseFullAddress = (raw: string) => {
    const value = raw.trim();
    setFullAddressInput(value);
    // Разбираем: «с. Самашки, ул. Заводская, д. 28» / «г. Грозный, ул. Ленина, д. 1» / «с. Самашки, Мечеть»
    const regionMatch = value.match(/^(с\.|г\.|р-н)\s+([^,]+),\s*/i);
    if (regionMatch) {
      setRegionType((regionMatch[1] || 'с.').toLowerCase() as 'с.' | 'г.' | 'р-н');
      setRegionName(regionMatch[2].trim());
    }
    const streetMatch = value.match(/(?:ул\.|улица|пер\.|переулок)\s*([^,]+?)(?:,\s*(?:д\.|дом)\s*([^,]+))?$/i);
    if (streetMatch) {
      setStreetName(stripUlPrefix(streetMatch[1].trim()));
      if (streetMatch[2]) setHouseNumber(streetMatch[2].trim());
    } else {
      // без улицы — возможно объект: «с. Самашки, Мечеть»
      const afterRegion = value.replace(/^(с\.|г\.|р-н)\s+[^,]+,\s*/i, '');
      if (afterRegion && !afterRegion.includes('ул')) {
        setHouseNumber(afterRegion.trim());
      }
    }
  };
  // Тип области: г. / р-н / с. (п.5)
  const [regionType, setRegionType] = useState<'с.' | 'г.' | 'р-н'>('с.');
  const [regionName, setRegionName] = useState('Самашки');
  const [houseNumber, setHouseNumber] = useState('');
  const [isNotHouse, setIsNotHouse] = useState(false);
  const [newLat, setNewLat] = useState('43.2880');
  const [newLng, setNewLng] = useState('45.2989');
  const [dmsInput, setDmsInput] = useState(() => decimalToDMSString(43.2880, 45.2989));
  const [dmsError, setDmsError] = useState('');
  // Карта выбора координат в форме адреса: клик по пустому месту
  // ставит точку. Раньше координаты можно было только вписать руками
  // или найти геокодером — для нового объекта без адреса это тупик.
  const [isPickMapOpen, setIsPickMapOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  // Общий справочник категорий карты из БД (app_filters, scope='map').
  // Раздел «Фильтры» → «Карта» и этот экран должны показывать одно и
  // то же: раньше здесь был только localStorage, поэтому списки
  // расходились между устройствами и между разделами админки.
  const [dbMapCategories, setDbMapCategories] = useState<string[]>([]);
  const reloadMapCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/filters?scope=map', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setDbMapCategories(
        (data.filters ?? [])
          .map((f: { labelRu?: string }) => String(f.labelRu ?? '').trim())
          .filter(Boolean),
      );
    } catch {
      // офлайн — останется локальный список
    }
  }, []);
  useEffect(() => { reloadMapCategories(); }, [reloadMapCategories]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addressFilter, setAddressFilter] = useState<string>('all');
  const [addressSearch, setAddressSearch] = useState('');
  // Пагинация списка адресов: по 100 на страницу, чтобы не вешать консоль
  // при тысячах домов в БД.
  const [addressPage, setAddressPage] = useState(0);
  const ADDRESS_PAGE_SIZE = 100;
  const [selectedAddressCategory, setSelectedAddressCategory] = useState<string>('Другое');

  // street suggestions
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [showStreetSug, setShowStreetSug] = useState(false);
  const streetInputRef = useRef<HTMLInputElement>(null);

  // editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStreetName, setEditStreetName] = useState('');
  const [editHouseNumber, setEditHouseNumber] = useState('');
  const [editIsNotHouse, setEditIsNotHouse] = useState(false);
  // Категория для «не дом» при редактировании (Магазин, Мечеть и т.п.).
  const [editCategory, setEditCategory] = useState('Другое');
  const [editRegionType, setEditRegionType] = useState<'с.' | 'г.' | 'р-н'>('с.');
  const [editRegionName, setEditRegionName] = useState('Самашки');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  // У какого адреса раскрыта карта выбора точки (правка существующего).
  const [editMapId, setEditMapId] = useState<string | null>(null);

  // soft-delete queue: addresses removed in this session that the user
  // can still restore. They are committed to the database only when the
  // user explicitly presses "Сохранить".
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  // Brand-new addresses added in this session but not yet committed.
  // Tracked separately so the "Сохранить" button can show the right
  // count and so a page refresh doesn't lose the form's input.
  const [pendingAdds, setPendingAdds] = useState<SamashkiHouseAddress[]>([]);
  // Модалка дублей при импорте/добавлении адресов.
  // Пара (existing + candidate): «Заменить» = удалить existing и добавить candidate
  // (иначе повторный импорт одного файла раздувает базу копиями).
  const [dupModal, setDupModal] = useState<{
    pairs: { existing: SamashkiHouseAddress; candidate: SamashkiHouseAddress }[];
    kept: { existing: SamashkiHouseAddress; candidate: SamashkiHouseAddress }[];
    onResolve: (kept: { existing: SamashkiHouseAddress; candidate: SamashkiHouseAddress }[]) => void;
  } | null>(null);
  const [dupExpanded, setDupExpanded] = useState(false);

  useEffect(() => {
    // ЖЁСТКАЯ привязка к БД: источник истины — таблица house_addresses.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/addresses', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.addresses && Array.isArray(data.addresses)) {
            if (!cancelled) {
              setAddresses(data.addresses as SamashkiHouseAddress[]);
              try { localStorage.setItem(CUSTOM_ADDRESSES_KEY, JSON.stringify(data.addresses)); } catch {}
            }
          }
        }
      } catch {}
    })();
    try {
      const cats = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
      if (cats) {
        const parsed = JSON.parse(cats) as string[];
        if (Array.isArray(parsed)) setCustomCategories(parsed);
      }
    } catch {}
    return () => { cancelled = true; };
  }, []);

  const persistAddresses = async (next: SamashkiHouseAddress[], deleteIds: string[] = []): Promise<number> => {
    setAddresses(next);
    try { localStorage.setItem(CUSTOM_ADDRESSES_KEY, JSON.stringify(next)); } catch {}
    try {
      let accessToken: string | undefined;
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token;
      }
      const res = await fetch('/api/admin/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ addresses: next, deleteIds }),
      });
      if (!res.ok) {
        // Сервер не применил изменения — НЕ даём ложное «Сохранено»:
        // пробрасываем, чтобы handleCommitAddresses показал ошибку.
        let detail = '';
        try { detail = (await res.json())?.error || ''; } catch {}
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      return Number(data?.deletedCount ?? 0);
    } catch (e) {
      throw new Error(`Не удалось сохранить в БД: ${e instanceof Error ? e.message : 'ошибка'}`);
    }
  };

  const allAddressCategories = Array.from(new Set([
    ...DEFAULT_ADDRESS_CATEGORIES,
    ...dbMapCategories,
    ...customCategories,
    ...addresses.map(a=>a.category).filter(Boolean) as string[],
  ]));

  const visibleAddresses = addresses.filter((a) => !pendingDeletes.has(a.id));
  const deletedAddresses = addresses.filter((a) => pendingDeletes.has(a.id));

  const searchQ = addressSearch.trim().toLowerCase();
  const matchesSearch = (a: SamashkiHouseAddress) => {
    if (!searchQ) return true;
    const hay = `${a.street} ${a.houseNumber} ${a.fullAddress} ${a.lat} ${a.lng}`.toLowerCase();
    return hay.includes(searchQ);
  };
  const filteredAddresses = addressFilter === '__deleted__'
    ? deletedAddresses.filter(matchesSearch)
    : visibleAddresses.filter((a) => {
        if (addressFilter === 'all') return matchesSearch(a);
        if (addressFilter === 'Дома') return !a.isNotHouse && matchesSearch(a);
        if (addressFilter === 'Другое') return !!a.isNotHouse && matchesSearch(a);
        return a.category === addressFilter && matchesSearch(a);
      });
  // Страница списка: при смене фильтра/поиска возвращаемся на первую.
  const totalPages = Math.max(1, Math.ceil(filteredAddresses.length / ADDRESS_PAGE_SIZE));
  const safePage = Math.min(addressPage, totalPages - 1);
  const pageItems = filteredAddresses.slice(safePage * ADDRESS_PAGE_SIZE, safePage * ADDRESS_PAGE_SIZE + ADDRESS_PAGE_SIZE);

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (allAddressCategories.includes(name)) { setNewCategoryName(''); return; }

    // Пишем в общий справочник: слаг из русского названия, как в
    // миграции 22. localStorage больше не источник истины — он остаётся
    // только запасным вариантом, если БД недоступна.
    const slug = name.toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/[а-яё]/g, (ch) => {
        const map: Record<string, string> = {
          а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'j',
          к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
          х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
        };
        return map[ch] ?? '';
      }) || `cat-${Date.now()}`;

    try {
      const { data: sessionData } = await supabase!.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/tasks/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope: 'map', value: slug, labelRu: name, sortOrder: 500 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Не удалось сохранить категорию');
      }
      await reloadMapCategories();
      setNewCategoryName('');
      setSaveMsg(`Категория "${name}" добавлена`);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Не удалось добавить категорию');
    }
    setTimeout(()=>setSaveMsg(null),2500);
  };
  const handleDeleteCategory = (cat: string) => {
    const next = customCategories.filter(c=>c!==cat);
    setCustomCategories(next);
    try { localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next)); } catch {}
  };

  useEffect(() => {
    const q = streetName.trim().toLowerCase();
    if (q.length < 1) { setStreetSuggestions([]); return; }
    // Подсказки улиц — из базы адресов (addresses, источник истины) +
    // статический список SAMASHKI_STREETS. Внешние геосервисы (OSM/Dadata)
    // НЕ дёргаем — они жгут лимит, а дома уже в нашей БД.
    const fromDb = Array.from(new Set(
      addresses
        .map((a) => a.street?.replace(/^ул\.\s*/i, '').trim())
        .filter((s): s is string => Boolean(s) && s.toLowerCase().includes(q)),
    ));
    const matches = Array.from(new Set([
      ...fromDb,
      ...SAMASHKI_STREETS.filter((s) => s.toLowerCase().includes(q)),
    ])).slice(0, 8);
    setStreetSuggestions(matches);
  }, [streetName, addresses]);

  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [geocodeMsg, setGeocodeMsg] = useState('');
  const reverseGeocode = async () => {
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setGeocodeMsg('Введите координаты.');
      return;
    }
    setGeocodeBusy(true);
    setGeocodeMsg('');
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      const data = await response.json().catch(() => null);
      const results = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) {
        setGeocodeMsg('Не найдено по координатам. Оставьте поля пустыми и заполните вручную.');
        return;
      }
      const r = results[0];
      const regionRaw = r.region || '';
      const settlementRaw = r.settlement || '';
      const nameRaw = settlementRaw || regionRaw || '';
      const name = String(nameRaw).replace(/^(село|город|район|г\.|с\.|р-н|пос\.|пгт)\s+/i, '');
      setRegionName(name || 'Самашки');
      setRegionType(nameRaw.match(/город/i) ? 'г.' : nameRaw.match(/район/i) ? 'р-н' : 'с.');
      setStreetName(stripUlPrefix(String(r.street || '').replace(/^(улица|ул\.)\s+/i, '')));
      setHouseNumber(String(r.house || ''));
      setGeocodeMsg('Подставлено из координат. Проверьте и при необходимости исправьте.');
    } catch {
      setGeocodeMsg('Геокодер недоступен.');
    } finally {
      setGeocodeBusy(false);
    }
  };

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const latNum = parseFloat(newLat);
    const lngNum = parseFloat(newLng);
    if (isNaN(latNum) || isNaN(lngNum)) { setSaveMsg('Проверьте координаты'); setTimeout(()=>setSaveMsg(null),3000); return; }
    const streetFull = ensureUlPrefix(streetName);
    const regionPrefix = `${regionType} ${regionName.trim() || 'Самашки'}, `;
    // Для дома — неизменный префикс «д. N»; для объекта — «(название)».
    const housePart = houseNumber.trim();
    if (!isNotHouse && !housePart) {
      setSaveMsg('Укажите номер дома'); setTimeout(()=>setSaveMsg(null),3000); return;
    }
    const fullAddr = isNotHouse
      ? `${regionPrefix}${streetFull} (${selectedAddressCategory || 'Другое'})`
      : `${regionPrefix}${streetFull}, д. ${housePart}`;
    const house: SamashkiHouseAddress = {
      id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      street: streetFull,
      houseNumber: houseNumber.trim() || (isNotHouse ? '—' : ''),
      fullAddress: fullAddr,
      lat: latNum,
      lng: lngNum,
      postalCode: '366602',
      isNotHouse: isNotHouse || undefined,
      category: isNotHouse ? (selectedAddressCategory || 'Другое') : undefined,
    };
    // Проверка дублей при ручном добавлении.
    const existingForDup = [...addresses, ...pendingAdds];
    const dup = findDuplicateAddresses(existingForDup, [house]);
    if (dup.length > 0) {
      openDupModal(existingForDup, [house], (keptPairs) => {
        if (keptPairs.length === 0) {
          setSaveMsg('Дубль исключён, адрес не добавлен.');
        } else {
          // «Заменить» = удалить существующий и добавить новый (без дублей в БД).
          const removeIds = new Set(keptPairs.map((p) => p.existing.id));
          setAddresses((cur) => cur.filter((a) => !removeIds.has(a.id)));
          setPendingAdds((cur) => cur.filter((a) => !removeIds.has(a.id)));
          const kept = keptPairs.map((p) => p.candidate);
          setAddresses((cur) => [...kept, ...cur]);
          setPendingAdds((cur) => [...kept, ...cur]);
          setSaveMsg('Адрес заменён. Нажмите «Сохранить», чтобы записать.');
        }
        setTimeout(() => setSaveMsg(null), 2500);
      });
      return;
    }
    setAddresses((cur) => [house, ...cur]);
    setPendingAdds((cur) => [house, ...cur]);
    setHouseNumber('');

    setSaveMsg('Адрес добавлен. Нажмите «Сохранить», чтобы записать.');
    setTimeout(()=>setSaveMsg(null),2500);
  };

  const handleDeleteAddress = (id: string) => {
    // Soft delete: the row stays in `addresses` until the user saves, but
    // it is hidden from the active list. A separate filter "Удалённые"
    // exposes them with a single restore button.
    setPendingDeletes((cur) => {
      const next = new Set(cur);
      next.add(id);
      return next;
    });

    setSaveMsg('Адрес перенесён в «Удалённые». Сохраните изменения или восстановите его.');
    setTimeout(()=>setSaveMsg(null),2500);
  };

  const handleRestoreAddress = (id: string) => {
    setPendingDeletes((cur) => {
      const next = new Set(cur);
      next.delete(id);
      return next;
    });

  };

  /** Импорт адресов из файла (GeoJSON / CSV / KML) — экспорт Яндекс Карт. */
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const importAddressFile = async (file: File) => {
    if (!file) return;
    setImportBusy(true);
    setImportMsg('');
    try {
      const text = await file.text();
      let imported: SamashkiHouseAddress[] = [];
      const lower = file.name.toLowerCase();
      const regionPrefix = `${regionType} ${regionName.trim() || 'Самашки'}, `;

      // Формирует запись «дома» из улицы и номера (единый формат с ручным добавлением).
      const pushHouse = (streetRaw: string, houseRaw: string, lat: number, lng: number) => {
        const streetFull = ensureUlPrefix(streetRaw.trim());
        const houseNum = houseRaw.trim();
        const fullAddr = houseNum
          ? `${regionPrefix}${streetFull}, д. ${houseNum}`
          : `${regionPrefix}${streetFull}`;
        imported.push({
          id: makeImportId(),
          street: streetFull,
          houseNumber: houseNum,
          fullAddress: fullAddr,
          lat,
          lng,
          postalCode: '366602',
          isNotHouse: false,
        });
      };

      if (lower.endsWith('.geojson') || lower.endsWith('.json') || text.trim().startsWith('{')) {
        // GeoJSON: FeatureCollection of Points.
        // Дома из OSM/Overpass приходят с properties.addr:street / addr:housenumber
        // и распознаются как дома; обычные точки (name/title/address) — как объекты.
        const geo = JSON.parse(text);
        const features = geo?.features ?? [];
        for (const f of features) {
          const coords = f?.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) continue;
          const props = f?.properties ?? {};
          const [lng, lat] = coords;
          const addrStreet = String(props['addr:street'] || props.street || '').trim();
          const addrHouse = String(props['addr:housenumber'] ?? props.housenumber ?? props.house_number ?? '').trim();
          if (addrStreet) {
            pushHouse(addrStreet, addrHouse, Number(lat), Number(lng));
            continue;
          }
          const name = String(props.name || props.title || props.address || props.description || '').trim();
          imported.push({
            id: makeImportId(),
            street: name || 'Объект',
            houseNumber: '',
            fullAddress: name || `Точка ${lat?.toFixed?.(5)}, ${lng?.toFixed?.(5)}`,
            lat: Number(lat),
            lng: Number(lng),
            postalCode: '366602',
            isNotHouse: true,
            category: 'Другое',
          });
        }
      } else if (lower.endsWith('.kml')) {
        // KML: Placemark with Point coordinates
        const kmlMatch = /<Placemark[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<coordinates>([^<]*)<\/coordinates>[\s\S]*?<\/Placemark>/gi;
        let m;
        while ((m = kmlMatch.exec(text)) !== null) {
          const name = m[1].trim();
          const [lng, lat] = m[2].trim().split(',').map(Number);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
          imported.push({
            id: makeImportId(),
            street: name || 'Объект',
            houseNumber: '',
            fullAddress: name || `Точка ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            lat,
            lng,
            postalCode: '366602',
            isNotHouse: true,
            category: 'Другое',
          });
        }
      } else if (lower.endsWith('.csv')) {
        // CSV: заголовки lat/lng + street/house (дома: ФИАС, Overpass) или name/address (объекты).
        // Разделитель определяется автоматически (запятая / точка с запятой / табуляция).
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) {
          setImportMsg('Файл пуст.');
          return;
        }
        const headerRaw = lines[0].toLowerCase();
        const sep =
          (headerRaw.match(/;/g) || []).length > (headerRaw.match(/,/g) || []).length
            ? ';'
            : headerRaw.includes('\t')
              ? '\t'
              : ',';
        const header = headerRaw.split(sep).map((h) => h.trim());
        const idxLat = header.findIndex((h) => h === 'lat' || h === 'latitude' || h.includes('::lat'));
        const idxLng = header.findIndex((h) => h === 'lng' || h === 'lon' || h === 'longitude' || h.includes('::lon'));
        const idxName = header.findIndex((h) => h === 'name' || h === 'title');
        const idxAddr = header.findIndex((h) => h === 'address' || h === 'full_address' || h === 'addr');
        const idxStreet = header.findIndex((h) => h.includes('street'));
        const idxHouse = header.findIndex((h) => h.includes('house'));
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(sep);
          const lat = Number((cells[idxLat] ?? '').trim());
          const lng = Number((cells[idxLng] ?? '').trim());
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const streetRaw = idxStreet >= 0 ? String(cells[idxStreet] ?? '').trim() : '';
          const houseRaw = idxHouse >= 0 ? String(cells[idxHouse] ?? '').trim() : '';
          if (streetRaw) {
            pushHouse(streetRaw, houseRaw, lat, lng);
            continue;
          }
          const name = (idxName >= 0 ? cells[idxName] : '') || (idxAddr >= 0 ? cells[idxAddr] : '') || '';
          imported.push({
            id: makeImportId(),
            street: String(name).trim() || 'Объект',
            houseNumber: '',
            fullAddress: String(name).trim() || `Точка ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            lat,
            lng,
            postalCode: '366602',
            isNotHouse: true,
            category: 'Другое',
          });
        }
      } else {
        setImportMsg('Неизвестный формат. Поддерживаются: GeoJSON (.geojson/.json), CSV, KML.');
        return;
      }

      if (imported.length === 0) {
        setImportMsg('В файле не найдено точек с координатами.');
        return;
      }
      // Дедупликация ВНУТРИ файла: если в CSV/GeoJSON сам адрес повторяется
      // (например, экспорт из раздутой БД), оставляем первую запись —
      // иначе дубли вернутся в базу при импорте.
      {
        const seenInFile = new Set<string>();
        const uniq: SamashkiHouseAddress[] = [];
        for (const a of imported) {
          const k = a.isNotHouse
            ? `obj:${normalizeFullKey(a.fullAddress)}`
            : `house:${normalizeStreetKey(a.street)}|${normalizeHouseKey(a.houseNumber)}`;
          if (seenInFile.has(k)) continue;
          seenInFile.add(k);
          uniq.push(a);
        }
        const removedInFile = imported.length - uniq.length;
        imported = uniq;
        if (removedInFile > 0) {
          setImportMsg(`В файле найдено повторяющихся адресов: ${removedInFile}. Оставлены первые.`);
        }
      }
      const houses = imported.filter((a) => !a.isNotHouse).length;
      const objects = imported.length - houses;
      // Дубли: новые записи против уже существующих (включая pending).
      const existingForDup = [...addresses, ...pendingAdds];
      const dups = findDuplicateAddresses(existingForDup, imported);
      if (dups.length > 0) {
        // Не-дубли добавляем СРАЗУ (не ждём модалку), в модалку — только дубли.
        const dupIds = new Set(dups.map((d) => d.candidate.id));
        const nonDups = imported.filter((a) => !dupIds.has(a.id));
        if (nonDups.length > 0) {
          setAddresses((cur) => [...nonDups, ...cur]);
          setPendingAdds((cur) => [...nonDups, ...cur]);
        }
        setImportMsg(`Найдено дублей: ${dups.length} из ${imported.length}. Новые добавлены, решите по дублям.`);
        openDupModal(existingForDup, dups.map((d) => d.candidate), (keptPairs) => {
          // «Заменить» = удалить существующий, добавить новый — БД не растёт копиями.
          const removeIds = new Set(keptPairs.map((p) => p.existing.id));
          if (removeIds.size > 0) {
            setAddresses((cur) => cur.filter((a) => !removeIds.has(a.id)));
            setPendingAdds((cur) => cur.filter((a) => !removeIds.has(a.id)));
          }
          const kept = keptPairs.map((p) => p.candidate);
          if (kept.length > 0) {
            setAddresses((cur) => [...kept, ...cur]);
            setPendingAdds((cur) => [...kept, ...cur]);
          }
          const total = nonDups.length + kept.length;
          const totalHouses = [...nonDups, ...kept].filter((a) => !a.isNotHouse).length;
          const skipped = dups.length - kept.length;
          setImportMsg(
            `Импортировано: ${total} (домов: ${totalHouses}, объектов: ${total - totalHouses})` +
            (skipped > 0 ? `, исключено дублей: ${skipped}` : '') +
            `. Нажмите «Сохранить».`,
          );
        });
        return;
      }
      setAddresses((cur) => [...imported, ...cur]);
      setPendingAdds((cur) => [...imported, ...cur]);
      setImportMsg(
        `Импортировано: ${imported.length} (домов: ${houses}, объектов: ${objects}). Нажмите «Сохранить».`,
      );
    } catch (e) {
      setImportMsg('Не удалось прочитать файл: ' + (e instanceof Error ? e.message : 'ошибка'));
    } finally {
      setImportBusy(false);
    }
  };

  const handleCommitAddresses = async () => {
    if (pendingDeletes.size === 0 && pendingAdds.length === 0) {
      setSaveMsg('Нет изменений для сохранения.');
      setTimeout(()=>setSaveMsg(null),2000);
      return;
    }
    // Явный список удаляемых id (то, что помечено корзиной/«Очистить»).
    const deleteIds = Array.from(pendingDeletes);
    const next = [...addresses.filter((a) => !pendingDeletes.has(a.id)), ...pendingAdds];
    setPendingDeletes(new Set());
    setPendingAdds([]);

    const removed = deleteIds.length;
    const added = pendingAdds.length;
    const parts: string[] = [];
    if (added > 0) parts.push(`добавлено ${added}`);
    if (removed > 0) parts.push(`удалено ${removed}`);
    setSaveMsg('Сохраняем…');
    try {
      const deletedInDb = await persistAddresses(next, deleteIds);
      setSaveMsg(`${parts.join(', ')} (в БД удалено: ${deletedInDb}) и сохранено.`);
      // Жёсткая синхронизация: после сохранения перечитываем список из БД,
      // чтобы локальное состояние ВСЕГДА совпадало с базой (удалённые не «оживают»).
      try {
        const res = await fetch('/api/admin/addresses', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.addresses && Array.isArray(data.addresses)) {
            setAddresses(data.addresses as SamashkiHouseAddress[]);
            try { localStorage.setItem(CUSTOM_ADDRESSES_KEY, JSON.stringify(data.addresses)); } catch {}
          }
        }
      } catch {}
    } catch (error) {
      setSaveMsg(`Не удалось сохранить: ${error instanceof Error ? error.message : 'ошибка сети'}`);
    }
    setTimeout(()=>setSaveMsg(null),2500);
  };

  /** «Очистить»: помечает ВСЕ адреса на удаление (через pending, до «Сохранить»). */
  const handleClearAllAddresses = () => {
    const ids = new Set(addresses.filter((a) => !pendingDeletes.has(a.id)).map((a) => a.id));
    if (ids.size === 0) return;
    setPendingDeletes((cur) => new Set([...cur, ...ids]));
    setAddressFilter('__deleted__');
    setSaveMsg(`Помечено на удаление: ${ids.size}. Нажмите «Сохранить».`);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  /** Открывает модалку дублей; onResolve получает пары, выбранные «Заменить». */
  const openDupModal = (
    existing: SamashkiHouseAddress[],
    candidates: SamashkiHouseAddress[],
    onResolve: (kept: { existing: SamashkiHouseAddress; candidate: SamashkiHouseAddress }[]) => void,
  ) => {
    const dups = findDuplicateAddresses(existing, candidates);
    if (dups.length === 0) { onResolve([]); return; }
    setDupExpanded(false);
    setDupModal({
      pairs: dups.map((d) => ({ existing: d.existing, candidate: d.candidate })),
      kept: [],
      onResolve,
    });
  };

  /** Мгновенно применяет выбор по строке: keep — «Заменить», skip — «Исключить». */
  const dupChoose = (index: number, mode: 'keep' | 'skip') => {
    if (!dupModal) return;
    const pair = dupModal.pairs[index];
    const kept = mode === 'keep' ? [...dupModal.kept, pair] : dupModal.kept;
    const pairs = dupModal.pairs.filter((_, i) => i !== index);
    if (pairs.length === 0) {
      const cb = dupModal.onResolve;
      setDupModal(null);
      cb(kept);
    } else {
      setDupModal({ ...dupModal, kept, pairs });
    }
  };

  /** «Исключить все» — применяем уже выбранные «Заменить», остальные пропускаем. */
  const dupSkipAll = () => {
    if (!dupModal) return;
    const cb = dupModal.onResolve;
    setDupModal(null);
    cb(dupModal.kept);
  };

  /** «Заменить все» — все оставшиеся дубли заменяют существующие. */
  const dupKeepAll = () => {
    if (!dupModal) return;
    const cb = dupModal.onResolve;
    setDupModal(null);
    cb([...dupModal.kept, ...dupModal.pairs]);
  };

  /** Закрытие (крестик) — применяем уже выбранные «Заменить», остальные пропускаем. */
  const dupClose = () => dupSkipAll();

  const startEdit = (addr: SamashkiHouseAddress) => {
    setEditingId(addr.id);
    setEditStreetName(stripUlPrefix(addr.street));
    setEditHouseNumber(addr.houseNumber === '—' ? '' : addr.houseNumber);
    setEditIsNotHouse(Boolean(addr.isNotHouse));
    setEditCategory(addr.category || 'Другое');
    setEditLat(String(addr.lat));
    setEditLng(String(addr.lng));
    // Область из fullAddress: «с. Самашки, ул. …»
    const regionMatch = String(addr.fullAddress).match(/^(с\.|г\.|р-н)\s+([^,]+),/i);
    if (regionMatch) {
      setEditRegionType((regionMatch[1] || 'с.').toLowerCase() as 'с.' | 'г.' | 'р-н');
      setEditRegionName(regionMatch[2].trim());
    }
  };
  const cancelEdit = () => { setEditingId(null); setEditMapId(null); };
  const saveEdit = () => {
    if (!editingId) return;
    if (!editStreetName.trim()) return;
    const latNum = parseFloat(editLat);
    const lngNum = parseFloat(editLng);
    if (isNaN(latNum) || isNaN(lngNum)) { setSaveMsg('Координаты неверные'); return; }
    const streetFull = ensureUlPrefix(editStreetName);
    const regionPrefix = `${editRegionType} ${editRegionName.trim() || 'Самашки'}, `;
    const next = addresses.map((a) => a.id === editingId ? {
      ...a,
      street: streetFull,
      houseNumber: editHouseNumber.trim() || (editIsNotHouse ? '—' : a.houseNumber),
      // Для «не дом» в скобках — выбранная категория объекта (Магазин, Мечеть и т.п.).
      fullAddress: editIsNotHouse
        ? `${regionPrefix}${streetFull} (${editCategory || 'Другое'})`
        : `${regionPrefix}${streetFull}, д. ${editHouseNumber.trim()}`,
      lat: latNum,
      lng: lngNum,
      isNotHouse: editIsNotHouse || undefined,
      category: editIsNotHouse ? (editCategory || 'Другое') : undefined,
    } : a);
    setAddresses(next);
    setEditingId(null);

    setSaveMsg('Изменения внесены. Нажмите «Сохранить» для записи в БД.');
    setTimeout(()=>setSaveMsg(null),2500);
  };

  const handleLatChange = (value: string) => {
    setNewLat(value);
    const latNum = parseFloat(value);
    const lngNum = parseFloat(newLng);
    if (!isNaN(latNum) && !isNaN(lngNum)) { setDmsInput(decimalToDMSString(latNum, lngNum)); setDmsError(''); }
  };
  const handleLngChange = (value: string) => {
    setNewLng(value);
    const latNum = parseFloat(newLat);
    const lngNum = parseFloat(value);
    if (!isNaN(latNum) && !isNaN(lngNum)) { setDmsInput(decimalToDMSString(latNum, lngNum)); setDmsError(''); }
  };
  const handleDmsChange = (value: string) => {
    setDmsInput(value);
    if (!value.trim()) { setDmsError(''); return; }
    const parsed = parseDMSString(value);
    if (parsed) {
      setNewLat(parsed.lat.toFixed(6));
      setNewLng(parsed.lng.toFixed(6));
      setDmsError('');
    } else if (value.length > 10) setDmsError('Не удалось распознать. Пример: 43°17\'15.8"N 45°17\'59.3"E');
  };

  return (
    <>
          <section className="space-y-5">
            <div><h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Адреса', 'Адресаш')}</h3><p className="text-sm text-slate-500 dark:text-zinc-500">{L('Улица с автопрефиксом ул., подсказки из OSM, чекбокс Не дом → категория Другое, редактирование карандашом, автосохранение.', 'Урам ул. авто-префиксца, OSM хьехам, Не дом чекбокс → Другое категори, къоламца хийцар, авто-дIаяздар.')}</p></div>

            <form onSubmit={handleAddAddress} className="smk-lux p-5">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{L('Добавить адрес или объект', 'Адрес йа объект тIетоха')}</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* Область: с./г./р-н + название */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{L('Область', 'Область')}</label>
                    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800">
                      <select
                        value={regionType}
                        onChange={(e) => setRegionType(e.target.value as 'с.' | 'г.' | 'р-н')}
                        className="shrink-0 border-r border-slate-200 bg-slate-100 px-2 py-2.5 text-xs font-bold text-slate-700 outline-none dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                      >
                        <option value="с.">с.</option>
                        <option value="г.">г.</option>
                        <option value="р-н">р-н</option>
                      </select>
                      <input
                        value={regionName}
                        onChange={(e) => setRegionName(e.target.value)}
                        placeholder="Самашки"
                        className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                      />
                    </div>
                  </div>
                  {/* Улица: неизменный префикс ул. */}
                  <div className="sm:col-span-1">
                    <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{L('Улица', 'Урам')}</label>
                    <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800">
                      <span className="select-none bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">ул.</span>
                      <input ref={streetInputRef} value={streetName} onChange={(e)=>{ setStreetName(e.target.value); setShowStreetSug(true); }} onFocus={()=>setShowStreetSug(true)} onBlur={()=>setTimeout(()=>setShowStreetSug(false),200)} placeholder="Заводская" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" required />
                    </div>
                    {/* Подсказки улиц из базы адресов (+ SAMASHKI_STREETS) */}
                    {showStreetSug && streetSuggestions.length > 0 && (
                      <div className="absolute z-30 mt-1 w-full overflow-hidden smk-panel p-1 shadow-xl">
                        {streetSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setStreetName(s); setShowStreetSug(false); }}
                            className="block w-full truncate rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-emerald-50 dark:text-zinc-300 dark:hover:bg-emerald-950/40"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Дом/объект: префикс д., при «Не дом» — категория */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{isNotHouse ? L('Объект', 'Объект') : L('Дом', 'ЦIа')}</label>
                    <div className="flex items-stretch gap-2">
                      <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800">
                        {!isNotHouse && <span className="select-none bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">д.</span>}
                        {isNotHouse ? (
                          <select
                            value={selectedAddressCategory}
                            onChange={(e) => setSelectedAddressCategory(e.target.value)}
                            className="min-w-0 flex-1 bg-amber-50 px-3 py-2.5 text-xs text-slate-900 outline-none dark:bg-amber-950/30 dark:text-white"
                          >
                            {allAddressCategories.filter((c) => c !== 'Дома').map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={houseNumber}
                            onChange={(e) => setHouseNumber(e.target.value)}
                            placeholder="28"
                            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                            required
                          />
                        )}
                      </div>
                      {/* self-stretch вместо фиксированной h-10: соседние
                          поля имеют py-2.5 и растут вместе со шрифтом,
                          а кнопка оставалась ниже их. Цвета — слот
                          «предупреждение», а не литералы amber. */}
                      <label className="smk-note smk-note-warn flex shrink-0 cursor-pointer select-none items-center gap-2 self-stretch px-3 transition">
                        <input type="checkbox" checked={isNotHouse} onChange={(e) => setIsNotHouse(e.target.checked)} className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500" />
                        {L('Не дом', 'ЦIа дац')}
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{L('Координаты — широта и долгота в один ряд', 'Координаташ — шоралла а, дохалла а цхьана могIарехь')}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Lat</span><input value={newLat} onChange={(e)=>handleLatChange(e.target.value)} placeholder="43.288024" className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" required /></div>
                    <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Lng</span><input value={newLng} onChange={(e)=>handleLngChange(e.target.value)} placeholder="45.298989" className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" required /></div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{L('Формат DMS', 'DMS формат')}</label>
                  <input value={dmsInput} onChange={(e)=>handleDmsChange(e.target.value)} placeholder={`43°17'15.8"N 45°17'59.3"E`} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-white" />
                  {dmsError && <p className="mt-1 text-xs text-amber-600">{dmsError}</p>}
                </div>

                {/* Выбор точки на карте: клик ставит координаты в поля
                    выше. Для объектов без почтового адреса («родник за
                    околицей») это единственный способ задать место, не
                    выясняя цифры на стороне. */}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsPickMapOpen((v) => !v)}
                    aria-expanded={isPickMapOpen}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  >
                    <MapPinned className="h-3.5 w-3.5" />
                    {isPickMapOpen
                      ? L('Скрыть карту', 'Карта къайлаяккха')
                      : L('Указать точку на карте', 'Картин тIехь меттиг билгалъяккха')}
                  </button>

                  {isPickMapOpen && (
                    <div className="mt-2 space-y-2">
                      <p className="smk-note smk-note-info px-3 py-2">
                        {L(
                          'Нажмите на карту — координаты подставятся в поля выше. Кнопкой «Поиск» можно затем подтянуть улицу и дом.',
                          'Карти тIе тIетаIае — координаташ лакхарчу меттигашка хIуттур ю. «Лахар» кнопкаца урам а, цIа а схьаэца мега.',
                        )}
                      </p>
                      <AdminPickMap
                        lat={parseFloat(newLat)}
                        lng={parseFloat(newLng)}
                        onPick={(lat, lng) => {
                          handleLatChange(lat.toFixed(6));
                          handleLngChange(lng.toFixed(6));
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"><Plus className="h-3.5 w-3.5" />{L('Добавить', 'ТIетоха')}</button>
                  <button type="button" onClick={() => void reverseGeocode()} disabled={geocodeBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"><Search className="h-3.5 w-3.5" />{geocodeBusy ? 'Ищем…' : 'Поиск'}</button>
                  {(saveMsg || geocodeMsg || importMsg) && <span className="text-xs font-semibold text-emerald-600">{importMsg || geocodeMsg || saveMsg}</span>}
                </div>
              </div>
            </form>

            <div className="smk-lux p-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{L('Поиск и категории', 'Лахар а, категореш а')}</h4>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={addressSearch}
                    onChange={(e) => { setAddressSearch(e.target.value); setNewCategoryName(e.target.value); }}
                    placeholder={L('Поиск: улица, дом, адрес, координаты...', 'Лахар: урам, цIа, адрес, координаташ...')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                <button type="button" onClick={handleAddCategory} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500">{L('Добавить', 'ТIетоха')}</button>
              </div>
              {searchQ && (
                <p className="mt-2 smk-text-label text-slate-500 dark:text-zinc-500">
                  {L('Найдено адресов:', 'Карийна адресаш:')} {filteredAddresses.length} {L('по запросу', 'дехарца')} «{addressSearch.trim()}»
                </p>
              )}
              {customCategories.length>0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {customCategories.map((cat)=>(
                    <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 smk-text-label font-semibold dark:bg-zinc-800">{cat}<button type="button" onClick={()=>handleDeleteCategory(cat)} className="ml-1 text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button key="all" type="button" onClick={()=>setAddressFilter('all')} className={`rounded-full px-2.5 py-1 smk-text-label font-bold transition ${addressFilter==='all' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400'}`}>{L('Все', 'Массо')}</button>
                {allAddressCategories.map((cat)=>(
                  <button key={cat} type="button" onClick={()=>setAddressFilter(cat)} className={`rounded-full px-2.5 py-1 smk-text-label font-bold transition ${addressFilter===cat ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400'}`}>{cat}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                  {addressFilter === '__deleted__' ? L('Удалённые', 'ДIадаьхнарш') : L('Сохранённые', 'ДIаязйинарш')} ({filteredAddresses.length}
                  {addressFilter !== '__deleted__' && addressFilter === 'all' ? ` из ${addresses.length}` : ''})
                </h4>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {/* Импорт — загружает файл, адреса попадают в pending (через «Сохранить») */}
                  <label className="inline-flex cursor-pointer items-center gap-1.5 smk-field px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50  dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <Upload className="h-3.5 w-3.5" />{importBusy ? L('Читаем…', 'Йоьшу…') : L('Импорт', 'Импорт')}
                    <input
                      type="file"
                      accept=".geojson,.json,.csv,.kml"
                      className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void importAddressFile(f); e.target.value = ''; }}
                    />
                  </label>
                  {/* Очистить — помечает ВСЕ адреса на удаление (через pending) */}
                  <button
                    type="button"
                    onClick={handleClearAllAddresses}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {L('Очистить', 'ЦIанъян')}
                  </button>
                  {deletedAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddressFilter('__deleted__')}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        addressFilter === '__deleted__'
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {L('Удалённые', 'ДIадаьхнарш')} ({deletedAddresses.length})
                    </button>
                  )}
                  {(pendingDeletes.size > 0 || pendingAdds.length > 0) && (
                    <button
                      type="button"
                      onClick={handleCommitAddresses}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <SaveIcon className="h-3.5 w-3.5" />
                      {L('Сохранить', 'ДIаязде')} ({pendingDeletes.size + pendingAdds.length})
                    </button>
                  )}
                </div>
              </div>
              {filteredAddresses.length === 0 && (
                <div className="smk-dashed p-6 text-center text-xs text-slate-500 dark:text-zinc-500">
                  {addressFilter === '__deleted__' ? L('Удалённых адресов нет.', 'ДIадаьхна адресаш бац.') : L('Нет адресов для этого фильтра.', 'ХIокху фильтран адресаш бац.')}
                </div>
              )}
              {pageItems.map((address) => {
                const isDeleted = pendingDeletes.has(address.id);
                return (
                  <div key={address.id} className={`rounded-2xl border p-3 shadow-sm ${isDeleted ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'}`}>
                    {editingId === address.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                          <div>
                            <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-800">
                              <select
                                value={editRegionType}
                                onChange={(e) => setEditRegionType(e.target.value as 'с.' | 'г.' | 'р-н')}
                                className="shrink-0 border-r border-slate-200 bg-slate-100 px-1.5 py-2 text-xs font-bold text-slate-700 outline-none dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                              >
                                <option value="с.">с.</option>
                                <option value="г.">г.</option>
                                <option value="р-н">р-н</option>
                              </select>
                              <input value={editRegionName} onChange={(e)=>setEditRegionName(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs outline-none dark:text-white" />
                            </div>
                          </div>
                          <div className="sm:col-span-2">
                            <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-800">
                              <span className="px-3 py-2 text-xs font-bold text-slate-400">ул.</span>
                              <input value={editStreetName} onChange={(e)=>setEditStreetName(e.target.value)} className="flex-1 bg-transparent px-2 py-2 text-xs outline-none dark:text-white" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 smk-text-label font-bold text-slate-400">д.</span>
                            {editIsNotHouse ? (
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value)}
                                className="flex-1 rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/30 dark:text-white"
                              >
                                {allAddressCategories.filter((c) => c !== 'Дома').map((cat) => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            ) : (
                              <input value={editHouseNumber} onChange={(e)=>setEditHouseNumber(e.target.value)} className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                            )}
                            <label className="flex shrink-0 cursor-pointer select-none items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 smk-text-label font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50">
                              <input type="checkbox" checked={editIsNotHouse} onChange={(e)=>setEditIsNotHouse(e.target.checked)} className="h-3.5 w-3.5 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500" />
                              {L('Не дом', 'ЦIа дац')}
                            </label>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Lat</span>
                            <input value={editLat} onChange={(e)=>setEditLat(e.target.value)} className="smk-field w-full py-2 pl-10 pr-3 text-xs text-slate-900 outline-none dark:text-white" />
                          </div>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Lng</span>
                            <input value={editLng} onChange={(e)=>setEditLng(e.target.value)} className="smk-field w-full py-2 pl-10 pr-3 text-xs text-slate-900 outline-none dark:text-white" />
                          </div>
                        </div>

                        {/* Правка точки на карте — то же, что при добавлении.
                            Раньше карта была только в форме нового адреса, а
                            у существующих оставались голые поля с цифрами:
                            поправить положение дома можно было лишь вручную. */}
                        <div>
                          <button
                            type="button"
                            onClick={() => setEditMapId(editMapId === address.id ? null : address.id)}
                            aria-expanded={editMapId === address.id}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                          >
                            <MapPinned className="h-3.5 w-3.5" />
                            {editMapId === address.id
                              ? L('Скрыть карту', 'Карта къайлаяккха')
                              : L('Указать точку на карте', 'Картин тIехь меттиг билгалъяккха')}
                          </button>

                          {editMapId === address.id && (
                            <div className="mt-2">
                              <AdminPickMap
                                lat={parseFloat(editLat)}
                                lng={parseFloat(editLng)}
                                onPick={(lat, lng) => {
                                  setEditLat(lat.toFixed(6));
                                  setEditLng(lng.toFixed(6));
                                }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button type="button" onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><SaveIcon className="h-3 w-3" />{L('Сохранить', 'ДIаязде')}</button>
                          <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"><X className="h-3 w-3" />{L('Отмена', 'Юхадаккха')}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${address.isNotHouse ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'}`}><MapPin className="h-4 w-4" /></div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                              {address.fullAddress}
                              {address.isNotHouse && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 smk-text-label text-amber-800">{address.category || 'Другое'}</span>}
                              {isDeleted && <span className="ml-1 rounded bg-red-600 px-1 py-0.5 smk-text-label font-bold text-white">{L('Удалён', 'ДIадаьккхина')}</span>}
                            </p>
                            <p className="truncate smk-text-label text-slate-500">{L('Координаты:', 'Координаташ:')} {address.lat.toFixed(5)}, {address.lng.toFixed(5)} · {decimalToDMSString(address.lat, address.lng)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isDeleted ? (
                            <button
                              type="button"
                              onClick={()=>handleRestoreAddress(address.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 smk-text-label font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                              title="Восстановить"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              {L('Восстановить', 'ЮхаметтахIотто')}
                            </button>
                          ) : (
                            <>
                              <button type="button" onClick={()=>startEdit(address)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"><Pencil className="h-4 w-4" /></button>
                              <button type="button" onClick={()=>handleDeleteAddress(address.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredAddresses.length > ADDRESS_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setAddressPage(safePage - 1)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    ← {L('Предыдущая', 'Хьалхара')}
                  </button>
                  <span className="px-2 text-xs font-bold text-slate-500 dark:text-zinc-400">
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setAddressPage(safePage + 1)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {L('Следующая', 'ТIаьхьара')} →
                  </button>
                </div>
              )}
            </div>
          </section>
      {dupModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="dup-title">
          <div className="w-full max-w-lg overflow-hidden smk-sheet shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="dup-title" className="text-base font-bold text-slate-900 dark:text-white">{L('Найдены дубли адресов', 'Карийна адресийн дублаш')}</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">
                    решено {dupModal.kept.length} из {dupModal.kept.length + dupModal.pairs.length} — кнопки применяются сразу
                  </p>
                </div>
              </div>
              <button type="button" onClick={dupClose} aria-label="Закрыть" className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-5 py-4 no-scrollbar">
              <p className="mb-3 text-xs text-slate-500 dark:text-zinc-500">
                Дубль — адрес с такой же улицей и номером (или с тем же полным адресом), что уже есть в базе.
                «Заменить» — удалит старый и добавит новый (без дублей), «Исключить» — пропустит.
              </p>
              {dupExpanded ? (
                <div className="space-y-2">
                  {dupModal.pairs.map((pair, i) => (
                    <div key={i} className="smk-inset p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{pair.candidate.fullAddress}</p>
                          <p className="mt-0.5 smk-text-label text-slate-500 dark:text-zinc-500">
                            уже есть: {pair.existing.fullAddress}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button type="button" onClick={() => dupChoose(i, 'keep')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 smk-text-label font-bold text-white hover:bg-emerald-700">
                            {L('Заменить', 'Хийца')}
                          </button>
                          <button type="button" onClick={() => dupChoose(i, 'skip')}
                            className="rounded-lg bg-slate-100 px-2.5 py-1.5 smk-text-label font-bold text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                            {L('Исключить', 'ДIасадаккха')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-zinc-900 dark:text-zinc-400">
                  {L('Осталось решить:', 'Дисадисинарг билгалде:')} {dupModal.pairs.length}. {L('Разверните список, чтобы решать по одному.', 'МогIам дIаелла, цхьацца билгалде.')}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 dark:border-zinc-800">
              <button type="button" onClick={() => setDupExpanded(!dupExpanded)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300">
                {dupExpanded ? L('Свернуть', 'ДIакъовла') : L('Развернуть список', 'МогIам дIаелла')}
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={dupSkipAll}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300">
                  {L('Исключить все', 'Массо дIасадаккха')}
                </button>
                <button type="button" onClick={dupKeepAll}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  {L('Заменить все', 'Массо хийца')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
