import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { areUsersBlocked, BLOCKED_MESSAGE } from '@/lib/blacklist';
import { isAdminEmail } from '@/lib/admin';

// Read environment once at module load so all handlers share the same
// values without re-parsing process.env on every request.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * Inline discussion (comments) under a profile question.
 *
 *   POST   /api/question-comments   — leave a comment (authenticated)
 *   GET    /api/question-comments   — list comments for a question (public)
 *   DELETE /api/question-comments   — delete a comment
 *                                     (its author, the анкета owner, or admin)
 *
 * Same auth pattern as /api/profile-questions: mutating handlers verify
 * the bearer JWT and write with the service role; GET is public and reads
 * through v_question_comments so the live author name / avatar resolve.
 */

const COMMENT_SELECT =
  'id, question_id, author_id, author_name, author_avatar_url, comment, created_at, reply_to_id, reply_to_author_id, reply_to_author_name';

interface VerifiedUser {
  id: string;
  email?: string | null;
}

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
  const info = await rateLimit(request, { limit, windowMs: 60_000 , scope: 'question-comments' });
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

  let body: { questionId?: string; comment?: string; replyToId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const questionId = String(body.questionId ?? '').trim();
  const comment = String(body.comment ?? '').trim();
  const replyToId = String(body.replyToId ?? '').trim();
  if (!questionId) {
    return NextResponse.json({ error: 'questionId обязателен' }, { status: 400 });
  }
  if (comment.length < 1 || comment.length > 500) {
    return NextResponse.json({ error: 'Комментарий должен быть от 1 до 500 символов' }, { status: 400 });
  }

  const admin = adminClient();

  // The question must exist (FK would also protect us, but a precise 404
  // is friendlier than a constraint error).
  const { data: question, error: questionError } = await admin
    .from('profile_questions')
    .select('id, profile_id')
    .eq('id', questionId)
    .maybeSingle();
  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 });
  }
  if (!question) {
    return NextResponse.json({ error: 'Вопрос не найден' }, { status: 404 });
  }

  // Чёрный список (обновление 32): комментировать обсуждение в анкете
  // человека, с которым есть взаимная блокировка, нельзя.
  const { data: hostProfile } = await admin
    .from('profiles')
    .select('owner_id')
    .eq('id', question.profile_id ?? '')
    .maybeSingle();
  if (await areUsersBlocked(admin, caller.id, hostProfile?.owner_id)) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 403 });
  }

  // If this is a reply, the target comment must exist and belong to the
  // same question (the FK would reject a foreign one anyway, but a clear
  // message beats a constraint error).
  if (replyToId) {
    const { data: parent, error: parentError } = await admin
      .from('profile_question_comments')
      .select('id, question_id')
      .eq('id', replyToId)
      .maybeSingle();
    if (parentError) {
      return NextResponse.json({ error: parentError.message }, { status: 500 });
    }
    if (!parent) {
      return NextResponse.json({ error: 'Комментарий, на который вы отвечаете, не найден' }, { status: 404 });
    }
    if (parent.question_id !== questionId) {
      return NextResponse.json({ error: 'Нельзя ответить на комментарий из другого вопроса' }, { status: 400 });
    }
  }

  const id = `comment-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  const { error: insertError } = await admin
    .from('profile_question_comments')
    .insert({
      id,
      question_id: questionId,
      author_id: caller.id,
      comment,
      reply_to_id: replyToId || null,
      created_at: today,
    });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Re-read through v_question_comments so the response carries the
  // live author_name / author_avatar_url from user_profiles.
  const { data: liveComment, error: liveError } = await admin
    .from('v_question_comments')
    .select(COMMENT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (liveError) {
    return NextResponse.json({ error: liveError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, comment: liveComment });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const questionId = url.searchParams.get('questionId')?.trim();
  if (!questionId) {
    return NextResponse.json({ error: 'questionId обязателен' }, { status: 400 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ comments: [] });
  }

  // GET is public. Comments are shown in reading order (oldest first) so
  // the discussion reads naturally top-down; within the same day the id
  // tie-break (millisecond timestamp) keeps the order stable.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon
    .from('v_question_comments')
    .select(COMMENT_SELECT)
    .eq('question_id', questionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ comments: data ?? [] });
}

/**
 * DELETE — remove a comment. Allowed for the comment's author, the owner
 * of the анкета the question belongs to, and admins.
 */
export async function DELETE(request: Request) {
  const limited = await rateLimited(request, 30);
  if (limited) return limited;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const caller = await verifyCaller(request);
  if (caller instanceof NextResponse) return caller;

  let body: { commentId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  const commentId = String(body.commentId ?? '').trim();
  if (!commentId) {
    return NextResponse.json({ error: 'commentId обязателен' }, { status: 400 });
  }

  const admin = adminClient();

  const { data: comment, error: commentError } = await admin
    .from('profile_question_comments')
    .select('id, question_id, author_id')
    .eq('id', commentId)
    .maybeSingle();
  if (commentError) {
    return NextResponse.json({ error: commentError.message }, { status: 500 });
  }
  if (!comment) {
    return NextResponse.json({ error: 'Комментарий не найден' }, { status: 404 });
  }

  // Permission: author / анкета owner / admin.
  const { data: question, error: questionError } = await admin
    .from('profile_questions')
    .select('id, profile_id')
    .eq('id', comment.question_id)
    .maybeSingle();
  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 });
  }
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, owner_id')
    .eq('id', question?.profile_id ?? '')
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const isAuthor = String(comment.author_id ?? '') === caller.id;
  const isOwner = Boolean(profile && String(profile.owner_id ?? '') === caller.id);
  const isAdmin = isAdminEmail(caller.email);
  if (!question || !profile || (!isAuthor && !isOwner && !isAdmin)) {
    return NextResponse.json({ error: 'Удалять комментарий может только его автор, владелец анкеты или админ' }, { status: 403 });
  }

  const { error: deleteError } = await admin
    .from('profile_question_comments')
    .delete()
    .eq('id', commentId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, commentId });
}
