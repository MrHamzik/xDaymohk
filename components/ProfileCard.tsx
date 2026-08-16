'use client';

import Image from 'next/image';
import { Award, Ban, ChevronRight, Flag, MapPin, Star } from 'lucide-react';
import { Profile } from '@/lib/types';
import { formatDisplayName, formatReviews } from '@/lib/text';
import { useI18n } from '@/lib/i18n';
import ProfileBadges, { WorkingStatusBadge } from '@/components/ProfileBadges';
import { cacheBustAvatarUrl } from '@/lib/media';

interface ProfileCardProps {
  profile: Profile;
  onSelect: (profile: Profile) => void;
  /** The viewer's account role, used only for moderation controls. */
  isAdmin?: boolean;
  /** The role of the account that owns this profile. */
  isAdminStatus?: boolean;
  /** Pending review is visible only to the owner and administrators. */
  showPending?: boolean;
  isOwnProfile?: boolean;
  onReport?: (profile: Profile) => void;
  onBlock?: (profile: Profile) => void;
}

export default function ProfileCard({
  profile,
  onSelect,
  isAdmin = false,
  isAdminStatus = false,
  showPending = false,
  isOwnProfile = false,
  onReport,
  onBlock,
}: ProfileCardProps) {
  const { t } = useI18n();
  const openProfile = () => onSelect(profile);
  const profileIsAdmin = Boolean(isAdminStatus);
  const hasAction = Boolean((isAdmin && !profileIsAdmin && onBlock) || (!isOwnProfile && !profile.isVerified && profile.verificationStatus !== 'verified' && onReport));

  const age = profile.birthDate
    ? Math.floor((new Date().getTime() - new Date(profile.birthDate).getTime()) / 31557600000)
    : null;

  return (
    <article
      onClick={openProfile}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openProfile();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Открыть ${profile.fullName}`}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm transition hover:border-emerald-300/80 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-800"
    >
      {/* Шапка: аватар + имя + статус + стрелка */}
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200/60 bg-slate-100 dark:border-zinc-800/60 dark:bg-zinc-950">
          <Image
            src={cacheBustAvatarUrl(profile.avatarUrl)}
            alt={profile.fullName}
            fill
            sizes="48px"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
              <span className="sm:hidden">{formatDisplayName(profile.fullName, true)}</span>
              <span className="hidden sm:inline">{profile.fullName}</span>
            </h3>
            <WorkingStatusBadge profile={profile} />
          </div>
          <div className="mt-0.5">
            <ProfileBadges profile={profile} adminStatus={profileIsAdmin} showPending={showPending} />
          </div>

          {profile.isSpecialist && profile.professionTitle && (
            <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-5 text-emerald-700 dark:text-emerald-400">
              {profile.professionTitle}
            </p>
          )}
        </div>

        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500 dark:text-zinc-600" />
      </div>

      {/* Разделитель */}
      <div className="border-t border-slate-100 dark:border-zinc-800/70" />

      {/* Описание */}
      {profile.bio && (
        <p className="line-clamp-2 px-3.5 py-2.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-zinc-400 sm:px-4">
          {profile.bio}
        </p>
      )}

      {/* Инфо-строка: рейтинг, возраст/пол, адрес */}
      <div className="mt-auto space-y-1.5 px-3.5 pb-3 text-xs text-slate-500 dark:text-zinc-400 sm:px-4">
        {(profile.isSpecialist && profile.rating > 0) && (
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-bold text-amber-500">{profile.rating.toFixed(1)}</span>
            <span className="text-slate-400 dark:text-zinc-500">({formatReviews(profile.reviewCount)})</span>
          </div>
        )}
        {!profile.isSpecialist && (age !== null || profile.gender) && (
          <div className="flex items-center gap-1.5">
            {age !== null && <span>Возраст: {age}</span>}
            {age !== null && profile.gender && <span className="text-slate-300 dark:text-zinc-700">·</span>}
            {profile.gender && <span>{t.genderLabel}: {profile.gender === 'male' ? t.genderMale : t.genderFemale}</span>}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">{profile.workplaceAddress}</span>
        </div>
      </div>

      {/* Нижний блок: документы / действия. Выше, когда есть кнопка действия. */}
      <div className={`flex items-center justify-between gap-2 border-t border-slate-100 px-3.5 text-xs dark:border-zinc-800 sm:px-4 ${hasAction ? 'bg-slate-50/90 py-2.5 dark:bg-zinc-900/60' : 'bg-transparent py-2'}`}>
        <div className="font-medium text-slate-600 dark:text-zinc-400">
          {profile.certificates.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-zinc-400">
              <Award className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Документы: {profile.certificates.length}
            </span>
          ) : (
            <span className="text-[11px] text-slate-300 dark:text-zinc-700">{hasAction ? '' : ' '}</span>
          )}
        </div>

        <div className="relative flex min-w-0 items-center gap-2">
          {isAdmin && !profileIsAdmin && onBlock ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onBlock(profile);
              }}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
            >
              <Ban className="h-3.5 w-3.5 shrink-0" />
              Заблокировать
            </button>
          ) : !isOwnProfile && !profile.isVerified && profile.verificationStatus !== 'verified' && onReport ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onReport(profile);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-amber-50 hover:text-amber-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
              aria-label="Пожаловаться на анкету"
            >
              <Flag className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              Пожаловаться
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
