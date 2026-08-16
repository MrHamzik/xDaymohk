'use client';

import { useAuth } from '@/components/AuthProvider';
import { CheckCircle2, Clock3, ShieldAlert, Star } from 'lucide-react';
import { Profile } from '@/lib/types';
import { calculateWorkingStatus } from '@/lib/schedule';
import { useI18n } from '@/lib/i18n';

export interface WorkingStatusBadgeProps {
  profile: Profile;
  onDarkBackground?: boolean;
}

export function WorkingStatusBadge({ profile, onDarkBackground = false }: WorkingStatusBadgeProps) {
  const { t } = useI18n();
  const { account } = useAuth();
  // Only specialists have working hours and real-time open/break/closed status
  if (!profile.isSpecialist) return null;

  // The owner's master "working status" switch in the side menu
  // only applies when the viewer is the owner of this profile. For
  // every other viewer we use the profile's own statusOverride
  // (set on the profile directly) and otherwise fall back to the
  // automatic schedule.
  const isOwner = Boolean(account && account.id === profile.ownerId);
  const effectiveOverride = isOwner ? account?.statusOverride : profile.statusOverride;
  const statusInfo = calculateWorkingStatus(profile, effectiveOverride);

  const statusBg = statusInfo.status === 'flexible'
    ? (onDarkBackground ? 'border-sky-300/60 bg-sky-500/40 text-sky-50' : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300')
    : statusInfo.status === 'break'
    ? (onDarkBackground ? 'border-amber-300/60 bg-amber-500/40 text-amber-50' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300')
    : statusInfo.status === 'offline'
    ? (onDarkBackground ? 'border-zinc-400/60 bg-zinc-500/40 text-zinc-100' : 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400')
    : (onDarkBackground ? 'border-emerald-300/60 bg-emerald-500/40 text-emerald-50' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300');

  const dotBg = statusInfo.status === 'flexible' ? 'bg-sky-500' : statusInfo.status === 'break' ? 'bg-amber-500' : statusInfo.status === 'offline' ? 'bg-zinc-400' : 'bg-emerald-500';

  const localizedBadge = statusInfo.status === 'flexible'
    ? t.statusFlexible
    : statusInfo.status === 'break'
    ? t.statusBreak
    : statusInfo.status === 'offline'
    ? t.statusOffline
    : t.statusActive;

  return (
    <span
      title={`${statusInfo.label}${statusInfo.details ? ` (${statusInfo.details})` : ''}`}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${statusBg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotBg}`} />
      {localizedBadge}
    </span>
  );
}

interface ProfileBadgesProps {
  profile: Profile;
  /** Account-level role, resolved from the signed-in Google account. */
  adminStatus?: boolean;
  onDarkBackground?: boolean;
  showPending?: boolean;
}

export default function ProfileBadges({ profile, adminStatus = false, onDarkBackground = false, showPending = false }: ProfileBadgesProps) {
  const { t } = useI18n();
  const isAdmin = Boolean(adminStatus);
  const isPending = showPending && profile.verificationStatus === 'pending';
  const isVerified = Boolean(!isPending && (profile.isVerified || profile.verificationStatus === 'verified'));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Роли и статусы">
      {isAdmin && (
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
          onDarkBackground
            ? 'border-red-300/60 bg-red-500/40 text-red-50'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
        }`}>
          <ShieldAlert className={`h-3 w-3 ${onDarkBackground ? 'text-red-100' : 'text-red-600 dark:text-red-400'}`} />
          {t.roleAdmin}
        </span>
      )}

      {profile.isSpecialist && (
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
          onDarkBackground
            ? 'border-emerald-300/50 bg-emerald-500/40 text-emerald-50'
            : 'border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
        }`}>
          <Star className={`h-3 w-3 ${onDarkBackground ? 'text-emerald-100' : 'text-emerald-600 dark:text-emerald-400'}`} />
          {t.roleSpecialist}
        </span>
      )}

      {isPending && (
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
          onDarkBackground
            ? 'border-slate-300/60 bg-slate-500/40 text-slate-50'
            : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400'
        }`}>
          <Clock3 className="h-3 w-3 animate-spin" />
          {t.rolePending}
        </span>
      )}

      {isVerified && (
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
          onDarkBackground
            ? 'border-blue-300/60 bg-blue-500/35 text-blue-50'
            : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
        }`}>
          <CheckCircle2 className={`h-3 w-3 ${onDarkBackground ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'}`} />
          {t.roleVerified}
        </span>
      )}
    </div>
  );
}
