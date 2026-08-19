'use client';

import { Star } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Review } from '@/lib/types';

/** Вкладка «Оценки»: балл, звёзды и распределение. */
export default function ProfileRatingsTab({
  reviews,
  rating,
  count,
}: {
  reviews: Review[];
  rating: number;
  count: number;
}) {
  const { t } = useI18n();

  return (
    <div className="smk-sheet-row p-3">
      <div className="flex items-center gap-3">
        <span className="text-3xl font-black leading-none text-slate-900 dark:text-white">
          {rating > 0 ? rating.toFixed(1) : '0'}
        </span>
        <div className="min-w-0">
          <div className="flex gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-3.5 w-3.5 ${
                  star <= Math.round(rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300 dark:text-zinc-600'
                }`}
              />
            ))}
          </div>
          <span className="smk-text-label text-slate-500 dark:text-zinc-500">
            {count} {t.profileRatingsCount}
          </span>
        </div>
      </div>

      <hr className="smk-orn-soft my-2.5" />

      <div className="space-y-1">
        {[5, 4, 3, 2, 1].map((stars) => {
          const starCount = reviews.filter((r) => r.rating === stars).length;
          const totalCount = reviews.length || 1;
          const percent = Math.round((starCount / totalCount) * 100);
          return (
            <div key={stars} className="flex items-center gap-2 smk-text-label">
              <span className="flex w-6 shrink-0 items-center gap-0.5 font-bold text-slate-600 dark:text-zinc-400">
                {stars}
                <Star className="h-2.5 w-2.5 fill-current" />
              </span>
              <div className="smk-bar flex-1">
                <span style={{ width: `${percent}%` }} />
              </div>
              <span className="w-5 shrink-0 text-right tabular-nums text-slate-500 dark:text-zinc-500">
                {starCount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
