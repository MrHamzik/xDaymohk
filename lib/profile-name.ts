import type { Profile } from '@/lib/types';

/** Имя на карточке: ник, если человек так попросил в личной анкете. */
export function displayName(profile: Pick<Profile, 'fullName' | 'nickname' | 'showNickname' | 'isPersonal'>): string {
  const nick = profile.nickname?.trim();
  if (profile.isPersonal && profile.showNickname && nick) return nick;
  return profile.fullName;
}
