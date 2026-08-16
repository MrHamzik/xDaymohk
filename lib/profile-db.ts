import { Profile, Review } from './types';

type DbRow = Record<string, any>;

export function profileFromDb(row: DbRow, certificateRows: DbRow[] = [], reviewRows: DbRow[] = []): Profile {
  const coords = row.workplace_coords && typeof row.workplace_coords === 'object'
    ? row.workplace_coords
    : { lat: 43.288024, lng: 45.298989 };

  return {
    id: String(row.id),
    ownerId: row.owner_id ?? undefined,
    fullName: row.full_name ?? '',
    avatarUrl: row.avatar_url ?? '',
    photos: Array.isArray(row.photos) ? row.photos : [],
    isSpecialist: Boolean(row.is_specialist),
    isPersonal: Boolean(row.is_personal) || String(row.id).startsWith('personal-'),
    professionCategory: row.profession_category ?? undefined,
    professionTitle: row.profession_title ?? undefined,
    experience: row.experience ?? undefined,
    experienceStart: row.experience_start ?? undefined,
    experienceEnd: row.experience_end ?? undefined,
    experienceCurrent: Boolean(row.experience_current),
    bio: row.bio ?? '',
    workplaceAddress: row.workplace_address ?? '',
    workplaceCoords: { lat: Number(coords.lat) || 0, lng: Number(coords.lng) || 0 },
    rating: Number(row.rating) || 0,
    reviewCount: Number(row.review_count) || 0,
    reviews: reviewRows.map(reviewFromDb),
    certificates: certificateRows.map((certificate) => ({
      id: String(certificate.id),
      title: certificate.title ?? '',
      issuer: certificate.issuer ?? '',
      year: String(certificate.year ?? ''),
      imageUrl: certificate.image_url ?? '',
    })),
    phone: row.phone ?? '',
    hidePhone: Boolean(row.hide_phone),
    sameAsPhoneWhatsapp: row.same_as_phone_whatsapp !== undefined ? Boolean(row.same_as_phone_whatsapp) : true,
    isVerified: Boolean(row.is_verified),
    verificationStatus: row.verification_status ?? 'none',
    isAdmin: Boolean(row.is_admin),
    isHidden: Boolean(row.is_hidden || row.is_banned),
    isBanned: Boolean(row.is_banned),
    telegram: row.telegram ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    videoUrl: row.video_url ?? undefined,
    workDays: Array.isArray(row.work_days) ? row.work_days : undefined,
    workHoursStart: row.work_hours_start ?? undefined,
    workHoursEnd: row.work_hours_end ?? undefined,
    breakStart: row.break_start ?? undefined,
    breakEnd: row.break_end ?? undefined,
    isFlexibleSchedule: Boolean(row.is_flexible_schedule),
    gender: row.gender ?? undefined,
    birthDate: row.birth_date ?? (row.birth_year ? String(row.birth_year) : undefined),
    settlement: row.settlement ?? 'Даймохк',
    createdAt: row.created_at ?? new Date().toISOString().split('T')[0],
  };
}

function reviewFromDb(row: DbRow): Review {
  return {
    id: String(row.id),
    authorId: row.author_id ?? undefined,
    authorAvatarUrl: row.author_avatar_url ?? undefined,
    author: row.author ?? 'Житель Даймохка',
    rating: Number(row.rating) || 0,
    text: row.text ?? '',
    createdAt: row.created_at ?? '',
  };
}

export function profileToDbRow(profile: Profile) {
  const row: DbRow = {
    id: profile.id,
    owner_id: profile.ownerId ?? null,
    full_name: profile.fullName,
    avatar_url: profile.avatarUrl,
    photos: profile.photos,
    is_specialist: profile.isSpecialist,
    is_personal: profile.isPersonal ?? profile.id.startsWith('personal-') ?? false,
    profession_category: profile.professionCategory ?? null,
    profession_title: profile.professionTitle ?? null,
    experience: profile.experience ?? null,
    experience_start: profile.experienceStart ?? null,
    experience_end: profile.experienceEnd ?? null,
    experience_current: profile.experienceCurrent ?? false,
    bio: profile.bio,
    workplace_address: profile.workplaceAddress,
    workplace_coords: profile.workplaceCoords,
    rating: profile.rating,
    review_count: profile.reviewCount,
    phone: profile.phone,
    hide_phone: profile.hidePhone ?? false,
    same_as_phone_whatsapp: profile.sameAsPhoneWhatsapp ?? true,
    is_verified: profile.isVerified ?? false,
    verification_status: profile.verificationStatus ?? 'none',
    is_admin: Boolean(profile.isAdmin),
    is_banned: profile.isBanned ?? false,
    telegram: profile.telegram ?? null,
    whatsapp: profile.whatsapp ?? null,
    video_url: profile.videoUrl ?? null,
    work_days: profile.workDays ?? [],
    work_hours_start: profile.workHoursStart ?? null,
    work_hours_end: profile.workHoursEnd ?? null,
    break_start: profile.breakStart ?? null,
    break_end: profile.breakEnd ?? null,
    is_flexible_schedule: profile.isFlexibleSchedule ?? false,
    gender: profile.gender ?? null,
    birth_date: profile.birthDate ?? null,
    settlement: profile.settlement ?? 'Даймохк',
    created_at: profile.createdAt,
  };
  // New installations have is_hidden. Omitting false keeps ordinary profile
  // saving compatible with older schemas until the migration is applied.
  if (profile.isHidden || profile.isBanned) row.is_hidden = true;
  return row;
}

export function profileUpdatesToDbRow(updates: Partial<Profile>) {
  const row: DbRow = {};
  const mapping: Record<string, string> = {
    ownerId: 'owner_id',
    fullName: 'full_name',
    avatarUrl: 'avatar_url',
    photos: 'photos',
    isSpecialist: 'is_specialist',
    isPersonal: 'is_personal',
    professionCategory: 'profession_category',
    professionTitle: 'profession_title',
    experience: 'experience',
    experienceStart: 'experience_start',
    experienceEnd: 'experience_end',
    experienceCurrent: 'experience_current',
    bio: 'bio',
    workplaceAddress: 'workplace_address',
    workplaceCoords: 'workplace_coords',
    rating: 'rating',
    reviewCount: 'review_count',
    phone: 'phone',
    hidePhone: 'hide_phone',
    sameAsPhoneWhatsapp: 'same_as_phone_whatsapp',
    isVerified: 'is_verified',
    verificationStatus: 'verification_status',
    isAdmin: 'is_admin',
    isHidden: 'is_hidden',
    isBanned: 'is_banned',
    telegram: 'telegram',
    whatsapp: 'whatsapp',
    videoUrl: 'video_url',
    workDays: 'work_days',
    workHoursStart: 'work_hours_start',
    workHoursEnd: 'work_hours_end',
    breakStart: 'break_start',
    breakEnd: 'break_end',
    isFlexibleSchedule: 'is_flexible_schedule',
    gender: 'gender',
    birthDate: 'birth_date',
    settlement: 'settlement',
    createdAt: 'created_at',
  };

  Object.entries(updates).forEach(([key, value]) => {
    if (mapping[key]) {
      row[mapping[key]] = value ?? null;
    }
  });

  return row;
}

export function certificateToDbRow(profileId: string, certificate: Profile['certificates'][number]) {
  return {
    id: certificate.id,
    profile_id: profileId,
    title: certificate.title,
    issuer: certificate.issuer,
    year: certificate.year,
    image_url: certificate.imageUrl,
  };
}
