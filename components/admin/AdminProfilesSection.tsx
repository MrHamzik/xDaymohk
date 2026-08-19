'use client';

import { useState } from 'react';
import { Check, Clock3, Eye, EyeOff, FolderOpen, Star, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import ProfileModal from '@/components/ProfileModal';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import { getStatus, isProfileHidden } from '@/components/admin/admin-helpers';
import type { Profile } from '@/lib/types';

type ProfilesSubTab = 'active' | 'pending' | 'hidden';

/**
 * Раздел «Анкеты» админки: активные, на проверке, скрытые.
 *
 * Вынесен из app/admin/page.tsx, чтобы правки каталога не цепляли
 * адреса и письма. Поиск живёт здесь, а не в общей панели: иначе
 * строка с одной вкладки залипала бы на другой.
 */
export default function AdminProfilesSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const {
    profiles, users, isProfileAdmin, updateProfile, addReview,
  } = useProfiles();

  const [subTab, setSubTab] = useState<ProfilesSubTab>('active');
  const [query, setQuery] = useState('');
  const [viewProfile, setViewProfile] = useState<Profile | null>(null);

  const adminQuery = query.trim().toLowerCase();
  const searchMatch = (value?: string) => !adminQuery || (value ?? '').toLowerCase().includes(adminQuery);

  const hiddenProfiles = profiles.filter((profile) => isProfileHidden(profile) && !isProfileAdmin(profile));
  const activeProfiles = profiles.filter((p) => !isProfileHidden(p) && p.verificationStatus !== 'pending');
  const pendingProfiles = profiles.filter((p) => p.verificationStatus === 'pending' && !isProfileHidden(p));
  const filteredActive = activeProfiles.filter((p) => searchMatch(p.fullName) || searchMatch(p.professionTitle));
  const filteredPending = pendingProfiles.filter((p) => searchMatch(p.fullName) || searchMatch(p.professionTitle));
  const filteredHidden = hiddenProfiles.filter((p) => searchMatch(p.fullName) || searchMatch(p.professionTitle));

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Анкеты', 'Анкеташ')}</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Все анкеты каталога: активные и скрытые.', 'Каталоган массо анкеташ: жигара а, къайлайаьхна а.')}</p>
          </div>
          <div className="flex gap-1 smk-panel p-1">
            <button type="button" onClick={() => setSubTab('active')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${subTab === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Активные', 'Жигаранаш')} ({activeProfiles.length})</button>
            <button type="button" onClick={() => setSubTab('pending')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${subTab === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('На проверке', 'Талларан тIехь')} ({pendingProfiles.length})</button>
            <button type="button" onClick={() => setSubTab('hidden')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${subTab === 'hidden' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Скрытые', 'Къайлайаьхнарш')} ({hiddenProfiles.length})</button>
          </div>
        </div>
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L('Поиск…', 'Лаха…')}
            className="w-full smk-field px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500  dark:text-white"
          />
        </div>

        {subTab === 'active' ? (
          filteredActive.length === 0 ? (
            <div className="smk-dashed p-8 text-center text-sm text-slate-500 dark:text-zinc-500">{L('Активных анкет нет.', 'Жигара анкеташ бац.')}</div>
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
                          <Avatar src={profile.avatarUrl} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{profile.fullName.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</h4>
                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 smk-text-label font-semibold ${status.className}`}>{status.icon}{status.label}</span>
                          {isProfileAdmin(profile) && profile.isSpecialist && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 smk-text-label font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"><Star className="h-3 w-3" />Специалист</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{profile.professionTitle || 'Житель'}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-500">{profile.workplaceAddress}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
                      <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button>
                      {!profile.isPersonal && (
                        <button type="button" onClick={() => updateProfile(profile.id, { isHidden: true, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-950/50"><EyeOff className="h-3.5 w-3.5" />{L('Скрыть', 'Къайлаяккха')}</button>
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
        ) : subTab === 'pending' ? (
          filteredPending.length === 0 ? (
            <div className="smk-dashed p-8 text-center text-sm text-slate-500 dark:text-zinc-500">{L('Анкет на проверке нет.', 'Талларан тIехь анкеташ бац.')}</div>
          ) : (
            <div className="space-y-3">
              {filteredPending.map((profile) => (
                <div key={profile.id} className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-200 dark:bg-zinc-800">
                      {profile.avatarUrl ? (
                        <Avatar src={profile.avatarUrl} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{profile.fullName.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</h4>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{profile.professionTitle || 'Специалист'}</p>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-500">{profile.workplaceAddress}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 smk-text-label font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"><Clock3 className="h-3 w-3" />{L('На проверке', 'Талларан тIехь')}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-amber-200/60 pt-3">
                    <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button>
                    <button type="button" onClick={() => updateProfile(profile.id, { isVerified: true, verificationStatus: 'verified' })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" />{L('Подтвердить', 'ТIечIагIде')}</button>
                    <button type="button" onClick={() => updateProfile(profile.id, { isVerified: false, verificationStatus: 'rejected' })} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><X className="h-3.5 w-3.5" />{L('Отклонить', 'ДIаяккха')}</button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          filteredHidden.length === 0 ? (
            <div className="smk-dashed p-8 text-center text-sm text-slate-500 dark:text-zinc-500">{L('Скрытых анкет нет.', 'Къайлайаьхна анкеташ бац.')}</div>
          ) : (
            <div className="space-y-3">
              {filteredHidden.map((profile) => {
                const status = getStatus(profile, users);
                return (
                  <div key={profile.id} className="rounded-3xl border border-red-200 bg-red-50/60 p-4 shadow-sm dark:border-red-900 dark:bg-red-950/40">
                    <div className="flex items-start gap-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-200 dark:bg-zinc-800">
                        {profile.avatarUrl ? (
                          <Avatar src={profile.avatarUrl} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{profile.fullName.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</p>
                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 smk-text-label font-semibold ${status.className}`}>{status.icon}{status.label}</span>
                          {isProfileAdmin(profile) && profile.isSpecialist && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 smk-text-label font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"><Star className="h-3 w-3" />Специалист</span>
                          )}
                        </div>
                        <p className="truncate text-sm font-semibold text-red-700 dark:text-red-400">{profile.professionTitle || 'Личная анкета'}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-400">{profile.workplaceAddress}</p>
                      </div>
                      <EyeOff className="h-5 w-5 shrink-0 text-red-600" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-red-200/60 pt-3">
                      <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/50"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button>
                      <button type="button" onClick={() => updateProfile(profile.id, { isHidden: false })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Eye className="h-3.5 w-3.5" />{L('Вернуть в каталог', 'Каталоге юхадаккха')}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </section>

      <ProfileModal
        profile={viewProfile}
        isAdminStatus={viewProfile ? isProfileAdmin(viewProfile) : false}
        showPending={Boolean(viewProfile?.verificationStatus === 'pending')}
        isViewerBlocked={false}
        onClose={() => setViewProfile(null)}
        onReview={addReview}
      />
    </>
  );
}
