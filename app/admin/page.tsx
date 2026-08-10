'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, Check, Clock3, Eye, EyeOff, FolderOpen, MapPin, Plus, RotateCcw, Save as SaveIcon, ShieldAlert, Trash2, UserCheck, UserRound, UserX, X, Pencil } from 'lucide-react';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import ProfileModal from '@/components/ProfileModal';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { SAMASHKI_HOUSE_ADDRESSES, SamashkiHouseAddress, getEffectiveHouseAddresses } from '@/lib/samashki-addresses';
import { SAMASHKI_STREETS } from '@/lib/types';
import { searchAddresses } from '@/lib/geocoding';
import { Profile } from '@/lib/types';

type AdminSection = 'pending' | 'hidden' | 'complaints' | 'users' | 'addresses';

const CUSTOM_ADDRESSES_KEY = 'samashki-custom-addresses';
const CUSTOM_CATEGORIES_KEY = 'samashki-custom-categories';
const DEFAULT_ADDRESS_CATEGORIES = ['Дома','Другое','Автосервис','Магазины','Торговля','Школа','Образование','Мечеть','Администрация','Почта','Спорткомплекс','Здравоохранение'];

function isProfileHidden(profile: Profile) {
  return Boolean(profile.isHidden || profile.isBanned);
}

function getStatus(profile: Profile) {
  if (profile.isAdmin) return { label: 'Админ', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (isProfileHidden(profile)) return { label: 'Скрыта', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (profile.verificationStatus === 'pending') return { label: 'На проверке', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300' };
  if (profile.verificationStatus === 'rejected') return { label: 'Отклонён', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (profile.isVerified || profile.verificationStatus === 'verified') return { label: 'Проверен', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300' };
  return { label: profile.isSpecialist ? 'Специалист' : 'Житель', className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400' };
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

export default function AdminPage() {
  const { account, signInWithGoogle } = useAuth();
  const { profiles, users, complaints, isCurrentUserAdmin, isProfileAdmin, updateProfile, updateComplaint, updateUserBlocked, addReview } = useProfiles();
  const { t } = useI18n();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [viewProfile, setViewProfile] = useState<Profile | null>(null);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  // Addresses
  const [addresses, setAddresses] = useState<SamashkiHouseAddress[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const eff = getEffectiveHouseAddresses();
        return eff;
      } catch {}
    }
    return SAMASHKI_HOUSE_ADDRESSES;
  });
  const [streetName, setStreetName] = useState('Заводская');
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
  const [selectedAddressCategory, setSelectedAddressCategory] = useState<string>('Другое');
  // Remember the active section across page reloads so the user does
  // not lose their place every time they refresh / re-open the admin
  // panel. Persisted in localStorage; falls back to 'pending'.
  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    if (typeof window === 'undefined') return 'pending';
    try {
      const stored = window.localStorage.getItem('samashki-admin-section');
      if (stored && ['pending', 'hidden', 'complaints', 'users', 'addresses'].includes(stored)) {
        return stored as AdminSection;
      }
    } catch {}
    return 'pending';
  });

  useEffect(() => {
    try { window.localStorage.setItem('samashki-admin-section', activeSection); } catch {}
  }, [activeSection]);

  // street suggestions
  const [streetQuery, setStreetQuery] = useState('');
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [showStreetSug, setShowStreetSug] = useState(false);
  const [osmSuggestions, setOsmSuggestions] = useState<string[]>([]);
  const streetInputRef = useRef<HTMLInputElement>(null);

  // editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStreetName, setEditStreetName] = useState('');
  const [editHouseNumber, setEditHouseNumber] = useState('');
  const [editIsNotHouse, setEditIsNotHouse] = useState(false);
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

  useEffect(() => {
    // Read what the admin previously committed (including an empty
    // array — that's the "I deleted everything" state and must win
    // over the default seed data, otherwise the admin would see the
    // same houses again after a full delete).
    try {
      const stored = localStorage.getItem(CUSTOM_ADDRESSES_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as SamashkiHouseAddress[];
        if (Array.isArray(parsed)) setAddresses(parsed);
      }
    } catch {}
    try {
      const cats = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
      if (cats) {
        const parsed = JSON.parse(cats) as string[];
        if (Array.isArray(parsed)) setCustomCategories(parsed);
      }
    } catch {}
  }, []);

  const persistAddresses = (next: SamashkiHouseAddress[]) => {
    setAddresses(next);
    try { localStorage.setItem(CUSTOM_ADDRESSES_KEY, JSON.stringify(next)); } catch {}
    fetch('/api/admin/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addresses: next }) }).catch(()=>{});
  };

  const allAddressCategories = Array.from(new Set([...DEFAULT_ADDRESS_CATEGORIES, ...customCategories, ...addresses.map(a=>a.category).filter(Boolean) as string[]]));

  const visibleAddresses = addresses.filter((a) => !pendingDeletes.has(a.id));
  const deletedAddresses = addresses.filter((a) => pendingDeletes.has(a.id));

  const filteredAddresses = addressFilter === '__deleted__'
    ? deletedAddresses
    : visibleAddresses.filter((a) => {
        if (addressFilter === 'all') return true;
        if (addressFilter === 'Дома') return !a.isNotHouse;
        if (addressFilter === 'Другое') return !!a.isNotHouse;
        return a.category === addressFilter;
      });

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
    const matches = SAMASHKI_STREETS.filter((s) => s.toLowerCase().includes(q)).slice(0, 8);
    setStreetSuggestions(matches);
  }, [streetName]);

  useEffect(() => {
    if (streetQuery.trim().length < 2) { setOsmSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await searchAddresses(streetQuery, controller.signal);
        const names = res.map((r) => {
          // extract road name
          const m = r.displayName.match(/ул\.?\s*([^,]+)/i);
          return m ? m[1].trim() : r.displayName.split(',')[0];
        }).filter(Boolean).slice(0,5);
        setOsmSuggestions(Array.from(new Set(names)));
      } catch { setOsmSuggestions([]); }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [streetQuery]);

  const requests = profiles.filter((profile) => profile.verificationStatus === 'pending' && !isProfileHidden(profile));
  const hiddenProfiles = profiles.filter((profile) => isProfileHidden(profile) && !isProfileAdmin(profile));
  const openComplaints = complaints.filter((complaint) => complaint.status === 'open');
  const people = users.filter((user) => !user.isAdmin);

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!streetName.trim()) return;
    if (!isNotHouse && !houseNumber.trim()) return;
    const latNum = parseFloat(newLat);
    const lngNum = parseFloat(newLng);
    if (isNaN(latNum) || isNaN(lngNum)) { setSaveMsg('Проверьте координаты'); setTimeout(()=>setSaveMsg(null),3000); return; }
    const streetFull = ensureUlPrefix(streetName);
    const fullAddr = isNotHouse ? `${streetFull} (${houseNumber.trim() || 'объект'})` : `${streetFull}, ${houseNumber.trim()}`;
    const house: SamashkiHouseAddress = {
      id: `addr-${Date.now()}`,
      street: streetFull,
      houseNumber: houseNumber.trim() || (isNotHouse ? '—' : ''),
      fullAddress: fullAddr,
      lat: latNum,
      lng: lngNum,
      postalCode: '366602',
      isNotHouse: isNotHouse || undefined,
      category: isNotHouse ? (selectedAddressCategory || 'Другое') : undefined,
    };
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

  const handleCommitAddresses = () => {
    if (pendingDeletes.size === 0 && pendingAdds.length === 0) {
      setSaveMsg('Нет изменений для сохранения.');
      setTimeout(()=>setSaveMsg(null),2000);
      return;
    }
    const next = addresses.filter((a) => !pendingDeletes.has(a.id));
    persistAddresses(next);
    setPendingDeletes(new Set());
    setPendingAdds([]);

    const removed = addresses.length - next.length;
    const added = pendingAdds.length;
    const parts: string[] = [];
    if (added > 0) parts.push(`добавлено ${added}`);
    if (removed > 0) parts.push(`удалено ${removed}`);
    setSaveMsg(`${parts.join(', ')} и сохранено в БД.`);
    setTimeout(()=>setSaveMsg(null),2500);
  };

  const startEdit = (addr: SamashkiHouseAddress) => {
    setEditingId(addr.id);
    setEditStreetName(stripUlPrefix(addr.street));
    setEditHouseNumber(addr.houseNumber === '—' ? '' : addr.houseNumber);
    setEditIsNotHouse(Boolean(addr.isNotHouse));
    setEditLat(String(addr.lat));
    setEditLng(String(addr.lng));
  };
  const cancelEdit = () => { setEditingId(null); };
  const saveEdit = () => {
    if (!editingId) return;
    if (!editStreetName.trim()) return;
    const latNum = parseFloat(editLat);
    const lngNum = parseFloat(editLng);
    if (isNaN(latNum) || isNaN(lngNum)) { setSaveMsg('Координаты неверные'); return; }
    const streetFull = ensureUlPrefix(editStreetName);
    const fullAddr = editIsNotHouse ? `${streetFull} (${editHouseNumber.trim() || 'объект'})` : `${streetFull}, ${editHouseNumber.trim()}`;
    const next = addresses.map((a) => a.id === editingId ? {
      ...a,
      street: streetFull,
      houseNumber: editHouseNumber.trim() || (editIsNotHouse ? '—' : a.houseNumber),
      fullAddress: fullAddr,
      lat: latNum,
      lng: lngNum,
      isNotHouse: editIsNotHouse || undefined,
      category: editIsNotHouse ? 'Другое' : undefined,
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Панель администратора</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-500">Доступ только для mr.hamzik1026@gmail.com, nabis95@gmail.com</p>
          {!account && <button onClick={() => void signInWithGoogle()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">Войти через Google</button>}
          <Link href="/" className="mt-4 text-xs font-semibold text-slate-500 hover:underline">Вернуться в каталог</Link>
        </main>
        <BottomNav isAdmin={false} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />
      <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 px-3.5 pb-20 pt-18 sm:pb-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Вернуться в каталог" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0"><h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Панель администратора</h2><p className="text-sm text-slate-500 dark:text-zinc-500">Подтверждения, скрытые анкеты, жалобы, пользователи и адреса</p></div>
          </div>
        </div>

        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {([
            ['pending', 'Подтверждения', requests.length],
            ['hidden', 'Скрытые', hiddenProfiles.length],
            ['complaints', 'Жалобы', openComplaints.length],
            ['users', 'Пользователи', people.length],
            ['addresses', 'Адреса села', addresses.length],
          ] as const).map(([section, label, count]) => (
            <button key={section} type="button" onClick={() => setActiveSection(section)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeSection === section ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeSection === section ? 'bg-white/20' : 'bg-slate-100 dark:bg-zinc-800'}`}>{count}</span></button>
          ))}
        </nav>

        {activeSection === 'pending' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900 dark:text-white">Ожидают подтверждения</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Анкеты специалистов, отправленные на проверку.</p></div><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"><Clock3 className="h-3.5 w-3.5" />{requests.length}</span></div>
            {requests.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">Новых запросов нет.</div> : <div className="space-y-3">{requests.map((profile) => (<div key={profile.id} className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20"><div className="flex items-start gap-3"><img src={profile.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" /><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</h4><p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{profile.professionTitle || 'Специалист'}</p><p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-500">{profile.workplaceAddress}</p></div></div><div className="mt-4 flex flex-wrap gap-2 border-t border-amber-200/60 pt-3"><button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700"><FolderOpen className="h-3.5 w-3.5" />Открыть</button><button type="button" onClick={() => updateProfile(profile.id, { isVerified: true, verificationStatus: 'verified' })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" />Подтвердить</button><button type="button" onClick={() => updateProfile(profile.id, { isVerified: false, verificationStatus: 'rejected' })} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><X className="h-3.5 w-3.5" />Отклонить</button></div></div>))}</div>}
          </section>
        )}
        {activeSection === 'hidden' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900 dark:text-white">Скрытые анкеты</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Анкеты скрыты из общего каталога, но не удалены.</p></div><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{hiddenProfiles.length}</span></div>
            {hiddenProfiles.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">Скрытых анкет нет.</div> : <div className="space-y-3">{hiddenProfiles.map((profile) => (<div key={profile.id} className="rounded-3xl border border-red-200 bg-red-50/60 p-4 shadow-sm"><div className="flex items-center gap-3"><img src={profile.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</p><p className="truncate text-xs text-red-700">{profile.professionTitle || 'Личная анкета'} · {profile.workplaceAddress}</p></div><EyeOff className="h-5 w-5 shrink-0 text-red-600" /></div><div className="mt-4 flex flex-wrap gap-2 border-t border-red-200/60 pt-3"><button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700"><FolderOpen className="h-3.5 w-3.5" />Открыть</button><button type="button" onClick={() => updateProfile(profile.id, { isHidden: false, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Eye className="h-3.5 w-3.5" />Показать в каталоге</button></div></div>))}</div>}
          </section>
        )}
        {activeSection === 'complaints' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900 dark:text-white">Жалобы</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Жалобы пользователей на анкеты и контакты.</p></div><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{openComplaints.length}</span></div>
            {openComplaints.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">Открытых жалоб нет.</div> : <div className="space-y-3">{openComplaints.map((complaint) => { const profile = profiles.find((item) => item.id === complaint.profileId); if (!profile) return null; const owner = users.find((user) => user.id === (complaint.targetUserId || profile.ownerId)); const targetIsAdmin = isProfileAdmin(profile) || Boolean(owner?.isAdmin); return <div key={complaint.id} className="rounded-3xl border border-red-200 bg-red-50/60 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</p><p className="mt-1 break-words text-sm text-slate-600">{complaint.reason}</p></div><span className="shrink-0 text-xs text-slate-400">От: {complaint.authorName}</span></div><div className="mt-4 flex flex-wrap gap-2 border-t border-red-200/60 pt-3"><button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700"><FolderOpen className="h-3.5 w-3.5" />Открыть</button>{!targetIsAdmin && <button type="button" onClick={() => updateProfile(profile.id, { isHidden: true, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white"><EyeOff className="h-3.5 w-3.5" />Скрыть анкету</button>}{!targetIsAdmin && owner && <button type="button" onClick={() => void updateUserBlocked(owner.id, true)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700"><UserX className="h-3.5 w-3.5" />Заблокировать аккаунт</button>}<button type="button" onClick={() => void updateComplaint(complaint.id, 'dismissed')} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700">Отклонить жалобу</button></div></div>; })}</div>}
          </section>
        )}
        {activeSection === 'users' && (
          <section className="space-y-4">
            <div><h3 className="text-base font-bold text-slate-900 dark:text-white">Пользователи</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Список зарегистрированных жителей и управление доступом.</p></div>
            <div className="space-y-3">{people.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">Пользователей пока нет.</div> : people.map((user) => { const userProfiles = profiles.filter((profile) => profile.ownerId === user.id); const expanded = expandedUserId === user.id; return <div key={user.id} className={`rounded-3xl border p-4 shadow-sm transition ${user.isBlocked ? 'border-red-300 bg-red-50/70' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'}`}><div className="flex items-center gap-3"><img src={user.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{user.fullName}</p><p className="truncate text-xs text-slate-500 dark:text-zinc-500">{user.email} · анкет: {user.profileCount}</p>{user.isBlocked && <span className="mt-1 inline-flex rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Аккаунт заблокирован</span>}</div><button type="button" onClick={() => setExpandedUserId(expanded ? null : user.id)} className="rounded-xl p-2 text-emerald-700 hover:bg-emerald-50"><UserRound className="h-5 w-5" /></button><button type="button" onClick={() => void updateUserBlocked(user.id, !user.isBlocked)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${user.isBlocked ? 'bg-emerald-600 text-white' : 'bg-red-50 text-red-700'}`}>{user.isBlocked ? <UserCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}{user.isBlocked ? 'Разблокировать' : 'Заблокировать'}</button></div>{expanded && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-zinc-800">{userProfiles.length === 0 ? <p className="text-xs text-slate-500">Анкет нет.</p> : userProfiles.map((profile) => { const status = getStatus(profile); return <div key={profile.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5 dark:bg-zinc-800/60"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.professionTitle || 'Личная анкета'}</p><span className={`mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span></div><button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-700 shadow-sm"><FolderOpen className="h-3.5 w-3.5" />Открыть</button></div>; })}</div>}</div>; })}</div>
          </section>
        )}

        {activeSection === 'addresses' && (
          <section className="space-y-5">
            <div><h3 className="text-base font-bold text-slate-900 dark:text-white">База адресов села Самашки</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Улица с автопрефиксом ул., подсказки из OSM, чекбокс Не дом → категория Другое, редактирование карандашом, автосохранение.</p></div>

            <form onSubmit={handleAddAddress} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Добавить адрес или объект</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2 relative">
                    <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">Улица (ул. добавится автоматически)</label>
                    <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800">
                      <span className="select-none bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">ул.</span>
                      <input ref={streetInputRef} value={streetName} onChange={(e)=>{ setStreetName(e.target.value); setStreetQuery(e.target.value); setShowStreetSug(true); }} onFocus={()=>setShowStreetSug(true)} onBlur={()=>setTimeout(()=>setShowStreetSug(false),200)} placeholder="Заводская" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" required />
                    </div>
                    {showStreetSug && (streetSuggestions.length>0 || osmSuggestions.length>0) && (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
                        {streetSuggestions.map((s)=>(
                          <button key={s} type="button" onMouseDown={(e)=>e.preventDefault()} onClick={()=>{ setStreetName(stripUlPrefix(s)); setShowStreetSug(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-emerald-50 dark:text-zinc-400 dark:hover:bg-emerald-950/40"><MapPin className="h-3 w-3 text-emerald-600" />{s}</button>
                        ))}
                        {osmSuggestions.map((s)=>(
                          <button key={'osm-'+s} type="button" onMouseDown={(e)=>e.preventDefault()} onClick={()=>{ setStreetName(s); setShowStreetSug(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50 dark:text-zinc-500"><span className="text-[10px] bg-slate-100 rounded px-1">OSM</span>{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">
                      {isNotHouse ? 'Название объекта / категория' : 'Номер дома'}
                    </label>
                    <div className="flex items-center gap-2">
                      {isNotHouse ? (
                        <select
                          value={selectedAddressCategory}
                          onChange={(e) => setSelectedAddressCategory(e.target.value)}
                          className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-amber-900 dark:bg-amber-950/30 dark:text-white"
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
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                          required
                        />
                      )}
                      <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50">
                        <input type="checkbox" checked={isNotHouse} onChange={(e) => setIsNotHouse(e.target.checked)} className="h-4 w-4 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500" />
                        Не дом
                      </label>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">{isNotHouse ? `Будет в категории «${selectedAddressCategory}» на карте` : 'Обычный дом'}</p>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">Координаты — широта и долгота в один ряд</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Lat</span><input value={newLat} onChange={(e)=>handleLatChange(e.target.value)} placeholder="43.288024" className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" required /></div>
                    <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Lng</span><input value={newLng} onChange={(e)=>handleLngChange(e.target.value)} placeholder="45.298989" className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" required /></div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">Формат DMS</label>
                  <input value={dmsInput} onChange={(e)=>handleDmsChange(e.target.value)} placeholder={`43°17'15.8"N 45°17'59.3"E`} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-white" />
                  {dmsError && <p className="mt-1 text-xs text-amber-600">{dmsError}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"><Plus className="h-3.5 w-3.5" />Добавить</button>
                  {saveMsg && <span className="text-xs font-semibold text-emerald-600">{saveMsg}</span>}
                </div>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Управление категориями</h4>
              <div className="flex gap-2">
                <input value={newCategoryName} onChange={(e)=>setNewCategoryName(e.target.value)} placeholder="Новая категория: Магазины, Школа..." className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                <button type="button" onClick={handleAddCategory} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-black">Добавить</button>
              </div>
              {customCategories.length>0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {customCategories.map((cat)=>(
                    <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-zinc-800">{cat}<button type="button" onClick={()=>handleDeleteCategory(cat)} className="ml-1 text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button key="all" type="button" onClick={()=>setAddressFilter('all')} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${addressFilter==='all' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400'}`}>Все</button>
                {allAddressCategories.map((cat)=>(
                  <button key={cat} type="button" onClick={()=>setAddressFilter(cat)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${addressFilter===cat ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400'}`}>{cat}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                  {addressFilter === '__deleted__' ? 'Удалённые' : 'Сохранённые'} ({filteredAddresses.length}
                  {addressFilter !== '__deleted__' && addressFilter === 'all' ? ` из ${addresses.length}` : ''})
                </h4>
                <div className="flex items-center gap-2">
                  {deletedAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddressFilter('__deleted__')}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        addressFilter === '__deleted__'
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60'
                      }`}
                    >
                      <Trash2 className="h-3 w-3" />
                      Удалённые ({deletedAddresses.length})
                    </button>
                  )}
                  {(pendingDeletes.size > 0 || pendingAdds.length > 0) && (
                    <button
                      type="button"
                      onClick={handleCommitAddresses}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <SaveIcon className="h-3.5 w-3.5" />
                      Сохранить ({pendingDeletes.size + pendingAdds.length})
                    </button>
                  )}
                </div>
              </div>
              {filteredAddresses.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
                  {addressFilter === '__deleted__' ? 'Удалённых адресов нет.' : 'Нет адресов для этого фильтра.'}
                </div>
              )}
              {filteredAddresses.map((address) => {
                const isDeleted = pendingDeletes.has(address.id);
                return (
                  <div key={address.id} className={`rounded-2xl border p-3 shadow-sm ${isDeleted ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'}`}>
                    {editingId === address.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div className="sm:col-span-2">
                            <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-800">
                              <span className="px-3 py-2 text-xs font-bold text-slate-400">ул.</span>
                              <input value={editStreetName} onChange={(e)=>setEditStreetName(e.target.value)} className="flex-1 bg-transparent px-2 py-2 text-xs outline-none dark:text-white" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input value={editHouseNumber} onChange={(e)=>setEditHouseNumber(e.target.value)} className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                            <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50">
                              <input type="checkbox" checked={editIsNotHouse} onChange={(e)=>setEditIsNotHouse(e.target.checked)} className="h-4 w-4 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500" />
                              Не дом
                            </label>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={editLat} onChange={(e)=>setEditLat(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                          <input value={editLng} onChange={(e)=>setEditLng(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><SaveIcon className="h-3 w-3" />Сохранить</button>
                          <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"><X className="h-3 w-3" />Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${address.isNotHouse ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'}`}><MapPin className="h-4 w-4" /></div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                              {address.fullAddress}
                              {address.isNotHouse && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-800">Другое</span>}
                              {isDeleted && <span className="ml-1 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white">Удалён</span>}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">Координаты: {address.lat.toFixed(5)}, {address.lng.toFixed(5)} · {decimalToDMSString(address.lat, address.lng)}</p>
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
                              Восстановить
                            </button>
                          ) : (
                            <>
                              <button type="button" onClick={()=>startEdit(address)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"><Pencil className="h-4 w-4" /></button>
                              <button type="button" onClick={()=>handleDeleteAddress(address.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <ProfileModal profile={viewProfile} isAdminStatus={viewProfile ? isProfileAdmin(viewProfile) : false} showPending={Boolean(viewProfile?.verificationStatus === 'pending')} isViewerBlocked={false} onClose={() => setViewProfile(null)} onReview={addReview} />
      <BottomNav onOpenMenu={() => setIsMenuDrawerOpen(true)} onOpenCreate={() => setIsCreateSheetOpen(true)} isAdmin={isCurrentUserAdmin} />
      <MobileMenuDrawer isOpen={isMenuDrawerOpen} onClose={() => setIsMenuDrawerOpen(false)} isAdmin={isCurrentUserAdmin} />
      <CreateActionModal isOpen={isCreateSheetOpen} onClose={() => setIsCreateSheetOpen(false)} onOpenCreateProfile={() => {}} />
    </div>
  );
}
