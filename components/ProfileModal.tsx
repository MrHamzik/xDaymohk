'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Ban, Clock, ExternalLink, Flag, MapPin, MessageSquare, Phone, Send, Star, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Certificate, Profile, Review } from '@/lib/types';
import { formatReviews } from '@/lib/text';
import { calculateWorkingStatus } from '@/lib/schedule';
import Notice from '@/components/Notice';
import ProfileBadges, { WorkingStatusBadge } from '@/components/ProfileBadges';

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
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [activeTab, setActiveTab] = useState<'reviews' | 'questions' | 'ratings'>('reviews');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setReviewRating(0);
    setReviewText('');
    setNotice('');
    setSelectedCert(null);
  }, [profile?.id]);

  if (!profile) return null;

  const mapAddress = profile.workplaceAddress.toLowerCase().includes('самаш')
    ? profile.workplaceAddress
    : `Самашки, ${profile.workplaceAddress}`;
  const isOwnProfile = Boolean(account && profile.ownerId && account.id === profile.ownerId);
  const canReview = Boolean(account && !account.isBlocked && onReview && !isOwnProfile);

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

  const handleReviewSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!account) {
      setNotice('Войдите через Google, чтобы оставить отзыв.');
      return;
    }
    if (!onReview || isOwnProfile) return;
    if (reviewRating === 0 || !reviewText.trim()) {
      setNotice('Поставьте оценку и напишите короткий отзыв.');
      return;
    }

    onReview(profile.id, {
      author: account?.fullName || 'Житель Самашек',
      rating: reviewRating,
      text: reviewText.trim().slice(0, MAX_REVIEW_TEXT_LENGTH),
    });
    setReviewRating(0);
    setReviewText('');
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
                src={profile.avatarUrl}
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

              {profile.isSpecialist && profile.rating > 0 && (
                <div className="mt-1 flex items-center gap-1 text-xs">
                  <div className="flex items-center font-bold text-amber-500">
                    <Star className="mr-0.5 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {profile.rating.toFixed(1)}
                  </div>
                  <span className="text-slate-400 dark:text-zinc-500">({formatReviews(profile.reviewCount)})</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs text-slate-800 dark:text-zinc-300 sm:p-5">
          {(() => {
            const statusInfo = calculateWorkingStatus(profile, profile.statusOverride);
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
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-200 dark:bg-red-50 dark:text-red-800">
              Эта анкета скрыта администратором и сейчас не видна в общем каталоге.
            </div>
          )}
          {isViewerBlocked && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-200 dark:bg-red-50 dark:text-red-800">
              Ваш аккаунт заблокирован. Вы можете только просматривать информацию.
            </div>
          )}
          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">О человеке</h3>
                        {profile.birthDate && (
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <span className="flex h-5 items-center rounded-md bg-slate-100 px-2 dark:bg-zinc-800">Год рождения: {profile.birthDate}</span>
                {profile.gender && (
                  <span className="flex h-5 items-center rounded-md bg-slate-100 px-2 dark:bg-zinc-800">
                    Пол: {profile.gender === 'male' ? 'Мужской' : 'Женский'}
                  </span>
                )}
              </div>
            )}
<p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
              {profile.bio}
            </p>
            {profile.experience && (
              <p className="mt-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">Стаж: {profile.experience}</p>
            )}
          </section>

          {profile.isSpecialist && (
            <section className="bg-slate-50/50 dark:bg-zinc-950/50 rounded-2xl overflow-hidden border border-slate-100 dark:border-zinc-800">
              <div className="flex border-b border-slate-100 dark:border-zinc-800">
                <button type="button" onClick={() => setActiveTab('reviews')} className={`flex-1 border-b-2 py-3 text-[11px] font-bold transition ${activeTab === 'reviews' ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>ОТЗЫВЫ ({(profile.reviews ?? []).length})</button>
                <button type="button" onClick={() => setActiveTab('questions')} className={`flex-1 border-b-2 py-3 text-[11px] font-bold transition ${activeTab === 'questions' ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>ВОПРОСЫ</button>
                <button type="button" onClick={() => setActiveTab('ratings')} className={`flex-1 border-b-2 py-3 text-[11px] font-bold transition ${activeTab === 'ratings' ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>ОЦЕНКИ</button>
              </div>

              <div className="p-3">
                {activeTab === 'reviews' && (
                  <div className="space-y-2">
                    {(profile.reviews ?? []).length > 0 ? (
                      <div className="space-y-2">
                        {(profile.reviews ?? []).map((review) => (
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
                          <p className="min-w-0 break-words text-xs font-bold text-slate-900 dark:text-white">{review.author}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <time className="text-[10px] font-medium text-slate-400">{formatReviewDate(review.createdAt)}</time>
                          <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            {review.rating.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{review.text}</p>
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
                      className="w-full resize-y break-words rounded-xl border border-slate-200 bg-white px-3 py-2.5.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
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
                  <div className="py-8 text-center">
                    <p className="text-xs text-slate-500 dark:text-zinc-500">Вопросов пока нет. Задайте свой первый вопрос!</p>
                  </div>
                )}
                {activeTab === 'ratings' && (
                  <div className="py-4 px-2">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-4xl font-black text-slate-900 dark:text-white">{profile.rating > 0 ? profile.rating.toFixed(1) : '0'}</span>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex gap-0.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star h-3.5 w-3.5 fill-amber-400 text-amber-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-500">{(profile.reviews ?? []).length} оценок</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {[5,4,3,2,1].map(stars => {
                        const count = (profile.reviews ?? []).filter(r => r.rating === stars).length;
                        const total = (profile.reviews ?? []).length || 1;
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

          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Адресс</h3>
            <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.workplaceAddress}</p>
                <a
                  href={`geo:${profile.workplaceCoords.lat},${profile.workplaceCoords.lng}?q=${profile.workplaceCoords.lat},${profile.workplaceCoords.lng}`}
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
    </>
  );
}
