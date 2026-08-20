'use client';

import Image from 'next/image';
import {
  Award, Ban, Briefcase, BriefcaseBusiness, CalendarDays, FileText,
  Flag, MapPin, Star, VenusAndMars,
} from 'lucide-react';
import { Profile } from '@/lib/types';
import { calculateAge, formatCount, formatReviews } from '@/lib/text';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import ProfileBadges, { useWorkingStatusRing } from '@/components/ProfileBadges';
import { cacheBustAvatarUrl } from '@/lib/media';
import { displayName } from '@/lib/profile-name';

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

const CARD_CATEGORIES = new Set([
  'doctor', 'builder', 'teacher', 'mechanic', 'service', 'trade', 'agriculture', 'other',
]);

function cardCategory(profile: Profile): string {
  if (profile.professionCategory && CARD_CATEGORIES.has(profile.professionCategory)) {
    return profile.professionCategory;
  }
  return profile.isSpecialist ? 'other' : 'resident';
}

/**
 * Карточка анкеты.
 *
 * Макет — по файлу «карточка специалиста»: пейзаж в шапке, вайнахский
 * орнамент в углу, строки с иконками, волна и пейзаж снизу. Рисунок
 * тянется за шириной и высотой карточки (container query + cover).
 * Оттенок зависит от сферы.
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
      aria-label={`${t.open} ${displayName(profile)}`}
      className={`smk-lux smk-enter smk-cat smk-cat--${cardCategory(profile)} group h-full cursor-pointer text-slate-900 dark:text-white`}
    >
      <div className="smk-cat-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cards/scene-top.jpg" alt="" className="smk-cat-scene" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cards/orn-corner.webp" alt="" className="smk-cat-orn" />
        <div className="smk-cat-medal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cards/frame-medal.png" alt="" className="smk-cat-frame" />
          <div
            className={`smk-ring ${statusRing.className}`}
            title={statusRing.label ?? undefined}
            aria-label={statusRing.label ?? undefined}
          >
            <Image
              src={cacheBustAvatarUrl(profile.avatarUrl)}
              alt={displayName(profile)}
              width={72}
              height={72}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          </div>
        </div>

        <div className="smk-cat-head">
          <h3 className="smk-title truncate smk-text-display font-bold leading-tight sm:text-xl">
            {displayName(profile)}
          </h3>

          {showHeadRating && (
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <Star className="h-4 w-4 shrink-0 translate-y-0.5 smk-star" />
              <span className="smk-rating-value text-sm font-extrabold">
                {headRating.toFixed(1)}
              </span>
              <span className="truncate smk-text-label text-slate-700 dark:text-zinc-300">
                {profile.isSpecialist
                  ? formatReviews(headCount)
                  : formatCount(headCount, t.cardRatingOne, t.cardRatingFew, t.cardRatingMany)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="smk-cat-body">
        <div className="pb-1">
          <ProfileBadges profile={profile} adminStatus={profileIsAdmin} showPending={showPending} />
        </div>

        <div className="smk-rows smk-text-body">
          {/* Строку профессии прячем, если она дословно повторяет бейдж
              «Специалист» рядом с именем — иначе выходило «Специалист
              Специалист». Осмысленные названия («Электрик») остаются. */}
          {profile.isSpecialist && profile.professionTitle
            && profile.professionTitle.trim().toLowerCase() !== t.roleSpecialist.toLowerCase() && (
            <div className="flex items-start gap-2.5 py-2">
              <Briefcase className="smk-ico mt-0.5 h-3.5 w-3.5" />
              <p className="line-clamp-2 font-bold leading-snug text-emerald-700 dark:text-emerald-400">
                {profile.professionTitle}
              </p>
            </div>
          )}

          {profile.bio && (
            <div className="flex items-start gap-2.5 py-2">
              <FileText className="smk-ico mt-0.5 h-3.5 w-3.5" />
              <p className="line-clamp-2 break-words [overflow-wrap:anywhere] leading-snug text-slate-600 dark:text-zinc-300">
                {profile.bio}
              </p>
            </div>
          )}

          {/* У специалиста — стаж и рабочий статус: возраст мастера
              клиенту неинтересен, а «сколько лет в деле» и «работает ли
              сейчас» решают, звонить или нет.
              У жителя остаются возраст и пол. */}
          {profile.isSpecialist ? (
            (profile.experience || statusRing.status) && (
              <div className="flex items-center gap-2 py-2">
                {profile.experience && (
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                    <BriefcaseBusiness className="smk-ico h-3.5 w-3.5" />
                    <span className="smk-row-label">{t.experienceLabel}:</span>
                    <span className="truncate font-semibold">{profile.experience}</span>
                  </span>
                )}
                {profile.experience && statusRing.status && <span className="smk-sep" aria-hidden />}
                {statusRing.status && (
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                    <span
                      className={`smk-status-dot smk-status-dot--${statusRing.status}`}
                      aria-hidden
                    />
                    <span className="truncate font-semibold">{statusRing.shortLabel}</span>
                  </span>
                )}
              </div>
            )
          ) : (
            (age !== null || profile.gender) && (
              <div className="flex items-center gap-2 py-2">
                {age !== null && (
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                    <CalendarDays className="smk-ico h-3.5 w-3.5" />
                    <span className="smk-row-label">{t.ageLabel}:</span>
                    <span className="font-semibold">{age}</span>
                  </span>
                )}
                {age !== null && profile.gender && <span className="smk-sep" aria-hidden />}
                {profile.gender && (
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                    <VenusAndMars className="smk-ico h-3.5 w-3.5" />
                    <span className="truncate font-semibold">
                      {profile.gender === 'male' ? t.genderMale : t.genderFemale}
                    </span>
                  </span>
                )}
              </div>
            )
          )}

          {profile.workplaceAddress && (
            <div className="flex items-start gap-2.5 py-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span className="line-clamp-2 break-words leading-snug text-slate-600 dark:text-zinc-300">
                {profile.workplaceAddress}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="smk-cat-land">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cards/scene-foot.jpg" alt="" className="smk-cat-land-scene" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cards/orn-strip.webp" alt="" className="smk-cat-strip" />
        <div className="smk-cat-actions">
          <div className="min-w-0">
            {profile.certificates.length > 0 ? (
              <span className="smk-cat-docs inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap smk-text-label font-bold">
                <Award className="h-3.5 w-3.5" />
                {t.cardDocuments}: {profile.certificates.length}
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
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-red-50 px-3 py-1.5 smk-text-label font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
              >
                <Ban className="h-3.5 w-3.5 shrink-0" />
                {t.cardBlock}
              </button>
            ) : !isOwnProfile && !profile.isVerified && profile.verificationStatus !== 'verified' && onReport ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReport(profile);
                }}
                className="smk-btn-gold smk-shine inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 smk-text-label"
                aria-label={t.cardReportAria}
              >
                <Flag className="h-3.5 w-3.5 shrink-0" />
                {t.cardReport}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
