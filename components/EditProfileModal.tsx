'use client';

import { useEffect, useState } from 'react';
import { Info, UserPlus, X } from 'lucide-react';
import { Account } from '@/components/AuthProvider';
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
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  // Пол и дата рождения живут в АНКЕТЕ (ТЗ-2, п.5): в профиле их
  // больше нет, здесь — полноценные поля.
  const [birthDate, setBirthDate] = useState('');
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
  // Видимость контактов В ЭТОЙ анкете: галочки «НЕ показывать» (правка
  // от 22.08, п.4 — единая формулировка), по умолчанию из профиля.
  const [hidePhone, setHidePhone] = useState(true);
  const [hideWhatsapp, setHideWhatsapp] = useState(true);
  const [hideTelegram, setHideTelegram] = useState(true);
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
    setHidePhone(profile ? profile.hidePhone === true : account?.hidePhone !== false);
    setHideWhatsapp(profile ? profile.hideWhatsapp === true : account?.hideWhatsapp !== false);
    setHideTelegram(profile ? profile.hideTelegram === true : account?.hideTelegram !== false);
    setWorkDays(profile?.workDays && profile.workDays.length > 0 ? profile.workDays : DEFAULT_WORK_DAYS);
    setWorkHoursStart(profile?.workHoursStart ?? '09:00');
    setWorkHoursEnd(profile?.workHoursEnd ?? '18:00');
    setBreakStart(profile?.breakStart ?? '');
    setBreakEnd(profile?.breakEnd ?? '');
    setIsFlexibleSchedule(Boolean(profile?.isFlexibleSchedule));

    // НОВАЯ анкета — дефолты из профиля: вся информация профиля
    // применяется к каждой новой анкете автоматически (ТЗ, п.4/5).
    if (!profile?.id && account) {
      setGender(profile?.gender ?? account?.gender ?? '');
      setBirthDate(profile?.birthDate ?? account?.birthDate ?? '');
      setSettlement(account.settlement || 'Даймохк');
    }

    setVideoUrl(profile?.videoUrl ?? '');
    setCertificates(profile?.certificates ?? []);
    setNickname(profile?.nickname ?? '');
    setShowNickname(Boolean(profile?.showNickname));
    setNotice('');
  }, [isOpen, profile?.id, account?.id]);

  useLockBody(isOpen);

  if (!isOpen) return null;

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


    // Личная анкета может иметь любой адрес/дефолт — строгая проверка БД
    // применяется только к анкетам специалистов/жителей в каталоге.
    const isPersonalProfile = Boolean(profile?.isPersonal);
    if (!isPersonalProfile && !workplaceAddress.trim()) {
      setNotice('Укажите место работы или адрес.');
      return;
    }
    // п.6 замечаний 22.08: адреса пользователя может не быть в базе —
    // строгая проверка убрана. Подсказки из БД и точка на карте
    // остаются помощью, но вводится и сохраняется любой адрес.

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

    // Контакты анкеты берутся из ПРОФИЛЯ (ТЗ, п.5.1): полей ввода
    // здесь больше нет. Скрытое профилем не подставляется вовсе.
    const finalWhatsapp: string | undefined = account?.hideWhatsapp
      ? undefined
      : (account?.whatsapp ? `7${extractPhoneDigits(account.whatsapp)}` : undefined);
    const finalTelegram: string | undefined = account?.hideTelegram
      ? undefined
      : (account?.telegram || undefined);

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
      gender: gender || profile?.gender || account?.gender,
      birthDate: birthDate || profile?.birthDate || account?.birthDate,
      settlement: settlement.trim(),
      phone: formatPhone(account.phone),
      hidePhone,
      hideWhatsapp,
      hideTelegram,
      sameAsPhoneWhatsapp: false,
      isVerified: false,
      verificationStatus: isSpecialist && requestVerification ? 'pending' : 'none',
      isAdmin: false,
      isHidden: profile?.isHidden ?? profile?.isBanned ?? false,
      isBanned: profile?.isBanned ?? false,
      whatsapp: finalWhatsapp,
      telegram: finalTelegram,
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
                  <input id="profile-nick" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 dark:text-white" />
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

              {/* Контакты анкеты берутся из профиля (ТЗ-2, п.6):
                  никаких полей и пояснений — только три галочки
                  видимости для ЭТОЙ анкеты (по умолчанию — из профиля). */}
              <div className="smk-field space-y-1.5 rounded-xl p-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400">
                  <input type="checkbox" checked={hidePhone} onChange={(e) => setHidePhone(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
                  {t.tourHidePhone}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400">
                  <input type="checkbox" checked={hideWhatsapp} onChange={(e) => setHideWhatsapp(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
                  {t.tourHideWhatsapp}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400">
                  <input type="checkbox" checked={hideTelegram} onChange={(e) => setHideTelegram(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
                  {t.tourHideTelegram}
                </label>
              </div>
            </section>

            {/* Пол и дата рождения — поля АНКЕТЫ (ТЗ-2, п.5): из
                профиля они убраны. */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-gender" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.genderLabel}</label>
                <select id="profile-gender" value={gender} onChange={(event) => setGender(event.target.value as 'male' | 'female' | 'other' | '')} className="smk-field w-full px-3 pr-8 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white">
                  <option value="">{t.genderNotSet}</option>
                  <option value="male">{t.genderMale}</option>
                  <option value="female">{t.genderFemale}</option>
                  <option value="other">{t.genderOther}</option>
                </select>
              </div>
              <div>
                <label htmlFor="profile-birth" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.birthDateLabel}</label>
                <input id="profile-birth" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white" />
              </div>
            </div>

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
