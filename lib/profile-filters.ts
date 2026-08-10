import { AudienceFilter, Profile, UserSummary } from './types';
import { calculateWorkingStatus } from './schedule';

export const ADMIN_EMAIL = 'mr.hamzik1026@gmail.com';
export const ADMIN_EMAILS = ['mr.hamzik1026@gmail.com', 'nabis95@gmail.com'].map((e) => e.toLowerCase());

function isAdminEmail(email: string | undefined | null) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export interface ProfileFilterOptions {
  query?: string;
  audienceFilters?: AudienceFilter[];
  professionFilters?: string[];
  adminOwnerId?: string;
  users?: UserSummary[];
}

/**
 * Resolves whether a profile belongs to an administrator.
 * Строго только 2 email администратора.
 */
export function isAdminProfile(profile: Profile, adminOwnerId?: string, users?: UserSummary[]) {
  if (users && profile.ownerId) {
    const owner = users.find((user) => user.id === profile.ownerId);
    if (owner && (owner.isAdmin || isAdminEmail(owner.email))) {
      return true;
    }
  }
  if (adminOwnerId && profile.ownerId === adminOwnerId) return true;
  // Флаг is_admin на старой анкете игнорируем, если владелец не в списке админов
  if (profile.isAdmin) {
    if (users && profile.ownerId) {
      const owner = users.find((user) => user.id === profile.ownerId);
      if (owner && isAdminEmail(owner.email)) return true;
      return false;
    }
    // Если users не загружены, временно считаем по флагу (для гостевого просмотра)
    return true;
  }
  return false;
}

export { isAdminEmail };

export function filterProfiles(profiles: Profile[], options: ProfileFilterOptions = {}) {
  const query = options.query?.trim().toLowerCase() ?? '';
  const audienceFilters = options.audienceFilters ?? [];
  const professionFilters = options.professionFilters ?? [];

  return profiles.filter((profile) => {
    const adminProfile = isAdminProfile(profile, options.adminOwnerId, options.users);

    if (professionFilters.length > 0 && !professionFilters.includes(profile.professionCategory ?? '')) {
      return false;
    }

    if (audienceFilters.length > 0) {
      const matchesAudience = audienceFilters.some((audience) => {
        if (audience === 'residents') return !profile.isSpecialist && !adminProfile;
        if (audience === 'specialists') return profile.isSpecialist;
        if (audience === 'verified') return Boolean(profile.isVerified || profile.verificationStatus === 'verified');
        if (audience === 'admins') return adminProfile;
        if (audience === 'flexible') return Boolean(profile.isSpecialist && profile.isFlexibleSchedule);
        if (audience === 'open_now') {
          return profile.isSpecialist && calculateWorkingStatus(profile, profile.statusOverride).status === 'active';
        }
        if (audience === 'break') {
          return profile.isSpecialist && calculateWorkingStatus(profile, profile.statusOverride).status === 'break';
        }
        if (audience === 'offline') {
          return profile.isSpecialist && calculateWorkingStatus(profile, profile.statusOverride).status === 'offline';
        }
        return false;
      });

      if (!matchesAudience) return false;
    }

    if (!query) return true;

    return [
      profile.fullName,
      profile.professionTitle,
      profile.bio,
      profile.workplaceAddress,
    ].some((value) => value?.toLowerCase().includes(query));
  });
}
