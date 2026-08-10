'use client';

import Image from 'next/image';
import { Award, Ban, Flag, MapPin, Star } from 'lucide-react';
import { Profile } from '@/lib/types';
import { formatDisplayName, formatReviews } from '@/lib/text';
import ProfileBadges, { WorkingStatusBadge } from '@/components/ProfileBadges';

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
  const openProfile = () => onSelect(profile);
  const profileIsAdmin = Boolean(isAdminStatus || profile.isAdmin);

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
      className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-sm transition hover:border-emerald-300/80 hover:shadow-md focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 dark:border-zinc-800 dark:bg-zinc-800"
    >
      {/* Upper Main Body */}
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <div
            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200/60 bg-slate-100 dark:border-zinc-800/60 dark:bg-zinc-950"
            style={{ borderRadius: 'var(--radius-xl, 0.75rem)' }}
          >
            <Image
              src={profile.avatarUrl}
              alt={profile.fullName}
              fill
              sizes="48px"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          </div>

          <div className="min-w-0 flex-1">
            {/* Line 1: Full Name + Status Badge */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                <span className="sm:hidden">{formatDisplayName(profile.fullName, true)}</span>
                <span className="hidden sm:inline">{profile.fullName}</span>
              </h3>
              <WorkingStatusBadge profile={profile} />
            </div>

            {/* Line 2: Role Badges */}
            <div className="mt-0.5">
              <ProfileBadges profile={profile} adminStatus={profileIsAdmin} showPending={showPending} />
            </div>

            {/* Profession specialization */}
            {profile.isSpecialist && profile.professionTitle && (
              <p className="mt-1 truncate text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {profile.professionTitle}
              </p>
            )}

            {/* Rating Stars */}
            {profile.isSpecialist && profile.rating > 0 && (
              <div className="mt-1 flex items-center gap-1 text-[11px]">
                <div className="flex items-center font-bold text-amber-500">
                  <Star className="mr-0.5 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {profile.rating.toFixed(1)}
                </div>
                <span className="text-slate-400 dark:text-zinc-500">
                  ({formatReviews(profile.reviewCount)})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bio summary */}
        {profile.bio && (
          <p className="mt-2.5 line-clamp-2 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
            {profile.bio}
          </p>
        )}

        {/* Info row with divider */}
        <div className="mt-2.5 flex flex-wrap items-center gap-y-1 gap-x-3 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
          {!profile.isSpecialist && profile.birthDate && (
            <span className="truncate">Возраст: {Math.floor((new Date().getTime() - new Date(profile.birthDate).getTime()) / 31557600000)}</span>
          )}
          {!profile.isSpecialist && profile.gender && (
            <span className="truncate">Пол: {profile.gender === 'male' ? 'Мужской' : 'Женский'}</span>
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">{profile.workplaceAddress}</span>
          </div>
        </div>
      </div>

      {/* Contrasting Lower Footer with separate background tone */}
      <div className="flex min-h-9 items-center justify-between border-t border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="font-medium text-slate-600 dark:text-zinc-400">
          {profile.certificates.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
              <Award className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Документы: {profile.certificates.length}
            </span>
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
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Ban className="h-3.5 w-3.5 shrink-0" />
              <span>Заблокировать</span>
            </button>
          ) : !isOwnProfile && !profile.isVerified && profile.verificationStatus !== 'verified' && onReport ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onReport(profile);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:text-amber-600 dark:text-zinc-500 dark:hover:text-amber-400 transition"
              aria-label="Пожаловаться на анкету"
            >
              <Flag className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>Пожаловаться</span>
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
