'use client';

import Image from 'next/image';
import {
  Award, Ban, Briefcase, BriefcaseBusiness, CalendarDays, ChevronRight, FileText,
  Flag, MapPin, Star, VenusAndMars,
} from 'lucide-react';
import { Profile } from '@/lib/types';
import { calculateAge, formatCount, formatReviews } from '@/lib/text';
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
      aria-label={`${t.open} ${profile.fullName}`}
      className="smk-lux smk-rays smk-enter group flex h-full cursor-pointer flex-col overflow-hidden text-slate-900 dark:text-white"
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
                {profile.isSpecialist
                  ? formatReviews(headCount)
                  : formatCount(headCount, t.cardRatingOne, t.cardRatingFew, t.cardRatingMany)}
              </span>
            </div>
          )}
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 self-center smk-arrow" />
      </div>

      {/* Золотой разделитель, затухающий к краям */}
      <hr className="smk-orn mx-3.5" />

      {/* ── Строки данных ─────────────────────────────────────────
             Без подложек: строки разделены тонкими линиями (.smk-rows),
             как в карточке задания. Подложка на каждой строке дробила
             карточку на плитки и съедала воздух. */}
      <div className="px-3.5 pb-1 pt-2">
        <ProfileBadges profile={profile} adminStatus={profileIsAdmin} showPending={showPending} />
      </div>

      <div className="smk-rows px-3.5 text-xs">
        {profile.isSpecialist && profile.professionTitle && (
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
                  {/* Точка пульсирует только у «живых» статусов —
                      мигающий «выходной» выглядел бы как ошибка. */}
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
            {/* Булавка зелёная — единственный цветной акцент в блоке */}
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="line-clamp-2 break-words leading-snug text-slate-600 dark:text-zinc-300">
              {profile.workplaceAddress}
            </span>
          </div>
        )}
      </div>

      {/* ── Подвал: документы · действие ────────────────────────── */}
      <div className={`smk-card-foot mt-auto flex items-center justify-between gap-2 px-3.5 ${
        hasAction ? 'py-2' : 'py-1.5'
      }`}>
        <div className="min-w-0">
          {profile.certificates.length > 0 ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-bold text-slate-500 dark:text-zinc-400">
              <Award className="smk-ico h-3.5 w-3.5" />
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
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
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
              className="smk-btn-gold smk-shine inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-[11px]"
              aria-label={t.cardReportAria}
            >
              <Flag className="h-3.5 w-3.5 shrink-0" />
              {t.cardReport}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
