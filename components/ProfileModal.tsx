'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Ban, ChevronDown, Clock, ExternalLink, Flag, MapPin, MessageSquare, Pencil, Phone, Send, Star, Trash2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { Certificate, Profile, Review } from '@/lib/types';
import { calculateAge, formatReviews } from '@/lib/text';
import ResidentReputation from '@/components/tasks/ResidentReputation';
import { calculateWorkingStatus } from '@/lib/schedule';
import Notice from '@/components/Notice';
import ProfileBadges, { WorkingStatusBadge } from '@/components/ProfileBadges';
import { cacheBustAvatarUrl } from '@/lib/media';

interface ProfileModalProps {
  profile: Profile | null;
  onClose: () => void;
  onReview?: (profileId: string, review: Omit<Review, 'id' | 'createdAt'>) => void;
  /** The role of the account that owns this profile. */
  isAdminStatus?: boolean;
  showPending?: boolean;
  canReport?: boolean;
  onReport?: () => void;
  canBlock?: boolean;
  onBlock?: () => void;
  isViewerBlocked?: boolean;
}

/** One comment in the inline discussion under a question. */
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

function getYoutubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace('www.', '');
    if (hostname !== 'youtu.be' && hostname !== 'youtube.com') return null;
    const videoId = hostname === 'youtu.be'
      ? url.pathname.slice(1)
      : url.searchParams.get('v') ?? (url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : '');
    return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : null;
  } catch {
    return null;
  }
}

const MAX_REVIEW_TEXT_LENGTH = 500;

function formatReviewDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ru-RU').format(date);
}

/**
 * Достаёт ID видео из ссылки YouTube (watch?v=, youtu.be/, /embed/, /shorts/).
 * Возвращает null для любых других ссылок — в iframe вставляем ТОЛЬКО
 * youtube-nocookie.com/embed/<id>, произвольные URL не рендерим.
 */
function youtubeEmbedId(url?: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'www.youtube-nocookie.com') {
    if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.split('/')[2];
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
    const v = parsed.searchParams.get('v');
    return v && /^[A-Za-z0-9_-]{6,}$/.test(v) ? v : null;
  }
  return null;
}

export default function ProfileModal({
  profile,
  onClose,
  onReview,
  isAdminStatus = false,
  showPending = false,
  canReport = false,
  onReport,
  canBlock = false,
  onBlock,
  isViewerBlocked = false,
}: ProfileModalProps) {
  const { account } = useAuth();
  const { language, t } = useI18n();
  const { profiles: allProfiles, users: allUsers, isProfileAdmin, createNotification } = useProfiles();
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  // A user card opened from a name link renders as a nested ProfileModal
  // on top of this one; closing it returns to this анкета instead of
  // closing everything and dropping back to the catalog.
  const [nestedProfile, setNestedProfile] = useState<Profile | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [activeTab, setActiveTab] = useState<'reviews' | 'questions' | 'ratings'>('reviews');
  const [notice, setNotice] = useState('');
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
  // Inline discussion under each question: loaded comments per question id,
  // which question is expanded, draft comments, and which question's
  // comments are currently loading.
  const [commentsByQuestion, setCommentsByQuestion] = useState<Record<string, QuestionComment[]>>({});
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentsLoading, setCommentsLoading] = useState<string | null>(null);
  // "Ответить" target per question: the comment being replied to.
  const [replyTargets, setReplyTargets] = useState<Record<string, { id: string; name: string } | null>>({});
  // Id of the review / question / comment currently being deleted.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Local copy of the reviews list so deletions reflect immediately
  // without waiting for a full provider refresh.
  const [localReviews, setLocalReviews] = useState<Review[] | null>(null);
  // Inline editing state: which review / question is being edited and
  // the current draft. Editing my own review also re-picks the rating.
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editReviewText, setEditReviewText] = useState('');
  const [editReviewRating, setEditReviewRating] = useState(0);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState('');

  useEffect(() => {
    setReviewRating(0);
    setReviewText('');
    setNotice('');
    setSelectedCert(null);
    setQuestionText('');
    setCommentsByQuestion({});
    setExpandedQuestion(null);
    setCommentDrafts({});
    setReplyTargets({});
    setLocalReviews(null);
    setEditingReviewId(null);
    setEditingQuestionId(null);
  }, [profile?.id]);

  // Load the latest questions for this profile every time the modal opens —
  // the list is also used for the "ВОПРОСЫ (N)" counter in the tab header.
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/profile-questions?profileId=${encodeURIComponent(profile.id)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQuestions(Array.isArray(data.questions) ? data.questions : []);
      } catch {
        // Network blip — leave the previous list in place.
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const handleQuestionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account) {
      setNotice('Войдите через Google, чтобы задать вопрос.');
      return;
    }
    if (!profile?.id) return;
    if (isOwnProfile) return;
    const trimmed = questionText.trim().slice(0, 500);
    if (trimmed.length < 1) {
      setNotice('Введите текст вопроса.');
      return;
    }
    setQuestionBusy(true);
    try {
      if (!supabase) {
        throw new Error('Supabase не настроен — войдите снова.');
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Сессия истекла — войдите снова.');
      const response = await fetch('/api/profile-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ profileId: profile.id, question: trimmed }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось отправить вопрос.');
      }
      const result = await response.json();
      setQuestions((current) => [result.question, ...current]);
      setQuestionText('');
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось отправить вопрос.');
    } finally {
      setQuestionBusy(false);
    }
  };

  /** Resolve the current access token for API calls. */
  const requireSession = async (): Promise<string> => {
    if (!supabase) {
      throw new Error('Supabase не настроен — войдите снова.');
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('Сессия истекла — войдите снова.');
    return accessToken;
  };

  /** Toggle the collapsible discussion under a question, loading the
   *  comments on first expand. */
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

  const loadComments = async (questionId: string) => {
    setCommentsLoading(questionId);
    try {
      const response = await fetch(`/api/question-comments?questionId=${encodeURIComponent(questionId)}`, { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      const comments = Array.isArray(result.comments) ? result.comments : [];
      setCommentsByQuestion((current) => ({ ...current, [questionId]: comments }));
      // Keep the "Обсуждение (N)" counter in sync with the loaded thread.
      setQuestions((current) => current.map((q) => (q.id === questionId ? { ...q, comment_count: comments.length } : q)));
    } catch {
      // Network blip — leave the previous state in place.
    } finally {
      setCommentsLoading(null);
    }
  };

  const handleCommentSubmit = async (event: React.FormEvent, questionId: string) => {
    event.preventDefault();
    if (!account) {
      setNotice('Войдите через Google, чтобы оставить комментарий.');
      return;
    }
    if (busyId) return;
    const comment = (commentDrafts[questionId] ?? '').trim().slice(0, 500);
    if (comment.length < 1) {
      setNotice('Введите текст комментария.');
      return;
    }
    const replyToId = replyTargets[questionId]?.id;
    setBusyId(`comment-${questionId}`);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/question-comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
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
        if (profile?.ownerId && profile.ownerId !== account.id) {
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
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось отправить комментарий.');
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
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
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось удалить комментарий.');
    } finally {
      setBusyId(null);
    }
  };

  /** "Ответить" on a comment: remember the target and pre-fill "Имя, ". */
  const handleReplyToComment = (questionId: string, comment: QuestionComment) => {
    const name = comment.author_name || 'Житель Даймохк';
    setReplyTargets((targets) => ({ ...targets, [questionId]: { id: comment.id, name } }));
    setCommentDrafts((drafts) => {
      const base = drafts[questionId] ?? '';
      const prefix = `${name}, `;
      return { ...drafts, [questionId]: base.startsWith(prefix) ? base : `${prefix}${base}` };
    });
  };

  const clearReply = (questionId: string) => {
    setReplyTargets((targets) => ({ ...targets, [questionId]: null }));
  };

  /** Open the user's personal card (their personal profile, or any of their
   *  profiles as a fallback) — used by the clickable "@Имя" links. */
  const openUserCard = (userId?: string) => {
    if (!userId) return;
    const card = allProfiles.find((p) => p.ownerId === userId && p.isPersonal)
      ?? allProfiles.find((p) => p.ownerId === userId);
    if (card) setNestedProfile(card);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!account || busyId) return;
    setBusyId(questionId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/profile-questions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ questionId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось удалить вопрос.');
      }
      setQuestions((current) => current.filter((q) => q.id !== questionId));
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось удалить вопрос.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!account || busyId) return;
    setBusyId(reviewId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/reviews', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reviewId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось удалить отзыв.');
      }
      setLocalReviews((current) => (current ?? profile?.reviews ?? []).filter((r) => r.id !== reviewId));
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось удалить отзыв.');
    } finally {
      setBusyId(null);
    }
  };

  /** Open the inline editor for my own review (text + stars). */
  const startEditReview = (review: Review) => {
    if (!account || account.id !== review.authorId) return;
    setEditingQuestionId(null);
    setEditingReviewId(review.id);
    setEditReviewText(review.text);
    setEditReviewRating(review.rating);
  };

  /** Save the edited review through PATCH /api/reviews. The server moves
   *  created_at to today, so the date beside the review updates too. */
  const handleEditReviewSubmit = async (event: React.FormEvent, reviewId: string) => {
    event.preventDefault();
    if (!account || busyId) return;
    if (editReviewRating < 1 || editReviewRating > 5) {
      setNotice('Поставьте оценку от 1 до 5 звёзд.');
      return;
    }
    const trimmed = editReviewText.trim().slice(0, MAX_REVIEW_TEXT_LENGTH);
    setBusyId(reviewId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reviewId, rating: editReviewRating, text: trimmed }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Не удалось изменить отзыв.');
      }
      const result = await response.json();
      const updated = result.review;
      setLocalReviews((current) =>
        (current ?? profile?.reviews ?? []).map((r) => (r.id === reviewId ? {
          ...r,
          rating: Number(updated?.rating ?? editReviewRating),
          text: String(updated?.text ?? trimmed),
          createdAt: String(updated?.createdAt ?? r.createdAt),
        } : r)),
      );
      setEditingReviewId(null);
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось изменить отзыв.');
    } finally {
      setBusyId(null);
    }
  };

  /** Open the inline editor for my own question. */
  const startEditQuestion = (q: { id: string; question: string; author_id?: string }) => {
    if (!account || account.id !== q.author_id) return;
    setEditingReviewId(null);
    setEditingQuestionId(q.id);
    setEditQuestionText(q.question);
  };

  /** Save the edited question through PATCH /api/profile-questions. The
   *  server moves created_at to today, so the date updates too. */
  const handleEditQuestionSubmit = async (event: React.FormEvent, questionId: string) => {
    event.preventDefault();
    if (!account || busyId) return;
    const trimmed = editQuestionText.trim().slice(0, 500);
    if (trimmed.length < 1) {
      setNotice('Введите текст вопроса.');
      return;
    }
    setBusyId(questionId);
    try {
      const accessToken = await requireSession();
      const response = await fetch('/api/profile-questions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
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
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось изменить вопрос.');
    } finally {
      setBusyId(null);
    }
  };

  if (!profile) return null;

  const mapAddress = profile.workplaceAddress.toLowerCase().includes('самаш')
    ? profile.workplaceAddress
    : `Даймохк, ${profile.workplaceAddress}`;
  const isOwnProfile = Boolean(account && profile.ownerId && account.id === profile.ownerId);
  // Один аккаунт — один отзыв на анкету: форму скрываем, если уже оставил.
  const alreadyReviewed = Boolean(
    account && (localReviews ?? profile.reviews ?? []).some((r) => r.authorId === account.id),
  );
  const canReview = Boolean(account && !account.isBlocked && onReview && !isOwnProfile && !alreadyReviewed);

  // Reviews rendered in the modal. After a local deletion we switch to
  // the local list so the removed review disappears immediately and the
  // rating / count are recomputed from what is left.
  const displayReviews = localReviews ?? profile.reviews ?? [];
  const displayReviewCount = localReviews !== null ? localReviews.length : profile.reviewCount;
  const displayRating = (() => {
    if (localReviews === null) return profile.rating;
    if (localReviews.length === 0) return 0;
    return Number((localReviews.reduce((sum, r) => sum + r.rating, 0) / localReviews.length).toFixed(1));
  })();

  /** May the viewer delete a review / question / comment? Author, анкета owner, admin. */
  const canDeleteBy = (authorId?: string) =>
    Boolean(
      account &&
      !account.isBlocked &&
      (account.id === authorId || account.id === profile.ownerId || account.isAdmin),
    );

  /** May the viewer EDIT a review / question? Only its author — editing a
   *  review re-picks the rating, so the анкета owner and admins only delete. */
  const canEditBy = (authorId?: string) =>
    Boolean(account && !account.isBlocked && account.id === authorId);

  const isPersonal = Boolean(profile.isPersonal);
  const hasPhone = !isPersonal && !profile.hidePhone && Boolean(profile.phone && profile.phone.trim().length > 0);
  const hasWhatsapp = !isPersonal && Boolean(profile.whatsapp && profile.whatsapp.trim().length > 0);
  const hasTelegram = !isPersonal && Boolean(profile.telegram && profile.telegram.trim().length > 0);
  const hasAnyContact = !isPersonal && (hasPhone || hasWhatsapp || hasTelegram);

  const handleCall = () => {
    if (!hasPhone) {
      setNotice('Контактный номер скрыт.');
      return;
    }
    window.location.href = `tel:${profile.phone}`;
  };

  const handleWhatsapp = () => {
    if (hasWhatsapp && profile.whatsapp) {
      const digits = profile.whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${digits}`, '_blank');
    }
  };

  const handleTelegram = () => {
    if (hasTelegram && profile.telegram) {
      const username = profile.telegram.startsWith('@') ? profile.telegram.slice(1) : profile.telegram;
      window.open(`https://t.me/${username}`, '_blank');
    }
  };

  const handleReviewSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!account) {
      setNotice('Войдите через Google, чтобы оставить отзыв.');
      return;
    }
    if (!onReview || isOwnProfile) return;
    if (reviewRating === 0) {
      setNotice('Поставьте оценку от 1 до 5 звёзд.');
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
      setNotice('');
    } catch (submitError) {
      setNotice(submitError instanceof Error ? submitError.message : 'Не удалось отправить отзыв.');
    }
  };

  if (!profile) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/80 p-0 backdrop-blur-md sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Анкета ${profile.fullName}`}>
      {notice && <Notice message={notice} type="error" onClose={() => setNotice('')} />}
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl transition-colors dark:bg-zinc-950 sm:max-w-2xl sm:rounded-2xl border border-slate-200/50 dark:border-zinc-800">
        <div className="relative shrink-0 border-b border-slate-100 bg-white p-4 text-slate-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white sm:p-5">
          <button
            onClick={onClose}
            aria-label="Закрыть анкету"
            className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3.5 pr-8">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-800 sm:h-16 sm:w-16">
              <Image
                src={cacheBustAvatarUrl(profile.avatarUrl)}
                alt={profile.fullName}
                fill
                sizes="(max-width: 768px) 64px, 64px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">{profile.fullName}</h2>
                <WorkingStatusBadge profile={profile} />
              </div>
              <div className="mt-1">
                <ProfileBadges profile={profile} adminStatus={isAdminStatus} showPending={showPending} />
              </div>
              {profile.isSpecialist && profile.professionTitle && (
                <p className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  {profile.professionTitle}
                </p>
              )}

              {profile.isSpecialist && displayRating > 0 && (
                <div className="mt-1 flex items-center gap-1 text-xs">
                  <div className="flex items-center font-bold text-amber-500">
                    <Star className="mr-0.5 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {displayRating.toFixed(1)}
                  </div>
                  <span className="text-slate-400 dark:text-zinc-500">({formatReviews(displayReviewCount)})</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs text-slate-800 dark:text-zinc-300 sm:p-5 no-scrollbar">
          {(() => {
            const isOwner = Boolean(account && account.id === profile.ownerId);
            const effectiveOverride = isOwner ? account?.statusOverride : profile.statusOverride;
            const statusInfo = calculateWorkingStatus(profile, effectiveOverride);
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusInfo.status === 'break' ? 'bg-amber-500' : statusInfo.status === 'offline' ? 'bg-zinc-400' : 'bg-emerald-500'}`} />
                  <span className="font-bold text-slate-900 dark:text-white">{statusInfo.label}</span>
                  {statusInfo.details && <span className="text-slate-500 dark:text-zinc-500">· {statusInfo.details}</span>}
                </div>
                {profile.isSpecialist && profile.workDays && profile.workDays.length > 0 && (
                  <div className="flex items-center gap-1 text-slate-500 dark:text-zinc-500">
                    <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{profile.workDays.join(', ')}</span>
                    {profile.workHoursStart && profile.workHoursEnd && (
                      <span>({profile.workHoursStart}–{profile.workHoursEnd})</span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {(profile.isHidden || profile.isBanned) && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              Эта анкета скрыта администратором и сейчас не видна в общем каталоге.
            </div>
          )}
          {isViewerBlocked && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              Ваш аккаунт заблокирован. Вы можете только просматривать информацию.
            </div>
          )}
          {/* Пол и возраст — только в ЛИЧНОЙ анкете (это личные данные владельца,
              в анкетах специалистов/жителей они не показываются). */}
          {profile.isPersonal && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{t.aboutPerson}</h3>
              {(() => {
                // Пол и возраст берём из профиля аккаунта владельца (user_profiles),
                // fallback — на данные анкеты.
                const ownerUser = profile.ownerId ? allUsers.find((u) => u.id === profile.ownerId) : undefined;
                const gender = ownerUser?.gender || profile.gender;
                const birth = ownerUser?.birthDate || profile.birthDate;
                if (!birth && !gender) return null;
                // Точный возраст: по полной дате 'YYYY-MM-DD' (с учётом того,
                // прошёл ли день рождения в этом году), иначе грубо по году.
                const age = birth ? calculateAge(String(birth)) : null;
                return (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    {age !== null && (
                      <span className="flex h-5 items-center rounded-md bg-slate-100 px-2 dark:bg-zinc-800">
                        {t.ageLabel}: {age}
                      </span>
                    )}
                    {gender && (
                      <span className="flex h-5 items-center rounded-md bg-slate-100 px-2 dark:bg-zinc-800">
                        {t.genderLabel}: {gender === 'male' ? t.genderMale : t.genderFemale}
                      </span>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

          <p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
            {profile.bio}
          </p>

          {/* Репутация жителя по заданиям — отдельно от рейтинга
              специалиста: тот про навыки, этот про человека. */}
          <ResidentReputation ownerId={profile.ownerId} />
          {profile.experience && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Стаж: {profile.experience}</p>
          )}

          {/* Видео (YouTube) — показываем, если ссылка указана в анкете */}
          {(() => {
            const videoId = profile.videoUrl ? youtubeEmbedId(profile.videoUrl) : null;
            if (!videoId) return null;
            return (
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-100 dark:border-zinc-800">
                <iframe
                  className="aspect-video w-full"
                  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                  title="Видео из анкеты"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            );
          })()}

          {profile.isSpecialist && (
            <section className="bg-slate-50/50 dark:bg-zinc-950/50 rounded-2xl overflow-hidden border border-slate-100 dark:border-zinc-800">
              <div className="flex border-b border-slate-100 dark:border-zinc-800">
                <button type="button" onClick={() => setActiveTab('reviews')} className={`flex-1 border-b-2 py-3 text-[11px] font-bold transition ${activeTab === 'reviews' ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>ОТЗЫВЫ ({displayReviewCount})</button>
                <button type="button" onClick={() => setActiveTab('questions')} className={`flex-1 border-b-2 py-3 text-[11px] font-bold transition ${activeTab === 'questions' ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>ВОПРОСЫ ({questions.length})</button>
                <button type="button" onClick={() => setActiveTab('ratings')} className={`flex-1 border-b-2 py-3 text-[11px] font-bold transition ${activeTab === 'ratings' ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>ОЦЕНКИ</button>
              </div>

              <div className="p-3">
                {activeTab === 'reviews' && (
                  <div className="space-y-2">
                    {displayReviews.length > 0 ? (
                      <div className="space-y-2">
                        {displayReviews.map((review) => (
                    <article key={review.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                                            <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 shrink-0 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden flex items-center justify-center">
                            {(review as any).authorAvatarUrl ? (
                              <img src={(review as any).authorAvatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-bold text-slate-500">{review.author.charAt(0)}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openUserCard(review.authorId)}
                            title="Открыть карточку пользователя"
                            className="min-w-0 break-words text-left text-xs font-bold text-slate-900 transition hover:text-emerald-600 hover:underline dark:text-white dark:hover:text-emerald-400"
                          >
                            {review.author}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <time className="text-[10px] font-medium text-slate-400">{formatReviewDate(review.createdAt)}</time>
                          <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            {review.rating.toFixed(1)}
                          </span>
                          {canEditBy(review.authorId) && editingReviewId !== review.id && (
                            <button
                              type="button"
                              onClick={() => startEditReview(review)}
                              disabled={busyId !== null}
                              aria-label="Изменить отзыв"
                              title={t.edit}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDeleteBy(review.authorId) && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteReview(review.id)}
                              disabled={busyId === review.id}
                              aria-label="Удалить отзыв"
                              title="Удалить отзыв"
                              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>
                      {editingReviewId === review.id ? (
                        <form onSubmit={(event) => void handleEditReviewSubmit(event, review.id)} className="mt-2 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                          <div className="flex items-center gap-1" aria-label="Изменить оценку">
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
                            placeholder="Расскажите о своём опыте"
                            className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                          />
                          <div className="flex items-center gap-2">
                            <button type="submit" disabled={busyId === review.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                              {busyId === review.id ? t.saving : t.save}
                            </button>
                            <button type="button" onClick={() => setEditingReviewId(null)} disabled={busyId === review.id} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
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
                <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-zinc-800 dark:text-zinc-500">Пока нет отзывов. Станьте первым.</p>
              )}

              {isOwnProfile ? (
                <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-500">Это ваша анкета. Оставлять отзыв самому себе нельзя.</p>
              ) : canReview && (
                <form onSubmit={handleReviewSubmit} className="mt-3 space-y-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Оставить отзыв</h4>
                  <div className="flex items-center gap-1" aria-label="Выберите оценку">
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
                      placeholder="Расскажите о своём опыте"
                      className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  <button type="submit" className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700">
                    Опубликовать отзыв
                  </button>
                </form>
              )}
                  </div>
                )}
                {activeTab === 'questions' && (
                  <div className="space-y-2">
                    {questions.length > 0 ? (
                      <div className="space-y-2">
                        {questions.map((q) => (
                          <article key={q.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center">
                                  {q.author_avatar_url ? (
                                    <img src={q.author_avatar_url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="text-[10px] font-bold text-slate-500">{(q.author_name || 'Ж').charAt(0)}</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openUserCard(q.author_id)}
                                  title="Открыть карточку пользователя"
                                  className="min-w-0 truncate text-xs font-bold text-slate-900 transition hover:text-emerald-600 hover:underline dark:text-white dark:hover:text-emerald-400"
                                >
                                  {q.author_name || 'Житель Даймохк'}
                                </button>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <time className="text-[10px] font-medium text-slate-400">{formatReviewDate(q.created_at)}</time>
                                {canEditBy(q.author_id) && editingQuestionId !== q.id && (
                                  <button
                                    type="button"
                                    onClick={() => startEditQuestion(q)}
                                    disabled={busyId !== null}
                                    aria-label="Изменить вопрос"
                                    title={t.edit}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {canDeleteBy(q.author_id) && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteQuestion(q.id)}
                                    disabled={busyId === q.id}
                                    aria-label="Удалить вопрос"
                                    title="Удалить вопрос"
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950 dark:hover:text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {editingQuestionId === q.id ? (
                              <form onSubmit={(event) => void handleEditQuestionSubmit(event, q.id)} className="mt-2 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                                <textarea
                                  rows={2}
                                  maxLength={500}
                                  value={editQuestionText}
                                  onChange={(event) => setEditQuestionText(event.target.value)}
                                  placeholder="Текст вопроса"
                                  className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                                />
                                <div className="flex items-center gap-2">
                                  <button type="submit" disabled={busyId === q.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                                    {busyId === q.id ? t.saving : t.save}
                                  </button>
                                  <button type="button" onClick={() => setEditingQuestionId(null)} disabled={busyId === q.id} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
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
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 transition hover:underline dark:text-emerald-400"
                            >
                              <MessageSquare className="h-3 w-3" />
                              Обсуждение ({q.comment_count ?? commentsByQuestion[q.id]?.length ?? 0})
                              <ChevronDown className={`h-3 w-3 transition-transform ${expandedQuestion === q.id ? 'rotate-180' : ''}`} />
                            </button>

                            {expandedQuestion === q.id && (
                              <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-white/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                                {commentsLoading === q.id ? (
                                  <p className="text-[10px] text-slate-400">Загружаем обсуждение…</p>
                                ) : (commentsByQuestion[q.id] ?? []).length > 0 ? (
                                  <div className="space-y-2">
                                    {(commentsByQuestion[q.id] ?? []).map((comment) => (
                                      <div key={comment.id} className="flex items-start gap-2">
                                        <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center">
                                          {comment.author_avatar_url ? (
                                            <img src={comment.author_avatar_url} alt="" className="h-full w-full object-cover" />
                                          ) : (
                                            <span className="text-[10px] font-bold text-slate-500">{(comment.author_name || 'Ж').charAt(0)}</span>
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => openUserCard(comment.author_id)}
                                              className="min-w-0 truncate text-[11px] font-bold text-slate-900 hover:text-emerald-600 hover:underline dark:text-white dark:hover:text-emerald-400"
                                              title="Открыть карточку пользователя"
                                            >
                                              {comment.author_name || 'Житель Даймохк'}
                                            </button>
                                            {comment.author_id === profile.ownerId && (
                                              <span className="shrink-0 rounded bg-emerald-100 px-1 py-px text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                                                Владелец анкеты
                                              </span>
                                            )}
                                            <time className="shrink-0 text-[9px] font-medium text-slate-400">{formatReviewDate(comment.created_at)}</time>
                                          </div>
                                          <p className="mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600 dark:text-zinc-400">
                                            {comment.reply_to_author_name && comment.comment.startsWith(`${comment.reply_to_author_name}, `) ? (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => openUserCard(comment.reply_to_author_id ?? undefined)}
                                                  className="font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                                                  title="Открыть карточку пользователя"
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
                                              aria-label="Ответить на комментарий"
                                              title="Ответить"
                                              className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                                            >
                                              <MessageSquare className="h-3 w-3" />
                                            </button>
                                          )}
                                          {canDeleteBy(comment.author_id) && (
                                            <button
                                              type="button"
                                              onClick={() => void handleDeleteComment(comment.id, q.id)}
                                              disabled={busyId === comment.id}
                                              aria-label="Удалить комментарий"
                                              title="Удалить комментарий"
                                              className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950 dark:hover:text-red-400"
                                            >
                                              <Trash2 className="h-3 w-3 text-red-500" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-slate-400">Комментариев пока нет. Станьте первым!</p>
                                )}

                                {account && !account.isBlocked ? (
                                  <form
                                    onSubmit={(event) => void handleCommentSubmit(event, q.id)}
                                    className="space-y-1.5"
                                  >
                                    {replyTargets[q.id] && (
                                      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-2 py-1 text-[10px] text-slate-600 dark:bg-emerald-950/40 dark:text-zinc-300">
                                        <span>
                                          Ответ для <span className="font-bold text-emerald-700 dark:text-emerald-400">@{replyTargets[q.id]?.name}</span>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => clearReply(q.id)}
                                          className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                                          aria-label="Отменить ответ"
                                          title="Отменить ответ"
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
                                        placeholder="Написать комментарий…"
                                        className="w-full min-w-0 resize-y break-words rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                                      />
                                      <button
                                        type="submit"
                                        disabled={busyId === `comment-${q.id}`}
                                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        {busyId === `comment-${q.id}` ? 'Отправляем…' : 'Отправить'}
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <p className="text-[10px] text-slate-400">Войдите, чтобы комментировать.</p>
                                )}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-zinc-800 dark:text-zinc-500">Вопросов пока нет. Задайте свой первый вопрос!</p>
                    )}

                    {isOwnProfile ? (
                      <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-500">Это ваша анкета. Задавать вопросы самому себе нельзя.</p>
                    ) : account && !account.isBlocked ? (
                      <form onSubmit={handleQuestionSubmit} className="mt-3 space-y-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">Задать вопрос</h4>
                        <div>
                          <textarea
                            rows={2}
                            maxLength={500}
                            value={questionText}
                            onChange={(event) => setQuestionText(event.target.value)}
                            placeholder="Например: в какое время лучше приехать?"
                            className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
                          />
                          <p className="mt-0.5 text-right text-[10px] text-slate-400">{questionText.length}/500</p>
                        </div>
                        <button type="submit" disabled={questionBusy} className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                          {questionBusy ? 'Отправляем…' : 'Отправить'}
                        </button>
                      </form>
                    ) : (
                      <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-500">Войдите, чтобы задать вопрос.</p>
                    )}
                  </div>
                )}
                {activeTab === 'ratings' && (
                  <div className="py-4 px-2">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-4xl font-black text-slate-900 dark:text-white">{displayRating > 0 ? displayRating.toFixed(1) : '0'}</span>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex gap-0.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-500">{displayReviewCount} оценок</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {[5,4,3,2,1].map(stars => {
                        const count = displayReviews.filter(r => r.rating === stars).length;
                        const total = displayReviews.length || 1;
                        const percent = Math.round((count / total) * 100);
                        return (
                          <div key={stars} className="flex items-center gap-2 text-[10px]">
                            <span className="w-2 text-right font-bold text-slate-700 dark:text-zinc-400">{stars}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3 w-3 fill-slate-300 text-slate-300 dark:fill-zinc-600 dark:text-zinc-600"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${percent}%` }}></div>
                            </div>
                            <span className="w-6 text-right text-slate-500 dark:text-zinc-500">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* «Анкеты пользователя» — в ЛЮБОЙ анкете владельца (и личной, и
              специалиста). Показываем ВСЕ анкеты владельца: личную и
              специалистов. Текущая (открытая) анкета некликабельна — клик по
              ней игнорируется, но можно переключаться на любую другую. */}
          {profile.ownerId && (
            <section className="mt-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                {language === 'ce' ? 'Лелорхочун анкеташ' : 'Анкеты пользователя'}
              </h3>
              {(() => {
                const ownerProfiles = allProfiles.filter(
                  (p) => p.ownerId === profile.ownerId && !p.isHidden && !p.isBanned
                );
                if (ownerProfiles.length === 0) {
                  return (
                    <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-zinc-800 dark:text-zinc-500">
                      {language === 'ce' ? 'Анкеташ бац.' : 'Анкет нет.'}
                    </p>
                  );
                }
                return (
                  <div className="space-y-1.5">
                    {ownerProfiles.map((other) => {
                      const isCurrent = other.id === profile.id;
                      return (
                        <button
                          key={other.id}
                          type="button"
                          disabled={isCurrent}
                          onClick={() => { if (!isCurrent) setNestedProfile(other); }}
                          className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left transition ${
                            isCurrent
                              ? 'cursor-default border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                              : 'border-slate-100 bg-slate-50/70 hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-800 dark:hover:border-emerald-800'
                          }`}
                        >
                          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-zinc-700">
                            {other.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cacheBustAvatarUrl(other.avatarUrl)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                                {other.fullName.charAt(0)}
                              </span>
                            )}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900 dark:text-white">
                            {other.professionTitle || other.fullName}
                            {other.isPersonal ? ` (${t.personalProfile.toLowerCase()})` : ''}
                          </span>
                          {other.isVerified || other.verificationStatus === 'verified' ? (
                            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              {t.roleVerified}
                            </span>
                          ) : null}
                          {isCurrent && (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {language === 'ce' ? 'ХIинца' : 'Открыта'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Адресс</h3>
            <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.workplaceAddress}</p>
                <a
                  href={`https://yandex.ru/maps/?pt=${profile.workplaceCoords.lng},${profile.workplaceCoords.lat}&z=16&l=map`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Открыть на карте
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </section>

          {profile.certificates.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                Документы ({profile.certificates.length})
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {profile.certificates.map((cert) => (
                  <button
                    key={cert.id}
                    type="button"
                    onClick={() => setSelectedCert(cert)}
                    className="group rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-left transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-800"
                  >
                    <div className="relative mb-1.5 h-24 w-full overflow-hidden rounded-lg bg-slate-200 dark:bg-zinc-800">
                      <Image
                        src={cert.imageUrl}
                        alt={cert.title}
                        fill
                        sizes="(max-width: 768px) 140px, 180px"
                        className="object-cover transition group-hover:scale-105"
                      />
                    </div>
                    <h4 className="truncate text-xs font-bold text-slate-900 dark:text-white">{cert.title}</h4>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-500">{cert.issuer} · {cert.year}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {profile.photos.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Фотографии работ</h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {profile.photos.map((photo, index) => (
                  <div key={photo} className="relative h-24 overflow-hidden rounded-xl border border-slate-200/60 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-800">
                    <Image src={photo} alt={`Работа ${index + 1}`} fill sizes="140px" className="object-cover" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {hasAnyContact && (
          <div className="flex shrink-0 items-center gap-2.5 border-t border-slate-100 bg-slate-50/90 p-3 dark:border-zinc-800 dark:bg-zinc-800">
            {!isViewerBlocked && hasPhone && (
              <button
                onClick={handleCall}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-95"
              >
                <Phone className="h-3.5 w-3.5" />
                Позвонить
              </button>
            )}
            {!isViewerBlocked && hasWhatsapp && (
              <button
                onClick={handleWhatsapp}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 active:scale-95"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp
              </button>
            )}
            {!isViewerBlocked && hasTelegram && (
              <button
                onClick={handleTelegram}
                aria-label="Открыть Telegram"
                title="Telegram"
                className="rounded-xl bg-slate-900 p-2.5 text-white transition hover:bg-slate-800 dark:bg-zinc-800 active:scale-95"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {selectedCert && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={selectedCert.title}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-800 border border-slate-200/50 dark:border-zinc-800">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">{selectedCert.title}</h3>
              <button
                onClick={() => setSelectedCert(null)}
                aria-label="Закрыть документ"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative mb-2.5 h-72 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-zinc-800">
              <Image src={selectedCert.imageUrl} alt={selectedCert.title} fill sizes="400px" className="object-contain" />
            </div>
            <p className="text-center text-[11px] font-medium text-slate-500 dark:text-zinc-500">
              {selectedCert.issuer} · {selectedCert.year}
            </p>
          </div>
        </div>
      )}
      </div>

      {/* User card opened from a name link: nested modal on top of this
          one. Closing it returns to the current анкета instead of closing
          everything and dropping back to the catalog. */}
      {nestedProfile && (
        <ProfileModal
          profile={nestedProfile}
          onClose={() => setNestedProfile(null)}
          onReview={onReview}
          isAdminStatus={isProfileAdmin(nestedProfile)}
          showPending={Boolean(account?.isAdmin || (account && nestedProfile.ownerId === account.id))}
          isViewerBlocked={isViewerBlocked}
        />
      )}
    </>
  );
}
