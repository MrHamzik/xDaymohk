'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleUserRound, Clock3, LogIn, LogOut, Pencil, RotateCcw, Trash2, UserPlus, X, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import PhoneField from '@/components/PhoneField';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/lib/i18n';
import { compressImageFile, cacheBustAvatarUrl } from '@/lib/media';
import { extractPhoneDigits, formatPhone, isValidCyrillicName } from '@/lib/phone';
import { Profile } from '@/lib/types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAddModal: () => void;
  onEditProfile: (profile: Profile) => void;
}

export default function AccountModal({ isOpen, onClose, onOpenAddModal, onEditProfile }: AccountModalProps) {
  const { t } = useI18n();
  const { account, isLoading, signInWithGoogle, updateAccount, deleteAccount, signOut } = useAuth();
  const { profiles, updateProfile, deleteProfile } = useProfiles();
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
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
    setGender(account.gender || '');
    setBirthDate(account.birthDate || '');
    setSettlement(account.settlement || 'Даймохк');
    setAvatarUrl(account.avatarUrl);
  }, [account]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const ownProfiles = account ? profiles.filter((profile) => profile.ownerId === account.id).sort((a,b)=>{ if(a.isPersonal && !b.isPersonal) return -1; if(!a.isPersonal && b.isPersonal) return 1; return 0; }) : [];

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
      setError('Имя и фамилия — только кириллица и дефис, 2-30 символов.');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      const combinedFullName = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Пользователь';
      await updateAccount({ fullName: combinedFullName, phone: formatPhone(accountPhone),
      gender: gender ? (gender as 'male' | 'female') : undefined,
      birthDate: birthDate ? birthDate : undefined,
      settlement: settlement.trim() || 'Даймохк',
 avatarUrl });
      setError('Данные профиля и всех ваших анкет сохранены.');
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Не удалось сохранить профиль.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
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
      onClose();
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Не удалось удалить аккаунт.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={account ? 'Профиль' : 'Вход через Google'}>
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-800 sm:max-w-md sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-zinc-800/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm" style={{ borderRadius: 'var(--radius-xl, 0.75rem)' }}>
              {account ? <CircleUserRound className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{account ? 'Ваш профиль' : 'Вход в профиль'}</h2>
              <p className="smk-text-label text-slate-500 dark:text-zinc-500">{account ? 'Общие данные для ваших анкет' : 'Авторизация через Google'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="smk-hit flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-700 dark:text-zinc-400"><X className="h-3.5 w-3.5" /></button>
        </header>

        {isLoading ? (
          <div className="p-6 text-center text-xs text-slate-500">Загрузка профиля…</div>
        ) : account ? (
          <form onSubmit={handleSaveAccount} className="space-y-3.5 overflow-y-auto p-4 no-scrollbar">
            {account.isBlocked && <p className="smk-note smk-note-danger p-2.5">{t.accountBlocked}</p>}

            {/* Avatar block */}
            <div className="smk-field flex items-center gap-3 p-3">
              <img
                src={cacheBustAvatarUrl(avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop')}
                alt="Аватар профиля"
                className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-sm"
                style={{ width: '3.5rem', height: '3.5rem', minWidth: '3.5rem', minHeight: '3.5rem', borderRadius: 'var(--radius-xl, 0.75rem)' }}
              />
              <div className="min-w-0 flex-1 shrink">
                <input id="account-avatar" type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" />
                <label htmlFor="account-avatar" className="inline-flex cursor-pointer rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95">Изменить фото</label>
                <p className="mt-1 smk-text-label leading-tight text-slate-500 dark:text-zinc-500">Фото и имя будут общими для всех анкет.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label htmlFor="account-last-name" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">Фамилия *</label>
                <input
                  id="account-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Например: Ибрагимов"
                  required
                  pattern="[А-ЯЁа-яё\-]{2,30}"
                  className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="account-first-name" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">Имя</label>
                <input
                  id="account-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Например: Магомед"
                  required
                  pattern="[А-ЯЁа-яё\-]{2,30}"
                  className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="account-phone" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">Общий телефон для анкет</label>
              <PhoneField id="account-phone" value={accountPhone} onChange={setAccountPhone} />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              
              <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900">
                <label htmlFor="account-gender" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">{t.genderLabel}</label>
                <select id="account-gender" value={gender} onChange={(event) => setGender(event.target.value as any)} className="smk-field w-full px-3 pr-10 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white">
                  <option value="">{t.genderNotSet}</option>
                  <option value="male">{t.genderMale}</option>
                  <option value="female">{t.genderFemale}</option>
                </select>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-zinc-800/60 dark:bg-zinc-900">
                <label htmlFor="account-birthDate" className="mb-1 block text-xs font-bold text-slate-700 dark:text-zinc-400">{t.birthDateLabel}</label>
                <input id="account-birthDate" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="smk-field w-full px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white" />
              </div>
            </div>

            <section className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 pb-1.5 dark:border-zinc-800/60">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400">Мои анкеты</h3>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 smk-text-label font-black text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">{ownProfiles.length}</span>
              </div>
              {ownProfiles.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-500 dark:text-zinc-500">Анкет пока нет.</p>
              ) : ownProfiles.map((profile) => (
                <div key={profile.id} className={`flex items-center gap-2 rounded-xl border p-2 ${profile.isPersonal ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : profile.isHidden || profile.isBanned ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : 'border-slate-200/60 bg-white dark:border-zinc-800/60 dark:bg-zinc-900'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.isPersonal ? t.personalProfile : (profile.professionTitle || t.personalProfile)}</p>
                      {profile.isPersonal && <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 smk-text-label font-bold text-emerald-800">{t.personalBadge}</span>}
                      {(profile.isHidden || profile.isBanned) && !profile.isPersonal && <span className="shrink-0 rounded-md bg-red-600 px-1 py-0.2 smk-text-label font-bold text-white">Скрыта</span>}
                      {profile.verificationStatus === 'pending' && <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-200 px-1 py-0.2 smk-text-label font-bold text-slate-700 dark:bg-zinc-700 dark:text-zinc-300"><Clock3 className="h-2.5 w-2.5 animate-spin" />На проверке</span>}
                    </div>
                    <p className="truncate smk-text-label text-slate-500 dark:text-zinc-500">{profile.isPersonal ? t.personalMinInfo : profile.workplaceAddress}</p>
                  </div>
                  {!profile.isPersonal && <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => updateProfile(profile.id, { isHidden: !profile.isHidden })} aria-label={profile.isHidden ? 'Показать анкету' : 'Скрыть анкету'} title={profile.isHidden ? 'Показать' : 'Скрыть'} className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800">{profile.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>}
                  <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => onEditProfile(profile)} aria-label="Изменить анкету" title="Изменить" className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"><Pencil className="h-3.5 w-3.5" /></button>
                  {!profile.isPersonal && profile.verificationStatus === 'pending' && <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => updateProfile(profile.id, { verificationStatus: 'none', isVerified: false })} aria-label="Отменить проверку" title="Отменить" className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950/40"><RotateCcw className="h-3.5 w-3.5" /></button>}
                  {!profile.isPersonal && <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => handleDeleteProfile(profile)} aria-label="Удалить анкету" title="Удалить" className="inline-flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </section>

            {error && <p className={`text-xs ${error.includes('сохранен') || error.includes('удалена') ? 'text-emerald-600' : 'text-red-600'}`}>{error}</p>}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="submit" disabled={isSaving || Boolean(account.isBlocked)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">{isSaving ? 'Сохраняем…' : 'Сохранить'}</button>
              <button type="button" disabled={Boolean(account.isBlocked)} onClick={() => { onClose(); onOpenAddModal(); }} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"><UserPlus className="h-3.5 w-3.5" />Новая анкета</button>
            </div>
            <button type="button" onClick={handleSignOut} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"><LogOut className="h-3.5 w-3.5" />Выйти из профиля</button>
            <button type="button" onClick={handleDeleteAccount} disabled={isSaving || Boolean(account.isBlocked)} className="w-full rounded-xl py-1 smk-text-label font-semibold text-slate-400 transition hover:text-red-600 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-red-400">Удалить аккаунт и все данные</button>
          </form>
        ) : (
          <div className="space-y-3.5 p-4 text-center">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSaving}
              className="smk-btn-google smk-text-label"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white smk-text-label font-black text-blue-600">G</span>
              Войти через Google
            </button>
            <p className="text-center smk-text-label leading-relaxed text-slate-500 dark:text-zinc-500">После входа имя и аватар подтянутся из Google-профиля.</p>
            <p className="mt-2 text-center smk-text-label leading-relaxed text-slate-400 dark:text-zinc-500">
              Нажимая кнопку «Войти через Google», вы принимаете условия{' '}
              <Link href="/legal" className="font-bold text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400">Пользовательского соглашения / Публичной оферты</Link>{' '}
              и даёте согласие на обработку персональных данных в соответствии с{' '}
              <Link href="/legal" className="font-bold text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400">Политикой конфиденциальности</Link>.
            </p>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
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
        isOpen={isDeleteConfirmOpen}
        title="Удалить аккаунт?"
        message="Будут удалены профиль, все анкеты, документы и отзывы. Восстановить данные нельзя."
        confirmLabel="Удалить всё"
        danger
        isBusy={isSaving}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />
    </>
  );
}
