import { Profile } from '@/lib/types';

/**
 * Merge localStorage-cached profiles with the latest Supabase snapshot.
 * Local changes (phone, whatsapp) take precedence to avoid overwriting
 * user edits when the remote table is briefly empty.
 */
export function mergeProfilesWithLocal(
  remote: Profile[] | null,
  local: Profile[] | null
): Profile[] | null {
  if (!remote) return local;
  if (!local) return remote;
  if (remote.length === 0 && local.length > 0) return local;

  const localMap = new Map(local.map((profile) => [profile.id, profile]));
  const mergedRemote = remote.map((remoteProfile) => {
    const localProfile = localMap.get(remoteProfile.id);
    if (!localProfile) return remoteProfile;
    const sameAs = localProfile.sameAsPhoneWhatsapp === false
      ? false
      : remoteProfile.sameAsPhoneWhatsapp ?? localProfile.sameAsPhoneWhatsapp ?? true;
    return {
      ...remoteProfile,
      whatsapp: sameAs === false
        ? (localProfile.whatsapp ?? remoteProfile.whatsapp)
        : (remoteProfile.whatsapp ?? localProfile.whatsapp),
      telegram: localProfile.telegram ?? remoteProfile.telegram,
      sameAsPhoneWhatsapp: sameAs,
      hidePhone: localProfile.hidePhone ?? remoteProfile.hidePhone,
      phone: remoteProfile.phone || localProfile.phone,
    };
  });
  const remoteIds = new Set(remote.map((profile) => profile.id));
  const extraLocal = local.filter((profile) => !remoteIds.has(profile.id));
  return [...mergedRemote, ...extraLocal];
}

export function normalizeProfiles(value: unknown): Profile[] | null {
  if (!Array.isArray(value)) return null;
  const profiles = value as Profile[];
  return profiles.map((profile) => ({
    ...profile,
    isAdmin: Boolean(profile.isAdmin),
  }));
}
