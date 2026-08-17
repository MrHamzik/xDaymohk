'use client';

import Image from 'next/image';
import {
  Award, Ban, Briefcase, CalendarDays, ChevronRight, FileText,
  Flag, MapPin, Star, VenusAndMars,
} from 'lucide-react';
import { Profile } from '@/lib/types';
import { calculateAge, formatReviews } from '@/lib/text';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import ProfileBadges, { useWorkingStatusRing } from '@/components/ProfileBadges';
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

/**
 * Карточка анкеты.
 *
 * Оформление сделано по референсу connection-channel/«макет и иконки»:
 * тёмное полотно с золотой окантовкой и диагональными бликами,
 * серифное имя, крупная золотая звезда рейтинга, строки данных с
 * иконками (документ, календарь, пол, зелёная булавка адреса) и
 * подвал с золотой кнопкой действия.
 *
 * Классы .smk-* описаны в globals.css — там же светлая тема, где
 * золото приглушено до охры ради читаемости на белом.
 */
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
  const { reputation } = useProfiles();
  const openProfile = () => onSelect(profile);

  // Репутация в заданиях привязана к ЧЕЛОВЕКУ, а не к анкете, поэтому
  // берём её у владельца из публичной вьюхи.
  //
  // Показываем ТОЛЬКО в личной анкете: у специалиста своя оценка —
  // profile.rating, она про навыки в профессии. Смешивать их нельзя,
  // иначе на карточке мастера оказывались бы две разные звёздочки.
  const ownerReputation = profile.ownerId ? reputation[profile.ownerId] : undefined;
  const showResidentRating = !profile.isSpecialist;
  const residentRating = Number(ownerReputation?.rating ?? 0);
  const residentReviews = Number(ownerReputation?.reviewCount ?? 0);

  const profileIsAdmin = Boolean(isAdminStatus);
  const hasAction = Boolean(
    (isAdmin && !profileIsAdmin && onBlock)
    || (!isOwnProfile && !profile.isVerified && profile.verificationStatus !== 'verified' && onReport),
  );

  // Возраст считаем по полной дате рождения (с учётом того, прошёл ли
  // день рождения в этом году). Деление разницы в миллисекундах на
  // «средний год» давало ошибку ±1 год.
  const age = calculateAge(profile.birthDate);

  // Рабочий статус специалиста показываем цветом кольца аватара.
  const statusRing = useWorkingStatusRing(profile);

  // Какой рейтинг показывать в шапке: у специалиста — профессиональный,
  // у жителя — репутация по заданиям.
  const headRating = profile.isSpecialist ? profile.rating : residentRating;
  const headCount = profile.isSpecialist ? profile.reviewCount : residentReviews;
  const showHeadRating = profile.isSpecialist
    ? profile.rating > 0
    : showResidentRating && residentReviews > 0;

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
      className="smk-lux group flex h-full cursor-pointer flex-col overflow-hidden text-slate-900 dark:text-white"
    >
      {/* ── Шапка: аватар · имя · рейтинг ─────────────────────────
             Рабочий статус — цвет кольца вокруг аватара, отдельной
             строки под него не нужно. */}
      <div className="flex items-center gap-3 px-3.5 pb-2.5 pt-3">
        <div className="shrink-0">
          <div
            className={`smk-ring h-11 w-11 sm:h-12 sm:w-12 ${statusRing.className}`}
            title={statusRing.label ?? undefined}
            aria-label={statusRing.label ?? undefined}
          >
            <Image
              src={cacheBustAvatarUrl(profile.avatarUrl)}
              alt={profile.fullName}
              width={56}
              height={56}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* Имя пишем полностью, без сокращений; не влезло — обрезаем */}
          <h3 className="smk-title truncate text-base font-bold leading-tight sm:text-lg">
            {profile.fullName}
          </h3>

          {showHeadRating && (
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <Star className="h-4 w-4 shrink-0 translate-y-0.5 smk-star" />
              <span className="smk-rating-value text-sm font-extrabold">
                {headRating.toFixed(1)}
              </span>
              <span className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                {profile.isSpecialist ? formatReviews(headCount) : `${headCount} оцен${
                  headCount === 1 ? 'ка' : headCount < 5 ? 'ки' : 'ок'
                }`}
              </span>
            </div>
          )}
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 self-center smk-arrow" />
      </div>

      {/* Золотой разделитель, затухающий к краям */}
      <hr className="smk-rule mx-3.5" />

      {/* ── Строки данных ───────────────────────────────────────── */}
      <div className="space-y-1.5 px-3.5 py-2.5 text-sm">
        {/* Первая строка под линией — роли и статусы */}
        <ProfileBadges profile={profile} adminStatus={profileIsAdmin} showPending={showPending} />

        {profile.isSpecialist && profile.professionTitle && (
          <div className="smk-field flex items-start gap-2.5 px-2.5 py-1.5">
            <Briefcase className="smk-ico mt-0.5 h-4 w-4" />
            <p className="line-clamp-2 font-bold leading-snug text-emerald-700 dark:text-emerald-400">
              {profile.professionTitle}
            </p>
          </div>
        )}

        {profile.bio && (
          <div className="smk-field flex items-start gap-2.5 px-2.5 py-1.5">
            <FileText className="smk-ico mt-0.5 h-4 w-4" />
            <p className="line-clamp-2 break-words [overflow-wrap:anywhere] leading-snug text-slate-700 dark:text-zinc-200">
              {profile.bio}
            </p>
          </div>
        )}

        {/* Возраст и пол — всегда в один ряд */}
        {(age !== null || profile.gender) && (
          <div className="smk-field flex items-center gap-2 px-2.5 py-1.5">
            {age !== null && (
              <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                <CalendarDays className="smk-ico h-4 w-4" />
                <span className="text-slate-400 dark:text-zinc-500">{t.ageLabel}:</span>
                <span className="font-semibold">{age}</span>
              </span>
            )}
            {age !== null && profile.gender && <span className="smk-sep" aria-hidden />}
            {profile.gender && (
              <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                <VenusAndMars className="smk-ico h-4 w-4" />
                <span className="truncate font-semibold">
                  {profile.gender === 'male' ? t.genderMale : t.genderFemale}
                </span>
              </span>
            )}
          </div>
        )}

        {profile.workplaceAddress && (
          <div className="smk-field flex items-start gap-2.5 px-2.5 py-1.5">
            {/* Булавка зелёная — единственный цветной акцент в блоке */}
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span className="line-clamp-2 break-words leading-snug text-slate-700 dark:text-zinc-200">
              {profile.workplaceAddress}
            </span>
          </div>
        )}
      </div>

      {/* ── Подвал: документы · действие ────────────────────────── */}
      <div className={`smk-foot mt-auto flex items-center justify-between gap-2 px-3.5 ${
        hasAction ? 'py-2' : 'py-1.5'
      }`}>
        <div className="min-w-0">
          {profile.certificates.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-zinc-400">
              <Award className="smk-ico h-3.5 w-3.5" />
              Документы: {profile.certificates.length}
            </span>
          ) : (
            <span aria-hidden>&nbsp;</span>
          )}
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {isAdmin && !profileIsAdmin && onBlock ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onBlock(profile);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
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
              className="smk-btn-gold inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-[11px]"
              aria-label="Пожаловаться на анкету"
            >
              <Flag className="h-3.5 w-3.5 shrink-0" />
              Пожаловаться
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
