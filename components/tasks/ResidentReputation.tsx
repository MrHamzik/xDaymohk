'use client';

import { useEffect, useState } from 'react';
import { Star, Loader2, Handshake } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { fetchResidentReviews } from '@/lib/tasks/client';
import type { ResidentReview } from '@/lib/types';

interface ResidentReputationProps {
  /** Владелец анкеты: рейтинг привязан к человеку, а не к анкете. */
  ownerId?: string;
}

/**
 * Репутация ЖИТЕЛЯ в личной анкете — отдельно от рейтинга специалиста.
 *
 * Разница по требованию заказчика: рейтинг специалиста (profiles.rating)
 * оценивает навыки в профессии, а этот (user_profiles.resident_rating) —
 * самого человека как участника сделок в «Аренца Темщик» / «ГIончалла».
 * Поэтому и данные разные: здесь resident_reviews, там reviews.
 */
export default function ResidentReputation({ ownerId }: ResidentReputationProps) {
  const [reviews, setReviews] = useState<ResidentReview[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    setIsLoading(true);
    fetchResidentReviews(ownerId)
      .then((list) => { if (!cancelled) setReviews(list); })
      .catch(() => { if (!cancelled) setReviews([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [ownerId]);

  if (!ownerId) return null;

  // Пока отзывов нет — блок не показываем, чтобы не засорять анкету
  // пустой секцией у тех, кто ещё не участвовал в заданиях.
  if (!isLoading && (!reviews || reviews.length === 0)) return null;

  const average = reviews && reviews.length > 0
    ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
    : 0;
  const visible = expanded ? reviews ?? [] : (reviews ?? []).slice(0, 3);

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-zinc-800">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          <Handshake className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Репутация в заданиях
        </h3>
        {reviews && reviews.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-extrabold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {average.toFixed(1)}
            <span className="font-semibold text-amber-600/80 dark:text-amber-400/70">
              ({reviews.length})
            </span>
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        {isLoading && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          </div>
        )}

        {visible.map((review) => (
          <article
            key={review.id}
            className="rounded-xl border border-slate-100 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-800"
          >
            <div className="flex items-start gap-2">
              <Avatar src={review.authorAvatarUrl} className="h-6 w-6 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-bold text-slate-900 dark:text-white">
                    {review.authorName || 'Житель Даймохк'}
                  </p>
                  <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {review.rating.toFixed(1)}
                  </span>
                </div>
                {/* Роль показывает, в каком качестве человека оценили */}
                <p className="text-[10px] text-slate-400">
                  {review.targetRole === 'customer' ? 'как заказчика' : 'как исполнителя'}
                </p>
                {review.text && (
                  <p className="mt-1 break-words text-[11px] leading-relaxed text-slate-600 dark:text-zinc-400">
                    {review.text}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}

        {reviews && reviews.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full rounded-lg py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            {expanded ? 'Свернуть' : `Показать все (${reviews.length})`}
          </button>
        )}
      </div>
    </section>
  );
}
