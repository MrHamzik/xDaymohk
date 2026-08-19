'use client';

import { useState } from 'react';
import { Ban, FolderOpen, ShieldAlert, UserCheck, UserRound } from 'lucide-react';
import Avatar from '@/components/Avatar';
import ProfileModal from '@/components/ProfileModal';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import { isDevEmail } from '@/lib/admin';
import { getStatus } from '@/components/admin/admin-helpers';
import { supabase } from '@/lib/supabase';
import type { Profile, UserSummary } from '@/lib/types';

/**
 * Раздел «Пользователи»: жители, специалисты, админы.
 *
 * Смена прав — только у невидимого разработчика (isDevEmail).
 * Блокировка идёт через /api/admin/ban и письмо в /api/notifications.
 */
export default function AdminUsersSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const { account } = useAuth();
  const {
    profiles, users, isProfileAdmin, addReview, refreshRemoteData,
  } = useProfiles();

  const [subTab, setSubTab] = useState<'residents' | 'specialists' | 'admins'>('residents');
  const [query, setQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [viewProfile, setViewProfile] = useState<Profile | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const people = users;
  const adminQuery = query.trim().toLowerCase();
  const searchMatch = (value?: string) => !adminQuery || (value ?? '').toLowerCase().includes(adminQuery);
  const filteredPeople = people.filter((u) => searchMatch(u.fullName) || searchMatch(u.email));
  const specUsers = people.filter((u) => !u.isAdmin && profiles.some((p) => p.ownerId === u.id && p.isSpecialist));
  const admUsers = people.filter((u) => u.isAdmin);
  const resUsers = people.filter((u) => !u.isAdmin && !specUsers.includes(u));
  const tabFilteredUsers = filteredPeople.filter((u) => {
    if (subTab === 'admins') return u.isAdmin;
    if (subTab === 'specialists') return specUsers.includes(u);
    return !specUsers.includes(u);
  });
  const showUsersPagination = tabFilteredUsers.length > 100;

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

  return (
    <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Пользователи', 'Лелошхой')}</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Список зарегистрированных жителей и управление доступом.', 'ДIабалабелла бахархойн могIам а, доступан урхалла а.')}</p>
          </div>
          <div className="flex gap-1 smk-panel p-1">
            <button type="button" onClick={() => setSubTab('residents')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${subTab === 'residents' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Жители', 'Бахархой')} ({resUsers.length})</button>
            <button type="button" onClick={() => setSubTab('specialists')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${subTab === 'specialists' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Специалисты', 'Специалисташ')} ({specUsers.length})</button>
            <button type="button" onClick={() => setSubTab('admins')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${subTab === 'admins' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{L('Админы', 'Админаш')} ({admUsers.length})</button>
          </div>
        </div>
        {saveMsg && <p className="smk-note smk-note-info px-3 py-2">{saveMsg}</p>}
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L('Поиск…', 'Лаха…')}
            className="w-full smk-field px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500  dark:text-white"
          />
        </div>
        <div className="space-y-3">
          {tabFilteredUsers.length === 0 ? (
            <div className="smk-dashed p-8 text-center text-sm text-slate-500 dark:text-zinc-500">{L('Пользователей пока нет.', 'Лелошхой хIинца бац.')}</div>
          ) : tabFilteredUsers.map((user) => {
            const userProfiles = profiles.filter((profile) => profile.ownerId === user.id);
            const expanded = expandedUserId === user.id;
            return (
              <div key={user.id} className={`rounded-3xl border p-4 shadow-sm transition ${user.isBlocked ? 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/50' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar src={user.avatarUrl} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{user.fullName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-zinc-500">{user.email} · {L('анкет:', 'анкеташ:')} {user.profileCount}</p>
                    {user.isAdmin && <span className="mt-1 inline-flex rounded-md bg-slate-800 px-1.5 py-0.5 smk-text-label font-bold text-white dark:bg-zinc-700">Админ</span>}
                    {user.isBlocked && <span className="mt-1 inline-flex rounded-md bg-red-600 px-1.5 py-0.5 smk-text-label font-bold text-white">{L('Аккаунт заблокирован', 'Аккаунт билсна')}</span>}
                  </div>
                  {!user.isAdmin && (
                    <button type="button" onClick={() => void adminToggleBan(user, !user.isBlocked)} className={`inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition sm:w-auto ${user.isBlocked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70'}`}>{user.isBlocked ? <UserCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}{user.isBlocked ? L('Разблокировать', 'ДIаяккха') : L('Заблокировать', 'Билсде')}</button>
                  )}
                  {account && isDevEmail(account.email) && !isDevEmail(user.email) && (
                    <button type="button" onClick={() => void adminToggleRole(user)} className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 smk-field px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto  dark:text-zinc-300 dark:hover:bg-zinc-800">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {user.isAdmin ? L('Забрать админа', 'Админ дIадаккха') : L('Сделать админом', 'Админ хIотто')}
                    </button>
                  )}
                  <button type="button" onClick={() => setExpandedUserId(expanded ? null : user.id)} className="rounded-xl p-2 text-emerald-700 transition hover:bg-emerald-50" title="Анкеты пользователя"><UserRound className="h-5 w-5" /></button>
                </div>
                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
                    {userProfiles.length === 0 ? (
                      <p className="text-xs text-slate-500">{L('Анкет нет.', 'Анкеташ бац.')}</p>
                    ) : userProfiles.map((profile) => {
                      const status = getStatus(profile, users);
                      return (
                        <div key={profile.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5 dark:bg-zinc-800/60">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.professionTitle || 'Личная анкета'}</p>
                            <span className={`mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 smk-text-label font-semibold ${status.className}`}>{status.icon}{status.label}</span>
                          </div>
                          <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50"><FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {showUsersPagination && (
          <p className="pt-1 text-center smk-text-label text-slate-400 dark:text-zinc-500">
            {L('Показаны первые 100 из', 'Гойту хьалхара 100')} {tabFilteredUsers.length} {L('пользователей. Уточните поиск.', 'лелошхой. Лахар ма-дарра де.')}
          </p>
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
