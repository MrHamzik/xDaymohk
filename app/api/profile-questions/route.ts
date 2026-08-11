import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';

// Read environment once at module load so both handlers can share
// the same values without re-parsing process.env on every request.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * POST: ask a new question on a profile.
 * GET:  list the existing questions for a profile (used by the
 *       profile modal).
 *
 * Auth: POST requires an authenticated bearer JWT. We use the
 * service role to write so we don't have to play RLS gymnastics
 * with the auth.uid() text/UUID cast (the same trap we hit with
 * complaints and reviews). GET is public — the questions table
 * has `public read` RLS and the list view is the same.
 */
export async function POST(request: Request) {
  const limit = rateLimit(request, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...limit, limit: 20 },
    );
  }

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Войдите, чтобы задать вопрос' }, { status: 401 });
  }

  let body: { profileId?: string; question?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const profileId = String(body.profileId ?? '').trim();
  const question = String(body.question ?? '').trim();
  if (!profileId) {
    return NextResponse.json({ error: 'profileId обязателен' }, { status: 400 });
  }
  if (question.length < 1 || question.length > 500) {
    return NextResponse.json({ error: 'Вопрос должен быть от 1 до 500 символов' }, { status: 400 });
  }

  // Step 1: verify the caller.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }

  // Step 2: make sure the target profile exists. RLS would also
  // protect us, but we'd rather give a precise 404.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, owner_id')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'Анкета не найдена' }, { status: 404 });
  }
  if (profile.owner_id && String(profile.owner_id) === userData.user.id) {
    return NextResponse.json({ error: 'Нельзя задать вопрос самому себе' }, { status: 400 });
  }

  // Step 3: insert the question. Source-of-truth for the author's
  // display name and avatar is user_profiles (not auth.users
  // user_metadata, which is a stale Google cache). We fall back
  // to the Google metadata only if user_profiles is missing, and
  // to a generic placeholder if both are empty.
  const id = `question-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  const { data: accountRow, error: accountError } = await admin
    .from('user_profiles')
    .select('full_name, avatar_url')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 });
  }
  const fullName = String(
    accountRow?.full_name
    ?? userData.user.user_metadata?.full_name
    ?? userData.user.user_metadata?.name
    ?? 'Житель Даймохк',
  );
  const avatarUrl = String(
    accountRow?.avatar_url
    ?? userData.user.user_metadata?.avatar_url
    ?? '',
  );
  const { data, error } = await admin
    .from('profile_questions')
    .insert({
      id,
      profile_id: profileId,
      author_id: userData.user.id,
      author_name: fullName,
      author_avatar_url: avatarUrl || null,
      question,
      created_at: today,
    })
    .select('id, profile_id, author_id, author_name, author_avatar_url, question, created_at')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, question: data });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get('profileId')?.trim();
  if (!profileId) {
    return NextResponse.json({ error: 'profileId обязателен' }, { status: 400 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ questions: [] });
  }

  // GET is public — anyone can read questions on a profile. We use
  // the anon client (which honours the public-read RLS policy).
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon
    .from('profile_questions')
    .select('id, profile_id, author_id, author_name, author_avatar_url, question, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ questions: data ?? [] });
}
