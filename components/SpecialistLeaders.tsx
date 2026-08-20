'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import { cacheBustAvatarUrl } from '@/lib/media';
import { displayName } from '@/lib/profile-name';
import { formatReviews } from '@/lib/text';
import type { Profile } from '@/lib/types';

interface Leader {
  id: string;
  fullName: string;
  avatarUrl: string;
  professionTitle: string;
  nickname?: string;
  showNickname?: boolean;
  isPersonal?: boolean;
  rating: number;
  reviewCount: number;
  periodReviews: number;
  periodAvg: number;
}

interface SpecialistLeadersProps {
  onOpen: (profileId: string) => void;
}

function asLeader(profile: Profile): Leader {
  return {
    id: profile.id,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
    professionTitle: profile.professionTitle || '',
    nickname: profile.nickname,
    showNickname: profile.showNickname,
    isPersonal: profile.isPersonal,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
    periodReviews: 0,
    periodAvg: profile.rating,
  };
}

function fallbackLeaders(profiles: Profile[]): { day: Leader | null; week: Leader | null; month: Leader | null } {
  const ranked = profiles
    .filter((profile) => profile.isSpecialist && !profile.isHidden && !profile.isBanned && profile.rating > 0)
    .slice()
    .sort((a, b) => (b.rating * b.reviewCount) - (a.rating * a.reviewCount));
  return {
    day: ranked[0] ? asLeader(ranked[0]) : null,
    week: ranked[1] ? asLeader(ranked[1]) : ranked[0] ? asLeader(ranked[0]) : null,
    month: ranked[2] ? asLeader(ranked[2]) : ranked[0] ? asLeader(ranked[0]) : null,
  };
}

export default function SpecialistLeaders({ onOpen }: SpecialistLeadersProps) {
  const { t } = useI18n();
  const { profiles } = useProfiles();
  const [remote, setRemote] = useState<{ day: Leader | null; week: Leader | null; month: Leader | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/specialists/leaders').catch(() => null);
      const data = await res?.json().catch(() => null);
      if (cancelled || !data) return;
      setRemote({
        day: data.day ?? null,
        week: data.week ?? null,
        month: data.month ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const local = useMemo(() => fallbackLeaders(profiles), [profiles]);
  const leaders = remote ?? local;
  const slots: Array<{ key: 'day' | 'week' | 'month'; title: string; person: Leader | null }> = [
    { key: 'day', title: t.specialistDay, person: leaders.day },
    { key: 'week', title: t.specialistWeek, person: leaders.week },
    { key: 'month', title: t.specialistMonth, person: leaders.month },
  ];

  if (!slots.some((slot) => slot.person)) return null;

  return (
    <section className="mb-4" aria-label={t.specialistLeaders}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {slots.map((slot) => {
          const person = slot.person;
          if (!person) return null;
          const name = displayName(person);
          const shownRating = person.periodAvg > 0 ? person.periodAvg : person.rating;
          const shownCount = person.periodReviews > 0 ? person.periodReviews : person.reviewCount;
          return (
            <button
              key={slot.key}
              type="button"
              onClick={() => onOpen(person.id)}
              className="smk-lux smk-rays flex items-center gap-3 px-3 py-2.5 text-left transition hover:brightness-95 dark:hover:brightness-110"
            >
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-zinc-800">
                <Image
                  src={cacheBustAvatarUrl(person.avatarUrl)}
                  alt={name}
                  width={44}
                  height={44}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="smk-text-label font-bold uppercase tracking-wide text-[var(--smk-gold)]">
                  {slot.title}
                </p>
                <p className="truncate smk-text-title font-bold text-slate-900 dark:text-white">{name}</p>
                {person.professionTitle && (
                  <p className="truncate smk-text-label font-semibold text-emerald-700 dark:text-emerald-400">
                    {person.professionTitle}
                  </p>
                )}
                {shownRating > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 smk-text-label font-bold text-slate-500 dark:text-zinc-400">
                    <Star className="h-3 w-3 smk-star" />
                    <span className="smk-rating-value">{shownRating.toFixed(1)}</span>
                    <span>{formatReviews(shownCount)}</span>
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
