'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, MessageSquare, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/ui/EmptyState';
import { formatReviewDate } from '@/components/profile/profile-helpers';
import type { Profile } from '@/lib/types';

interface QuestionComment {
  id: string;
  question_id: string;
  author_id?: string;
  author_name: string;
  author_avatar_url?: string | null;
  comment: string;
  created_at: string;
  reply_to_id?: string | null;
  reply_to_author_id?: string | null;
  reply_to_author_name?: string | null;
}

async function requireSession(): Promise<string> {
  if (!supabase) throw new Error('Supabase не настроен — войдите снова.');
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Сессия истекла — войдите снова.');
  return accessToken;
}

/**
 * Вкладка «Вопросы»: список, обсуждение, ответы и форма нового вопроса.
 */
export default function ProfileQuestionsTab({
  profile,
  isOwnProfile,
  onOpenUser,
  onNotice,
  onCount,
}: {
  profile: Profile;
  isOwnProfile: boolean;
  onOpenUser: (userId?: string) => void;
  onNotice: (message: string) => void;
  onCount: (count: number) => void;
}) {
  const { account } = useAuth();
  const { t } = useI18n();
  const { createNotification } = useProfiles();
  const [questionText, setQuestionText] = useState('');
  const [questionBusy, setQuestionBusy] = useState(false);
  const [questions, setQuestions] = useState<Array<{
    id: string;
    author_id?: string;
    author_name: string;
    author_avatar_url?: string | null;
    question: string;
    comment_count?: number;
    created_at: string;
  }>>([]);
  const [commentsByQuestion, setCommentsByQuestion] = useState<Record<string, QuestionComment[]>>({});
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentsLoading, setCommentsLoading] = useState<string | null>(null);
  const [replyTargets, setReplyTargets] = useState<Record<string, { id: string; name: string } | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState('');

  useEffect(() => {
    setQuestionText('');
    setCommentsByQuestion({});
    setExpandedQuestion(null);
    setCommentDrafts({});
    setReplyTargets({});
    setEditingQuestionId(null);
  }, [profile.id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/profile-questions?profileId=${encodeURIComponent(profile.id)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQuestions(Array.isArray(data.questions) ? data.questions : []);
      } catch {
        // Сеть моргнула — оставляем прежний список.
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [profile.id]);

  useEffect(() => {
    onCount(questions.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  const canDeleteBy = (authorId?: string) =>
    Boolean(
      account &&
      !account.isBlocked &&
      (account.id === authorId || account.id === profile.ownerId || account.isAdmin),
    );
  const canEditBy = (authorId?: string) =>
    Boolean(account && !account.isBlocked && account.id === authorId);

  const handleQuestionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account) {
      onNotice('Войдите через Google, чтобы задать вопрос.');
      return;
    }
    if (isOwnProfile) return;
    const trimmed = questionText.trim().slice(0, 500);
    if (trimmed.length < 1) {
      onNotice('Введите текст вопроса.');
      return;
    }
    setQuestionBusy(true);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/profile-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ profileId: profile.id, question: trimmed }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось отправить вопрос.');
      }
      const result = await response.json();
      setQuestions((current) => [result.question, ...current]);
      setQuestionText('');
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось отправить вопрос.');
    } finally {
      setQuestionBusy(false);
    }
  };

  const loadComments = async (questionId: string) => {
    setCommentsLoading(questionId);
    try {
      const response = await fetch(`/api/question-comments?questionId=${encodeURIComponent(questionId)}`, { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      const comments = Array.isArray(result.comments) ? result.comments : [];
      setCommentsByQuestion((current) => ({ ...current, [questionId]: comments }));
      setQuestions((current) => current.map((q) => (q.id === questionId ? { ...q, comment_count: comments.length } : q)));
    } catch {
      // Сеть моргнула.
    } finally {
      setCommentsLoading(null);
    }
  };

  const toggleDiscussion = (questionId: string) => {
    if (expandedQuestion === questionId) {
      setExpandedQuestion(null);
      return;
    }
    setExpandedQuestion(questionId);
    if (!commentsByQuestion[questionId] && commentsLoading !== questionId) {
      void loadComments(questionId);
    }
  };

  const handleCommentSubmit = async (event: React.FormEvent, questionId: string) => {
    event.preventDefault();
    if (!account) {
      onNotice('Войдите через Google, чтобы оставить комментарий.');
      return;
    }
    if (busyId) return;
    const comment = (commentDrafts[questionId] ?? '').trim().slice(0, 500);
    if (comment.length < 1) {
      onNotice('Введите текст комментария.');
      return;
    }
    const replyToId = replyTargets[questionId]?.id;
    setBusyId(`comment-${questionId}`);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/question-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ questionId, comment, replyToId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось отправить комментарий.');
      }
      const result = await response.json();
      if (result.comment) {
        setCommentsByQuestion((current) => ({
          ...current,
          [questionId]: [...(current[questionId] ?? []), result.comment],
        }));
        setQuestions((current) => current.map((q) => (q.id === questionId ? { ...q, comment_count: (q.comment_count ?? 0) + 1 } : q)));
        setCommentDrafts((drafts) => {
          const next = { ...drafts };
          delete next[questionId];
          return next;
        });
        setReplyTargets((targets) => {
          const next = { ...targets };
          delete next[questionId];
          return next;
        });
        if (profile.ownerId && profile.ownerId !== account.id) {
          void createNotification(
            profile.ownerId,
            'comment_replied',
            'Новый комментарий',
            `${account.fullName || 'Кто-то'} оставил комментарий в обсуждении вашей анкеты.`,
            'Керла комментарий',
            `${account.fullName || 'Цхьаммо'} хьан анкетан хьежамехь комментарий йаздина.`,
          );
        }
      }
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось отправить комментарий.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteComment = async (commentId: string, questionId: string) => {
    if (!account || busyId) return;
    setBusyId(commentId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/question-comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ commentId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось удалить комментарий.');
      }
      setCommentsByQuestion((current) => ({
        ...current,
        [questionId]: (current[questionId] ?? []).filter((comment) => comment.id !== commentId),
      }));
      setQuestions((current) => current.map((q) => (q.id === questionId ? { ...q, comment_count: Math.max(0, (q.comment_count ?? 0) - 1) } : q)));
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось удалить комментарий.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReplyToComment = (questionId: string, comment: QuestionComment) => {
    const name = comment.author_name || 'Житель Даймохк';
    setReplyTargets((targets) => ({ ...targets, [questionId]: { id: comment.id, name } }));
    setCommentDrafts((drafts) => {
      const base = drafts[questionId] ?? '';
      const prefix = `${name}, `;
      return { ...drafts, [questionId]: base.startsWith(prefix) ? base : `${prefix}${base}` };
    });
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!account || busyId) return;
    setBusyId(questionId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/profile-questions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ questionId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось удалить вопрос.');
      }
      setQuestions((current) => current.filter((q) => q.id !== questionId));
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось удалить вопрос.');
    } finally {
      setBusyId(null);
    }
  };

  const startEditQuestion = (q: { id: string; question: string; author_id?: string }) => {
    if (!account || account.id !== q.author_id) return;
    setEditingQuestionId(q.id);
    setEditQuestionText(q.question);
  };

  const handleEditQuestionSubmit = async (event: React.FormEvent, questionId: string) => {
    event.preventDefault();
    if (!account || busyId) return;
    const trimmed = editQuestionText.trim().slice(0, 500);
    if (trimmed.length < 1) {
      onNotice('Введите текст вопроса.');
      return;
    }
    setBusyId(questionId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/profile-questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ questionId, question: trimmed }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось изменить вопрос.');
      }
      const result = await response.json();
      const updated = result.question;
      setQuestions((current) => current.map((q) => (q.id === questionId ? {
        ...q,
        question: String(updated?.question ?? trimmed),
        created_at: String(updated?.created_at ?? q.created_at),
      } : q)));
      setEditingQuestionId(null);
      onNotice('');
    } catch (submitError) {
      onNotice(submitError instanceof Error ? submitError.message : 'Не удалось изменить вопрос.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      {questions.length > 0 ? (
        <div className="space-y-1.5">
          {questions.map((q) => (
            <article key={q.id} className="smk-sheet-row p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center">
                    {q.author_avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.author_avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="smk-text-label font-bold text-slate-500">{(q.author_name || 'Ж').charAt(0)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenUser(q.author_id)}
                    title={t.profileOpenUserCard}
                    className="min-w-0 truncate text-xs font-bold text-slate-900 transition hover:text-emerald-600 hover:underline dark:text-white dark:hover:text-emerald-400"
                  >
                    {q.author_name || 'Житель Даймохк'}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <time className="smk-meta smk-text-label font-medium">{formatReviewDate(q.created_at)}</time>
                  {canEditBy(q.author_id) && editingQuestionId !== q.id && (
                    <button
                      type="button"
                      onClick={() => startEditQuestion(q)}
                      disabled={busyId !== null}
                      aria-label={t.profileEditQuestion}
                      title={t.edit}
                      className="smk-act flex h-6 w-6 items-center justify-center"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDeleteBy(q.author_id) && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteQuestion(q.id)}
                      disabled={busyId === q.id}
                      aria-label={t.profileDeleteQuestion}
                      title={t.profileDeleteQuestion}
                      className="smk-act smk-act--danger flex h-6 w-6 items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {editingQuestionId === q.id ? (
                <form onSubmit={(event) => void handleEditQuestionSubmit(event, q.id)} className="mt-2 space-y-2 rounded-xl smk-sheet-row p-2.5">
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={editQuestionText}
                    onChange={(event) => setEditQuestionText(event.target.value)}
                    placeholder={t.profileQuestionTextLabel}
                    className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                  />
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={busyId === q.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 smk-text-label font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                      {busyId === q.id ? t.saving : t.save}
                    </button>
                    <button type="button" onClick={() => setEditingQuestionId(null)} disabled={busyId === q.id} className="rounded-lg bg-slate-100 px-3 py-1.5 smk-text-label font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                      {t.cancel}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-1 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{q.question}</p>
              )}

              <button
                type="button"
                onClick={() => toggleDiscussion(q.id)}
                aria-expanded={expandedQuestion === q.id}
                className="mt-1.5 inline-flex items-center gap-1 smk-text-label font-bold text-emerald-600 transition hover:underline dark:text-emerald-400"
              >
                <MessageSquare className="h-3 w-3" />
                {t.profileDiscussion} ({q.comment_count ?? commentsByQuestion[q.id]?.length ?? 0})
                <ChevronDown className={`h-3 w-3 transition-transform ${expandedQuestion === q.id ? 'rotate-180' : ''}`} />
              </button>

              {expandedQuestion === q.id && (
                <div className="mt-2 space-y-2 rounded-lg smk-sheet-row p-2.5">
                  {commentsLoading === q.id ? (
                    <p className="smk-meta smk-text-label">{t.profileCommentsLoading}</p>
                  ) : (commentsByQuestion[q.id] ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {(commentsByQuestion[q.id] ?? []).map((comment) => (
                        <div key={comment.id} className="flex items-start gap-2">
                          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center">
                            {comment.author_avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={comment.author_avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="smk-text-label font-bold text-slate-500">{(comment.author_name || 'Ж').charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onOpenUser(comment.author_id)}
                                className="min-w-0 truncate smk-text-label font-bold text-slate-900 hover:text-emerald-600 hover:underline dark:text-white dark:hover:text-emerald-400"
                                title={t.profileOpenUserCard}
                              >
                                {comment.author_name || 'Житель Даймохк'}
                              </button>
                              {comment.author_id === profile.ownerId && (
                                <span className="shrink-0 rounded bg-emerald-100 px-1 py-px smk-text-label font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                                  {t.profileSheetOwner}
                                </span>
                              )}
                              <time className="smk-meta shrink-0 smk-text-label font-medium">{formatReviewDate(comment.created_at)}</time>
                            </div>
                            <p className="mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap smk-text-label leading-relaxed text-slate-600 dark:text-zinc-400">
                              {comment.reply_to_author_name && comment.comment.startsWith(`${comment.reply_to_author_name}, `) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onOpenUser(comment.reply_to_author_id ?? undefined)}
                                    className="font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                                    title={t.profileOpenUserCard}
                                  >
                                    {comment.reply_to_author_name}
                                  </button>
                                  {comment.comment.slice(comment.reply_to_author_name.length)}
                                </>
                              ) : (
                                comment.comment
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-center gap-1">
                            {account && !account.isBlocked && (
                              <button
                                type="button"
                                onClick={() => handleReplyToComment(q.id, comment)}
                                disabled={busyId !== null}
                                aria-label={t.profileReplyAction}
                                title={t.profileReplyAction}
                                className="smk-act flex h-5 w-5 items-center justify-center"
                              >
                                <MessageSquare className="h-3 w-3" />
                              </button>
                            )}
                            {canDeleteBy(comment.author_id) && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteComment(comment.id, q.id)}
                                disabled={busyId === comment.id}
                                aria-label={t.profileDeleteComment}
                                title={t.profileDeleteComment}
                                className="smk-act smk-act--danger flex h-5 w-5 items-center justify-center"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="smk-meta smk-text-label">{t.profileNoComments}</p>
                  )}

                  {account && !account.isBlocked ? (
                    <form
                      onSubmit={(event) => void handleCommentSubmit(event, q.id)}
                      className="space-y-1.5"
                    >
                      {replyTargets[q.id] && (
                        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-2 py-1 smk-text-label text-slate-600 dark:bg-emerald-950/40 dark:text-zinc-300">
                          <span>
                            {t.profileReplyTo} <span className="font-bold text-emerald-700 dark:text-emerald-400">@{replyTargets[q.id]?.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setReplyTargets((targets) => ({ ...targets, [q.id]: null }))}
                            className="smk-act smk-act--danger flex h-4 w-4 items-center justify-center"
                            aria-label={t.profileReplyCancel}
                            title={t.profileReplyCancel}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={commentDrafts[q.id] ?? ''}
                          onChange={(event) =>
                            setCommentDrafts((drafts) => ({ ...drafts, [q.id]: event.target.value }))
                          }
                          placeholder={t.profileCommentPlaceholder}
                          className="w-full min-w-0 resize-y break-words rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        />
                        <button
                          type="submit"
                          disabled={busyId === `comment-${q.id}`}
                          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 smk-text-label font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyId === `comment-${q.id}` ? t.profileSending : t.profileSend}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="smk-meta smk-text-label">{t.profileSignInToComment}</p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title={t.profileNoQuestions} />
      )}

      {isOwnProfile ? (
        <p className="smk-sheet-row mt-2 p-2.5 smk-text-label text-slate-500 dark:text-zinc-500">{t.profileOwnQuestionBlocked}</p>
      ) : account && !account.isBlocked ? (
        <form onSubmit={handleQuestionSubmit} className="smk-sheet-row mt-2 space-y-2 p-2.5">
          <h4 className="smk-sheet-label">{t.profileAskQuestion}</h4>
          <div>
            <textarea
              rows={2}
              maxLength={500}
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              placeholder={t.profileQuestionPlaceholder}
              className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
            />
            <p className="smk-meta mt-0.5 text-right smk-text-label">{questionText.length}/500</p>
          </div>
          <button type="submit" disabled={questionBusy} className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
            {questionBusy ? t.profileSending : t.profileSend}
          </button>
        </form>
      ) : (
        <p className="smk-sheet-row mt-2 p-2.5 smk-text-label text-slate-500 dark:text-zinc-500">{t.profileSignInToAsk}</p>
      )}
    </div>
  );
}
