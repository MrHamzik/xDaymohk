'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleUserRound, Clock3, LogIn, LogOut, Pencil, RotateCcw, ShieldOff, Trash2, UserPlus, UserRound, Eye, EyeOff } from 'lucide-react';
import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import PhoneField from '@/components/PhoneField';
import PhoneVerifyPanel from '@/components/PhoneVerifyPanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import EditProfileModal from '@/components/EditProfileModal';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { compressImageFile, cacheBustAvatarUrl } from '@/lib/media';
import { extractPhoneDigits, formatPhone, isValidCyrillicName } from '@/lib/phone';
import { Profile } from '@/lib/types';

export default function ProfilePage() {
  const { account, isLoading, signInWithGoogle, updateAccount, deleteAccount, signOut, signOutEverywhere } = useAuth();
  const { profiles, isCurrentUserAdmin, updateProfile, deleteProfile, addProfile } = useProfiles();
  const { t } = useI18n();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [settlement, setSettlement] = useState('Даймохк');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isSignOutAllOpen, setIsSignOutAllOpen] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);

  useEffect(() => {
    if (!account) return;
    const parts = (account.fullName || '').trim().split(/\s+/);
    if (parts.length >= 2) {
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    } else {
      setFirstName(account.fullName || '');
      setLastName('');
    }
    setAccountPhone(extractPhoneDigits(account.phone));
    setAvatarUrl(account.avatarUrl);
        setGender(account.gender || '');
    setBirthDate(account.birthDate || '');
    setSettlement(account.settlement || 'Даймохк');
  }, [account]);

  const ownProfiles = account
    ? profiles
        .filter((profile) => profile.ownerId === account.id)
        .sort((a, b) => {
          if (a.isPersonal && !b.isPersonal) return -1;
          if (!a.isPersonal && b.isPersonal) return 1;
          return 0;
        })
    : [];

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Выберите изображение.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Размер исходного фото не должен превышать 5 МБ.');
      return;
    }

    try {
      setAvatarUrl(await compressImageFile(file, true));
      setError('');
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Не удалось обработать фото.');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsSaving(true);
    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Не удалось открыть Google.');
      setIsSaving(false);
    }
  };

  const handleSaveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (account?.isBlocked) {
      setError('Заблокированный пользователь может только просматривать данные.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError('Укажите имя и фамилию кириллицей.');
      return;
    }
    if (!isValidCyrillicName(firstName) || !isValidCyrillicName(lastName)) {
      setError('Имя и фамилия — только кириллица (А-Я, Ёё) и дефис, от 2 до 30 символов, без спецсимволов и цифр.');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      const combinedFullName = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Пользователь';
      await updateAccount({ 
        fullName: combinedFullName, 
        phone: formatPhone(accountPhone), 
        avatarUrl,
        gender: gender ? (gender as 'male' | 'female') : undefined,
        birthDate: birthDate ? birthDate : undefined,
        settlement: settlement.trim() || 'Даймохк'
      });
      setError('Данные профиля и всех ваших анкет сохранены.');
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Не удалось сохранить профиль.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  /**
   * Выход со всех устройств.
   *
   * Отдельно от обычного «Выйти» и с подтверждением: действие
   * необратимое для остальных сессий — человек, который читает эту
   * страницу с планшета, останется без входа и там тоже.
   */
  const confirmSignOutEverywhere = async () => {
    if (isSigningOutAll) return;
    setIsSigningOutAll(true);
    try {
      await signOutEverywhere();
      setIsSignOutAllOpen(false);
    } finally {
      setIsSigningOutAll(false);
    }
  };

  const handleDeleteProfile = (profile: Profile) => {
    if (account?.isBlocked) {
      setError('Заблокированный пользователь может только просматривать данные.');
      return;
    }
    setProfileToDelete(profile);
  };

  const confirmDeleteProfile = async () => {
    if (!profileToDelete || isDeletingProfile) return;
    setIsDeletingProfile(true);
    setError('');
    try {
      await deleteProfile(profileToDelete.id);
      setProfileToDelete(null);
      setError('Анкета удалена и сохранена.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить анкету.');
    } finally {
      setIsDeletingProfile(false);
    }
  };

  const handleDeleteAccount = () => {
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteAccount = async () => {
    setIsDeleteConfirmOpen(false);
    setError('');
    setIsSaving(true);
    try {
      await deleteAccount();
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Не удалось удалить аккаунт.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = (newProfile: Profile) => {
    if (editingProfile) {
      updateProfile(newProfile.id, newProfile);
      setEditingProfile(null);
    } else {
      addProfile(newProfile);
    }
    setIsAddModalOpen(false);
  };

  // Профиль доступен ТОЛЬКО после входа. Гостя — к окну согласия.
  if (!isLoading && !account) {
    return (
      <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
        <Navbar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <UserRound className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Профиль</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Войдите в Даймохк, чтобы открыть свой профиль.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('daymohk-open-consent'))}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Войти в Даймохк
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

            <div className="smk-shell">
        <AppSidebar isAdmin={isCurrentUserAdmin} />
        
        {/* Main Content Area */}
        <main className="smk-shell-main">
        <div className="mb-4 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              aria-label="Вернуться в каталог"
              className="smk-hit smk-field flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-700 shadow-sm transition hover:brightness-95 dark:text-zinc-300 dark:hover:brightness-110"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">
                {account ? 'Ваш профиль' : 'Вход в профиль'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-500">
                {account ? 'Общие данные и ваши анкеты' : 'Авторизация через Google'}
              </p>
            </div>
          </div>
        </div>
        <hr className="smk-orn mb-4" />

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900">
            {t.loading}
          </div>
        ) : account ? (
          <form onSubmit={handleSaveAccount} className="space-y-3.5">
            {account.isBlocked && (
              <p className="smk-note smk-note-danger p-3">
                {t.accountBlocked}
              </p>
            )}

            {/* Общий контейнер личных данных.
                Аватар, ФИО, телефон, пол и дата рождения — это ОДИН
                блок «кто я», а не пять независимых полос на полотне
                страницы. Раньше они лежали прямо на фоне, и цвет фона
                смешивался с цветом полей: границы блока не читались.
                Контейнер берёт слот «Панели и подвал карточек», поля
                внутри остаются на своём слоте — получается два уровня
                глубины вместо одного пятна. */}
            <section className="smk-panel space-y-3.5 p-3.5">
              {/* Sleek Profile Card with Avatar */}
            <div className="smk-field flex items-center gap-3.5 rounded-2xl p-3.5">
              <img
                src={cacheBustAvatarUrl(avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop')}
                alt="Аватар профиля"
                className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-sm"
                style={{ width: '3.5rem', height: '3.5rem', minWidth: '3.5rem', minHeight: '3.5rem', borderRadius: 'var(--radius-xl, 0.75rem)' }}
              />
              <div className="min-w-0 flex-1 shrink">
                <input id="account-avatar" type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" />
                <label htmlFor="account-avatar" className="inline-flex cursor-pointer rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95">
                  {t.avatarChange}
                </label>
                <p className="mt-1 smk-text-label leading-tight text-slate-500 dark:text-zinc-500">{t.avatarHint}</p>
              </div>
            </div>

            {/* Names Row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="account-first-name" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.firstName} *</label>
                <input
                  id="account-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder={t.firstNamePlaceholder}
                  required
                  pattern="[А-ЯЁа-яё\-]{2,30}"
                  title="Только кириллица и дефис"
                  className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="account-last-name" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.lastName} *</label>
                <input
                  id="account-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder={t.lastNamePlaceholder}
                  required
                  pattern="[А-ЯЁа-яё\-]{2,30}"
                  title="Только кириллица и дефис"
                  className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="account-phone" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-400">{t.phoneGeneral}</label>
              <PhoneField id="account-phone" value={accountPhone} onChange={setAccountPhone} />
              <div className="mt-2">
                <PhoneVerifyPanel hideField phoneDigits={accountPhone} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="account-gender" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">{t.genderLabel}</label>
                <select id="account-gender" value={gender} onChange={(event) => setGender(event.target.value as any)} className="smk-field w-full px-3 pr-8 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-zinc-100">
                  <option value="">{t.genderNotSet}</option>
                  <option value="male">{t.genderMale}</option>
                  <option value="female">{t.genderFemale}</option>
                </select>
              </div>
              <div>
                <label htmlFor="account-birthDate" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">{t.birthDateLabel}</label>
                <input id="account-birthDate" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-zinc-100" />
              </div>
            </div>
            </section>

            {/* Мои анкеты — тот же контейнер-панель, что и личные данные:
                это второй смысловой блок страницы, и он не должен
                висеть прямо на фоне. Внутри — .smk-group: прозрачная
                группа с орнаментальными разделителями между строками. */}
            <section className="smk-panel smk-group p-3.5">
              <div className="flex items-center justify-between gap-3 pb-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400">{t.myProfiles}</h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 smk-text-label font-black text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">{ownProfiles.length}</span>
              </div>
              {ownProfiles.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-500 dark:text-zinc-500">{t.noProfilesYet}</p>
              ) : ownProfiles.map((profile) => (
                <div key={profile.id} className={`flex items-center gap-2 rounded-xl border p-2 ${profile.isPersonal ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : profile.isHidden || profile.isBanned ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : 'smk-field border-transparent'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.isPersonal ? t.personalProfile : (profile.professionTitle || t.personalProfile)}</p>
                      {profile.isPersonal && <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 smk-text-label font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">{t.personalBadge}</span>}
                      {(profile.isHidden || profile.isBanned) && !profile.isPersonal && <span className="shrink-0 rounded-md bg-red-600 px-1.5 py-0.5 smk-text-label font-bold text-white">Скрыта</span>}
                      {profile.verificationStatus === 'pending' && <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-200 px-1.5 py-0.5 smk-text-label font-bold text-slate-700 dark:bg-zinc-700 dark:text-zinc-300"><Clock3 className="h-2.5 w-2.5 animate-spin" />На проверке</span>}
                    </div>
                    <p className="truncate smk-text-label text-slate-500 dark:text-zinc-500">{profile.isPersonal ? t.personalMinInfo : profile.workplaceAddress}</p>
                  </div>
                  {!profile.isPersonal && <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => updateProfile(profile.id, { isHidden: !profile.isHidden })} aria-label={profile.isHidden ? 'Показать анкету' : 'Скрыть анкету'} title={profile.isHidden ? 'Показать' : 'Скрыть'} className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800">{profile.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>}
                  <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => { setEditingProfile(profile); setIsAddModalOpen(true); }} aria-label="Изменить анкету" title="Изменить" className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"><Pencil className="h-3.5 w-3.5" /></button>
                  {!profile.isPersonal && profile.verificationStatus === 'pending' && <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => updateProfile(profile.id, { verificationStatus: 'none', isVerified: false })} aria-label="Отменить проверку" title="Отменить" className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950/40"><RotateCcw className="h-3.5 w-3.5" /></button>}
                  {!profile.isPersonal && <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => handleDeleteProfile(profile)} aria-label="Удалить анкету" title="Удалить" className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </section>

            {error && <p className={`text-xs ${error.includes('сохранен') || error.includes('удалена') ? 'text-emerald-600' : 'text-red-600'}`}>{error}</p>}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="submit" disabled={isSaving || Boolean(account.isBlocked)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">{isSaving ? t.saving : t.save}</button>
              <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => { setEditingProfile(null); setIsAddModalOpen(true); }} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"><UserPlus className="h-3.5 w-3.5" />{t.newProfile}</button>
            </div>

            <div className="flex flex-col gap-1.5 pt-2">
              <button type="button" onClick={handleSignOut} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"><LogOut className="h-3.5 w-3.5" />{t.signOut}</button>
              {/* Отдельная кнопка, а не галочка рядом с «Выйти»: обычный
                  выход нажимают каждый день, этот — раз в жизни, когда
                  потерян телефон. Смешивать их опасно. */}
              <button type="button" onClick={() => setIsSignOutAllOpen(true)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 smk-text-label font-semibold text-slate-500 transition hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"><ShieldOff className="h-3.5 w-3.5" />{t.signOutEverywhere}</button>
              <button type="button" onClick={handleDeleteAccount} disabled={isSaving || Boolean(account.isBlocked)} className="w-full rounded-xl py-1 smk-text-label font-semibold text-slate-400 transition hover:text-red-600 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-red-400">Удалить аккаунт и все данные</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400">
              <LogIn className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Вход в профиль</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-500">
              Войдите через Google, чтобы создавать и редактировать свои анкеты в каталоге родины.
            </p>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSaving}
              className="smk-btn-google smk-text-label"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white smk-text-label font-black text-blue-600">G</span>
              Войти через Google
            </button>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </main>
      </div>
      <EditProfileModal
        isOpen={isAddModalOpen}
        account={account}
        profile={editingProfile}
        onClose={() => { setEditingProfile(null); setIsAddModalOpen(false); }}
        onSave={handleSaveProfile}
      />

      <ConfirmDialog
        isOpen={Boolean(profileToDelete)}
        title="Удалить анкету?"
        message="Анкета, её документы и отзывы будут удалены. Это действие нельзя отменить."
        confirmLabel="Удалить"
        danger
        isBusy={isDeletingProfile}
        onConfirm={confirmDeleteProfile}
        onCancel={() => setProfileToDelete(null)}
      />
      <ConfirmDialog
        isOpen={isSignOutAllOpen}
        title={t.signOutEverywhereConfirm}
        message={t.signOutEverywhereMessage}
        confirmLabel={t.signOutEverywhere}
        danger
        isBusy={isSigningOutAll}
        onConfirm={confirmSignOutEverywhere}
        onCancel={() => setIsSignOutAllOpen(false)}
      />
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Удалить аккаунт?"
        message="Будут удалены профиль, все анкеты, документы и отзывы. Восстановить данные нельзя."
        confirmLabel="Удалить всё"
        danger
        isBusy={isSaving}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />

      <BottomNav
        onOpenMenu={() => setIsMenuDrawerOpen(true)}
        onOpenCreate={() => setIsCreateSheetOpen(true)}
        isAdmin={isCurrentUserAdmin}
      />
      <MobileMenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        isAdmin={isCurrentUserAdmin}
      />
      <CreateActionModal
        isOpen={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
        onOpenCreateProfile={() => {
          setEditingProfile(null);
          setIsAddModalOpen(true);
        }}
      />
    </div>
  );
}
