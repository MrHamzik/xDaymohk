'use client';

import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { CheckCircle2, Clock3, ShieldAlert, Star } from 'lucide-react';
import { Profile, ProfileStatusType } from '@/lib/types';
import { calculateWorkingStatus } from '@/lib/schedule';
import { useMinuteTick } from '@/lib/use-clock';
import { useI18n } from '@/lib/i18n';

/**
 * Режим работы, действующий для этой анкеты.
 *
 * Тумблер «Режим работы» в боковом меню принадлежит ЧЕЛОВЕКУ
 * (user_profiles.status_override) и обязан менять статус сразу на всех
 * его анкетах специалиста — у любого зрителя, а не только у владельца.
 *
 * Раньше здесь было `isOwner ? account.statusOverride : profile.statusOverride`,
 * но `profiles.status_override` как колонка не существует и в Profile
 * никогда не заполнялся. Поэтому для всех, кроме владельца, override был
 * undefined и статус считался только по расписанию — со стороны казалось,
 * что тумблер вообще ни на что не влияет.
 *
 * Теперь для чужого зрителя берём override владельца из публичной вьюхи
 * v_resident_reputation (обновление 26). Своё значение из account
 * приоритетнее: оно применяется мгновенно, не дожидаясь перезагрузки
 * списка анкет.
 */
function useEffectiveOverride(profile: Profile) {
  const { account } = useAuth();
  const { reputation } = useProfiles();

  const isOwner = Boolean(account && profile.ownerId && account.id === profile.ownerId);
  if (isOwner) return account?.statusOverride;
  return profile.ownerId ? reputation[profile.ownerId]?.statusOverride : undefined;
}

export interface WorkingStatusBadgeProps {
  profile: Profile;
  onDarkBackground?: boolean;
}

export function WorkingStatusBadge({ profile, onDarkBackground = false }: WorkingStatusBadgeProps) {
  const { t } = useI18n();
  const effectiveOverride = useEffectiveOverride(profile);
  // Расписание зависит от текущего времени — пересчитываем раз в минуту,
  // иначе бейдж застывает в состоянии на момент загрузки страницы.
  useMinuteTick();
  // Only specialists have working hours and real-time open/break/closed status
  if (!profile.isSpecialist) return null;

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

/**
 * Рабочий статус как ЦВЕТ КОЛЬЦА вокруг аватара:
 * зелёное — работает, жёлтое — перерыв, голубое — произвольный график,
 * серое — не работает.
 *
 * Возвращает класс-модификатор для .smk-ring и подпись для title/aria,
 * чтобы карточка не тратила место на отдельный бейдж или точку.
 */
export function useWorkingStatusRing(profile: Profile): {
  className: string;
  label: string | null;
  /** Машинный статус — для точки и модификаторов CSS. */
  status: ProfileStatusType | null;
  /** Короткая подпись для строки данных («Работает», «Перерыв»…). */
  shortLabel: string | null;
} {
  const { t } = useI18n();
  const effectiveOverride = useEffectiveOverride(profile);
  // См. WorkingStatusBadge: без тика кольцо не меняет цвет до перезагрузки.
  useMinuteTick();
  if (!profile.isSpecialist) {
    return { className: '', label: null, status: null, shortLabel: null };
  }

  const statusInfo = calculateWorkingStatus(profile, effectiveOverride);

  const className = statusInfo.status === 'flexible'
    ? 'smk-ring-flexible'
    : statusInfo.status === 'break'
    ? 'smk-ring-break'
    : statusInfo.status === 'offline'
    ? 'smk-ring-offline'
    : 'smk-ring-active';

  const shortLabel = statusInfo.status === 'flexible'
    ? t.statusFlexible
    : statusInfo.status === 'break'
    ? t.statusBreak
    : statusInfo.status === 'offline'
    ? t.statusOffline
    : t.statusActive;

  return {
    className,
    label: `${statusInfo.label}${statusInfo.details ? ` (${statusInfo.details})` : ''}`,
    status: statusInfo.status,
    shortLabel,
  };
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

  // Бейджи используют .smk-role: цвет берётся из переменной темы, а
  // заливка и обводка выводятся из него прозрачностью. Раньше здесь
  // было по три жёстко прописанных класса Tailwind на каждый бейдж —
  // пользовательская тема их перекрасить не могла.
  const onDark = onDarkBackground ? ' text-white' : '';

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Роли и статусы">
      {isAdmin && (
        <span className={`smk-role smk-role--admin${onDark}`}>
          <ShieldAlert className="h-3 w-3" />
          {t.roleAdmin}
        </span>
      )}

      {profile.isSpecialist && (
        <span className={`smk-role smk-role--specialist${onDark}`}>
          <Star className="h-3 w-3" />
          {t.roleSpecialist}
        </span>
      )}

      {isPending && (
        <span className={`smk-role smk-role--pending${onDark}`}>
          <Clock3 className="h-3 w-3 animate-spin" />
          {t.rolePending}
        </span>
      )}

      {isVerified && (
        <span className={`smk-role smk-role--verified${onDark}`}>
          <CheckCircle2 className="h-3 w-3" />
          {t.roleVerified}
        </span>
      )}
    </div>
  );
}
