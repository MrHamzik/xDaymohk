import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { certificateToDbRow, profileToDbRow } from '@/lib/profile-db';
import { Profile } from '@/lib/types';

/**
 * Persist a profile (and its certificates / reviews) to Supabase.
 * Falls back to a base column set when the schema is older than expected.
 */
export async function persistProfileToSupabase(profile: Profile): Promise<void> {
  if (!supabase) return;

  const row = profileToDbRow(profile);
  const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' });
  if (error) {
    // Не молчим (баг от 22.08, п.6): чаще всего это отсутствующая колонка
    // (не применены миграции) — один такой столбец раньше silently валил
    // сохранение ника и галочек, человек узнаывал об этом только в каталоге.
    console.warn('[profiles] полный upsert не прошёл, пробуем базовый набор:', error.message);
    const baseRow: Record<string, unknown> = {
      id: profile.id,
      owner_id: profile.ownerId ?? null,
      full_name: profile.fullName,
      avatar_url: profile.avatarUrl,
      photos: profile.photos,
      is_specialist: profile.isSpecialist,
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
      // Раньше fallback терял эти поля (баг от 22.08, п.6): ник и
      // галочки видимости не сохранялись именно на старых схемах.
      hide_whatsapp: profile.hideWhatsapp ?? false,
      hide_telegram: profile.hideTelegram ?? false,
      nickname: profile.nickname ?? null,
      show_nickname: profile.showNickname ?? false,
      settlement: (profile as any).settlement ?? null,
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
      birth_date: (profile as any).birthDate ?? null,
      created_at: profile.createdAt,
    };
    const { error: retryError } = await supabase.from('profiles').upsert(baseRow, { onConflict: 'id' });
    if (retryError) {
      console.warn('Не удалось сохранить анкету в Supabase:', retryError.message);
      return;
    }
  }

  if (profile.isHidden === false) {
    const { error: visibilityError } = await supabase
      .from('profiles')
      .update({ is_hidden: false })
      .eq('id', profile.id);
    if (visibilityError) console.warn('Не удалось обновить видимость анкеты:', visibilityError.message);
  }

  const certificateRows = profile.certificates.map((certificate) => certificateToDbRow(profile.id, certificate));
  if (certificateRows.length > 0) {
    const { error: certificateError } = await supabase
      .from('certificates')
      .upsert(certificateRows, { onConflict: 'id' });
    if (certificateError) console.warn('Не удалось сохранить документы анкеты:', certificateError.message);
  }

  // Editing a questionnaire can remove a document. Delete only the old
  // children that are no longer present.
  const { data: existingCertificates, error: existingCertificatesError } = await supabase
    .from('certificates')
    .select('id')
    .eq('profile_id', profile.id);
  if (!existingCertificatesError && existingCertificates) {
    const currentCertificateIds = new Set(certificateRows.map((certificate) => certificate.id));
    const removedCertificateIds = existingCertificates
      .map((certificate) => String(certificate.id))
      .filter((id) => !currentCertificateIds.has(id));
    if (removedCertificateIds.length > 0) {
      const { error: deleteCertificateError } = await supabase
        .from('certificates')
        .delete()
        .in('id', removedCertificateIds);
      if (deleteCertificateError) console.warn('Не удалось удалить документы анкеты:', deleteCertificateError.message);
    }
  }

  // Reviews are intentionally NOT synced here. Step 16 dropped the
  // reviews.author and reviews.author_avatar_url columns in
  // favour of v_reviews, which JOINs to user_profiles to project
  // the live name/avatar. Upserting the old row shape would fail
  // with a "column does not exist" error. New reviews go through
  // /api/reviews (which inserts only author_id + the rating text
  // and lets the view resolve the author fields on read).
}
