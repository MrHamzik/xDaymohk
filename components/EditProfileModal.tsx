'use client';

import { useEffect, useState } from 'react';
import { Award, Clock, ExternalLink, Info, MapPin, UserPlus, X } from 'lucide-react';
import { Account } from '@/components/AuthProvider';
import PhoneField from '@/components/PhoneField';
import Notice from '@/components/Notice';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import InteractiveMap, { type MapLayerMode } from '@/components/InteractiveMap';
import { compressImageFile, uploadImageIfStorageConfigured } from '@/lib/media';
import { WEEKDAYS } from '@/lib/schedule';
import { findClosestSamashkiHouse } from '@/lib/samashki-addresses';
import { Certificate, MapPosition, PROFESSION_CATEGORIES, Profile } from '@/lib/types';

interface EditProfileModalProps {
  isOpen: boolean;
  account: Account | null;
  profile?: Profile | null;
  onClose: () => void;
  onSave: (newProfile: Profile) => void;
}

function extractPhoneDigits(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 10 && (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

function formatPhone(value: string) {
  const digits = extractPhoneDigits(value);
  if (!digits) return '';

  let formatted = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) formatted += `) ${digits.slice(3, 6)}`;
  if (digits.length >= 6) formatted += `-${digits.slice(6, 8)}`;
  if (digits.length >= 8) formatted += `-${digits.slice(8, 10)}`;
  return formatted;
}

function normalizeAddress(value: string) {
  const address = value.trim();
  if (!address) return 'Самашки';
  return /самашк/i.test(address) ? address : `Самашки, ${address}`;
}

const MAX_BIO_LENGTH = 1000;

function calculateExperience(start: string, end: string, isCurrent: boolean) {
  if (!start) return '';
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${isCurrent || !end ? new Date().toISOString().slice(0, 10) : end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return '';

  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth();
  if (endDate.getDate() < startDate.getDate()) months = Math.max(0, months - 1);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? 'год' : years >= 2 && years <= 4 ? 'года' : 'лет'}`);
  if (remainingMonths) parts.push(`${remainingMonths} ${remainingMonths === 1 ? 'месяц' : remainingMonths >= 2 && remainingMonths <= 4 ? 'месяца' : 'месяцев'}`);
  return parts.join(' ') || 'меньше месяца';
}

function isVideoLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function EditProfileModal({ isOpen, account, profile = null, onClose, onSave }: EditProfileModalProps) {
    const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [birthYear, setBirthYear] = useState('');
  const [settlement, setSettlement] = useState('Самашки');
const [isSpecialist, setIsSpecialist] = useState(false);
  const [professionCategory, setProfessionCategory] = useState('doctor');
  const [professionTitle, setProfessionTitle] = useState('');
  const [experienceStart, setExperienceStart] = useState('');
  const [experienceEnd, setExperienceEnd] = useState('');
  const [experienceCurrent, setExperienceCurrent] = useState(true);
  const [requestVerification, setRequestVerification] = useState(false);
  const [bio, setBio] = useState('');
  const [workplaceAddress, setWorkplaceAddress] = useState('');
  const [workplaceCoords, setWorkplaceCoords] = useState<MapPosition | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [modalMapLayerMode, setModalMapLayerMode] = useState<MapLayerMode>('streets');
  const [showModalHouses, setShowModalHouses] = useState(true);
  const [showModalPlaces, setShowModalPlaces] = useState(true);
  const [hidePhone, setHidePhone] = useState(false);
  const [whatsappDigits, setWhatsappDigits] = useState('');
  const [sameAsPhoneWhatsapp, setSameAsPhoneWhatsapp] = useState(true);
  const [telegram, setTelegram] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [showVideoHint, setShowVideoHint] = useState(false);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [newCertificateTitle, setNewCertificateTitle] = useState('');
  const [newCertificateIssuer, setNewCertificateIssuer] = useState('');
  const [newCertificateImageUrl, setNewCertificateImageUrl] = useState('');
  const [workDays, setWorkDays] = useState<string[]>(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']);
  const [workHoursStart, setWorkHoursStart] = useState('09:00');
  const [workHoursEnd, setWorkHoursEnd] = useState('18:00');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [isFlexibleSchedule, setIsFlexibleSchedule] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setIsSpecialist(profile?.isSpecialist ?? false);
    setProfessionCategory(profile?.professionCategory ?? 'doctor');
    setProfessionTitle(profile?.professionTitle ?? '');
    setExperienceStart(profile?.experienceStart ?? '');
    setExperienceEnd(profile?.experienceEnd ?? '');
    setExperienceCurrent(profile?.experienceCurrent ?? !profile?.experienceEnd);
    setRequestVerification(profile?.verificationStatus === 'pending');
    setBio(profile?.bio === 'Житель Самашек.' ? '' : profile?.bio ?? '');
    setWorkplaceAddress(profile?.workplaceAddress ?? '');
    setWorkplaceCoords(profile?.workplaceCoords ?? null);
    setShowMap(false);
    setHidePhone(profile?.hidePhone ?? false);
    setWorkDays(profile?.workDays && profile.workDays.length > 0 ? profile.workDays : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']);
    setWorkHoursStart(profile?.workHoursStart ?? '09:00');
    setWorkHoursEnd(profile?.workHoursEnd ?? '18:00');
    setBreakStart(profile?.breakStart ?? '');
    setBreakEnd(profile?.breakEnd ?? '');
    setIsFlexibleSchedule(Boolean(profile?.isFlexibleSchedule));

    const isWhatsappSame = profile ? Boolean(profile.sameAsPhoneWhatsapp) : true;
    setSameAsPhoneWhatsapp(isWhatsappSame);
    if (isWhatsappSame && account) {
      setWhatsappDigits(extractPhoneDigits(account.phone));
    } else {
      setWhatsappDigits(extractPhoneDigits(profile?.whatsapp || ''));
    }

    setTelegram(profile?.telegram?.replace(/^@/, '') ?? '');
    setVideoUrl(profile?.videoUrl ?? '');
    setCertificates(profile?.certificates ?? []);
    setNewCertificateTitle('');
    setNewCertificateIssuer('');
    setNewCertificateImageUrl('');
    setNotice('');
  }, [isOpen, profile?.id, account?.id]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMapSelect = (position: MapPosition, explicitAddress?: string) => {
    if (explicitAddress) {
      setWorkplaceCoords(position);
      setWorkplaceAddress(explicitAddress);
      return;
    }
    // Используем эффективную базу адресов (включая кастомные из админки) для поиска ближайшего
    try {
      // @ts-ignore dynamic import of effective list
      const { getEffectiveHouseAddresses } = require('@/lib/samashki-addresses');
      const all = getEffectiveHouseAddresses();
      let closest = all[0];
      let min = Infinity;
      for (const h of all) {
        const dLat = h.lat - position.lat;
        const dLng = h.lng - position.lng;
        const d = dLat*dLat + dLng*dLng;
        if (d < min) { min = d; closest = h; }
      }
      if (closest) {
        setWorkplaceCoords({ lat: closest.lat, lng: closest.lng });
        setWorkplaceAddress(closest.fullAddress);
        return;
      }
    } catch {}
    const closest = findClosestSamashkiHouse(position);
    setWorkplaceCoords({ lat: closest.lat, lng: closest.lng });
    setWorkplaceAddress(closest.fullAddress);
  };

  const handleAddressSelect = (suggestion: { displayName: string; lat: number; lng: number }) => {
    setWorkplaceCoords({ lat: suggestion.lat, lng: suggestion.lng });
  };

  const handleCertificateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('Загрузите изображение документа.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice('Размер исходного документа не должен превышать 5 МБ.');
      return;
    }

    try {
      setNewCertificateImageUrl(await compressImageFile(file));
    } catch (imageError) {
      setNotice(imageError instanceof Error ? imageError.message : 'Не удалось обработать документ.');
    }
  };

  const addCertificate = () => {
    if (!newCertificateImageUrl) {
      setNotice('Сначала загрузите изображение документа.');
      return;
    }

    setCertificates((currentCertificates) => [
      ...currentCertificates,
      {
        id: `cert-${Date.now()}`,
        title: newCertificateTitle.trim() || 'Документ',
        issuer: newCertificateIssuer.trim() || 'Самашки',
        year: new Date().getFullYear().toString(),
        imageUrl: newCertificateImageUrl,
      },
    ]);
    setNewCertificateTitle('');
    setNewCertificateIssuer('');
    setNewCertificateImageUrl('');
  };

  const handleWhatsappChange = (value: string) => {
    setWhatsappDigits(value);
    if (account && extractPhoneDigits(value) === extractPhoneDigits(account.phone)) {
      setSameAsPhoneWhatsapp(true);
    } else {
      setSameAsPhoneWhatsapp(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!account) {
      setNotice('Сначала войдите в профиль.');
      return;
    }
    if (account.isBlocked) {
      setNotice('Ваш аккаунт заблокирован администратором.');
      return;
    }

    const phoneDigits = extractPhoneDigits(account.phone);

    if (!workplaceAddress.trim()) {
      setNotice('Укажите место работы или адрес.');
      return;
    }

    if (isSpecialist && experienceStart && !experienceCurrent && !experienceEnd) {
      setNotice('Укажите дату окончания или отметьте «Работаю здесь сейчас».');
      return;
    }

    if (isSpecialist && experienceStart && !calculateExperience(experienceStart, experienceEnd, experienceCurrent)) {
      setNotice('Проверьте даты стажа. Дата окончания не может быть раньше даты начала.');
      return;
    }

    if (videoUrl.trim() && !isVideoLink(videoUrl.trim())) {
      setNotice('Укажите корректную ссылку на видео.');
      return;
    }

    const safeAvatarUrl = await uploadImageIfStorageConfigured(account.avatarUrl, account.id, 'avatars');
    let finalWhatsapp: string | undefined = undefined;
    if (sameAsPhoneWhatsapp) {
      finalWhatsapp = phoneDigits ? `7${phoneDigits}` : undefined;
    } else if (whatsappDigits.trim()) {
      finalWhatsapp = `7${whatsappDigits.trim()}`;
    }

    const newProfile: Profile = {
      id: profile?.id ?? `profile-${Date.now()}`,
      ownerId: profile?.ownerId ?? account.id,
      fullName: account.fullName,
      avatarUrl: safeAvatarUrl,
      photos: profile?.photos ?? [],
      isSpecialist,
      professionCategory: isSpecialist ? professionCategory : undefined,
      professionTitle: isSpecialist ? professionTitle.trim() || undefined : undefined,
      experience: isSpecialist ? (calculateExperience(experienceStart, experienceEnd, experienceCurrent) || undefined) : undefined,
      experienceStart: isSpecialist ? (experienceStart || undefined) : undefined,
      experienceEnd: isSpecialist ? (experienceCurrent ? undefined : experienceEnd || undefined) : undefined,
      experienceCurrent: isSpecialist ? experienceCurrent : undefined,
      bio: bio.trim() || 'Житель Самашек.',
      workplaceAddress: normalizeAddress(workplaceAddress),
      workplaceCoords: workplaceCoords ?? { lat: 43.288024, lng: 45.298989 },
      rating: profile?.rating ?? 0,
      reviewCount: profile?.reviewCount ?? 0,
      reviews: profile?.reviews ?? [],
            gender: gender ? (gender as 'male' | 'female') : undefined,
      birthDate: birthYear ? birthYear : undefined,
      settlement: settlement.trim(),
phone: formatPhone(account.phone),
      hidePhone,
      sameAsPhoneWhatsapp,
      isVerified: false,
      verificationStatus: isSpecialist && requestVerification ? 'pending' : 'none',
      isAdmin: false,
      isHidden: profile?.isHidden ?? profile?.isBanned ?? false,
      isBanned: profile?.isBanned ?? false,
      whatsapp: finalWhatsapp,
      telegram: telegram.trim() ? `@${telegram.trim().replace(/^@/, '')}` : undefined,
      videoUrl: isSpecialist ? (videoUrl.trim() || undefined) : undefined,
      workDays: isSpecialist ? (workDays.length > 0 ? workDays : undefined) : undefined,
      workHoursStart: isSpecialist && !isFlexibleSchedule ? (workHoursStart.trim() || undefined) : undefined,
      workHoursEnd: isSpecialist && !isFlexibleSchedule ? (workHoursEnd.trim() || undefined) : undefined,
      breakStart: isSpecialist && !isFlexibleSchedule ? (breakStart.trim() || undefined) : undefined,
      breakEnd: isSpecialist && !isFlexibleSchedule ? (breakEnd.trim() || undefined) : undefined,
      isFlexibleSchedule: isSpecialist ? isFlexibleSchedule : false,
      certificates: isSpecialist ? certificates : [],
      createdAt: profile?.createdAt ?? new Date().toISOString().split('T')[0],
    };

    onSave(newProfile);
    onClose();
  };

  return (
    <>
      {notice && <Notice message={notice} type="error" onClose={() => setNotice('')} />}
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={profile ? 'Изменить анкету' : 'Добавить анкету'}>
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl transition-colors dark:bg-zinc-950 sm:max-w-2xl sm:rounded-2xl border border-slate-200/50 dark:border-zinc-800">
        {/* Clean minimal modal header matching unified background */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{profile ? 'Изменить анкету' : 'Новая анкета'}</h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">{profile ? 'Обновите данные этой анкеты' : 'Отдельная страница для одной услуги или профессии'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрыть форму" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"><X className="h-3.5 w-3.5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 text-xs text-slate-800 dark:text-zinc-300">
          {account ? (
            /* User profile banner - hide info text for personal */
            <section className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800">
              <img src={account.avatarUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{account.fullName}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-500">{account.phone || 'Телефон не указан'}</p>
                {!profile?.isPersonal && <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">Информация профиля используется для каждой анкеты.</p>}
              </div>
            </section>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Для создания анкеты нужно войти в профиль.</p>
          )}

          {!profile?.isPersonal && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-800">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">Показывать себя как специалиста</h3>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-500">Профиль появится в поиске по услугам и получит график работы.</p>
              </div>
              <input type="checkbox" checked={isSpecialist} onChange={(event) => setIsSpecialist(event.target.checked)} className="h-4 w-4 shrink-0 rounded text-emerald-600 focus:ring-emerald-500" />
            </div>
          )}

          {isSpecialist && (
            <section className="space-y-3.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <label htmlFor="profile-category" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">Сфера деятельности</label>
                <select id="profile-category" value={professionCategory} onChange={(event) => setProfessionCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-10 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white">
                  {PROFESSION_CATEGORIES.filter((category) => category.id !== 'all').map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="profile-specialization" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">Специализация</label>
                <input id="profile-specialization" value={professionTitle} onChange={(event) => setProfessionTitle(event.target.value)} placeholder="Например, стоматолог или электрик" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-bold text-slate-700 dark:text-zinc-400">Период работы и стаж</p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500">
                    С даты
                    <input type="date" value={experienceStart} onChange={(event) => setExperienceStart(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500">
                    По дату
                    <input type="date" value={experienceEnd} disabled={experienceCurrent} onChange={(event) => setExperienceEnd(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                  </label>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-400">
                  <input type="checkbox" checked={experienceCurrent} onChange={(event) => { setExperienceCurrent(event.target.checked); if (event.target.checked) setExperienceEnd(''); }} className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500" />
                  Работаю здесь сейчас
                </label>
                {experienceStart && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Стаж: {calculateExperience(experienceStart, experienceEnd, experienceCurrent)}</p>}
              </div>

              {/* Working Schedule Section */}
              <div className="space-y-2.5 border-t border-slate-200/80 pt-2.5 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400">График и часы работы</h4>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-500">По этим часам на карте отображается статус: Работает / Перерыв / Не работает.</p>
                  </div>
                  <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">Рабочие дни недели</label>
                  <div className="grid grid-cols-7 gap-1 w-full">
                    {WEEKDAYS.map((day) => {
                      const isSelected = workDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setWorkDays((current) => current.includes(day) ? current.filter((d) => d !== day) : [...current, day]);
                          }}
                          className={`flex items-center justify-center rounded-xl py-1.5 text-xs font-bold transition ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-2.5 text-xs font-bold text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <input
                    type="checkbox"
                    checked={isFlexibleSchedule}
                    onChange={(e) => setIsFlexibleSchedule(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>
                    <span className="block font-bold">Произвольный график</span>
                    <span className="block font-normal text-[10px] text-sky-700 dark:text-sky-300">
                      Отображается голубым цветом на карте, скрывает фиксированные часы
                    </span>
                  </span>
                </label>

                {!isFlexibleSchedule && (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="work-start" className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-zinc-400">Начало работы</label>
                        <input
                          id="work-start"
                          type="time"
                          value={workHoursStart}
                          onChange={(e) => setWorkHoursStart(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="work-end" className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-zinc-400">Окончание работы</label>
                        <input
                          id="work-end"
                          type="time"
                          value={workHoursEnd}
                          onChange={(e) => setWorkHoursEnd(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label htmlFor="break-start" className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-zinc-400">Обед с (опц.)</label>
                        <input
                          id="break-start"
                          type="time"
                          value={breakStart}
                          onChange={(e) => setBreakStart(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="break-end" className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-zinc-400">Перерыв до</label>
                        <input
                          id="break-end"
                          type="time"
                          value={breakEnd}
                          onChange={(e) => setBreakEnd(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Documents and Certs */}
              <div className="space-y-2.5 border-t border-slate-200/80 pt-2.5 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400">Документы и грамоты</h4>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-500">Добавьте дипломы или сертификаты.</p>
                  </div>
                  <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                {certificates.length > 0 && (
                  <div className="space-y-1.5">
                    {certificates.map((certificate) => (
                      <div key={certificate.id} className="flex items-center gap-2 rounded-xl bg-white p-2 dark:bg-zinc-800">
                        <img src={certificate.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{certificate.title}</p><p className="truncate text-[10px] text-slate-500 dark:text-zinc-500">{certificate.issuer} · {certificate.year}</p></div>
                        <button type="button" onClick={() => setCertificates((items) => items.filter((item) => item.id !== certificate.id))} className="shrink-0 px-2 py-1 text-[11px] font-semibold text-red-600 hover:underline dark:text-red-400">Удалить</button>
                      </div>
                    ))}
                  </div>
                )}
                <input value={newCertificateTitle} onChange={(event) => setNewCertificateTitle(event.target.value)} placeholder="Название документа" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                <input value={newCertificateIssuer} onChange={(event) => setNewCertificateIssuer(event.target.value)} placeholder="Кем выдан" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
                <input id="profile-certificate" type="file" accept="image/*" onChange={handleCertificateUpload} className="w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700" />
                {newCertificateImageUrl && <p className="text-xs text-emerald-700 dark:text-emerald-400">Документ загружен, нажмите «Добавить документ».</p>}
                <button type="button" onClick={addCertificate} className="rounded-xl border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40">Добавить документ</button>
              </div>

              {/* Video about work */}
              <div className="border-t border-slate-200/80 pt-2.5 dark:border-zinc-800">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="profile-video" className="text-xs font-semibold text-slate-700 dark:text-zinc-400">Видео о работе</label>
                  <button type="button" onClick={() => setShowVideoHint((isShown) => !isShown)} aria-label="Пояснение о видео" className="text-amber-500 transition hover:text-amber-600"><Info className="h-3.5 w-3.5" /></button>
                </div>
                {showVideoHint && <p className="mb-2 rounded-xl bg-amber-50 p-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Загрузите ролик на YouTube и вставьте ссылку сюда («По ссылке»).</p>}
                <input id="profile-video" type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtu.be/..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
              </div>

              <label className="flex cursor-pointer items-start gap-2 border-t border-slate-200/80 pt-2.5 text-xs dark:border-zinc-800">
                <input type="checkbox" checked={requestVerification} onChange={(event) => setRequestVerification(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500" />
                <span><span className="block font-semibold text-slate-700 dark:text-zinc-300">Отправить на проверку</span><span className="mt-0.5 block text-[10px] text-slate-500 dark:text-zinc-500">Администратор проверит данные анкеты и присвоит галочку.</span></span>
              </label>
            </section>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label htmlFor="profile-address" className="block text-xs font-semibold text-slate-700 dark:text-zinc-400">Адресс *</label>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => setShowMap((isShown) => !isShown)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"><MapPin className="h-3 w-3" />{showMap ? 'Скрыть карту' : 'Открыть карту'}</button>
                <a href={`geo:${profile ? profile.workplaceCoords.lat : (workplaceCoords?.lat ?? 43.2880)},${profile ? profile.workplaceCoords.lng : (workplaceCoords?.lng ?? 45.2989)}?q=${profile ? profile.workplaceCoords.lat : (workplaceCoords?.lat ?? 43.2880)},${profile ? profile.workplaceCoords.lng : (workplaceCoords?.lng ?? 45.2989)}`} target="_blank" rel="noopener noreferrer" aria-label="Открыть карту в новой вкладке" className="text-emerald-600 dark:text-emerald-400"><ExternalLink className="h-3 w-3" /></a>
              </div>
            </div>
            {showMap && (
              <div className="mb-2.5 space-y-2">
                <InteractiveMap
                  selectedPosition={workplaceCoords}
                  onSelect={handleMapSelect}
                  showControls={true}
                  showProfiles={false}
                  showHouses={showModalHouses}
                  showPlaces={showModalPlaces}
                  mapLayerMode={modalMapLayerMode}
                  onMapLayerModeChange={setModalMapLayerMode}
                  className="h-56 sm:h-72"
                />
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold text-slate-400">Показать:</span>
                  <button type="button" onClick={()=>setShowModalHouses(v=>!v)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${showModalHouses ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>Дома</button>
                  <button type="button" onClick={()=>setShowModalPlaces(v=>!v)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${showModalPlaces ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>Другое</button>
                </div>
              </div>
            )}
            <AddressAutocomplete
              id="profile-address"
              value={workplaceAddress}
              onChange={setWorkplaceAddress}
              onSelect={handleAddressSelect}
            />
          </div>


          
          <div>
            <label htmlFor="profile-bio" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">Описание анкеты</label>
            <textarea id="profile-bio" rows={3} maxLength={MAX_BIO_LENGTH} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="О себе, услугах или деятельности..." className="w-full resize-y break-words [overflow-wrap:anywhere] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" />
            <p className="mt-0.5 text-right text-[10px] text-slate-400">{bio.length}/{MAX_BIO_LENGTH}</p>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="profile-whatsapp" className="block text-xs font-semibold text-slate-700 dark:text-zinc-400">WhatsApp</label>
                <label className="flex cursor-pointer items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400"><input type="checkbox" checked={sameAsPhoneWhatsapp} onChange={(event) => { setSameAsPhoneWhatsapp(event.target.checked); if (event.target.checked && account) setWhatsappDigits(extractPhoneDigits(account.phone)); }} className="h-3 w-3 rounded text-emerald-600 focus:ring-emerald-500" />Использовать общий номер</label>
              </div>
              <PhoneField id="profile-whatsapp" value={whatsappDigits} onChange={handleWhatsappChange} />
            </div>
            <div>
              <label htmlFor="profile-telegram" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">Telegram</label>
              <div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3 font-bold text-slate-400">@</span><input id="profile-telegram" value={telegram} onChange={(event) => setTelegram(event.target.value.replace(/^@/, ''))} placeholder="username" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white" /></div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400"><input type="checkbox" checked={hidePhone} onChange={(event) => setHidePhone(event.target.checked)} className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500" />Не показывать общий телефон в этой анкете</label>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-2.5 text-[11px] text-amber-800 dark:text-amber-800 dark:border-amber-200/80 dark:bg-amber-50/80">
            ⚠️ Если оставить поля WhatsApp и Telegram пустыми, они не будут показываться в анкете.
          </div>

          <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-95">{profile ? 'Сохранить изменения' : 'Добавить в каталог'}</button>
        </form>
      </div>
      </div>
    </>
  );
}
