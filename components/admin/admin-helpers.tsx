import { Check, Star, UserRound } from 'lucide-react';
import type { Profile, UserSummary } from '@/lib/types';

export function isProfileHidden(profile: Profile) {
  return Boolean(profile.isHidden || profile.isBanned);
}

export function getStatus(profile: Profile, users?: UserSummary[]) {
  // Метки статусов — без перевода (короткие технические подписи).
  // Админ-статус — по владельцу из users (невидимый разработчик уже
  // исключён), а не по флагу profile.isAdmin.
  const owner = users?.find((u) => u.id === profile.ownerId);
  if (owner?.isAdmin) return { label: 'Админ', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (isProfileHidden(profile)) return { label: 'Скрыта', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (profile.verificationStatus === 'pending') return { label: 'На проверке', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300' };
  if (profile.verificationStatus === 'rejected') return { label: 'Отклонён', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300' };
  if (profile.isVerified || profile.verificationStatus === 'verified') return { label: 'Проверен', icon: <Check className="h-3 w-3" />, className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300' };
  if (profile.isSpecialist) return { label: 'Специалист', icon: <Star className="h-3 w-3" />, className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' };
  return { label: 'Житель', icon: <UserRound className="h-3 w-3" />, className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400' };
}
