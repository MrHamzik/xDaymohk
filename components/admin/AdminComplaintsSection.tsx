'use client';

import { useState } from 'react';
import { Check, EyeOff, FolderOpen, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import ProfileModal from '@/components/ProfileModal';
import ComplaintResolveModal, { type ComplaintResolveMode } from '@/components/ComplaintResolveModal';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import { supabase } from '@/lib/supabase';
import type { Complaint, NotificationLetterPayload, Profile } from '@/lib/types';

/**
 * Раздел «Жалобы» админки.
 *
 * Письма и блокировки идут через те же API, что и раньше: /api/admin/ban
 * и /api/notifications. Модалка разбора живёт здесь, а не в оболочке
 * страницы — соседние разделы её не открывают.
 */
export default function AdminComplaintsSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const {
    profiles, users, complaints, isProfileAdmin, updateProfile, updateComplaint, addReview,
  } = useProfiles();

  const [query, setQuery] = useState('');
  const [viewProfile, setViewProfile] = useState<Profile | null>(null);
  const [resolveComplaint, setResolveComplaint] = useState<Complaint | null>(null);
  const [resolveMode, setResolveMode] = useState<ComplaintResolveMode>('accept');

  const openComplaints = complaints.filter((complaint) => complaint.status === 'open');
  const adminQuery = query.trim().toLowerCase();
  const searchMatch = (value?: string) => !adminQuery || (value ?? '').toLowerCase().includes(adminQuery);
  const filteredComplaints = openComplaints.filter(
    (c) => searchMatch(c.reason) || searchMatch(c.authorName) || searchMatch(profiles.find((pr) => pr.id === c.profileId)?.fullName),
  );

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

  const handleResolveComplaint = async (payload: {
    complaintId: string;
    status: 'resolved' | 'dismissed';
    notifications: NotificationLetterPayload[];
    bans: { userId: string; hours: number | null }[];
  }) => {
    for (const ban of payload.bans) {
      await applyBan(ban.userId, ban.hours);
    }
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

  return (
    <>
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L('Поиск…', 'Лаха…')}
            className="w-full smk-field px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500  dark:text-white"
          />
        </div>
        {filteredComplaints.length === 0 ? (
          <div className="smk-dashed p-8 text-center text-sm text-slate-500 dark:text-zinc-500">{L('Открытых жалоб нет.', 'ДIаелла арзаш бац.')}</div>
        ) : (
          <div className="space-y-3">
            {filteredComplaints.map((complaint) => {
              const profile = profiles.find((item) => item.id === complaint.profileId);
              if (!profile) return null;
              const owner = users.find((user) => user.id === (complaint.targetUserId || profile.ownerId));
              const targetIsAdmin = isProfileAdmin(profile) || Boolean(owner?.isAdmin);
              return (
                <div key={complaint.id} className="overflow-hidden rounded-3xl border border-red-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-start justify-between gap-3 border-b border-red-100 bg-red-50/60 p-4 dark:border-zinc-800 dark:bg-red-950/20">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-200 dark:bg-zinc-800">
                        {profile.avatarUrl ? (
                          <Avatar src={profile.avatarUrl} className="h-full w-full object-cover" />
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
                          <p className="mt-0.5 truncate smk-text-label text-slate-400 dark:text-zinc-500">
                            {L('Владелец:', 'Долахо:')} {owner.fullName} {owner.isBlocked ? '· заблокирован' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 smk-text-label font-medium text-slate-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
                      От: {complaint.authorName}
                    </span>
                  </div>

                  <div className="p-4">
                    <p className="break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
                      {complaint.reason}
                    </p>
                    {complaint.createdAt && (
                      <p className="mt-1.5 smk-text-label text-slate-400 dark:text-zinc-500">{complaint.createdAt}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <button type="button" onClick={() => setViewProfile(profile)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50">
                      <FolderOpen className="h-3.5 w-3.5" />{L('Открыть', 'Схьаделла')}
                    </button>
                    <button type="button" onClick={() => { setResolveMode('accept'); setResolveComplaint(complaint); }} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700">
                      <Check className="h-3.5 w-3.5" />{L('Принять', 'ТIеэца')}
                    </button>
                    <button type="button" onClick={() => { setResolveMode('dismiss'); setResolveComplaint(complaint); }} className="inline-flex items-center gap-1.5 smk-field px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100  dark:text-zinc-300">
                      <X className="h-3.5 w-3.5" />{L('Отклонить', 'ДIаяккха')}
                    </button>
                    {!targetIsAdmin && (
                      <button type="button" onClick={() => updateProfile(profile.id, { isHidden: true, isBanned: false })} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-950/50">
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

      <ProfileModal
        profile={viewProfile}
        isAdminStatus={viewProfile ? isProfileAdmin(viewProfile) : false}
        showPending={Boolean(viewProfile?.verificationStatus === 'pending')}
        isViewerBlocked={false}
        onClose={() => setViewProfile(null)}
        onReview={addReview}
      />
      <ComplaintResolveModal
        complaint={resolveComplaint}
        mode={resolveMode}
        owner={resolveComplaint ? users.find((u) => u.id === (resolveComplaint.targetUserId || profiles.find((p) => p.id === resolveComplaint.profileId)?.ownerId)) ?? null : null}
        author={resolveComplaint ? users.find((u) => u.id === resolveComplaint.authorId) ?? null : null}
        profileName={resolveComplaint ? (profiles.find((p) => p.id === resolveComplaint.profileId)?.fullName ?? 'анкета') : ''}
        onClose={() => setResolveComplaint(null)}
        onResolve={handleResolveComplaint}
      />
    </>
  );
}
