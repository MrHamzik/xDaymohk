import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { isAdminEmail } from '@/lib/admin';

// Read environment once at module load so both handlers can share
// the same values without re-parsing process.env on every request.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * Questions on a profile.
 *
 *   POST   /api/profile-questions   — ask a new question (authenticated)
 *   GET    /api/profile-questions   — list questions for a profile (public)
 *   DELETE /api/profile-questions   — delete a question
 *                                     (its author, the анкета owner, or admin)
 *
 * Discussion under each question lives in /api/question-comments (step 18).
 *
 * Auth: every mutating handler requires an authenticated bearer JWT. We
 * use the service role to write so we don't have to play RLS gymnastics
 * with the auth.uid() text/UUID cast (the same trap we hit with
 * complaints and reviews). GET is public — the questions table has
 * `public read` RLS and the list view is the same.
 */

const QUESTION_SELECT =
  'id, profile_id, author_id, author_name, author_avatar_url, question, created_at, comment_count';

interface VerifiedUser {
  id: string;
  email?: string | null;
}

/** Verify the bearer JWT and return the caller, or a JSON error response. */
async function verifyCaller(request: Request): Promise<VerifiedUser | NextResponse> {
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'Войдите, чтобы продолжить' }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
  }
  return { id: userData.user.id, email: userData.user.email };
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function rateLimited(request: Request, limit: number) {
  const info = await rateLimit(request, { limit, windowMs: 60_000 });
  if (!info.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      { ...info, limit },
    );
  }
  return undefined;
}

export async function POST(request: Request) {
  const limited = await rateLimited(request, 20);
  if (limited) return limited;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const caller = await verifyCaller(request);
  if (caller instanceof NextResponse) return caller;

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

  // Make sure the target profile exists. RLS would also protect us, but
  // we'd rather give a precise 404.
  const admin = adminClient();
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
  if (profile.owner_id && String(profile.owner_id) === caller.id) {
    return NextResponse.json({ error: 'Нельзя задать вопрос самому себе' }, { status: 400 });
  }

  // Insert the question. We do NOT write author_name / author_avatar_url
  // here — those columns were dropped in step 16 in favour of the
  // v_profile_questions view, which resolves the live display name /
  // avatar through v_user_display (step 17). The result returned to the
  // client is read back through the view below so the API responds with
  // the same field names the UI has always used.
  const id = `question-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await admin
    .from('profile_questions')
    .insert({
      id,
      profile_id: profileId,
      author_id: caller.id,
      question,
      created_at: today,
    })
    .select('id, profile_id, author_id, question, created_at')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Re-read through v_profile_questions so the response carries the
  // live author_name / author_avatar_url from user_profiles.
  const { data: liveQuestion, error: liveError } = await admin
    .from('v_profile_questions')
    .select(QUESTION_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (liveError) {
    return NextResponse.json({ error: liveError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, question: liveQuestion ?? data });
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
  // Read through v_profile_questions so the response carries the
  // live author_name / author_avatar_url. created_at is a DATE (no time
  // component), so items posted on the same day would come back in
  // arbitrary order — tie-break by id, which embeds a millisecond
  // timestamp (newest first).
  const { data, error } = await anon
    .from('v_profile_questions')
    .select(QUESTION_SELECT)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ questions: data ?? [] });
}

/**
 * PATCH — edit a question's text. Only its AUTHOR may edit (like the
 * reviews PATCH: the анкета owner and admins can only delete).
 *
 * Editing moves created_at to today — the user asked for the shown
 * date to reflect the last edit. The response is re-read through
 * v_profile_questions so it carries the live author_name / avatar.
 */
export async function PATCH(request: Request) {
  const limited = await rateLimited(request, 20);
  if (limited) return limited;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const caller = await verifyCaller(request);
  if (caller instanceof NextResponse) return caller;

  let body: { questionId?: string; question?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const questionId = String(body.questionId ?? '').trim();
  const question = String(body.question ?? '').trim();
  if (!questionId) {
    return NextResponse.json({ error: 'questionId обязателен' }, { status: 400 });
  }
  if (question.length < 1 || question.length > 500) {
    return NextResponse.json({ error: 'Вопрос должен быть от 1 до 500 символов' }, { status: 400 });
  }

  const admin = adminClient();

  const { data: existing, error: fetchError } = await admin
    .from('profile_questions')
    .select('id, author_id')
    .eq('id', questionId)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Вопрос не найден' }, { status: 404 });
  }
  if (String(existing.author_id ?? '') !== caller.id) {
    return NextResponse.json({ error: 'Изменять вопрос может только его автор' }, { status: 403 });
  }

  const today = new Date().toISOString().split('T')[0];
  const { error: updateError } = await admin
    .from('profile_questions')
    .update({ question, created_at: today })
    .eq('id', questionId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: liveQuestion } = await admin
    .from('v_profile_questions')
    .select(QUESTION_SELECT)
    .eq('id', questionId)
    .maybeSingle();

  return NextResponse.json({ success: true, question: liveQuestion ?? { id: questionId, question, created_at: today } });
}

/**
 * DELETE — remove a question. Allowed for the question's author, the
 * owner of the анкета it belongs to, and admins.
 */
export async function DELETE(request: Request) {
  const limited = await rateLimited(request, 30);
  if (limited) return limited;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const caller = await verifyCaller(request);
  if (caller instanceof NextResponse) return caller;

  let body: { questionId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const questionId = String(body.questionId ?? '').trim();
  if (!questionId) {
    return NextResponse.json({ error: 'questionId обязателен' }, { status: 400 });
  }

  const admin = adminClient();

  const { data: question, error: questionError } = await admin
    .from('profile_questions')
    .select('id, profile_id, author_id')
    .eq('id', questionId)
    .maybeSingle();
  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 });
  }
  if (!question) {
    return NextResponse.json({ error: 'Вопрос не найден' }, { status: 404 });
  }

  // Permission: the author, the анкета owner, or an admin.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, owner_id')
    .eq('id', question.profile_id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  const isAuthor = String(question.author_id ?? '') === caller.id;
  const isOwner = Boolean(profile && String(profile.owner_id ?? '') === caller.id);
  const isAdmin = isAdminEmail(caller.email);
  if (!profile || (!isAuthor && !isOwner && !isAdmin)) {
    return NextResponse.json({ error: 'Удалять вопрос может только его автор, владелец анкеты или админ' }, { status: 403 });
  }

  const { error: deleteError } = await admin
    .from('profile_questions')
    .delete()
    .eq('id', questionId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, questionId });
}
