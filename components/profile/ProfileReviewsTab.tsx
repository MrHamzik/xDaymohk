'use client';

import { useEffect, useState } from 'react';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/ui/EmptyState';
import { formatReviewDate, MAX_REVIEW_TEXT_LENGTH } from '@/components/profile/profile-helpers';
import type { Profile, Review } from '@/lib/types';

async function requireSession(): Promise<string> {
  if (!supabase) throw new Error('Supabase не настроен — войдите снова.');
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Сессия истекла — войдите снова.');
  return accessToken;
}

/**
 * Вкладка «Отзывы»: список, правка, удаление и форма нового отзыва.
 * Локальный список нужен, чтобы удаление сразу пересчитывало балл в шапке.
 */
export default function ProfileReviewsTab({
  profile,
  isOwnProfile,
  onReview,
  onOpenUser,
  onNotice,
  onStats,
}: {
  profile: Profile;
  isOwnProfile: boolean;
  onReview?: (profileId: string, review: Omit<Review, 'id' | 'createdAt'>) => void | Promise<void>;
  onOpenUser: (userId?: string) => void;
  onNotice: (message: string) => void;
  onStats: (rating: number, count: number, reviews: Review[]) => void;
}) {
  const { account } = useAuth();
  const { t } = useI18n();
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [localReviews, setLocalReviews] = useState<Review[] | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editReviewText, setEditReviewText] = useState('');
  const [editReviewRating, setEditReviewRating] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setReviewRating(0);
    setReviewText('');
    setLocalReviews(null);
    setEditingReviewId(null);
  }, [profile.id]);

  const displayReviews = localReviews ?? profile.reviews ?? [];
  const displayReviewCount = localReviews !== null ? localReviews.length : profile.reviewCount;
  const displayRating = (() => {
    if (localReviews === null) return profile.rating;
    if (localReviews.length === 0) return 0;
    return Number((localReviews.reduce((sum, r) => sum + r.rating, 0) / localReviews.length).toFixed(1));
  })();

  useEffect(() => {
    onStats(displayRating, displayReviewCount, displayReviews);
    // onStats стабилен по смыслу: шлём только когда изменились цифры.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRating, displayReviewCount]);

  const alreadyReviewed = Boolean(
    account && displayReviews.some((r) => r.authorId === account.id),
  );
  const canReview = Boolean(account && !account.isBlocked && onReview && !isOwnProfile && !alreadyReviewed);

  const canDeleteBy = (authorId?: string) =>
    Boolean(
      account &&
      !account.isBlocked &&
      (account.id === authorId || account.id === profile.ownerId || account.isAdmin),
    );
  const canEditBy = (authorId?: string) =>
    Boolean(account && !account.isBlocked && account.id === authorId);

  const handleDeleteReview = async (reviewId: string) => {
    if (!account || busyId) return;
    setBusyId(reviewId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ reviewId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось удалить отзыв.');
      }
      setLocalReviews((current) => (current ?? profile.reviews ?? []).filter((r) => r.id !== reviewId));
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось удалить отзыв.');
    } finally {
      setBusyId(null);
    }
  };

  const startEditReview = (review: Review) => {
    if (!account || account.id !== review.authorId) return;
    setEditingReviewId(review.id);
    setEditReviewText(review.text);
    setEditReviewRating(review.rating);
  };

  const handleEditReviewSubmit = async (event: React.FormEvent, reviewId: string) => {
    event.preventDefault();
    if (!account || busyId) return;
    if (editReviewRating < 1 || editReviewRating > 5) {
      onNotice('Поставьте оценку от 1 до 5 звёзд.');
      return;
    }
    const trimmed = editReviewText.trim().slice(0, MAX_REVIEW_TEXT_LENGTH);
    setBusyId(reviewId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ reviewId, rating: editReviewRating, text: trimmed }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось изменить отзыв.');
      }
      const result = await response.json();
      const updated = result.review;
      setLocalReviews((current) =>
        (current ?? profile.reviews ?? []).map((r) => (r.id === reviewId ? {
          ...r,
          rating: Number(updated?.rating ?? editReviewRating),
          text: String(updated?.text ?? trimmed),
          createdAt: String(updated?.createdAt ?? r.createdAt),
        } : r)),
      );
      setEditingReviewId(null);
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось изменить отзыв.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account) {
      onNotice('Войдите через Google, чтобы оставить отзыв.');
      return;
    }
    if (!onReview || isOwnProfile) return;
    if (reviewRating === 0) {
      onNotice('Поставьте оценку от 1 до 5 звёзд.');
      return;
    }
    try {
      await onReview(profile.id, {
        author: account?.fullName || 'Житель Даймохк',
        rating: reviewRating,
        text: reviewText.trim().slice(0, MAX_REVIEW_TEXT_LENGTH),
      });
      setReviewRating(0);
      setReviewText('');
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось отправить отзыв.');
    }
  };

  return (
    <div className="space-y-2">
      {displayReviews.length > 0 ? (
        <div className="space-y-1.5">
          {displayReviews.map((review) => (
            <article key={review.id} className="smk-sheet-row p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 shrink-0 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden flex items-center justify-center">
                    {(review as { authorAvatarUrl?: string }).authorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(review as { authorAvatarUrl?: string }).authorAvatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="smk-text-label font-bold text-slate-500">{review.author.charAt(0)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenUser(review.authorId)}
                    title={t.profileOpenUserCard}
                    className="min-w-0 break-words text-left text-xs font-bold text-slate-900 transition hover:text-emerald-600 hover:underline dark:text-white dark:hover:text-emerald-400"
                  >
                    {review.author}
                  </button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <time className="smk-meta smk-text-label font-medium">{formatReviewDate(review.createdAt)}</time>
                  <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {review.rating.toFixed(1)}
                  </span>
                  {canEditBy(review.authorId) && editingReviewId !== review.id && (
                    <button
                      type="button"
                      onClick={() => startEditReview(review)}
                      disabled={busyId !== null}
                      aria-label={t.profileEditReview}
                      title={t.edit}
                      className="smk-act flex h-6 w-6 items-center justify-center"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDeleteBy(review.authorId) && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteReview(review.id)}
                      disabled={busyId === review.id}
                      aria-label={t.profileDeleteReview}
                      title={t.profileDeleteReview}
                      className="smk-act smk-act--danger flex h-6 w-6 items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {editingReviewId === review.id ? (
                <form onSubmit={(event) => void handleEditReviewSubmit(event, review.id)} className="mt-2 space-y-2 rounded-xl smk-sheet-row p-2.5">
                  <div className="flex items-center gap-1" aria-label={t.profileRateChange}>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setEditReviewRating(rating)}
                        aria-label={`${rating} из 5`}
                        className="rounded-lg p-0.5 transition hover:bg-amber-100 dark:hover:bg-amber-100"
                      >
                        <Star className={`h-4 w-4 ${rating <= editReviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-zinc-600'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    maxLength={MAX_REVIEW_TEXT_LENGTH}
                    value={editReviewText}
                    onChange={(event) => setEditReviewText(event.target.value)}
                    placeholder={t.reviewPlaceholder}
                    className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                  />
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={busyId === review.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 smk-text-label font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                      {busyId === review.id ? t.saving : t.save}
                    </button>
                    <button type="button" onClick={() => setEditingReviewId(null)} disabled={busyId === review.id} className="rounded-lg bg-slate-100 px-3 py-1.5 smk-text-label font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                      {t.cancel}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-1 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{review.text}</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title={t.profileNoReviews} />
      )}

      {isOwnProfile ? (
        <p className="smk-sheet-row mt-2 p-2.5 smk-text-label text-slate-500 dark:text-zinc-500">{t.profileOwnReviewBlocked}</p>
      ) : canReview && (
        <form onSubmit={handleReviewSubmit} className="smk-sheet-row mt-2 space-y-2 p-2.5">
          <h4 className="smk-sheet-label">{t.leaveReview}</h4>
          <div className="flex items-center gap-1" aria-label={t.profileRatePick}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => setReviewRating(rating)}
                aria-label={`${rating} из 5`}
                className="rounded-lg p-0.5 transition hover:bg-amber-100 dark:hover:bg-amber-100"
              >
                <Star className={`h-5 w-5 ${rating <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-zinc-600'}`} />
              </button>
            ))}
          </div>
          <div>
            <textarea
              rows={2}
              maxLength={MAX_REVIEW_TEXT_LENGTH}
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
              placeholder={t.reviewPlaceholder}
              className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
            />
          </div>
          <button type="submit" className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700">
            {t.publishReview}
          </button>
        </form>
      )}
    </div>
  );
}
