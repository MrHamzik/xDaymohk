'use client';

import { useEffect, useState } from 'react';
import { Info, UserPlus, X } from 'lucide-react';
import { Account } from '@/components/AuthProvider';
import PhoneField from '@/components/PhoneField';
import Notice from '@/components/Notice';
import { extractPhoneDigits, formatPhone } from '@/lib/phone';
import { findClosestSamashkiHouse, getEffectiveHouseAddresses } from '@/lib/samashki-addresses';
import { Certificate, MapPosition, PROFESSION_CATEGORIES, Profile } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import ScheduleSection from '@/components/edit-profile/ScheduleSection';
import DocumentsSection from '@/components/edit-profile/DocumentsSection';
import WorkplaceSection from '@/components/edit-profile/WorkplaceSection';
import ExperienceSection, { calculateExperience } from '@/components/edit-profile/ExperienceSection';
import { useSheetSwipe } from '@/lib/hooks/useSheetSwipe';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface EditProfileModalProps {
  isOpen: boolean;
  account: Account | null;
  profile?: Profile | null;
  onClose: () => void;
  onSave: (newProfile: Profile) => void;
}

const MAX_BIO_LENGTH = 1000;

function normalizeAddress(value: string) {
  const address = value.trim();
  if (!address) return 'Даймохк';
  return /даймохк|самашк/i.test(address) ? address : `Даймохк, ${address}`;
}

function isVideoLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const DEFAULT_WORK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export default function EditProfileModal({ isOpen, account, profile = null, onClose, onSave }: EditProfileModalProps) {
  const { t } = useI18n();
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [birthYear, setBirthYear] = useState('');
  const [settlement, setSettlement] = useState('Даймохк');
  const [isSpecialist, setIsSpecialist] = useState(true);
  const [professionCategory, setProfessionCategory] = useState('doctor');
  const [professionTitle, setProfessionTitle] = useState('');
  const [experienceStart, setExperienceStart] = useState('');
  const [experienceEnd, setExperienceEnd] = useState('');
  const [experienceCurrent, setExperienceCurrent] = useState(true);
  const [requestVerification, setRequestVerification] = useState(false);
  const [bio, setBio] = useState('');
  const [workplaceAddress, setWorkplaceAddress] = useState('');
  const [workplaceCoords, setWorkplaceCoords] = useState<MapPosition | null>(null);
  const [hidePhone, setHidePhone] = useState(false);
  const [whatsappDigits, setWhatsappDigits] = useState('');
  const [sameAsPhoneWhatsapp, setSameAsPhoneWhatsapp] = useState(true);
  const [telegram, setTelegram] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [showVideoHint, setShowVideoHint] = useState(false);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [workDays, setWorkDays] = useState<string[]>(DEFAULT_WORK_DAYS);
  const [workHoursStart, setWorkHoursStart] = useState('09:00');
  const [workHoursEnd, setWorkHoursEnd] = useState('18:00');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [isFlexibleSchedule, setIsFlexibleSchedule] = useState(false);
  const [notice, setNotice] = useState('');
  const [nickname, setNickname] = useState('');
  const [showNickname, setShowNickname] = useState(false);
  const swipe = useSheetSwipe(onClose);

  useEffect(() => {
    if (!isOpen) return;

    // New profiles are always specialist (the personal one already exists
    // and cannot be removed). Editing an existing profile keeps its
    // current isSpecialist value (including the personal=false one).
    setIsSpecialist(profile?.id ? Boolean(profile.isSpecialist) : true);
    setProfessionCategory(profile?.professionCategory ?? 'doctor');
    setProfessionTitle(profile?.professionTitle ?? '');
    setExperienceStart(profile?.experienceStart ?? '');
    setExperienceEnd(profile?.experienceEnd ?? '');
    setExperienceCurrent(profile?.experienceCurrent ?? !profile?.experienceEnd);
    setRequestVerification(profile?.verificationStatus === 'pending');
    setBio(profile?.bio === 'Житель Даймохка.' ? '' : profile?.bio ?? '');
    setWorkplaceAddress(profile?.workplaceAddress ?? '');
    setWorkplaceCoords(profile?.workplaceCoords ?? null);
    setHidePhone(profile?.hidePhone ?? false);
    setWorkDays(profile?.workDays && profile.workDays.length > 0 ? profile.workDays : DEFAULT_WORK_DAYS);
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
    setNickname(profile?.nickname ?? '');
    setShowNickname(Boolean(profile?.showNickname));
    setNotice('');
  }, [isOpen, profile?.id, account?.id]);

  useLockBody(isOpen);

  if (!isOpen) return null;

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

    // Личная анкета может иметь любой адрес/дефолт — строгая проверка БД
    // применяется только к анкетам специалистов/жителей в каталоге.
    const isPersonalProfile = Boolean(profile?.isPersonal);
    if (!isPersonalProfile && !workplaceAddress.trim()) {
      setNotice('Укажите место работы или адрес.');
      return;
    }
    if (!isPersonalProfile) {
      // Строгий формат: адрес должен быть из базы (домов/объектов) или
      // выбран точкой на карте. Допускается префикс «Даймохк, …» / «Самашки, …»
      // (normalizeAddress добавляет его при сохранении).
      const dbAddresses = getEffectiveHouseAddresses().map((a) => a.fullAddress);
      const trimmedAddress = workplaceAddress.trim();
      // «Даймохк» — всегда валидный адрес (область по умолчанию), даже если
      // пользователь не выбрал точку на карте.
      const isDefaultRegion = /^даймохк$/i.test(trimmedAddress)
        || /^с\.\s+даймохк$/i.test(trimmedAddress)
        || /^даймохк,\s*/i.test(trimmedAddress);
      const addressMatchesDb = isDefaultRegion || dbAddresses.some((db) =>
        trimmedAddress === db
        || trimmedAddress.endsWith(`, ${db}`)
        || trimmedAddress.endsWith(db),
      );
      if (!addressMatchesDb) {
        setNotice('Адрес не найден в базе. Выберите адрес из списка подсказок или отметьте точку на карте.');
        return;
      }
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
      avatarUrl: account.avatarUrl,
      photos: profile?.photos ?? [],
      isPersonal: Boolean(profile?.isPersonal),
      nickname: profile?.isPersonal ? nickname.trim() : profile?.nickname,
      showNickname: profile?.isPersonal ? showNickname : Boolean(profile?.showNickname),
      isSpecialist,
      professionCategory: isSpecialist ? professionCategory : undefined,
      professionTitle: isSpecialist ? professionTitle.trim() || undefined : undefined,
      experience: isSpecialist ? calculateExperience(experienceStart, experienceEnd, experienceCurrent) || undefined : undefined,
      experienceStart: isSpecialist ? experienceStart || undefined : undefined,
      experienceEnd: isSpecialist ? experienceCurrent ? undefined : experienceEnd || undefined : undefined,
      experienceCurrent: isSpecialist ? experienceCurrent : undefined,
      bio: bio.trim() || 'Житель Даймохка.',
      workplaceAddress: normalizeAddress(workplaceAddress),
      workplaceCoords: workplaceCoords ?? { lat: 43.288024, lng: 45.298989 },
      rating: profile?.rating ?? 0,
      reviewCount: profile?.reviewCount ?? 0,
      reviews: profile?.reviews ?? [],
      gender: profile?.gender ?? account.gender,
      birthDate: profile?.birthDate ?? account.birthDate,
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
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={profile ? t.editProfileTitle : t.newProfileTitle}>
        <div className="smk-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl transition-colors sm:max-w-2xl sm:rounded-3xl">
          <div className="flex shrink-0 items-center justify-between smk-sheet-head border-b border-[color:var(--smk-divider)] p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                <UserPlus className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">{profile ? t.editProfileTitle : t.newProfileTitle}</h2>
                <p className="smk-text-label text-slate-500 dark:text-zinc-500">{profile ? t.editProfileSubtitle : t.newProfileSubtitle}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Закрыть форму" className="smk-act flex h-7 w-7 items-center justify-center"><X className="h-3.5 w-3.5" /></button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 text-xs text-slate-800 dark:text-zinc-300 no-scrollbar">
            {account ? (
              <section className="smk-field flex items-center gap-3 p-3">
                <img src={account.avatarUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{account.fullName}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{account.phone || t.phoneNotSet}</p>
                  {!profile?.isPersonal && <p className="mt-0.5 smk-text-label text-emerald-700 dark:text-emerald-400">{t.profileInfoUsed}</p>}
                </div>
              </section>
            ) : (
              <p className="smk-note smk-note-warn p-3">{t.signInToCreate}</p>
            )}

            {profile?.isPersonal && (
              <section className="space-y-2">
                <div>
                  <label htmlFor="profile-nick" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">{t.nicknameLabel}</label>
                  <input id="profile-nick" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24} className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 dark:text-white" />
                  <p className="mt-1 smk-text-label text-slate-500 dark:text-zinc-500">{t.nicknameHint}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400">
                  <input type="checkbox" checked={showNickname} onChange={(event) => setShowNickname(event.target.checked)} className="h-3.5 w-3.5 rounded text-emerald-600" />
                  {t.nicknameShow}
                </label>
              </section>
            )}

            {!profile?.isPersonal && !profile?.id && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                <p className="smk-text-label leading-relaxed text-emerald-800 dark:text-emerald-200">
                  {t.personalProfileExists}
                </p>
              </div>
            )}

            {isSpecialist && (
              <section className="smk-group">
                <div>
                  <label htmlFor="profile-category" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">{t.professionCategory}</label>
                  <select id="profile-category" value={professionCategory} onChange={(event) => setProfessionCategory(event.target.value)} className="smk-field w-full pl-3 pr-10 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white">
                    {PROFESSION_CATEGORIES.filter((category) => category.id !== 'all').map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="profile-specialization" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">{t.professionSpecialization}</label>
                  <input id="profile-specialization" value={professionTitle} onChange={(event) => setProfessionTitle(event.target.value)} placeholder={t.professionSpecializationPlaceholder} className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white" />
                </div>

                <ExperienceSection
                  experienceStart={experienceStart}
                  setExperienceStart={setExperienceStart}
                  experienceEnd={experienceEnd}
                  setExperienceEnd={setExperienceEnd}
                  experienceCurrent={experienceCurrent}
                  setExperienceCurrent={setExperienceCurrent}
                />

                <ScheduleSection
                  isFlexibleSchedule={isFlexibleSchedule}
                  setIsFlexibleSchedule={setIsFlexibleSchedule}
                  workDays={workDays}
                  setWorkDays={setWorkDays}
                  workHoursStart={workHoursStart}
                  setWorkHoursStart={setWorkHoursStart}
                  workHoursEnd={workHoursEnd}
                  setWorkHoursEnd={setWorkHoursEnd}
                  breakStart={breakStart}
                  setBreakStart={setBreakStart}
                  breakEnd={breakEnd}
                  setBreakEnd={setBreakEnd}
                />

                <DocumentsSection
                  certificates={certificates}
                  setCertificates={setCertificates}
                  onNotice={setNotice}
                />

                <div className="border-t border-[color:var(--smk-divider)] pt-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor="profile-video" className="text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.videoTitle}</label>
                    <button type="button" onClick={() => setShowVideoHint((isShown) => !isShown)} aria-label="Пояснение о видео" className="text-amber-500 transition hover:text-amber-600"><Info className="h-3.5 w-3.5" /></button>
                  </div>
                  {showVideoHint && <p className="smk-note smk-note-warn mb-2 p-2">{t.videoHint}</p>}
                  <input id="profile-video" type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtu.be/..." className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white" />
                </div>

                <label className="flex cursor-pointer items-start gap-2 border-t border-slate-200/80 pt-2.5 text-xs dark:border-zinc-800">
                  <input type="checkbox" checked={requestVerification} onChange={(event) => setRequestVerification(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500" />
                  <span><span className="block font-semibold text-slate-700 dark:text-zinc-300">{t.requestVerificationLabel}</span><span className="mt-0.5 block smk-text-label text-slate-500 dark:text-zinc-500">{t.requestVerificationHint}</span></span>
                </label>
              </section>
            )}

            <WorkplaceSection
              workplaceAddress={workplaceAddress}
              setWorkplaceAddress={setWorkplaceAddress}
              workplaceCoords={workplaceCoords}
              setWorkplaceCoords={setWorkplaceCoords}
            />

            {/* Контакты идут сразу после адреса и до рассказа о себе (п.43):
                сначала «где», потом «как связаться», и только затем текст.
                Порядок внутри: Телефон → WhatsApp → Telegram. */}
            <section className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400">
                {t.contactsHeading}
              </h3>

              <div>
                {/* Подписи полей связи одинаковы во всех формах (п.2/п.8):
                    «Телефон для звонков», «Номер телефона в WhatsApp»,
                    «Имя пользователя в Telegram». Раньше здесь стояло
                    просто «Телефон», а в анкете регистрации — «Телефон /
                    Телефон»: три формы, три разных набора подписей. */}
                <label htmlFor="profile-phone" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">
                  {t.phoneGeneral}
                </label>
                <input
                  id="profile-phone"
                  value={account?.phone ? formatPhone(account.phone) : ''}
                  placeholder={t.phoneNotSet}
                  readOnly
                  className="smk-field w-full px-3 py-2.5 text-xs text-slate-500 dark:text-zinc-400"
                />
                <p className="mt-1 smk-text-label text-slate-500 dark:text-zinc-500">{t.phoneFromAccount}</p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="profile-whatsapp" className="block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.phoneWhatsappLabel}</label>
                  <label className="flex cursor-pointer items-center gap-1 smk-text-label text-emerald-700 dark:text-emerald-400"><input type="checkbox" checked={sameAsPhoneWhatsapp} onChange={(event) => { setSameAsPhoneWhatsapp(event.target.checked); if (event.target.checked && account) setWhatsappDigits(extractPhoneDigits(account.phone)); }} className="h-3 w-3 rounded text-emerald-600 focus:ring-emerald-500" />{t.useCommonNumber}</label>
                </div>
                <PhoneField id="profile-whatsapp" value={whatsappDigits} onChange={handleWhatsappChange} />
              </div>
              <div>
                <label htmlFor="profile-telegram" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.phoneTelegramLabel}</label>
                <div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3 font-bold text-slate-400">@</span><input id="profile-telegram" value={telegram} onChange={(event) => setTelegram(event.target.value.replace(/^@/, ''))} placeholder={t.telegramUsername} className="smk-field w-full py-2.5 pl-8 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white" /></div>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400"><input type="checkbox" checked={hidePhone} onChange={(event) => setHidePhone(event.target.checked)} className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500" />{t.hidePhoneLabel}</label>

            </section>

            <div>
              <label htmlFor="profile-bio" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.bioLabel}</label>
              <textarea id="profile-bio" rows={3} maxLength={MAX_BIO_LENGTH} value={bio} onChange={(event) => setBio(event.target.value)} placeholder={t.bioPlaceholder} className="w-full resize-y break-words [overflow-wrap:anywhere] smk-field px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white" />
              <p className="mt-0.5 text-right smk-text-label text-slate-400">{bio.length}/{MAX_BIO_LENGTH}</p>
            </div>


            <div className="smk-note smk-note-warn p-2.5">
              {t.emptyContactsWarning}
            </div>

            <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-95">{profile ? t.saveProfileBtn : t.addToCatalogBtn}</button>
          </form>
        </div>
      </div>
    </>
  );
}
