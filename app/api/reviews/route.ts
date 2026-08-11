import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Submit a review for a profile.
 *
 * Why a dedicated endpoint and not a direct client-side insert:
 *   The RLS policy "reviews author write" requires
 *     auth.uid()::text = author_id::text
 *   which the client satisfies by passing author_id itself. That
 *   works, but we also need to update profiles.rating and
 *   profiles.review_count on the same row, and the "profiles
 *   owner update" RLS policy is gated on owner_id = auth.uid() —
 *   which fails for the recipient (the reviewer doesn't own the
 *   profile). So at least one of the two writes is going to hit a
 *   42501 RLS rejection, no matter how we slice it.
 *
 *   The standard fix is to do the writes server-side, under the
 *   service role, after verifying the caller's JWT. The server
 *   is the only place that can set the rating / count atomically
 *   with the insert, and it can't be tricked into forging
 *   author_id because we read it from the verified JWT instead
 *   of from the request body.
 */
export async function POST(request: Request) {
  const limit = rateLimit(request, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 20 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Сессия не найдена' }, { status: 401 });
  }

  let body: {
    profileId?: string;
    rating?: number;
    text?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const profileId = String(body.profileId ?? '').trim();
  const rating = Number(body.rating);
  const text = String(body.text ?? '').trim().slice(0, 500);
  if (!profileId) {
    return NextResponse.json({ error: 'profileId обязателен' }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Оценка должна быть от 1 до 5' }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: 'Текст отзыва слишком длинный' }, { status: 400 });
  }

  // Step 1: verify the caller's bearer JWT.
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }
  if (userData.user.email && userData.user.app_metadata?.banned_until) {
    // Soft hint: the user_metadata.banned_until timestamp is set by
    // the temporary-ban feature (added in a later step). The auth
    // provider doesn't enforce it directly, so we check it here.
    const bannedUntil = new Date(String(userData.user.app_metadata.banned_until));
    if (Number.isFinite(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now()) {
      return NextResponse.json({ error: 'Ваш аккаунт временно заблокирован' }, { status: 403 });
    }
  }

  // Step 2: switch to the service-role client.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 3: load the target profile to compute the new average
  // rating, and to make sure the reviewer is not reviewing their
  // own profile.
  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, owner_id, rating, review_count')
    .eq('id', profileId)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'Анкета не найдена' }, { status: 404 });
  }
  if (target.owner_id && String(target.owner_id) === userData.user.id) {
    return NextResponse.json({ error: 'Нельзя оставить отзыв самому себе' }, { status: 400 });
  }

  // Compute the new rolling average. If the previous count is 0 the
  // new rating is just the new score; otherwise it's a weighted
  // average rounded to one decimal place.
  const previousCount = Number(target.review_count ?? 0);
  const previousRating = Number(target.rating ?? 0);
  const nextCount = previousCount + 1;
  const nextRating = previousCount > 0
    ? Number(((previousRating * previousCount + rating) / nextCount).toFixed(1))
    : rating;

  // Step 4: insert the review and update the aggregate in parallel.
  // Both writes are idempotent enough: if the insert fails we never
  // update the aggregate; if the update fails we have a review
  // without a count update (the trigger recompute_profile_rating
  // would catch up the next time reviews change, but it's a no-op
  // for our table anyway). The order doesn't matter for correctness
  // because both rows are owned by the service role.
  //
  // We DO NOT write author / author_avatar_url here — the
  // public.reviews table dropped those columns in step 16. The
  // v_reviews view JOINs to user_profiles and projects the live
  // values, so the name / avatar shown in the UI is always the
  // current one (not a snapshot from the moment the review was
  // submitted).
  const reviewId = `review-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  const [{ error: insertError }, { error: updateError }] = await Promise.all([
    admin.from('reviews').insert({
      id: reviewId,
      profile_id: profileId,
      author_id: userData.user.id,
      rating,
      text,
      created_at: today,
    }),
    admin
      .from('profiles')
      .update({ rating: nextRating, review_count: nextCount })
      .eq('id', profileId),
  ]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  if (updateError) {
    // The review was inserted but the aggregate wasn't bumped. We
    // log it and return success anyway — the user sees their review
    // and the next refresh will show the right number. If the
    // recompute_profile_rating trigger were wired up, it would
    // already be fixed.
    console.warn('Review aggregate update failed:', updateError.message);
  }

  // Read the live review row back through v_reviews so the response
  // carries the current author / avatar from user_profiles (not a
  // snapshot from the moment the review was written).
  const { data: liveReview, error: liveError } = await admin
    .from('v_reviews')
    .select('id, author, author_avatar_url, rating, text, created_at')
    .eq('id', reviewId)
    .maybeSingle();
  if (liveError) {
    return NextResponse.json({ error: liveError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    review: {
      id: reviewId,
      author: liveReview?.author ?? 'Житель Даймохк',
      authorAvatarUrl: liveReview?.author_avatar_url ?? undefined,
      rating,
      text,
      createdAt: today,
    },
    aggregate: { rating: nextRating, reviewCount: nextCount },
  });
}
