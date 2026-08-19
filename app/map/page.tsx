'use client';

import Avatar from '@/components/Avatar';
import { useBlacklist } from '@/components/BlacklistProvider';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, LocateFixed, MapPinned, Phone, Users, Star } from 'lucide-react';
import { cacheBustAvatarUrl } from '@/lib/media';
import { fetchEffectiveHouseAddresses, type SamashkiHouseAddress } from '@/lib/samashki-addresses';
import { getMapCategories, fetchMapCategories } from '@/lib/map-categories';
import InteractiveMap from '@/components/InteractiveMapLazy';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import { type MapLayerMode, type MapObjectMode } from '@/components/InteractiveMap';
import AccountModal from '@/components/AccountModal';
import EditProfileModal from '@/components/EditProfileModal';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import ProfileModal from '@/components/ProfileModal';
import ReportDialog from '@/components/ReportDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProfileBadges from '@/components/ProfileBadges';
import SearchFilter from '@/components/SearchFilter';
import CreateActionModal from '@/components/CreateActionModal';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { filterProfiles } from '@/lib/profile-filters';
import { calculateWorkingStatus, resolveOwnerOverride } from '@/lib/schedule';
import { formatReviews } from '@/lib/text';
import { useI18n } from '@/lib/i18n';
import { AudienceFilter, Profile } from '@/lib/types';

// Заглушка координат из массового импорта (центр села) и «нет координат».
// Такие адреса на карту не попадают, значит и кликом по карте выбраны быть
// не могут — иначе панель показала бы анкеты по адресу, которого не видно.
const VILLAGE_CENTER = { lat: 43.291081, lng: 45.301384 };
const hasRealAddressCoords = (lat: number, lng: number) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !(Math.abs(lat - VILLAGE_CENTER.lat) < 1e-3 && Math.abs(lng - VILLAGE_CENTER.lng) < 1e-3);
};

export default function MapPage() {
  const { profiles, users, reputation, isCurrentUserAdmin, isProfileAdmin, addProfile, updateProfile, addReview, addComplaint } = useProfiles();
  const { account } = useAuth();
  const { t } = useI18n();
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [reportProfile, setReportProfile] = useState<Profile | null>(null);
  const [blockProfile, setBlockProfile] = useState<Profile | null>(null);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilters, setAudienceFilters] = useState<AudienceFilter[]>([]);
  const [professionFilters, setProfessionFilters] = useState<string[]>([]);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('streets');
  const [locationRequestKey, setLocationRequestKey] = useState(0);
  // Слой объектов на карте — только один активный (как «карта/спутник/гибрид»).
  const [objectMode, setObjectMode] = useState<MapObjectMode>('profiles');
  // Категория для слоя «Другое» ('' = все), как фильтр в админке.
  const [placesCategory, setPlacesCategory] = useState('');
  const [allAddresses, setAllAddresses] = useState<SamashkiHouseAddress[]>([]);
  // Адрес, выбранный кликом по дому/объекту на карте (или по карте рядом с
  // домом): панель «Анкеты по адресу» показывает анкеты всех, кто привязан
  // к этому адресу — независимо от того, чья это точка.
  const [selectedAddress, setSelectedAddress] = useState<SamashkiHouseAddress | null>(null);
  // Категории «Других» объектов. Берём общий справочник (базовый набор
  // + добавленные админом в «Адреса» → «Поиск и категории») и дополняем
  // теми, что реально встречаются у адресов. Раньше список строился
  // только из адресов, поэтому до появления объектов был пустым.
  const [placeCategories, setPlaceCategories] = useState<string[]>(() => getMapCategories());
  useEffect(() => {
    // Справочник общий и живёт в БД (app_filters, scope='map'):
    // getMapCategories() отдаёт кэш мгновенно, fetch — актуальный список.
    let cancelled = false;
    const used = allAddresses.filter((a) => a.isNotHouse).map((a) => a.category);
    setPlaceCategories(getMapCategories(used));
    fetchMapCategories(used).then((list) => { if (!cancelled) setPlaceCategories(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [allAddresses]);

  useEffect(() => {
    let cancelled = false;
    fetchEffectiveHouseAddresses().then((addr) => {
      if (!cancelled && Array.isArray(addr)) setAllAddresses(addr);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const adminOwnerId = account?.isAdmin ? account.id : undefined;
  // Скрытые чёрным списком не должны появляться и на карте: иначе
  // человек, которого вы заблокировали, остаётся виден точкой.
  const { isHidden: isBlockedOwner } = useBlacklist();
  const profilesWithAddresses = useMemo(
    () => profiles.filter((profile) =>
      Boolean(profile.workplaceAddress.trim())
      && !profile.isHidden && !profile.isBanned
      && !isBlockedOwner(profile.ownerId)),
    [profiles, isBlockedOwner],
  );
  const filteredProfiles = useMemo(
    () => filterProfiles(profilesWithAddresses, {
      query: searchQuery,
      audienceFilters,
      professionFilters,
      adminOwnerId,
      users,
    }),
    [profilesWithAddresses, searchQuery, audienceFilters, professionFilters, adminOwnerId, users],
  );

  useEffect(() => {
    setSelectedProfileId((currentId) => (
      currentId && filteredProfiles.some((profile) => profile.id === currentId)
        ? currentId
        : null
    ));
  }, [filteredProfiles]);

  const selectedProfile = useMemo(
    () => filteredProfiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [filteredProfiles, selectedProfileId],
  );
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId && ((isCurrentUserAdmin || !profile.isHidden) && !profile.isBanned)) ?? null,
    [profiles, activeProfileId, isCurrentUserAdmin],
  );
  const selectedOwnerProfiles = useMemo(() => {
    if (!selectedProfile) return [];
    if (!selectedProfile.ownerId) return [selectedProfile];
    return profiles.filter((profile) => profile.ownerId === selectedProfile.ownerId && !profile.isHidden && !profile.isBanned && !isBlockedOwner(profile.ownerId));
  }, [profiles, selectedProfile]);

  // Анкеты ВСЕХ жителей и специалистов, у кого указан выбранный адрес.
  // Берём из полного списка profiles (а не из filteredProfiles) — поиск и
  // фильтры сверху не должны урезать список по адресу.
  //
  // Совпадение по двум признакам:
  //  1) координаты (адреса анкет привязаны к координатам дома; допуск
  //     ~50 м покрывает спиральное разнесение домов с общими координатами);
  //  2) нормализованный текст адреса — для старых записей, где координаты
  //     не проставлены или отличаются.
  const addressProfiles = useMemo(() => {
    if (!selectedAddress) return [];
    // Нормализация: убираем населённый пункт, приводим «улица/ул.» и
    // «дом/д.» к единому виду, схлопываем пробелы и знаки препинания.
    const normalizeAddress = (value: string) =>
      value
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/^\s*(с\.|c\.|г\.|село|город)?\s*(даймохк|самашки)\s*,?\s*/i, '')
        .replace(/\b(улица|ул)\b\.?/g, 'ул')
        .replace(/\b(переулок|пер)\b\.?/g, 'пер')
        .replace(/\b(проспект|пр-т|пр)\b\.?/g, 'пр')
        .replace(/\b(дом|д)\b\.?/g, 'д')
        .replace(/[.,;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const target = normalizeAddress(selectedAddress.fullAddress);
    const hasTargetCoords = hasRealAddressCoords(selectedAddress.lat, selectedAddress.lng);

    return profiles.filter((profile) => {
      if (profile.isHidden || profile.isBanned) return false;
      const address = profile.workplaceAddress?.trim();
      const coords = profile.workplaceCoords;
      const byCoords = Boolean(
        hasTargetCoords
        && coords
        && Number.isFinite(coords.lat)
        && Number.isFinite(coords.lng)
        && Math.abs(coords.lat - selectedAddress.lat) < 0.0005
        && Math.abs(coords.lng - selectedAddress.lng) < 0.0005,
      );
      const byText = Boolean(address && target && normalizeAddress(address) === target);
      return byCoords || byText;
    });
  }, [profiles, selectedAddress]);

  /** Клик по карте/дому выбирает ближайший адрес (в пределах ~250 м) —
   *  панель выше покажет анкеты всех, кто живёт/работает по этому адресу. */
  const handleMapSelect = (position: { lat: number; lng: number }) => {
    // Адреса без настоящих координат («нет координат», нули, заглушка
    // центра села) не участвуют — они и на карте не отображаются.
    const pool = allAddresses.filter((a) => hasRealAddressCoords(a.lat, a.lng));
    if (pool.length === 0) return;
    let closest = pool[0];
    let best = Infinity;
    for (const addr of pool) {
      const d = (addr.lat - position.lat) ** 2 + (addr.lng - position.lng) ** 2;
      if (d < best) { best = d; closest = addr; }
    }
    // Клик вдали от любого дома — просто сброс выбора адреса.
    if (best > 0.003 * 0.003) {
      setSelectedAddress(null);
      return;
    }
    setSelectedProfileId(null);
    setSelectedAddress(closest);
  };

  const handleSaveProfile = (profile: Profile) => {
    if (editingProfile) {
      updateProfile(profile.id, profile);
      setEditingProfile(null);
    } else {
      addProfile(profile);
    }
  };

  const handleBlockProfile = (profile: Profile) => {
    if (isProfileAdmin(profile)) return;
    setBlockProfile(profile);
  };

  const confirmBlockProfile = async () => {
    if (!blockProfile || isProfileAdmin(blockProfile)) {
      setBlockProfile(null);
      return;
    }
    await updateProfile(blockProfile.id, { isHidden: true, isBanned: false });
    setBlockProfile(null);
    setActiveProfileId(null);
  };

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />
            <div className="mx-auto flex w-full max-w-6xl items-start justify-start gap-6 px-3.5 pb-20 pt-18 sm:pb-8 lg:pt-24">
        {/* Detached Sidebar for Desktop */}
        <aside className="sticky top-24 z-40 hidden w-[290px] shrink-0 flex-col lg:flex h-[calc(100vh-8rem)]">
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950 no-scrollbar">
            <SidebarNav isAdmin={isCurrentUserAdmin} />
          </div>
        </aside>
        
        {/* Main Content Area */}
        {/* Без max-w-3xl: на этой странице главный элемент — карта, и
            ограничивать её 48rem посреди широкого экрана незачем.
            Остальные страницы ширину сохраняют — правка только здесь. */}
        <main className="min-w-0 flex-1">
        <div className="mb-5 flex items-center gap-3">
          <Link
            href="/catalog"
            aria-label="Вернуться в каталог"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t.mapPageTitle}</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-500">{t.mapPageSubtitle}</p>
          </div>
        </div>

        <SearchFilter
          searchQuery={searchQuery}
          setQuery={setSearchQuery}
          audienceFilters={audienceFilters}
          setAudienceFilters={setAudienceFilters}
          professionFilters={professionFilters}
          setProfessionFilters={setProfessionFilters}
        />

        <section className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800" aria-labelledby="map-profiles-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <h3 id="map-profiles-title" className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {selectedAddress ? 'Анкеты по адресу' : 'Анкеты выбранного пользователя'}
                </h3>
                <p className="truncate text-xs text-slate-500 dark:text-zinc-500">
                  {selectedAddress
                    ? selectedAddress.fullAddress
                    : 'Нажмите на миниатюру, чтобы выбрать его точку или открыть анкету.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{(selectedAddress ? addressProfiles : selectedOwnerProfiles).length}</span>
              {selectedAddress && (
                <button
                  type="button"
                  onClick={() => setSelectedAddress(null)}
                  aria-label="Сбросить выбранный адрес"
                  title="Сбросить адрес"
                  className="smk-hit flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {(selectedAddress ? addressProfiles : selectedOwnerProfiles).length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(selectedAddress ? addressProfiles : selectedOwnerProfiles).map((profile) => {
                const hasMapPoint = filteredProfiles.some((item) => item.id === profile.id);
                const isSelected = profile.id === selectedProfile?.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => hasMapPoint ? setSelectedProfileId(profile.id) : setActiveProfileId(profile.id)}
                    className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left transition ${isSelected ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-800/70 dark:hover:border-emerald-800'}`}
                  >
                    <Avatar src={profile.avatarUrl} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{profile.professionTitle || 'Личная анкета'}</span>
                      <span className="block truncate smk-text-label text-slate-500 dark:text-zinc-500">{profile.workplaceAddress || 'Адрес не указан'}</span>
                    </span>
                    {profile.verificationStatus === 'pending' && <span className="shrink-0 smk-text-label text-slate-500 dark:text-zinc-500">На проверке</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="smk-sheet-row p-4 text-center text-sm text-slate-500 dark:text-zinc-500">
              {selectedAddress ? 'По этому адресу анкет не найдено.' : 'Выберите точку анкеты на карте.'}
            </p>
          )}
        </section>

        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-3">
          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 md:col-span-2" aria-labelledby="map-section-title">
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <MapPinned className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <h3 id="map-section-title" className="truncate text-sm font-bold text-slate-900 dark:text-white">Даймохк</h3>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLocationRequestKey((key) => key + 1)}
                  aria-label={t.mapMyLoc}
                  title={t.mapMyLoc}
                  className="rounded-lg bg-slate-100 p-1.5 text-emerald-700 transition hover:bg-white dark:bg-zinc-800 dark:text-emerald-300 dark:hover:bg-zinc-700"
                >
                  <LocateFixed className="h-4 w-4" />
                </button>
                <MapSegmentedControl
                  ariaLabel="Тип карты"
                  active={[mapLayerMode]}
                  onSelect={setMapLayerMode}
                  options={[
                    { value: 'streets', label: t.mapLayerStreets },
                    { value: 'satellite', label: t.mapLayerSatellite },
                    { value: 'hybrid', label: t.mapLayerHybrid },
                  ]}
                />
              </div>
            </div>
            <InteractiveMap
              selectedPosition={selectedProfile?.workplaceCoords ?? (selectedAddress ? { lat: selectedAddress.lat, lng: selectedAddress.lng } : null)}
              showControls={false}
              showProfiles={objectMode === 'profiles'}
              showHouses={objectMode === 'houses'}
              showPlaces={objectMode === 'places'}
              objectMode={objectMode}
              placesCategory={placesCategory}
              onSelect={handleMapSelect}
              onClearSelection={() => setSelectedProfileId(null)}
              mapLayerMode={mapLayerMode}
              onMapLayerModeChange={setMapLayerMode}
              locationRequestKey={locationRequestKey}
              markers={filteredProfiles.map((profile) => {
                // Режим работы владельца действует на всех его анкетах:
                // чужому зрителю берём его из публичной репутации.
                const statusInfo = calculateWorkingStatus(profile, resolveOwnerOverride({
                  isOwner: Boolean(account && profile.ownerId && account.id === profile.ownerId),
                  viewerOverride: account?.statusOverride,
                  ownerOverride: profile.ownerId ? reputation[profile.ownerId]?.statusOverride : undefined,
                }));
                return {
                  id: profile.id,
                  position: profile.workplaceCoords,
                  label: profile.fullName,
                  description: `${statusInfo.label} (${statusInfo.details || ''}) · ${profile.workplaceAddress}`,
                  status: statusInfo.status,
                  isSpecialist: profile.isSpecialist,
                  onClick: () => { setSelectedAddress(null); setSelectedProfileId(profile.id); },
                };
              })}
              // Высота от экрана, а не фиксированные 380/460 px: на
              // большом мониторе карта занимала треть окна, а вокруг
              // оставалась пустота.
              className="h-[420px] sm:h-[min(70vh,720px)]"
            />
            
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 pt-3 dark:border-zinc-700">
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Слои объектов">
                <span className="smk-text-label font-bold text-slate-400">{t.mapShowLayers}</span>
                {/* Ровно тот же компонент, что и «Карта/Спутник/Гибрид»
                    сверху — одинаковое оформление гарантировано. Число
                    показывается только у активного слоя. */}
                <MapSegmentedControl
                  ariaLabel="Слои объектов"
                  active={[objectMode]}
                  // Повторный клик по активному слою выключает его (none).
                  onSelect={(mode) => setObjectMode(objectMode === mode ? 'none' : mode)}
                  options={[
                    { value: 'profiles' as MapObjectMode, label: t.mapLayerProfiles, count: filteredProfiles.length },
                    { value: 'houses' as MapObjectMode, label: t.mapLayerHouses, count: allAddresses.filter((a) => !a.isNotHouse).length },
                    { value: 'places' as MapObjectMode, label: t.mapLayerPlaces, count: allAddresses.filter((a) => a.isNotHouse).length },
                  ]}
                />
              </div>

              {/* Фильтр категорий для слоя «Другое» (как в админке) */}
              {objectMode === 'places' && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label htmlFor="map-place-category" className="smk-text-label font-bold text-slate-400">
                    Категория:
                  </label>
                  {/* Выпадающий список: категорий могут быть десятки,
                      набор кнопок занимал бы несколько строк. */}
                  <select
                    id="map-place-category"
                    value={placesCategory}
                    onChange={(e) => setPlacesCategory(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 smk-text-label font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    <option value="">Все категории</option>
                    {placeCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

            </div>
          </section>

          {selectedProfile && (
            <section className="flex min-w-0 flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950" aria-labelledby="profile-location-title">
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800">
                    <Avatar src={selectedProfile.avatarUrl} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h3 id="profile-location-title" className="break-words text-sm font-bold text-slate-900 dark:text-white">{selectedProfile.fullName}</h3>
                    <ProfileBadges profile={selectedProfile} adminStatus={isProfileAdmin(selectedProfile)} showPending={Boolean(isCurrentUserAdmin || (account && selectedProfile.ownerId === account.id))} />
                    <p className="mt-1 truncate text-sm font-semibold text-emerald-600 dark:text-emerald-400">{selectedProfile.isSpecialist ? selectedProfile.professionTitle || 'Специалист' : 'Житель'}</p>
                    {selectedProfile.rating > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-500">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {selectedProfile.rating.toFixed(1)} · {formatReviews(selectedProfile.reviewCount)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 text-sm text-slate-600 dark:text-zinc-400">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Рабочий адрес</span>
                    <p className="break-words font-semibold text-slate-900 dark:text-white">{selectedProfile.workplaceAddress}</p>
                  </div>
                  <p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap leading-relaxed">{selectedProfile.bio}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveProfileId(selectedProfile.id)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                >
                  <FileText className="h-4 w-4" />
                  Открыть
                </button>
              </div>

              {!account?.isBlocked && !selectedProfile.hidePhone && selectedProfile.phone && (
                <a
                  href={`tel:${selectedProfile.phone}`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-700"
                >
                  <Phone className="h-4 w-4" />
                  Позвонить
                </a>
              )}
            </section>
          )}
        </div>
      </main>
      </div>
      <ProfileModal
        profile={activeProfile}
        isAdminStatus={activeProfile ? isProfileAdmin(activeProfile) : false}
        showPending={Boolean(isCurrentUserAdmin || (account && activeProfile?.ownerId === account.id))}
        isViewerBlocked={Boolean(account?.isBlocked)}
        onClose={() => setActiveProfileId(null)}
        onReview={addReview}
      />
      <ReportDialog
        profile={reportProfile}
        isOpen={Boolean(reportProfile)}
        onClose={() => setReportProfile(null)}
        onSubmit={(reason) => reportProfile ? addComplaint(reportProfile.id, reason) : Promise.resolve()}
      />
      <ConfirmDialog
        isOpen={Boolean(blockProfile)}
        title="Заблокировать?"
        message="Анкета будет скрыта из общего каталога, но останется у администратора в разделе скрытых анкет. Это действие можно отменить."
        confirmLabel="Заблокировать"
        danger
        onConfirm={confirmBlockProfile}
        onCancel={() => setBlockProfile(null)}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onOpenAddModal={() => { setEditingProfile(null); setIsAddModalOpen(true); }}
        onEditProfile={(profile) => { setEditingProfile(profile); setIsAccountModalOpen(false); setIsAddModalOpen(true); }}
      />
      <EditProfileModal
        isOpen={isAddModalOpen}
        account={account}
        profile={editingProfile}
        onClose={() => { setEditingProfile(null); setIsAddModalOpen(false); }}
        onSave={handleSaveProfile}
      />
      <BottomNav
        onOpenMenu={() => setIsMenuDrawerOpen(true)}
        onOpenCreate={() => setIsCreateSheetOpen(true)}
        isAdmin={isCurrentUserAdmin}
      />
      <MobileMenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        isAdmin={isCurrentUserAdmin}
      />
      <CreateActionModal
        isOpen={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
        onOpenCreateProfile={() => {
          setEditingProfile(null);
          setIsAddModalOpen(true);
        }}
      />
    </div>
  );
}
