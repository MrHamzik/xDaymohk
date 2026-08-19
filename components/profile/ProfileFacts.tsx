'use client';

import { BriefcaseBusiness, CalendarDays, Clock, VenusAndMars } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import InfoRow from '@/components/ui/InfoRow';
import { calculateAge } from '@/lib/text';
import { compactWeekdays } from '@/lib/schedule';
import type { Profile } from '@/lib/types';

/** Сетка «стаж / график / возраст / пол» — без дубля статуса из шапки. */
export default function ProfileFacts({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const { users } = useProfiles();

  const ownerUser = profile.ownerId ? users.find((u) => u.id === profile.ownerId) : undefined;
  const gender = profile.isPersonal ? (ownerUser?.gender || profile.gender) : undefined;
  const birth = profile.isPersonal ? (ownerUser?.birthDate || profile.birthDate) : undefined;
  const age = birth ? calculateAge(String(birth)) : null;

  const rows: Array<{ key: string; icon: typeof Clock; label: string; value: string }> = [];

  if (profile.isSpecialist && profile.experience) {
    rows.push({ key: 'exp', icon: BriefcaseBusiness, label: t.experienceLabel, value: profile.experience });
  }
  if (profile.isSpecialist) {
    const days = profile.workDays && profile.workDays.length > 0
      ? compactWeekdays(profile.workDays)
      : '';
    const hours = profile.workHoursStart && profile.workHoursEnd
      ? `${profile.workHoursStart}–${profile.workHoursEnd}`
      : '';
    const schedule = [days, hours].filter(Boolean).join(' · ');
    if (schedule) {
      rows.push({ key: 'schedule', icon: Clock, label: t.workScheduleShort, value: schedule });
    }
  }
  if (age !== null) {
    rows.push({ key: 'age', icon: CalendarDays, label: t.ageLabel, value: String(age) });
  }
  if (gender) {
    rows.push({
      key: 'gender',
      icon: VenusAndMars,
      label: t.genderLabel,
      value: gender === 'male' ? t.genderMale : t.genderFemale,
    });
  }
  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 px-4 py-3.5 smk-text-label sm:grid-cols-2">
      {rows.map((row) => (
        <InfoRow key={row.key} icon={row.icon} label={row.label} value={row.value} />
      ))}
    </div>
  );
}
