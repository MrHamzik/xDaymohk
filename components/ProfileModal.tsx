'use client';

import Avatar from '@/components/Avatar';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Flag, Heart, Lock, MapPin, MessageSquare, Phone, Send, Share2, ShieldBan, Star, X } from 'lucide-react';
import { shareLink, siteOrigin } from '@/lib/share';
import { displayName } from '@/lib/profile-name';
import ReportDialog from '@/components/ReportDialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useBlacklist } from '@/components/BlacklistProvider';
import { useI18n } from '@/lib/i18n';
import { Certificate, Profile, Review } from '@/lib/types';
import { formatReviews } from '@/lib/text';
import ResidentReputation from '@/components/tasks/ResidentReputation';
import EmptyState from '@/components/ui/EmptyState';
import Notice from '@/components/Notice';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProfileBadges, { WorkingStatusBadge } from '@/components/ProfileBadges';
import { cacheBustAvatarUrl } from '@/lib/media';
import InteractiveMap from '@/components/InteractiveMapLazy';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { type MapLayerMode } from '@/components/InteractiveMap';
import ProfileFacts from '@/components/profile/ProfileFacts';
import ProfileReviewsTab from '@/components/profile/ProfileReviewsTab';
import ProfileQuestionsTab from '@/components/profile/ProfileQuestionsTab';
import ProfileRatingsTab from '@/components/profile/ProfileRatingsTab';
import { youtubeEmbedId } from '@/components/profile/profile-helpers';
import { useSheetSwipe } from '@/lib/hooks/useSheetSwipe';
import { useLockBody } from '@/lib/hooks/useLockBody';

interface ProfileModalProps {
  profile: Profile | null;
  onClose: () => void;
  onReview?: (profileId: string, review: Omit<Review, 'id' | 'createdAt'>) => void;
  isAdminStatus?: boolean;
  showPending?: boolean;
  canReport?: boolean;
  onReport?: () => void;
  canBlock?: boolean;
  onBlock?: () => void;
  isViewerBlocked?: boolean;
}

/**
 * Карточка анкеты: шапка, факты, вкладки и контакты.
 *
 * Отзывы, вопросы и оценки вынесены в components/profile/* — иначе
 * этот файл снова разрастётся до полутора тысяч строк.
 */
export default function ProfileModal({
  profile,
  onClose,
  onReview,
  isAdminStatus = false,
  showPending = false,
  isViewerBlocked = false,
  canReport,
  onReport,
}: ProfileModalProps) {
  const { account } = useAuth();
  const { t } = useI18n();
  const { profiles: allProfiles, isProfileAdmin, addComplaint } = useProfiles();
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('streets');
  const [nestedProfile, setNestedProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'reviews' | 'questions' | 'ratings'>('reviews');
  const [notice, setNotice] = useState('');
  const [noticeKind, setNoticeKind] = useState<'error' | 'success'>('error');
  const [blockBusy, setBlockBusy] = useState(false);
  const [reviewStats, setReviewStats] = useState({
    rating: profile?.rating ?? 0,
    count: profile?.reviewCount ?? 0,
    reviews: profile?.reviews ?? [],
  });
  const [questionCount, setQuestionCount] = useState(0);
  const { block: blockUser } = useBlacklist();
  const [fav, setFav] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const swipe = useSheetSwipe(onClose);
  useLockBody(Boolean(profile));

  useEffect(() => {
    if (!profile || !supabase || !account) { setFav(false); return; }
    let cancelled = false;
    void (async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/favorites', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (!cancelled && Array.isArray(data?.ids)) setFav(data.ids.includes(profile.id));
    })();
    return () => { cancelled = true; };
  }, [profile?.id, account?.id]);

  if (!profile) return null;

  const isOwnProfile = Boolean(account && profile.ownerId && account.id === profile.ownerId);
  const displayRating = reviewStats.rating;
  const displayReviewCount = reviewStats.count;
  const isPersonal = Boolean(profile.isPersonal);
  const hasPhone = !isPersonal && !profile.hidePhone && Boolean(profile.phone && profile.phone.trim().length > 0);
  const hasWhatsapp = !isPersonal && Boolean(profile.whatsapp && profile.whatsapp.trim().length > 0);
  const hasTelegram = !isPersonal && Boolean(profile.telegram && profile.telegram.trim().length > 0);
  const hasAnyContact = !isPersonal && (hasPhone || hasWhatsapp || hasTelegram);
  const contactsLocked = !isPersonal && Boolean(profile.contactsLocked);
  const videoId = profile.videoUrl ? youtubeEmbedId(profile.videoUrl) : null;

  const ownerId = profile.ownerId;
  const canBlockOwner = Boolean(
    account && ownerId && ownerId !== account.id && !isAdminStatus && !account.isBlocked,
  );
  const showReport = canReport ?? Boolean(
    account && !isOwnProfile && !isAdminStatus && !account.isBlocked,
  );

  const openUserCard = (userId?: string) => {
    if (!userId) return;
    const card = allProfiles.find((p) => p.ownerId === userId && p.isPersonal)
      ?? allProfiles.find((p) => p.ownerId === userId);
    if (card) setNestedProfile(card);
  };

  const handleBlockOwner = async () => {
    if (!ownerId) return;
    setBlockBusy(true);
    try {
      await blockUser(ownerId);
      onClose();
    } catch (error) {
      setNoticeKind('error');
      setNotice(error instanceof Error ? error.message : t.profileBlockFailed);
    } finally {
      setBlockBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/80 p-0 backdrop-blur-md sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Анкета ${profile.fullName}`}>
      {notice && <Notice message={notice} type={noticeKind} onClose={() => setNotice('')} />}
      <div className="smk-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl transition-colors sm:max-w-2xl sm:rounded-3xl">
        <div
          className="smk-sheet-head shrink-0 px-4 pb-3.5 pt-3 text-slate-900 dark:text-white"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div className="flex items-center gap-2">
            {/* flex-1 держит место, даже когда статуса нет.
                WorkingStatusBadge возвращает null у неспециалистов, и
                без распорки блок схлопывался — иконки съезжали влево. */}
            <div className="min-w-0 flex-1">
              <WorkingStatusBadge profile={profile} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  void shareLink(
                    displayName(profile),
                    profile.professionTitle || displayName(profile),
                    `${siteOrigin()}/catalog?profile=${encodeURIComponent(profile.id)}`,
                  );
                }}
                aria-label={t.shareAction}
                className="smk-act flex h-7 w-7 items-center justify-center"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {account && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!supabase) return;
                    const session = await supabase.auth.getSession();
                    const token = session.data.session?.access_token;
                    if (!token) return;
                    const next = !fav;
                    setFav(next);
                    const res = await fetch(
                      next ? '/api/favorites' : `/api/favorites?profileId=${encodeURIComponent(profile.id)}`,
                      {
                        method: next ? 'POST' : 'DELETE',
                        headers: {
                          Authorization: `Bearer ${token}`,
                          ...(next ? { 'Content-Type': 'application/json' } : {}),
                        },
                        body: next ? JSON.stringify({ profileId: profile.id }) : undefined,
                      },
                    );
                    if (!res.ok) setFav(!next);
                    else {
                      window.dispatchEvent(new CustomEvent('daymohk-favorites', {
                        detail: { id: profile.id, on: next },
                      }));
                    }
                  }}
                  aria-label={fav ? t.favOff : t.favAdd}
                  className="smk-act flex h-7 w-7 items-center justify-center"
                >
                  <Heart className={`h-4 w-4 ${fav ? 'fill-rose-500 text-rose-500' : ''}`} />
                </button>
              )}
              {showReport && (
                <button
                  type="button"
                  onClick={() => {
                    if (onReport) onReport();
                    else setReportOpen(true);
                  }}
                  aria-label={t.cardReportAria}
                  title={t.cardReport}
                  className="smk-act flex h-7 w-7 items-center justify-center text-[var(--smk-gold-deep)]"
                >
                  <Flag className="h-4 w-4" />
                </button>
              )}
              {canBlockOwner && (
                <button
                  onClick={() => setIsBlockConfirmOpen(true)}
                  disabled={blockBusy}
                  aria-label={t.profileBlockUser}
                  title={t.profileBlockUser}
                  className="smk-act smk-act--danger flex h-7 w-7 items-center justify-center"
                >
                  <ShieldBan className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onClose}
                aria-label={t.profileCloseSheet}
                className="smk-act smk-hit flex h-7 w-7 items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <hr className="smk-orn my-3" />

          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-sm dark:bg-zinc-800 sm:h-20 sm:w-20">
              <Image
                src={cacheBustAvatarUrl(profile.avatarUrl)}
                alt={displayName(profile)}
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <h2 className="smk-text-display font-bold leading-tight text-slate-900 dark:text-white">
                {displayName(profile)}
              </h2>
              {profile.isSpecialist && profile.professionTitle && (
                <p className="mt-1 truncate text-xs font-bold text-emerald-700 dark:text-emerald-400">
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

          <hr className="smk-orn my-3" />

          <div>
            <ProfileBadges profile={profile} adminStatus={isAdminStatus} showPending={showPending} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto text-xs text-slate-800 dark:text-zinc-300 no-scrollbar">
          {(profile.isHidden || profile.isBanned) && (
            <p className="smk-note smk-note-danger mx-4 mt-3 px-3.5 py-2.5">
              {t.profileHiddenNotice}
            </p>
          )}
          {isViewerBlocked && (
            <p className="smk-note smk-note-danger mx-4 mt-3 px-3.5 py-2.5">
              {t.profileViewerBlocked}
            </p>
          )}

          <ProfileFacts profile={profile} />

          {profile.bio && (
            <section className="smk-sheet-section px-4 py-3.5">
              <h3 className="smk-sheet-label mb-1.5">{t.profileAboutHeading}</h3>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] smk-text-body leading-relaxed text-slate-700 dark:text-zinc-300">
                {profile.bio}
              </p>
            </section>
          )}

          {!profile.isSpecialist && <ResidentReputation ownerId={profile.ownerId} />}

          {videoId && (
            <section className="smk-sheet-section px-4 py-3.5">
              <h3 className="smk-sheet-label mb-1.5">{t.profileVideoHeading}</h3>
              <div className="overflow-hidden rounded-xl">
                <iframe
                  className="aspect-video w-full"
                  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                  title={t.profileVideoHeading}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </section>
          )}

          {profile.isSpecialist && (
            <section className="smk-sheet-section px-4 py-3.5">
              <div className="smk-seg mb-3 grid grid-cols-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('reviews')}
                  aria-pressed={activeTab === 'reviews'}
                  className={`smk-seg-btn ${activeTab === 'reviews' ? 'smk-seg-btn--on' : ''}`}
                >
                  {t.reviewsTab} <span className="smk-seg-num">{displayReviewCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('questions')}
                  aria-pressed={activeTab === 'questions'}
                  className={`smk-seg-btn ${activeTab === 'questions' ? 'smk-seg-btn--on' : ''}`}
                >
                  {t.questionsTab} <span className="smk-seg-num">{questionCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ratings')}
                  aria-pressed={activeTab === 'ratings'}
                  className={`smk-seg-btn ${activeTab === 'ratings' ? 'smk-seg-btn--on' : ''}`}
                >
                  {t.ratingsTab}
                </button>
              </div>

              <div className={activeTab === 'reviews' ? '' : 'hidden'}>
                <ProfileReviewsTab
                  profile={profile}
                  isOwnProfile={isOwnProfile}
                  onReview={onReview}
                  onOpenUser={openUserCard}
                  onNotice={(message) => { setNoticeKind('error'); setNotice(message); }}
                  onStats={(rating, count, reviews) => setReviewStats({ rating, count, reviews })}
                />
              </div>
              <div className={activeTab === 'questions' ? '' : 'hidden'}>
                <ProfileQuestionsTab
                  profile={profile}
                  isOwnProfile={isOwnProfile}
                  onOpenUser={openUserCard}
                  onNotice={(message) => { setNoticeKind('error'); setNotice(message); }}
                  onCount={setQuestionCount}
                />
              </div>
              {activeTab === 'ratings' && (
                <ProfileRatingsTab
                  reviews={profile.reviews ?? []}
                  rating={displayRating}
                  count={displayReviewCount}
                />
              )}
            </section>
          )}

          {profile.ownerId && (
            <section className="smk-sheet-section px-4 py-3.5">
              <h3 className="smk-sheet-label mb-2">
                {t.profileOwnerProfilesHeading}
              </h3>
              {(() => {
                const ownerProfiles = allProfiles.filter(
                  (p) => p.ownerId === profile.ownerId && !p.isHidden && !p.isBanned
                );
                if (ownerProfiles.length === 0) {
                  return <EmptyState title={t.profileOwnerProfilesEmpty} />;
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
                          className={`flex w-full items-center gap-2 p-2 text-left transition ${
                            isCurrent
                              ? 'smk-sheet-row cursor-default ring-1 ring-emerald-400/70'
                              : 'smk-sheet-row hover:brightness-95 dark:hover:brightness-110'
                          }`}
                        >
                          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-zinc-700">
                            {other.avatarUrl ? (
                              <Avatar src={other.avatarUrl} className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center smk-text-label font-bold text-slate-500">
                                {other.fullName.charAt(0)}
                              </span>
                            )}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900 dark:text-white">
                            {other.professionTitle || other.fullName}
                            {other.isPersonal ? ` (${t.personalProfile.toLowerCase()})` : ''}
                          </span>
                          {other.isVerified || other.verificationStatus === 'verified' ? (
                            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 smk-text-label font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              {t.roleVerified}
                            </span>
                          ) : null}
                          {isCurrent && (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 smk-text-label font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {t.profileOpenedBadge}
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

          <section className="smk-sheet-section px-4 py-3.5">
            <h3 className="smk-sheet-label mb-1.5">{t.profileAddressHeading}</h3>
            <div className="smk-sheet-row flex items-stretch gap-3 p-2.5">
              <div className="flex w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <MapPin className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{profile.workplaceAddress}</p>
                <button
                  type="button"
                  onClick={() => setIsMapOpen((open) => !open)}
                  aria-expanded={isMapOpen}
                  className="mt-1.5 inline-flex items-center gap-1 smk-text-label font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <MapPin className="h-3 w-3" />
                  {isMapOpen ? t.hideMap : t.openOnMap}
                </button>
              </div>
            </div>

            {isMapOpen && (
              <div className="mt-2.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="smk-sheet-label">{t.showLabel}</span>
                  <MapSegmentedControl
                    ariaLabel={t.mapTypeAria}
                    active={[mapLayerMode]}
                    onSelect={setMapLayerMode}
                    options={[
                      { value: 'streets' as MapLayerMode, label: t.mapLayerStreets },
                      { value: 'satellite' as MapLayerMode, label: t.mapLayerSatellite },
                      { value: 'hybrid' as MapLayerMode, label: t.mapLayerHybrid },
                    ]}
                  />
                </div>
                <InteractiveMap
                  selectedPosition={profile.workplaceCoords}
                  showControls={false}
                  showProfiles={false}
                  showHouses
                  showPlaces
                  mapLayerMode={mapLayerMode}
                  onMapLayerModeChange={setMapLayerMode}
                  className="h-56 overflow-hidden rounded-xl sm:h-72"
                />
              </div>
            )}
          </section>

          {profile.certificates.length > 0 && (
            <section className="smk-sheet-section px-4 py-3.5">
              <h3 className="smk-sheet-label mb-1.5">
                {t.profileDocumentsHeading} ({profile.certificates.length})
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {profile.certificates.map((cert) => (
                  <button
                    key={cert.id}
                    type="button"
                    onClick={() => setSelectedCert(cert)}
                    className="group smk-sheet-row p-2 text-left transition hover:brightness-95 dark:hover:brightness-110"
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
                    <p className="smk-text-label text-slate-500 dark:text-zinc-500">{cert.issuer} · {cert.year}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {profile.photos.length > 0 && (
            <section className="smk-sheet-section px-4 py-3.5">
              <h3 className="smk-sheet-label mb-1.5">{t.profileWorkPhotosHeading}</h3>
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

        {contactsLocked && (
          <div className="smk-sheet-section smk-sheet-foot shrink-0 p-3">
            <p className="smk-note smk-note-info flex items-start gap-2 px-3 py-2.5">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-bold">{t.contactsLocked}</span>
                <br />
                {t.contactsLockedHint}
              </span>
            </p>
          </div>
        )}

        {hasAnyContact && (
          <div className="smk-sheet-section smk-sheet-foot flex shrink-0 items-center gap-2.5 p-3">
            {!isViewerBlocked && hasPhone && (
              <button
                onClick={() => { window.location.href = `tel:${profile.phone}`; }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-95"
              >
                <Phone className="h-3.5 w-3.5" />
                {t.callBtn}
              </button>
            )}
            {!isViewerBlocked && hasWhatsapp && (
              <button
                onClick={() => {
                  const digits = profile.whatsapp!.replace(/\D/g, '');
                  window.open(`https://wa.me/${digits}`, '_blank');
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 active:scale-95"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp
              </button>
            )}
            {!isViewerBlocked && hasTelegram && (
              <button
                onClick={() => {
                  const username = profile.telegram!.startsWith('@') ? profile.telegram!.slice(1) : profile.telegram!;
                  window.open(`https://t.me/${username}`, '_blank');
                }}
                aria-label="Открыть Telegram"
                title="Telegram"
                className="rounded-xl bg-[#229ED9] p-2.5 text-white transition hover:brightness-110 active:scale-95"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {selectedCert && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={selectedCert.title}>
          <div className="smk-sheet w-full max-w-md overflow-hidden rounded-2xl p-4 shadow-2xl">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">{selectedCert.title}</h3>
              <button
                onClick={() => setSelectedCert(null)}
                aria-label={t.profileCloseDocument}
                className="smk-hit flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative mb-2.5 h-72 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-zinc-800">
              <Image src={selectedCert.imageUrl} alt={selectedCert.title} fill sizes="400px" className="object-contain" />
            </div>
            <p className="text-center smk-text-label font-medium text-slate-500 dark:text-zinc-500">
              {selectedCert.issuer} · {selectedCert.year}
            </p>
          </div>
        </div>
      )}
      </div>

      <ReportDialog
        profile={profile}
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={(reason) => addComplaint(profile.id, reason)}
      />

      <ConfirmDialog
        isOpen={isBlockConfirmOpen}
        title={t.profileBlockTitle}
        message={t.profileBlockConfirm}
        confirmLabel={t.profileBlockTitle}
        danger
        isBusy={blockBusy}
        onCancel={() => setIsBlockConfirmOpen(false)}
        onConfirm={() => {
          setIsBlockConfirmOpen(false);
          void handleBlockOwner();
        }}
      />

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
