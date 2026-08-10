'use client';

import { useState } from 'react';

import { Ban, Check, Clock3, Eye, EyeOff, FolderOpen, ShieldAlert, UserCheck, UserRound, UserX, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { isAdminProfile } from '@/lib/profile-filters';
import { Complaint, Profile } from '@/lib/types';

type AdminSection = 'pending' | 'hidden' | 'complaints' | 'users';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Profile[];
  complaints: Complaint[];
  onUpdateProfile: (profileId: string, updates: Partial<Profile>) => void;
  onUpdateComplaint: (complaintId: string, status: Complaint['status']) => Promise<void>;
  onOpenProfile?: (profile: Profile) => void;
}

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

export default function AdminPanel({ isOpen, onClose, profiles, complaints, onUpdateProfile, onUpdateComplaint, onOpenProfile }: AdminPanelProps) {
  const { account } = useAuth();
  const { users, updateUserBlocked, isProfileAdmin } = useProfiles();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>('pending');
  const adminOwnerId = account?.isAdmin ? account.id : undefined;

  if (!isOpen) return null;

  const requests = profiles.filter((profile) => profile.verificationStatus === 'pending' && !isProfileHidden(profile));
  const hiddenProfiles = profiles.filter((profile) => isProfileHidden(profile) && !isProfileAdmin(profile));
  const openComplaints = complaints.filter((complaint) => complaint.status === 'open');
  const people = users.filter((user) => !user.isAdmin);

  const openProfile = (profile: Profile) => {
    onOpenProfile?.(profile);
    if (onOpenProfile) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Панель администратора">
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-950 sm:max-w-2xl sm:rounded-3xl">
        <header className="flex shrink-0 items-center justify-between bg-zinc-950 p-5 text-white dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20 text-red-300">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Панель администратора</h2>
              <p className="text-sm text-zinc-300">Проверка, пользователи и скрытые анкеты</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрыть панель администратора" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </header>

        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2.5.5 dark:border-zinc-800 dark:bg-zinc-950" role="tablist" aria-label="Разделы панели администратора">
          {([
            ['pending', 'Подтверждения', requests.length],
            ['hidden', 'Скрытые', hiddenProfiles.length],
            ['complaints', 'Жалобы', openComplaints.length],
            ['users', 'Пользователи', people.length],
          ] as const).map(([section, label, count]) => (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={activeSection === section}
              onClick={() => setActiveSection(section)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${activeSection === section ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeSection === section ? 'bg-white/20' : 'bg-slate-100 dark:bg-zinc-800'}`}>{count}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-slate-800 dark:text-zinc-300 sm:p-6">
          <section className={activeSection === 'pending' ? '' : 'hidden'}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ожидают подтверждения</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-500">Анкеты специалистов, отправленные на проверку.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"><Clock3 className="h-3.5 w-3.5" />{requests.length}</span>
            </div>
            {requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-zinc-800 dark:text-zinc-500">Новых запросов нет.</div>
            ) : (
              <div className="space-y-3">
                {requests.map((profile) => (
                  <div key={profile.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                    <div className="flex items-start gap-3">
                      <img src={profile.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</h4><p className="text-sm text-emerald-700 dark:text-emerald-400">{profile.professionTitle || 'Специалист'}</p><p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-500">{profile.workplaceAddress}</p></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-950 dark:text-emerald-300"><FolderOpen className="h-3.5 w-3.5" />Открыть</button>
                      <button type="button" onClick={() => onUpdateProfile(profile.id, { isVerified: true, verificationStatus: 'verified' })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"><Check className="h-3.5 w-3.5" />Подтвердить</button>
                      <button type="button" onClick={() => onUpdateProfile(profile.id, { isVerified: false, verificationStatus: 'rejected' })} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"><X className="h-3.5 w-3.5" />Отклонить</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={activeSection === 'hidden' ? '' : 'hidden'}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h3 className="text-base font-bold text-slate-900 dark:text-white">Скрытые анкеты</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Анкеты скрыты из общего каталога, но не удалены.</p></div>
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">{hiddenProfiles.length}</span>
            </div>
            {hiddenProfiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-zinc-800 dark:text-zinc-500">Скрытых анкет нет.</div>
            ) : (
              <div className="space-y-2">
                {hiddenProfiles.map((profile) => (
                  <div key={profile.id} className="rounded-2xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
                    <div className="flex items-center gap-3"><img src={profile.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</p><p className="truncate text-xs text-red-700 dark:text-red-300">{profile.professionTitle || 'Личная анкета'} · {profile.workplaceAddress}</p></div><EyeOff className="h-4 w-4 shrink-0 text-red-600" /></div>
                    <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => openProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-300"><FolderOpen className="h-3.5 w-3.5" />Открыть</button><button type="button" onClick={() => onUpdateProfile(profile.id, { isHidden: false, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"><Eye className="h-3.5 w-3.5" />Показать</button></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={activeSection === 'complaints' ? '' : 'hidden'}>
            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900 dark:text-white">Жалобы</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Жалоба относится к анкете и её владельцу.</p></div><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">{openComplaints.length}</span></div>
            {openComplaints.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-zinc-800 dark:text-zinc-500">Открытых жалоб нет.</div> : <div className="space-y-2">{openComplaints.map((complaint) => { const profile = profiles.find((item) => item.id === complaint.profileId); if (!profile) return null; const owner = users.find((user) => user.id === (complaint.targetUserId || profile.ownerId)); const targetIsAdmin = isProfileAdmin(profile) || Boolean(owner?.isAdmin); return <div key={complaint.id} className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white">{profile.fullName}</p><p className="mt-1 break-words text-sm text-slate-600 dark:text-zinc-400">{complaint.reason}</p></div><span className="shrink-0 text-xs text-slate-400">{complaint.authorName}</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => openProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-950 dark:text-emerald-300"><FolderOpen className="h-3.5 w-3.5" />Открыть</button>{!targetIsAdmin && <button type="button" onClick={() => onUpdateProfile(profile.id, { isHidden: true, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"><EyeOff className="h-3.5 w-3.5" />Заблокировать</button>}{!targetIsAdmin && owner && <button type="button" onClick={() => void updateUserBlocked(owner.id, true)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-300"><UserX className="h-3.5 w-3.5" />Заблокировать</button>}<button type="button" onClick={() => void onUpdateComplaint(complaint.id, 'dismissed')} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">Отклонить</button></div></div>; })}</div>}
          </section>

          <section className={activeSection === 'users' ? '' : 'hidden'}>
            <div className="mb-3"><h3 className="text-base font-bold text-slate-900 dark:text-white">Пользователи</h3><p className="text-sm text-slate-500 dark:text-zinc-500">Откройте анкеты пользователя или заблокируйте весь аккаунт.</p></div>
            <div className="space-y-2">
              {people.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-zinc-800 dark:text-zinc-500">Пользователей пока нет.</div> : people.map((user) => { const userProfiles = profiles.filter((profile) => profile.ownerId === user.id); const expanded = expandedUserId === user.id; return <div key={user.id} className={`rounded-2xl border p-3 ${user.isBlocked ? 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20' : 'border-slate-200 dark:border-zinc-800'}`}><div className="flex items-center gap-3"><img src={user.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.fullName}</p><p className="truncate text-xs text-slate-500 dark:text-zinc-500">{user.email} · анкет: {user.profileCount}</p>{user.isBlocked && <span className="mt-1 inline-flex rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Пользователь заблокирован</span>}</div><button type="button" onClick={() => setExpandedUserId(expanded ? null : user.id)} aria-label="Показать анкеты пользователя" className="rounded-xl p-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"><UserRound className="h-5 w-5" /></button><button type="button" onClick={() => void updateUserBlocked(user.id, !user.isBlocked)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold ${user.isBlocked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300'}`}>{user.isBlocked ? <UserCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}{user.isBlocked ? 'Разблокировать' : 'Заблокировать'}</button></div>{expanded && <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 dark:border-zinc-800">{userProfiles.length === 0 ? <p className="text-xs text-slate-500 dark:text-zinc-500">Анкет нет.</p> : userProfiles.map((profile) => { const status = getStatus(profile); return <div key={profile.id} className="flex items-center gap-2 rounded-xl bg-white p-2 dark:bg-zinc-950"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{profile.professionTitle || 'Личная анкета'}</p><span className={`mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span></div><button type="button" onClick={() => openProfile(profile)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"><FolderOpen className="h-3.5 w-3.5" />Открыть</button></div>; })}</div>}</div>; })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
