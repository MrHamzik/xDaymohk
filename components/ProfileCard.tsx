'use client';

import Image from 'next/image';
import {
  Award, Ban, ChevronRight, Flag, MapPin, Star, VenusAndMars,
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
             Структура повторяет карточку задания: шапка, разделитель,
             суть, разделитель, чипы, подвал. Отступы и размеры те же. */}
      <div className="flex items-start gap-3 py-3.5 pl-4 pr-3.5">
        <div className="shrink-0">
          <div
            className={`smk-ring h-11 w-11 ${statusRing.className}`}
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
          <h3 className="smk-title truncate text-base font-bold leading-tight text-slate-900 dark:text-white">
            {profile.fullName}
          </h3>

          {/* Метаданные с ромбами-разделителями — как у задания */}
          <div className="smk-meta mt-1.5 flex flex-wrap items-center text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
            {showHeadRating && (
              <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                <Star className="h-3 w-3 smk-star" />
                {headRating.toFixed(1)}
              </span>
            )}
            {showHeadRating && (
              <span>
                {profile.isSpecialist
                  ? formatReviews(headCount)
                  : formatCount(headCount, t.cardRatingOne, t.cardRatingFew, t.cardRatingMany)}
              </span>
            )}
            {profile.isSpecialist && profile.experience && (
              <span>{t.experienceLabel}: {profile.experience}</span>
            )}
            {!profile.isSpecialist && age !== null && (
              <span>{t.ageLabel}: {age}</span>
            )}
          </div>
        </div>

      </div>

      {/* Разделитель на всю ширину, затухающий к краям */}
      <hr className="smk-rule mx-4" />

      {/* ── Суть: профессия и описание ─────────────────────────── */}
      <div className="px-4 py-3">
        {profile.isSpecialist && profile.professionTitle && (
          <h4 className="line-clamp-2 text-sm font-bold leading-snug text-emerald-700 dark:text-emerald-400">
            {profile.professionTitle}
          </h4>
        )}
        {profile.bio && (
          <p className={`line-clamp-2 break-words [overflow-wrap:anywhere] text-xs leading-relaxed text-slate-600 dark:text-zinc-400 ${
            profile.isSpecialist && profile.professionTitle ? 'mt-1.5' : ''
          }`}>
            {profile.bio}
          </p>
        )}
        {!profile.bio && !(profile.isSpecialist && profile.professionTitle) && (
          <p className="text-xs leading-relaxed text-slate-400 dark:text-zinc-500">
            {profile.isSpecialist ? t.roleSpecialist : t.filterResidents}
          </p>
        )}
      </div>

      <hr className="smk-rule mx-4" />

      {/* ── Чипы: роли и статусы, как метки у задания ──────────── */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-4 py-3 text-[10px] font-bold">
        <ProfileBadges profile={profile} adminStatus={profileIsAdmin} showPending={showPending} />

        {/* Рабочий статус специалиста — чип с пульсирующей точкой */}
        {statusRing.status && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-zinc-700/70 dark:text-zinc-300">
            <span
              className={`smk-status-dot smk-status-dot--${statusRing.status}`}
              aria-hidden
            />
            {statusRing.shortLabel}
          </span>
        )}

        {/* Пол — только у жителей: у специалиста место занимает статус */}
        {!profile.isSpecialist && profile.gender && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-zinc-700/70 dark:text-zinc-300">
            <VenusAndMars className="h-3 w-3" />
            {profile.gender === 'male' ? t.genderMale : t.genderFemale}
          </span>
        )}

        {profile.certificates.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            <Award className="h-3 w-3" />
            {t.cardDocuments}: {profile.certificates.length}
          </span>
        )}
      </div>

      {/* ── Подвал: документы · действие ────────────────────────── */}
      {/* Подвал как у задания: слева адрес, справа действие.
          «Документы» переехали в чипы — там для них есть место, а
          подвал получил осмысленное содержимое вместо счётчика. */}
      <div className="smk-card-foot flex items-center justify-between gap-2 py-2.5 pl-4 pr-3.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">
            {profile.workplaceAddress || t.taskAddressMissing}
          </span>
        </span>

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
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 smk-arrow" />
          )}
        </div>
      </div>
    </article>
  );
}
