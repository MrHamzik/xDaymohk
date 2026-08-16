'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Archive, ArrowLeft, Ban, Check, ChevronDown, Clock3, Eye, EyeOff, FolderOpen, MapPin, Moon, Plus, RotateCcw, Save as SaveIcon, Search, Send, ShieldAlert, Star, Sun, Trash2, Upload, UserCheck, UserRound, X, Pencil } from 'lucide-react';
import AdminLetterEditorCard from '@/components/AdminLetterEditorCard';
import AdminFiltersSection from '@/components/admin/AdminFiltersSection';
import { cacheBustAvatarUrl } from '@/lib/media';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import ProfileModal from '@/components/ProfileModal';
import ComplaintResolveModal, { ComplaintResolveMode } from '@/components/ComplaintResolveModal';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { isDevEmail } from '@/lib/admin';
import { useI18n } from '@/lib/i18n';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { SAMASHKI_HOUSE_ADDRESSES, SamashkiHouseAddress, getEffectiveHouseAddresses } from '@/lib/samashki-addresses';
import { SAMASHKI_STREETS } from '@/lib/types';
import { Complaint, NotificationLetterPayload, Profile, UserSummary } from '@/lib/types';

type AdminSection = 'profiles' | 'complaints' | 'users' | 'addresses' | 'letters' | 'filters';
type ProfilesSubTab = 'active' | 'pending' | 'hidden';

const CUSTOM_ADDRESSES_KEY = 'samashki-custom-addresses';
const CUSTOM_CATEGORIES_KEY = 'samashki-custom-categories';
const DEFAULT_ADDRESS_CATEGORIES = ['Дома','Другое','Автосервис','Магазины','Торговля','Школа','Образование','Мечеть','Администрация','Почта','Спорткомплекс','Здравоохранение'];

function isProfileHidden(profile: Profile) {
  return Boolean(profile.isHidden || profile.isBanned);
}

function getStatus(profile: Profile, users?: UserSummary[]) {
  // Метки статусов — без перевода (функция вне компонента, L недоступен;
  // это короткие технические метки, понятные и так).
  // Админ-статус — по владельцу из users (там невидимый разработчик уже
  // исключён), а не по флагу profile.isAdmin.
  const owner = users?.find((u) => u.id === profile.ownerId);
  if (owner?.isAdmin) return { label: 'Админ', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (isProfileHidden(profile)) return { label: 'Скрыта', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (profile.verificationStatus === 'pending') return { label: 'На проверке', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300' };
  if (profile.verificationStatus === 'rejected') return { label: 'Отклонён', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (profile.isVerified || profile.verificationStatus === 'verified') return { label: 'Проверен', icon: <Check className="h-3 w-3" />, className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300' };
  if (profile.isSpecialist) return { label: 'Специалист', icon: <Star className="h-3 w-3" />, className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' };
  return { label: 'Житель', icon: <UserRound className="h-3 w-3" />, className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400' };
}

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

export default function AdminPage() {
  const { account, signInWithGoogle } = useAuth();
  const { profiles, users, complaints, isCurrentUserAdmin, isProfileAdmin, updateProfile, updateComplaint, updateUserBlocked, addReview, refreshRemoteData } = useProfiles();
  const { t, language, setLanguage } = useI18n();
  const { isDarkMode, toggleTheme } = useTheme();
  // Перевод интерфейса админки: переключатель языка в хедере переводит ВСЕ
  // тексты админки (RU/CE), но НЕ тексты самих модальных окон писем — те
  // редактируются отдельным переключателем RU/CE внутри каждой карточки.
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [viewProfile, setViewProfile] = useState<Profile | null>(null);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

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
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addressFilter, setAddressFilter] = useState<string>('all');
  const [addressSearch, setAddressSearch] = useState('');
  // Пагинация списка адресов: по 100 на страницу, чтобы не вешать консоль
  // при тысячах домов в БД.
  const [addressPage, setAddressPage] = useState(0);
  const ADDRESS_PAGE_SIZE = 100;
  const [selectedAddressCategory, setSelectedAddressCategory] = useState<string>('Другое');
  // Remember the active section across page reloads so the user does
  // not lose their place every time they refresh / re-open the admin
  // panel. Persisted in localStorage; falls back to 'pending'.
  const [profilesSubTab, setProfilesSubTab] = useState<ProfilesSubTab>('active');
  // Вкладки раздела «Пользователи»: Жители / Специалисты / Админы.
  const [usersSubTab, setUsersSubTab] = useState<'residents' | 'specialists' | 'admins'>('residents');
  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    if (typeof window === 'undefined') return 'profiles';
    try {
      const stored = window.localStorage.getItem('samashki-admin-section');
      if (stored && ['profiles', 'complaints', 'users', 'addresses', 'letters', 'filters'].includes(stored)) {
        return stored as AdminSection;
      }
    } catch {}
    return 'profiles';
  });

  useEffect(() => {
    try { window.localStorage.setItem('samashki-admin-section', activeSection); } catch {}
  }, [activeSection]);

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

  // ==== Раздел «Письма» ====
  interface LetterDraft {
    id?: string;
    key?: string | null;
    letter_type: 'welcome' | 'custom';
    title_ru: string;
    title_ce: string;
    message_ru: string;
    message_ce: string;
    sender: string;
    preset: string;
    color: string;
    icon: string;
    recipients: 'all' | 'selected';
  }
  const [letters, setLetters] = useState<LetterDraft[]>([]);
  const [welcomeForm, setWelcomeForm] = useState<LetterDraft>({
    letter_type: 'welcome', title_ru: '', title_ce: '', message_ru: '', message_ce: '', sender: 'Даймохк', preset: 'green', color: '', icon: '🎉', recipients: 'all',
  });
  // Модальное окно приветственного сообщения (открывается при заходе).
  // Дефолты — те же, что fallback в OnboardingModal (чтобы превью всегда
  // совпадало с реальным окном, даже пока БД не заполнена).
  const [welcomeModal, setWelcomeModal] = useState<LetterDraft>({
    letter_type: 'welcome', title_ru: 'Добро пожаловать в родной Даймохк', title_ce: 'Марша догIийла хьомечу Даймохка', message_ru: 'Вы можете авторизоваться и заполнить профиль, открыть краткое руководство по приложению или продолжить в режиме гостя.', message_ce: 'Хьо авторизаци йан а, профиль кечйан а мега, приложенин доца руководство йилла а, я гостера дIадерзо.', sender: 'Даймохк', preset: 'green', color: '', icon: '🎉', recipients: 'all',
  });
  const [composeForm, setComposeForm] = useState<LetterDraft>({
    letter_type: 'custom', title_ru: '', title_ce: '', message_ru: '', message_ce: '', sender: 'Даймохк', preset: 'green', color: '', icon: '📩', recipients: 'all',
  });
  // Автосохранение черновика «Написать письмо» в localStorage (чтобы не терять
  // при сворачивании/перезагрузке).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('samashki-compose-draft');
      if (raw) setComposeForm((f) => ({ ...f, ...JSON.parse(raw) }));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('samashki-compose-draft', JSON.stringify(composeForm)); } catch {}
  }, [composeForm]);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [recipientSearch, setRecipientSearch] = useState('');
  const [letterMsg, setLetterMsg] = useState('');
  const [letterSending, setLetterSending] = useState(false);

  const loadLetters = async () => {
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.letters)) {
          setLetters(data.letters);
          const w = data.letters.find((l: LetterDraft) => l.key === 'welcome');
          if (w) setWelcomeForm({ ...welcomeForm, ...w, letter_type: 'welcome' });
          // Тексты модального окна приветствия — тоже из БД, иначе превью
          // в админке всегда показывало бы дефолтные значения.
          const m = data.letters.find((l: LetterDraft) => l.key === 'welcome_modal');
          if (m) setWelcomeModal({ ...welcomeModal, ...m, letter_type: 'welcome' });
        }
        if (Array.isArray(data.queue)) setScheduleQueue(data.queue);
        if (Array.isArray(data.sent)) setSentLogs(data.sent);
      }
    } catch {}
  };

  useEffect(() => {
    if (activeSection === 'letters') {
      // Сначала доставляем готовые письма (ошибки ПОКАЗЫВАЕМ — админ должен
      // видеть, если доставка не сработала), затем обновляем списки —
      // админ сразу видит актуальную очередь и «Отправленные».
      void (async () => {
        await deliverReady(true);
        await loadLetters();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const saveWelcome = async () => {
    setLetterMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ ...welcomeForm, id: 'letter-welcome', key: 'welcome' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLetterMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setLetterMsg('Welcome-шаблон сохранён.');
      void loadLetters();
    } catch (e) {
      setLetterMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const saveWelcomeModal = async () => {
    setLetterMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ ...welcomeModal, id: 'letter-welcome-modal', key: 'welcome_modal' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLetterMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setLetterMsg('Модальное окно сохранено.');
      void loadLetters();
    } catch (e) {
      setLetterMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const translateWelcomeModal = async () => {
    setLetterMsg('Перевожу…');
    const t1 = await googleTranslate(welcomeModal.title_ru);
    const t2 = await googleTranslate(welcomeModal.message_ru);
    setWelcomeModal((f) => ({ ...f, title_ce: t1 || f.title_ce, message_ce: t2 || f.message_ce }));
    if (t1 || t2) setLetterLang((l) => ({ ...l, modal: 'ce' }));
    setLetterMsg(t1 || t2 ? 'Переведено.' : 'Не удалось перевести.');
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const sendCompose = async () => {
    if (!composeForm.title_ru.trim() || !composeForm.message_ru.trim()) {
      setLetterMsg('Заполните заголовок и текст письма (ru).');
      setTimeout(() => setLetterMsg(''), 3000);
      return;
    }
    setLetterSending(true);
    setLetterMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const recipients = composeForm.recipients === 'all' ? 'all' : Array.from(selectedRecipients);
      if (scheduleEnabled) {
        // По расписанию
        const res = await fetch('/api/admin/letters/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({
            letter: composeForm,
            scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : new Date().toISOString(),
            repeat: scheduleRepeat,
            days: scheduleDays,
            count: scheduleCount,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLetterMsg(`Ошибка: ${d.error || res.status}`);
        } else {
          setLetterMsg(`Запланировано на ${new Date(d.runAt).toLocaleString()}.`);
        }
      } else {
        // Сразу
        const res = await fetch('/api/admin/letters/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({ letter: composeForm, recipients }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLetterMsg(`Ошибка: ${d.error || res.status}`);
        } else {
          setLetterMsg(`Письмо отправлено: ${d.count} получателям.`);
          // Черновик больше не нужен — очищаем.
          try { localStorage.removeItem('samashki-compose-draft'); } catch {}
          setComposeForm((f) => ({ ...f, title_ru: '', title_ce: '', message_ru: '', message_ce: '' }));
        }
      }
      void loadSchedule();
    } catch (e) {
      setLetterMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    } finally {
      setLetterSending(false);
      setTimeout(() => setLetterMsg(''), 4000);
    }
  };

  // ==== Планировщик писем ====
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleRepeat, setScheduleRepeat] = useState<'once' | 'daily' | 'n_days'>('once');
  const [scheduleDays, setScheduleDays] = useState(1);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [scheduleQueue, setScheduleQueue] = useState<{ id: string; letter_id: string; run_at: string; title_ru?: string }[]>([]);
  // «Отправленные» — история из letter_log (архив, вкладка «Отправленные»).
  const [sentLogs, setSentLogs] = useState<{ id: string; letter_id: string; title_ru: string; title_ce: string; sender: string; count: number; sent_at: string }[]>([]);
  // Модалка «Архив»: вкладки Очередь / Отправленные.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState<'queue' | 'sent'>('queue');
  const [archiveMsg, setArchiveMsg] = useState('');
  // Карандаш в очереди: редактирование письма (время + тема + текст + получатели).
  const [editSched, setEditSched] = useState<{
    scheduleId: string;
    letterId: string;
    runAt: string;
    title_ru: string;
    title_ce: string;
    message_ru: string;
    message_ce: string;
    sender: string;
    recipients: 'all' | 'selected';
  } | null>(null);
  const [editSchedBusy, setEditSchedBusy] = useState(false);
  const [editSchedSelected, setEditSchedSelected] = useState<Set<string>>(new Set());

  /** ISO → локальный формат для <input type="datetime-local">. */
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // ==== Утилиты писем: перевод (Google), переключатель языка превью ====
  // Какой язык показывает превью-редактор ('ru' | 'ce') для каждого письма.
  const [letterLang, setLetterLang] = useState<Record<'welcome' | 'modal' | 'compose', 'ru' | 'ce'>>({ welcome: 'ru', modal: 'ru', compose: 'ru' });
  // Сворачиваемые блоки раздела «Письма» (по умолчанию свёрнуты — компактно).
  const [lettersOpen, setLettersOpen] = useState<Record<string, boolean>>({ welcome: false, modal: false, compose: false, queue: true });

  const googleTranslate = async (text: string) => {
    if (!text.trim()) return '';
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: 'ru', to: 'ce' }),
      });
      const d = await res.json().catch(() => ({}));
      return d?.translated || '';
    } catch {
      return '';
    }
  };

  const translateWelcome = async () => {
    setLetterMsg('Перевожу…');
    const t1 = await googleTranslate(welcomeForm.title_ru);
    const t2 = await googleTranslate(welcomeForm.message_ru);
    setWelcomeForm((f) => ({ ...f, title_ce: t1 || f.title_ce, message_ce: t2 || f.message_ce }));
    if (t1 || t2) setLetterLang((l) => ({ ...l, welcome: 'ce' }));
    setLetterMsg(t1 || t2 ? 'Переведено.' : 'Не удалось перевести.');
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const translateCompose = async () => {
    setLetterMsg('Перевожу…');
    const t1 = await googleTranslate(composeForm.title_ru);
    const t2 = await googleTranslate(composeForm.message_ru);
    setComposeForm((f) => ({ ...f, title_ce: t1 || f.title_ce, message_ce: t2 || f.message_ce }));
    if (t1 || t2) setLetterLang((l) => ({ ...l, compose: 'ce' }));
    setLetterMsg(t1 || t2 ? 'Переведено.' : 'Не удалось перевести.');
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const loadSchedule = async () => {
    // Очередь приходит в GET /api/admin/letters (поле queue).
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.queue)) setScheduleQueue(d.queue);
        if (Array.isArray(d.sent)) setSentLogs(d.sent);
      }
    } catch {}
  };

  // Доставка готовых писем (без ручной кнопки): вызывается при открытии
  // раздела «Письма» и при открытии «Архива». Письмо отправляется само, когда
  // наступает время; pg_cron (SQL 11) делает то же каждые 5 минут.
  // Если SQL-функция недоступна — доставку выполняет приложение (fallback
  // в /api/admin/letters/process), и админ видит подсказку применить SQL 15.
  const deliverReady = async (showError = true) => {
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (showError) {
          const msg = `Ошибка доставки: ${d.error || res.status}`;
          setArchiveMsg(msg);
          setLetterMsg(msg);
        }
        return false;
      }
      if (d.method === 'node' && d.rpcError) {
        // SQL-функция недоступна — доставка прошла средствами приложения.
        const hint = `Доставлено приложением (SQL-функция недоступна: ${d.rpcError}). Примените supabase/update/15-letters-deliver-delete.sql`;
        setArchiveMsg(hint);
        setLetterMsg(hint);
        setTimeout(() => setLetterMsg(''), 8000);
      } else if (showError && Number(d.processed) > 0) {
        setLetterMsg(`Доставлено писем: ${d.processed}.`);
        setTimeout(() => setLetterMsg(''), 3000);
      }
      return true;
    } catch {
      return false;
    }
  };

  /** Открыть «Архив»: сначала тихо доставляем готовые, затем показываем. */
  const openArchive = async () => {
    setArchiveMsg('');
    setArchiveTab('queue');
    setArchiveOpen(true);
    await deliverReady(true);
    await loadLetters();
  };

  const closeArchive = () => {
    setArchiveOpen(false);
    setEditSched(null);
    setArchiveMsg('');
  };

  /** Удалить письмо из очереди (красная корзина, вкладка «Очередь»). */
  const deleteSchedule = async (scheduleId: string) => {
    setArchiveMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch(`/api/admin/letters/schedule/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setArchiveMsg(L('Письмо удалено из очереди.', 'Кехат кепийн могIара дIадаьккхина.'));
      setTimeout(() => setArchiveMsg(''), 3000);
      await loadLetters();
    } catch (e) {
      setArchiveMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
  };

  /** Удалить запись из «Отправленных» (история). */
  const deleteLog = async (logId: string) => {
    setArchiveMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch(`/api/admin/letters/log/${encodeURIComponent(logId)}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setArchiveMsg(L('Запись удалена из истории.', 'ДIадаздина истори тIера дIадаьккхина.'));
      setTimeout(() => setArchiveMsg(''), 3000);
      await loadLetters();
    } catch (e) {
      setArchiveMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
  };

  /** Карандаш: начать редактирование письма из очереди (время + тема + текст + получатели). */
  const startEditSchedule = (sched: { id: string; letter_id: string; run_at: string }) => {
    const tpl = letters.find((l) => l.id === sched.letter_id);
    setEditSched({
      scheduleId: sched.id,
      letterId: sched.letter_id,
      runAt: sched.run_at,
      title_ru: tpl?.title_ru ?? '',
      title_ce: tpl?.title_ce ?? '',
      message_ru: tpl?.message_ru ?? '',
      message_ce: tpl?.message_ce ?? '',
      sender: tpl?.sender ?? 'Даймохк',
      recipients: tpl?.recipients === 'selected' ? 'selected' : 'all',
    });
    setEditSchedSelected(new Set());
    setArchiveMsg('');
  };

  /** Сохранить изменения письма в очереди (PATCH). */
  const saveEditSchedule = async () => {
    if (!editSched) return;
    if (!editSched.title_ru.trim() || !editSched.message_ru.trim()) {
      setArchiveMsg(L('Заполните тему и текст (ru).', 'Тема а, текст а (ru) дIаязде.'));
      return;
    }
    const parsed = new Date(editSched.runAt);
    if (Number.isNaN(parsed.getTime())) {
      setArchiveMsg(L('Неверное время отправки.', 'ДIадахьитаран хан нийса дац.'));
      return;
    }
    setEditSchedBusy(true);
    setArchiveMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch(`/api/admin/letters/schedule/${encodeURIComponent(editSched.scheduleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({
          runAt: editSched.runAt,
          letter: {
            id: editSched.letterId,
            title_ru: editSched.title_ru,
            title_ce: editSched.title_ce,
            message_ru: editSched.message_ru,
            message_ce: editSched.message_ce,
            sender: editSched.sender,
            recipients: editSched.recipients,
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setArchiveMsg(L('Сохранено.', 'ДIаяздина.'));
      setEditSched(null);
      setTimeout(() => setArchiveMsg(''), 3000);
      await loadLetters();
    } catch (e) {
      setArchiveMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    } finally {
      setEditSchedBusy(false);
    }
  };

  /** Включение «Отправить по расписанию»: время по умолчанию = сейчас. */
  const toggleSchedule = (checked: boolean) => {
    setScheduleEnabled(checked);
    if (checked && !scheduleAt) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setScheduleAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
    }
  };

  useEffect(() => {
    // ЖЁСТКАЯ привязка к БД: источник истины — таблица house_addresses.
    // localStorage — только кэш для оффлайна, но при загрузке админки
    // всегда тянем свежие адреса с сервера и заменяем ими локальное
    // состояние (иначе удалённые в БД адреса «оживают» из localStorage).
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
    // The POST handler enforces admin auth, so we have to attach the
    // user's access token — otherwise the request comes back 403 and
    // the database is never updated. The /map page would then re-fetch
    // the unchanged rows on the next visit and the addresses would
    // appear to "come back" even though the admin saw "Сохранено".
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

  const allAddressCategories = Array.from(new Set([...DEFAULT_ADDRESS_CATEGORIES, ...customCategories, ...addresses.map(a=>a.category).filter(Boolean) as string[]]));

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

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (allAddressCategories.includes(name)) { setNewCategoryName(''); return; }
    const next = [...customCategories, name];
    setCustomCategories(next);
    try { localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next)); } catch {}
    setNewCategoryName('');
    setSaveMsg(`Категория "${name}" добавлена`);
    setTimeout(()=>setSaveMsg(null),2000);
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

  const requests = profiles.filter((profile) => profile.verificationStatus === 'pending' && !isProfileHidden(profile));
  const hiddenProfiles = profiles.filter((profile) => isProfileHidden(profile) && !isProfileAdmin(profile));
  const openComplaints = complaints.filter((complaint) => complaint.status === 'open');
  // Все пользователи, включая админов (админы помечены и не блокируются).
  const people = users;

  // Поиск по разделам админ-панели (п.4). Фильтрует по имени/email/тексту.
  const [adminSearch, setAdminSearch] = useState('');
  const adminQuery = adminSearch.trim().toLowerCase();
  const searchMatch = (value?: string) => !adminQuery || (value ?? '').toLowerCase().includes(adminQuery);

  const filteredRequests = requests.filter((p) => searchMatch(p.fullName) || searchMatch(p.professionTitle));
  const filteredHidden = hiddenProfiles.filter((p) => searchMatch(p.fullName) || searchMatch(p.professionTitle));
  // Активные анкеты: все, кроме скрытых/забаненных (включая личные).
  const activeProfiles = profiles.filter((p) => !isProfileHidden(p) && p.verificationStatus !== 'pending');
  const pendingProfiles = profiles.filter((p) => p.verificationStatus === 'pending' && !isProfileHidden(p));
  const filteredActive = activeProfiles.filter((p) => searchMatch(p.fullName) || searchMatch(p.professionTitle));
  const filteredPending = pendingProfiles.filter((p) => searchMatch(p.fullName) || searchMatch(p.professionTitle));
  const filteredComplaints = openComplaints.filter(
    (c) => searchMatch(c.reason) || searchMatch(c.authorName) || searchMatch(profiles.find((pr) => pr.id === c.profileId)?.fullName),
  );
  const filteredPeople = people.filter((u) => searchMatch(u.fullName) || searchMatch(u.email));
  // Классификация пользователей для вкладок (жители/специалисты/админы).
  // Специалист — пользователь, у которого есть хотя бы одна анкета-специалист.
  const specUsers = people.filter((u) => !u.isAdmin && profiles.some((p) => p.ownerId === u.id && p.isSpecialist));
  const admUsers = people.filter((u) => u.isAdmin);
  const resUsers = people.filter((u) => !u.isAdmin && !specUsers.includes(u));
  const tabFilteredUsers = filteredPeople.filter((u) => {
    if (usersSubTab === 'admins') return u.isAdmin;
    if (usersSubTab === 'specialists') return specUsers.includes(u);
    return !specUsers.includes(u);
  });
  const visibleUsers = tabFilteredUsers.slice(0, 100);
  const showUsersPagination = tabFilteredUsers.length > 100;

  // Модалка обработки жалобы (письма нарушителю/отправителю + блокировки).
  const [resolveComplaint, setResolveComplaint] = useState<Complaint | null>(null);
  const [resolveMode, setResolveMode] = useState<ComplaintResolveMode>('accept');
  const { createNotification } = useProfiles();

  /** Применить блокировку пользователя (hours = null — навсегда). */
  const applyBan = async (userId: string, hours: number | null) => {
    if (!supabase) return;
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error('Сессия истекла — войдите снова.');
    const response = await fetch('/api/admin/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId, hours }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error ?? 'Не удалось заблокировать аккаунт.');
    }
  };

  /** Блокировка/разблокировка из списка пользователей: через API + письмо. */
  const adminToggleBan = async (user: UserSummary, isBlocked: boolean) => {
    if (!supabase) return;
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) return;
      const method = isBlocked ? 'POST' : 'DELETE';
      const response = await fetch('/api/admin/ban', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось изменить статус блокировки.');
      }
      // Письмо-уведомление (через /api/notifications, service role).
      if (isBlocked) {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            recipientId: user.id,
            type: 'user_blocked',
            title: L('Аккаунт заблокирован', 'Аккаунт билсна'),
            message: 'Администратор заблокировал ваш аккаунт. Обратитесь к администрации для уточнения причин.',
            ceTitle: 'Аккаунт билсена яьлла',
            ceMessage: 'Администраторо хьан аккаунт билсна. Бахьанах лаьцна хаадар администрацега хьажа.',
            sender: 'Даймохк',
          }),
        });
      } else {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            recipientId: user.id,
            type: 'user_unblocked',
            title: 'Аккаунт разблокирован',
            message: 'Администратор разблокировал ваш аккаунт.',
            ceTitle: 'Аккаунт дIаяьккхина',
            ceMessage: 'Администраторо хьан аккаунт дIаяьккхина.',
            sender: 'Даймохк',
          }),
        });
      }
    } catch (err) {
      console.error('adminToggleBan failed:', err);
    }
  };

  /** Выдать/отобрать админ-права (только невидимый разработчик). */
  const adminToggleRole = async (user: UserSummary) => {
    if (!supabase || !account || !isDevEmail(account.email)) return;
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) return;
      const res = await fetch('/api/admin/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId: user.id, makeAdmin: !user.isAdmin }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось изменить права.');
      }
      setSaveMsg(user.isAdmin ? 'Права админа отозваны.' : 'Пользователь стал админом.');
      setTimeout(() => setSaveMsg(null), 2500);
      await refreshRemoteData();
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Ошибка смены прав.');
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  /** Завершить обработку жалобы: письма + блокировки + статус. */
  const handleResolveComplaint = async (payload: {
    complaintId: string;
    status: 'resolved' | 'dismissed';
    notifications: NotificationLetterPayload[];
    bans: { userId: string; hours: number | null }[];
  }) => {
    for (const ban of payload.bans) {
      await applyBan(ban.userId, ban.hours);
    }
    // Письма шлём через /api/notifications (service role — надёжно).
    const session = supabase ? await supabase.auth.getSession() : null;
    const accessToken = session?.data.session?.access_token;
    for (const n of payload.notifications) {
      if (!accessToken) continue;
      try {
        const response = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            recipientId: n.recipientId,
            type: n.type ?? 'complaint_result',
            title: n.title,
            message: n.message,
            ceTitle: n.ceTitle,
            ceMessage: n.ceMessage,
            sender: n.sender,
          }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          console.warn('Письмо жалобы не отправлено:', result?.error ?? response.status);
        }
      } catch {
        // продолжаем
      }
    }
    await updateComplaint(payload.complaintId, payload.status);
  };

  /** Обратный геокодинг: по координатам (newLat/newLng) подставляем область/улицу/дом. */
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
      // Область: с. / г. / р-н + название
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
  const cancelEdit = () => { setEditingId(null); };
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

  if (!isCurrentUserAdmin) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-slate-50 dark:bg-zinc-950">
        <Navbar />
        <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center p-6 text-center pt-24 pb-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{L('Панель администратора', 'Администраторан панель')}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-500">{L('Доступ только для mr.hamzik1026@gmail.com, nabis95@gmail.com', 'Доступ башха: mr.hamzik1026@gmail.com, nabis95@gmail.com')}</p>
          {!account && <button onClick={() => void signInWithGoogle()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">{L('Войти через Google', 'Google чуйаха')}</button>}
          <Link href="/" className="mt-4 text-xs font-semibold text-slate-500 hover:underline">{L('Вернуться в каталог', 'Каталоге юхаверза')}</Link>
        </main>
        <BottomNav isAdmin={false} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />
      <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 px-3.5 pb-20 pt-18 sm:pb-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label={L('Вернуться в каталог', 'Каталоге юхаверза')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{L('Панель администратора', 'Администраторан панель')}</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Подтверждения, скрытые анкеты, жалобы, пользователи и адреса', 'ТIечIагIдарш, къайлайаьхна анкеташ, арзаш, лелошхой а, адресаш а')}</p>
            </div>
          </div>
          {/* Переключатели языка интерфейса и темы — только в админке.
              Язык переводит ТЕКСТЫ АДМИНКИ, а не тексты модальных окон писем. */}
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {(['ru', 'ce'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase transition ${language === l ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                  title={l === 'ru' ? 'Русский' : 'Нохчийн'}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label={isDarkMode ? 'Светлая тема' : 'Тёмная тема'}
              title={isDarkMode ? 'Светлая тема' : 'Тёмная тема'}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {([
            ['profiles', L('Анкеты', 'Анкеташ'), profiles.filter((p) => !isProfileHidden(p) || isProfileHidden(p)).length],
            ['complaints', L('Жалобы', 'Арзаш'), openComplaints.length],
            ['users', L('Пользователи', 'Лелошхой'), people.length],
            ['addresses', L('Адреса', 'Адресаш'), addresses.length],
            ['letters', L('Письма', 'Кехаташ'), 0],
            ['filters', L('Фильтры', 'Фильтраш'), 0],
          ] as const).map(([section, label, count]) => (
            <button key={section} type="button" onClick={() => setActiveSection(section)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeSection === section ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeSection === section ? 'bg-white/20' : 'bg-slate-100 dark:bg-zinc-800'}`}>{count}</span></button>
          ))}
        </nav>

        {activeSection === 'profiles' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Анкеты', 'Анкеташ')}</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Все анкеты каталога: активные и скрытые.', 'Каталоган массо анкеташ: жигара а, къайлайаьхна а.')}</p>
              </div>
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <button type="button" onClick={() => setProfilesSubTab('active')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${profilesSubTab === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Активные', 'Жигаранаш')} ({activeProfiles.length})</button>
                <button type="button" onClick={() => setProfilesSubTab('pending')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${profilesSubTab === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('На проверке', 'Талларан тIехь')} ({pendingProfiles.length})</button>
                <button type="button" onClick={() => setProfilesSubTab('hidden')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${profilesSubTab === 'hidden' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Скрытые', 'Къайлайаьхнарш')} ({hiddenProfiles.length})</button>
              </div>
            </div>
            <div className="relative">
              <input
                type="search"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder={L('Поиск…', 'Лаха…')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </div>

            {profilesSubTab === 'active' ? (
              filteredActive.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">{L('Активных анкет нет.', 'Жигара анкеташ бац.')}</div>
              ) : (
                <div className="space-y-3">
                  {filteredActive.map((profile) => {
                    const status = getStatus(profile, users);
                    const isPending = profile.verificationStatus === 'pending';
                    return (
                      <div key={profile.id} className={`rounded-3xl border p-4 shadow-sm ${isPending ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'}`}>
                        <div className="flex items-start gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-200 dark:bg-zinc-800">
                            {profile.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cacheBustAvatarUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{profile.fullName.charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</h4>
                              <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.icon}{status.label}</span>
                              {isProfileAdmin(profile) && profile.isSpecialist && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"><Star className="h-3 w-3" />Специалист</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{profile.professionTitle || 'Житель'}</p>
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-500">{profile.workplaceAddress}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
                          <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button>
                          {!profile.isPersonal && (
                            <button type="button" onClick={() => updateProfile(profile.id, { isHidden: true, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700"><EyeOff className="h-3.5 w-3.5" />{L('Скрыть', 'Къайлаяккха')}</button>
                          )}
                          {isPending && (
                            <>
                              <button type="button" onClick={() => updateProfile(profile.id, { isVerified: true, verificationStatus: 'verified' })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" />{L('Подтвердить', 'ТIечIагIде')}</button>
                              <button type="button" onClick={() => updateProfile(profile.id, { isVerified: false, verificationStatus: 'rejected' })} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><X className="h-3.5 w-3.5" />{L('Отклонить', 'ДIаяккха')}</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : profilesSubTab === 'pending' ? (
              filteredPending.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">{L('Анкет на проверке нет.', 'Талларан тIехь анкеташ бац.')}</div>
              ) : (
                <div className="space-y-3">
                  {filteredPending.map((profile) => (
                    <div key={profile.id} className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
                      <div className="flex items-start gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-200 dark:bg-zinc-800">
                          {profile.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cacheBustAvatarUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{profile.fullName.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</h4>
                          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{profile.professionTitle || 'Специалист'}</p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-500">{profile.workplaceAddress}</p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"><Clock3 className="h-3 w-3" />{L('На проверке', 'Талларан тIехь')}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-amber-200/60 pt-3">
                        <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button>
                        <button type="button" onClick={() => updateProfile(profile.id, { isVerified: true, verificationStatus: 'verified' })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" />{L('Подтвердить', 'ТIечIагIде')}</button>
                        <button type="button" onClick={() => updateProfile(profile.id, { isVerified: false, verificationStatus: 'rejected' })} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><X className="h-3.5 w-3.5" />{L('Отклонить', 'ДIаяккха')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              filteredHidden.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">{L('Скрытых анкет нет.', 'Къайлайаьхна анкеташ бац.')}</div>
              ) : (
                <div className="space-y-3">
                  {filteredHidden.map((profile) => {
                    const status = getStatus(profile, users);
                    return (
                      <div key={profile.id} className="rounded-3xl border border-red-200 bg-red-50/60 p-4 shadow-sm dark:border-red-900 dark:bg-red-950/40">
                        <div className="flex items-start gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-200 dark:bg-zinc-800">
                            {profile.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cacheBustAvatarUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{profile.fullName.charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</p>
                              <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.icon}{status.label}</span>
                              {isProfileAdmin(profile) && profile.isSpecialist && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"><Star className="h-3 w-3" />Специалист</span>
                              )}
                            </div>
                            <p className="truncate text-sm font-semibold text-red-700 dark:text-red-400">{profile.professionTitle || 'Личная анкета'}</p>
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-400">{profile.workplaceAddress}</p>
                          </div>
                          <EyeOff className="h-5 w-5 shrink-0 text-red-600" />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-red-200/60 pt-3">
                          <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button>
                          <button type="button" onClick={() => updateProfile(profile.id, { isHidden: false })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Eye className="h-3.5 w-3.5" />{L('Вернуть в каталог', 'Каталоге юхадаккха')}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </section>
        )}
        {activeSection === 'complaints' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Жалобы', 'Арзаш')}</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Жалобы пользователей на анкеты и контакты.', 'Лелошхойн арзаш анкеташна а, контакташна а.')}</p>
              </div>
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{openComplaints.length}</span>
            </div>
            <div className="relative">
              <input
                type="search"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder={L('Поиск…', 'Лаха…')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            {openComplaints.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">{L('Открытых жалоб нет.', 'ДIаелла арзаш бац.')}</div>
            ) : (
              <div className="space-y-3">
                {openComplaints.map((complaint) => {
                  const profile = profiles.find((item) => item.id === complaint.profileId);
                  if (!profile) return null;
                  const owner = users.find((user) => user.id === (complaint.targetUserId || profile.ownerId));
                  const targetIsAdmin = isProfileAdmin(profile) || Boolean(owner?.isAdmin);
                  return (
                    <div key={complaint.id} className="overflow-hidden rounded-3xl border border-red-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                      {/* Header: profile + complaint meta */}
                      <div className="flex items-start justify-between gap-3 border-b border-red-100 bg-red-50/60 p-4 dark:border-zinc-800 dark:bg-red-950/20">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-200 dark:bg-zinc-800">
                            {profile.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cacheBustAvatarUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                                {profile.fullName.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-zinc-400">
                              {profile.professionTitle || 'Личная анкета'} · {profile.workplaceAddress}
                            </p>
                            {owner && (
                              <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-zinc-500">
                                {L('Владелец:', 'Долахо:')} {owner.fullName} {owner.isBlocked ? '· заблокирован' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
                          От: {complaint.authorName}
                        </span>
                      </div>

                      {/* Complaint text */}
                      <div className="p-4">
                        <p className="break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
                          {complaint.reason}
                        </p>
                        {complaint.createdAt && (
                          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-zinc-500">{complaint.createdAt}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                        <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40">
                          <FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}
                        </button>
                        <button type="button" onClick={() => { setResolveMode('accept'); setResolveComplaint(complaint); }} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700">
                          <Check className="h-3.5 w-3.5" />{L('Принять', 'ТIеэца')}
                        </button>
                        <button type="button" onClick={() => { setResolveMode('dismiss'); setResolveComplaint(complaint); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          <X className="h-3.5 w-3.5" />{L('Отклонить', 'ДIаяккха')}
                        </button>
                        {!targetIsAdmin && (
                          <button type="button" onClick={() => updateProfile(profile.id, { isHidden: true, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-400">
                            <EyeOff className="h-3.5 w-3.5" />{L('Скрыть анкету', 'Анкета къайлаяккха')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {activeSection === 'users' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Пользователи', 'Лелошхой')}</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Список зарегистрированных жителей и управление доступом.', 'ДIабалабелла бахархойн могIам а, доступан урхалла а.')}</p>
              </div>
              {/* Вкладки: Жители / Специалисты / Админы — как в разделе «Анкеты» */}
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <button type="button" onClick={() => setUsersSubTab('residents')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${usersSubTab === 'residents' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Жители', 'Бахархой')} ({resUsers.length})</button>
                <button type="button" onClick={() => setUsersSubTab('specialists')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${usersSubTab === 'specialists' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Специалисты', 'Специалисташ')} ({specUsers.length})</button>
                <button type="button" onClick={() => setUsersSubTab('admins')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${usersSubTab === 'admins' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Админы', 'Админаш')} ({admUsers.length})</button>
              </div>
            </div>
            <div className="relative">
              <input
                type="search"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder={L('Поиск…', 'Лаха…')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            <div className="space-y-3">{tabFilteredUsers.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">{L('Пользователей пока нет.', 'Лелошхой хIинца бац.')}</div> : tabFilteredUsers.map((user) => { const userProfiles = profiles.filter((profile) => profile.ownerId === user.id); const expanded = expandedUserId === user.id; return <div key={user.id} className={`rounded-3xl border p-4 shadow-sm transition ${user.isBlocked ? 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/50' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'}`}><div className="flex flex-wrap items-center gap-3"><img src={cacheBustAvatarUrl(user.avatarUrl)} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{user.fullName}</p><p className="truncate text-xs text-slate-500 dark:text-zinc-500">{user.email} · {L('анкет:', 'анкеташ:')} {user.profileCount}</p>
                          {user.isAdmin && <span className="mt-1 inline-flex rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-zinc-700">Админ</span>}
                          {user.isBlocked && <span className="mt-1 inline-flex rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{L('Аккаунт заблокирован', 'Аккаунт билсна')}</span>}
                        </div>
                        {!user.isAdmin && (
                          <button type="button" onClick={() => void adminToggleBan(user, !user.isBlocked)} className={`inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition sm:w-auto ${user.isBlocked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70'}`}>{user.isBlocked ? <UserCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}{user.isBlocked ? L('Разблокировать', 'ДIаяккха') : L('Заблокировать', 'Билсде')}</button>
                        )}
                        {/* Кнопка смены прав ВИДНА и для админов (отобрать), и для жителей (выдать).
                            Только у невидимого разработчика; на самого разработчика не показывается. */}
                        {account && isDevEmail(account.email) && !isDevEmail(user.email) && (
                          <button type="button" onClick={() => void adminToggleRole(user)} className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            {user.isAdmin ? L('Забрать админа', 'Админ дIадаккха') : L('Сделать админом', 'Админ хIотто')}
                          </button>
                        )}
                        <button type="button" onClick={() => setExpandedUserId(expanded ? null : user.id)} className="rounded-xl p-2 text-emerald-700 transition hover:bg-emerald-50" title="Анкеты пользователя"><UserRound className="h-5 w-5" /></button></div>{expanded && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-zinc-800">{userProfiles.length === 0 ? <p className="text-xs text-slate-500">{L('Анкет нет.', 'Анкеташ бац.')}</p> : userProfiles.map((profile) => { const status = getStatus(profile, users); return <div key={profile.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5 dark:bg-zinc-800/60"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.professionTitle || 'Личная анкета'}</p><span className={`mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.icon}{status.label}</span></div><button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-700 shadow-sm"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button></div>; })}</div>}</div>; })}</div>
          {showUsersPagination && (
            <p className="pt-1 text-center text-[11px] text-slate-400 dark:text-zinc-500">
              {L('Показаны первые 100 из', 'Гойту хьалхара 100')} {tabFilteredUsers.length} {L('пользователей. Уточните поиск.', 'лелошхой. Лахар ма-дарра де.')}
            </p>
          )}
          </section>
        )}

        {activeSection === 'addresses' && (
          <section className="space-y-5">
            <div><h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Адреса', 'Адресаш')}</h3><p className="text-sm text-slate-500 dark:text-zinc-500">{L('Улица с автопрефиксом ул., подсказки из OSM, чекбокс Не дом → категория Другое, редактирование карандашом, автосохранение.', 'Урам ул. авто-префиксца, OSM хьехам, Не дом чекбокс → Другое категори, къоламца хийцар, авто-дIаяздар.')}</p></div>

            <form onSubmit={handleAddAddress} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
                      <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
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
                      <label className="flex h-10 shrink-0 cursor-pointer select-none items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50">
                        <input type="checkbox" checked={isNotHouse} onChange={(e) => setIsNotHouse(e.target.checked)} className="h-4 w-4 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500" />
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

                <div className="flex items-center gap-2">
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"><Plus className="h-3.5 w-3.5" />{L('Добавить', 'ТIетоха')}</button>
                  <button type="button" onClick={() => void reverseGeocode()} disabled={geocodeBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"><Search className="h-3.5 w-3.5" />{geocodeBusy ? 'Ищем…' : 'Поиск'}</button>
                  {(saveMsg || geocodeMsg || importMsg) && <span className="text-xs font-semibold text-emerald-600">{importMsg || geocodeMsg || saveMsg}</span>}
                </div>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
                <button type="button" onClick={handleAddCategory} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-black">{L('Добавить', 'ТIетоха')}</button>
              </div>
              {searchQ && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-500">
                  {L('Найдено адресов:', 'Карийна адресаш:')} {filteredAddresses.length} {L('по запросу', 'дехарца')} «{addressSearch.trim()}»
                </p>
              )}
              {customCategories.length>0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {customCategories.map((cat)=>(
                    <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-zinc-800">{cat}<button type="button" onClick={()=>handleDeleteCategory(cat)} className="ml-1 text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button key="all" type="button" onClick={()=>setAddressFilter('all')} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${addressFilter==='all' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400'}`}>{L('Все', 'Массо')}</button>
                {allAddressCategories.map((cat)=>(
                  <button key={cat} type="button" onClick={()=>setAddressFilter(cat)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${addressFilter===cat ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400'}`}>{cat}</button>
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
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
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
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
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
                            <span className="shrink-0 text-[11px] font-bold text-slate-400">д.</span>
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
                            <label className="flex shrink-0 cursor-pointer select-none items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50">
                              <input type="checkbox" checked={editIsNotHouse} onChange={(e)=>setEditIsNotHouse(e.target.checked)} className="h-3.5 w-3.5 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500" />
                              {L('Не дом', 'ЦIа дац')}
                            </label>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={editLat} onChange={(e)=>setEditLat(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                          <input value={editLng} onChange={(e)=>setEditLng(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
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
                              {address.isNotHouse && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-800">{address.category || 'Другое'}</span>}
                              {isDeleted && <span className="ml-1 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white">{L('Удалён', 'ДIадаьккхина')}</span>}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">{L('Координаты:', 'Координаташ:')} {address.lat.toFixed(5)}, {address.lng.toFixed(5)} · {decimalToDMSString(address.lat, address.lng)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isDeleted ? (
                            <button
                              type="button"
                              onClick={()=>handleRestoreAddress(address.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
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
        )}

        {activeSection === 'letters' && (
          <section className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Письма', 'Кехаташ')}</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Превью показывает письмо ровно так, как его видит пользователь в уведомлениях. Текст внутри письма редактируется прямо в превью; переключатель RU/CE — язык письма.', 'Превью гойту кехат бакъонца, лелошхочо уведомленашкахь санна. Кехатан чоьхьара йоза превью чохь дIаяздо; RU/CE тIелацар — кехатан мотт.')}</p>
            </div>

            {letterMsg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{letterMsg}</div>}

            {/* Уведомление после регистрации + Приветственное сообщение — два превью-редактора в ряд */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <AdminLetterEditorCard
                title={L('Уведомление после регистрации', 'Регистрацин тIехьа хаам')}
                hint={L('Отправляется новым пользователям при регистрации. Нажмите на текст внутри письма — он редактируется прямо в превью.', 'ДIабалабеллачу лелошхочунна дIадахьита. Кехатан чоьхьара йозана тIехьа тIе тоха — превью чохь дIаяздо.')}
                draft={welcomeForm}
                onChange={(patch) => setWelcomeForm((f) => ({ ...f, ...patch }))}
                lang={letterLang.welcome}
                onLangChange={(l) => setLetterLang((s) => ({ ...s, welcome: l }))}
                onTranslate={() => void translateWelcome()}
                onSave={() => void saveWelcome()}
                saveLabel={L('Сохранить шаблон', 'Шаблон дIаязде')}
                collapsed={!lettersOpen.welcome}
                onToggle={() => setLettersOpen((o) => ({ ...o, welcome: !o.welcome }))}
              />
              <AdminLetterEditorCard
                title={L('Приветственное сообщение', 'Марша догIийла хаам')}
                hint={L('Окно, которое открывается при заходе в приложение. Превью — точная копия реального окна. Текст редактируется прямо в превью.', 'ХIокху корто санна дIаеллалучу окно, приложене чувоьдуш. Превью — бакъчу окнан бакъха копи. Йоза превью чохь дIаяздо.')}
                variant="welcome"
                draft={welcomeModal}
                onChange={(patch) => setWelcomeModal((f) => ({ ...f, ...patch }))}
                lang={letterLang.modal}
                onLangChange={(l) => setLetterLang((s) => ({ ...s, modal: l }))}
                onTranslate={() => void translateWelcomeModal()}
                onSave={() => void saveWelcomeModal()}
                saveLabel={L('Сохранить', 'ДIаязде')}
                collapsed={!lettersOpen.modal}
                onToggle={() => setLettersOpen((o) => ({ ...o, modal: !o.modal }))}
              />
            </div>

            {/* Написать письмо — превью-редактор рассылки + получатели и расписание в конце */}
            <AdminLetterEditorCard
              title={L('Написать письмо', 'Кехат язъе')}
              hint={L('Отправляется сразу всем или выбранным пользователям (в уведомления). Текст редактируется прямо в превью; получатели и расписание — в конце.', 'ДIадахьийтина массарна йа харжамна лелошхошна (уведомленашка). Йоза превью чохь дIаяздо; дIаэцарех а, расписанех а — чаккхенгахь.')}
              draft={composeForm}
              onChange={(patch) => setComposeForm((f) => ({ ...f, ...patch }))}
              lang={letterLang.compose}
              onLangChange={(l) => setLetterLang((s) => ({ ...s, compose: l }))}
              onTranslate={() => void translateCompose()}
              collapsed={!lettersOpen.compose}
              onToggle={() => setLettersOpen((o) => ({ ...o, compose: !o.compose }))}
              footer={
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void sendCompose()} disabled={letterSending} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                    <Send className="h-3.5 w-3.5" />
                    {letterSending ? L('Отправляем…', 'ДIадахка…') : (scheduleEnabled ? L('Запланировать', 'План хIотто') : L('Отправить', 'ДIадахка'))}
                  </button>
                  <button type="button" onClick={() => void openArchive()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    <Archive className="h-3.5 w-3.5" />
                    {L('Архив', 'Архив')} ({scheduleQueue.length + sentLogs.length})
                  </button>
                </div>
              }
              afterFooter={
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setLettersOpen((o) => ({ ...o, queue: !o.queue }))}
                    aria-expanded={lettersOpen.queue}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{L('Получатели и расписание', 'ДIаэцархой а, расписани а')}</h4>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${lettersOpen.queue ? '' : '-rotate-90'}`} />
                  </button>

                  {lettersOpen.queue && (
                  <>
                  {/* Получатели */}
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Получатели', 'ДIаэцархой')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setComposeForm({ ...composeForm, recipients: 'all' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${composeForm.recipients === 'all' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Все пользователи', 'Массо лелошхой')}</button>
                    <button type="button" onClick={() => setComposeForm({ ...composeForm, recipients: 'selected' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${composeForm.recipients === 'selected' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Выбрать', 'Харжа')} ({selectedRecipients.size})</button>
                  </div>
                  {composeForm.recipients === 'selected' && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="relative mb-1.5">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                          placeholder={L('Поиск по имени…', 'ЦIерца лахар…')}
                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                      <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto no-scrollbar sm:grid-cols-2">
                        {people
                          .filter((u) => u.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase()))
                          .map((u) => (
                            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                              <input type="checkbox" checked={selectedRecipients.has(u.id)} onChange={(e) => setSelectedRecipients((cur) => { const n = new Set(cur); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} className="h-3.5 w-3.5 rounded text-emerald-600" />
                              <span className="truncate">{u.fullName}</span>
                            </label>
                          ))}
                        {people.filter((u) => u.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase())).length === 0 && (
                          <p className="col-span-full py-2 text-center text-[11px] text-slate-400">{L('Никого не найдено', 'Цхьан а ца карийна')}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Планирование */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-zinc-300">
                      <input type="checkbox" checked={scheduleEnabled} onChange={(e) => toggleSchedule(e.target.checked)} className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500" />
                      {L('Отправить по расписанию', 'Расписаница дIадахка')}
                    </label>
                    {scheduleEnabled && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold text-slate-400">{L('Время отправки', 'ДIадахьитаран хан')}</label>
                          <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold text-slate-400">{L('Частота', 'Цуьнан-хIокху')}</label>
                          <select value={scheduleRepeat} onChange={(e) => setScheduleRepeat(e.target.value as 'once' | 'daily' | 'n_days')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
                            <option value="once">{L('Один раз', 'Цкъа')}</option>
                            <option value="daily">{L('Каждый день', 'ХIора дийнахь')}</option>
                            <option value="n_days">{L('Каждые N дней', 'ХIора N де')}</option>
                          </select>
                        </div>
                        {scheduleRepeat === 'n_days' && (
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-slate-400">{L('Каждые N дней', 'ХIора N де')}</label>
                            <input type="number" min={1} max={365} value={scheduleDays} onChange={(e) => setScheduleDays(Number(e.target.value) || 1)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                          </div>
                        )}
                        {scheduleRepeat !== 'once' && (
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-slate-400">{L('Сколько раз (0 = всегда)', 'Массо а хан (0 = массалла а)')}</label>
                            <input type="number" min={0} value={scheduleCount} onChange={(e) => setScheduleCount(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </>
                  )}
                </div>
              }
            />

          </section>
        )}

        {activeSection === 'filters' && <AdminFiltersSection />}
      </main>

      <ProfileModal profile={viewProfile} isAdminStatus={viewProfile ? isProfileAdmin(viewProfile) : false} showPending={Boolean(viewProfile?.verificationStatus === 'pending')} isViewerBlocked={false} onClose={() => setViewProfile(null)} onReview={addReview} />
      <ComplaintResolveModal
        complaint={resolveComplaint}
        mode={resolveMode}
        owner={resolveComplaint ? users.find((u) => u.id === (resolveComplaint.targetUserId || profiles.find((p) => p.id === resolveComplaint.profileId)?.ownerId)) ?? null : null}
        author={resolveComplaint ? users.find((u) => u.id === resolveComplaint.authorId) ?? null : null}
        profileName={resolveComplaint ? (profiles.find((p) => p.id === resolveComplaint.profileId)?.fullName ?? 'анкета') : ''}
        onClose={() => setResolveComplaint(null)}
        onResolve={handleResolveComplaint}
      />
      <BottomNav onOpenMenu={() => setIsMenuDrawerOpen(true)} onOpenCreate={() => setIsCreateSheetOpen(true)} isAdmin={isCurrentUserAdmin} />
      <MobileMenuDrawer isOpen={isMenuDrawerOpen} onClose={() => setIsMenuDrawerOpen(false)} isAdmin={isCurrentUserAdmin} />
      <CreateActionModal isOpen={isCreateSheetOpen} onClose={() => setIsCreateSheetOpen(false)} onOpenCreateProfile={() => {}} />

      {/* Модалка «Архив»: очередь запланированных и отправленные письма */}
      {archiveOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="archive-title">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="archive-title" className="text-base font-bold text-slate-900 dark:text-white">{L('Архив писем', 'Кехатийн архив')}</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">{L('Очередь и отправленные письма', 'Кеп а, дIадаьхна кехаташ а')}</p>
                </div>
              </div>
              <button type="button" onClick={closeArchive} aria-label={L('Закрыть', 'ДIакъовла')} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!editSched ? (
              <>
                {/* Вкладки: Очередь / Отправленные */}
                <div className="flex shrink-0 gap-1 border-b border-slate-100 px-5 pt-3 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setArchiveTab('queue')}
                    className={`rounded-t-lg px-3 py-2 text-xs font-bold transition ${archiveTab === 'queue' ? 'border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400'}`}
                  >
                    {L('Очередь', 'Кеп')} ({scheduleQueue.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveTab('sent')}
                    className={`rounded-t-lg px-3 py-2 text-xs font-bold transition ${archiveTab === 'sent' ? 'border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400'}`}
                  >
                    {L('Отправленные', 'ДIадаьхнарш')} ({sentLogs.length})
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 no-scrollbar">
                  {archiveMsg && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{archiveMsg}</div>}

                  {archiveTab === 'queue' ? (
                    scheduleQueue.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500 dark:text-zinc-500">{L('В очереди пусто. Письмо попадает в очередь при планировании.', 'Кепехь хIумма а дац. Кехат кепе воьду плане хIоттош.')}</p>
                    ) : (
                      <div className="space-y-2">
                        {scheduleQueue.map((q) => {
                          const ready = new Date(q.run_at) <= new Date();
                          return (
                            <div key={q.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{q.title_ru || L('Письмо', 'Кехат')}</p>
                                <p className={`mt-0.5 text-[11px] font-semibold ${ready ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-500'}`}>
                                  {new Date(q.run_at).toLocaleString()}
                                  {ready && <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">{L('к отправке', 'дIадахьита')}</span>}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => startEditSchedule(q)}
                                aria-label={L('Редактировать', 'Хийца')}
                                title={L('Редактировать', 'Хийца')}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-zinc-800"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteSchedule(q.id)}
                                aria-label={L('Удалить', 'ДIадайа')}
                                title={L('Удалить', 'ДIадайа')}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : sentLogs.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-500 dark:text-zinc-500">{L('Отправленных писем пока нет.', 'ДIадаьхна кехаташ хIинца бац.')}</p>
                  ) : (
                    <div className="space-y-2">
                      {sentLogs.map((log) => (
                        <div key={log.id} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{log.title_ru || L('Письмо', 'Кехат')}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-500">
                              {new Date(log.sent_at).toLocaleString()} · {L('получателей', 'дIаэцархой')}: {log.count} · {log.sender}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteLog(log.id)}
                            aria-label={L('Удалить', 'ДIадайа')}
                            title={L('Удалить из истории', 'Исторех дIадайа')}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Карандаш: редактирование письма из очереди */
              <div className="flex-1 space-y-3 overflow-y-auto p-5 no-scrollbar">
                {archiveMsg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{archiveMsg}</div>}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Время отправки', 'ДIадахьитаран хан')}</label>
                  <input type="datetime-local" value={toLocalInput(editSched.runAt)} onChange={(e) => setEditSched({ ...editSched, runAt: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Тема (RU)', 'Тема (RU)')}</label>
                  <input value={editSched.title_ru} onChange={(e) => setEditSched({ ...editSched, title_ru: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Текст (RU)', 'Текст (RU)')}</label>
                  <textarea rows={3} value={editSched.message_ru} onChange={(e) => setEditSched({ ...editSched, message_ru: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Тема (CE)', 'Тема (CE)')}</label>
                  <input value={editSched.title_ce} onChange={(e) => setEditSched({ ...editSched, title_ce: e.target.value })} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Текст (CE)', 'Текст (CE)')}</label>
                  <textarea rows={2} value={editSched.message_ce} onChange={(e) => setEditSched({ ...editSched, message_ce: e.target.value })} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Отправитель', 'ДIадахочо')}</label>
                  <input value={editSched.sender} onChange={(e) => setEditSched({ ...editSched, sender: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-zinc-400">{L('Получатели', 'ДIаэцархой')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setEditSched({ ...editSched, recipients: 'all' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${editSched.recipients === 'all' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Все пользователи', 'Массо лелошхой')}</button>
                    <button type="button" onClick={() => setEditSched({ ...editSched, recipients: 'selected' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${editSched.recipients === 'selected' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Выбрать', 'Харжа')} ({editSchedSelected.size})</button>
                  </div>
                  {editSched.recipients === 'selected' && (
                    <div className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-zinc-700 dark:bg-zinc-900 no-scrollbar sm:grid-cols-2">
                      {people.map((u) => (
                        <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                          <input type="checkbox" checked={editSchedSelected.has(u.id)} onChange={(e) => setEditSchedSelected((cur) => { const n = new Set(cur); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} className="h-3.5 w-3.5 rounded text-emerald-600" />
                          <span className="truncate">{u.fullName}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {editSched && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-zinc-800">
                <button type="button" onClick={() => setEditSched(null)} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {L('Отмена', 'Юхадаккха')}
                </button>
                <button type="button" onClick={() => void saveEditSchedule()} disabled={editSchedBusy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  <SaveIcon className="h-3.5 w-3.5" />
                  {editSchedBusy ? L('Сохраняем…', 'ДIаяздо…') : L('Сохранить', 'ДIаязде')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модалка дублей адресов: исключить или заменить существующий. */}
      {dupModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="dup-title">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
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
              <button type="button" onClick={dupClose} aria-label="Закрыть" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
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
                    <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{pair.candidate.fullAddress}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-500">
                            уже есть: {pair.existing.fullAddress}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button type="button" onClick={() => dupChoose(i, 'keep')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700">
                            {L('Заменить', 'Хийца')}
                          </button>
                          <button type="button" onClick={() => dupChoose(i, 'skip')}
                            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
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
    </div>
  );
}
