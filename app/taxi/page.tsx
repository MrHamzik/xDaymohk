'use client';

/**
 * Такси (п.1–8 замечаний 23.08): только карта во весь экран и поля
 * «откуда/куда» в компактной шторке. Без шапки и без переключателя
 * «пассажир/водитель»: таксист на линии видит ленту заказов, все
 * остальные — форму заказа. Анкета таксиста создаётся в профиле.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Car, ChevronDown, CircleCheck, Loader2, LocateFixed, Route, Star, X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import Notice from '@/components/Notice';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import { supabase } from '@/lib/supabase';
import { getUserCoords } from '@/lib/geo';
import { reverseGeocode } from '@/lib/geocoding';
import {
  estimateRide, type SurgeSlot, type TaxiFare, type TaxiTariff,
} from '@/lib/taxi/pricing';
import type { MapMarker } from '@/lib/types';
import { type MapObjectMode } from '@/components/InteractiveMap';

const InteractiveMapLazy = dynamic(() => import('@/components/InteractiveMap'), { ssr: false });

interface DriverCard {
  userId: string;
  isOnline: boolean;
  carModel: string;
  carColor: string;
  carPlate: string;
  rating: number;
  rideCount: number;
}

interface RideRow {
  id: string;
  rider_id: string;
  driver_id: string | null;
  status: string;
  tariff_id: string;
  from_label: string;
  from_lat: number | null;
  from_lng: number | null;
  to_label: string;
  to_lat: number | null;
  to_lng: number | null;
  distance_km: number;
  price: number;
  multiplier: number;
  comment: string;
  passenger_name?: string;
  passenger_phone?: string;
  created_at: string;
  taxi_events?: Array<{ event_type: string; actor: string; created_at: string }>;
  taxi_drivers?: {
    car_model: string;
    car_color: string;
    car_plate: string;
    rating: number;
    is_verified: boolean;
    show_gender?: boolean;
    show_age?: boolean;
    user_profiles?: { full_name: string; gender?: string | null; birth_date?: string | null } | null;
  } | null;
  user_profiles?: { full_name: string } | null;
}

const STATUS_LABELS: Record<string, { ru: string; ce: string }> = {
  searching: { ru: 'Ищем таксиста…', ce: 'Таксист лоьхуш…' },
  assigned: { ru: 'Таксист назначен', ce: 'Таксист хӀоттийна' },
  to_pickup: { ru: 'Едет к вам', ce: 'Хьоьга воьду' },
  in_ride: { ru: 'В поездке', ce: 'Некъехь' },
  completed: { ru: 'Завершена', ce: 'Чекхъяьлла' },
  cancelled: { ru: 'Отменена', ce: 'ДӀаяьккхина' },
};

const EVENT_LABELS: Record<string, { ru: string; ce: string }> = {
  created: { ru: 'Заказ создан', ce: 'Заказ кхоьллина' },
  accept: { ru: 'Таксист принял заказ', ce: 'Таксиста заказ тӀеэцна' },
  to_pickup: { ru: 'Таксист выехал к точке', ce: 'Таксист точке воьлу' },
  in_ride: { ru: 'Поездка началась', ce: 'Некъ болабелла' },
  complete: { ru: 'Поездка завершена', ce: 'Некъ чекхбаьлла' },
  cancel: { ru: 'Заказ отменён', ce: 'Заказ дӀаяьккхина' },
};

export default function TaxiPage() {
  const { t, language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const { account } = useAuth();
  const { profiles } = useProfiles();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const [summary, setSummary] = useState<{
    onlineDrivers: number;
    surge: number;
    tariffs: TaxiTariff[];
    fare: TaxiFare | null;
    slots: SurgeSlot[];
  } | null>(null);

  // Таксист на линии видит заказы; остальные — форму заказа (п.1).
  const [driver, setDriver] = useState<DriverCard | null>(null);
  const [driverLoaded, setDriverLoaded] = useState(false);
  const [orders, setOrders] = useState<RideRow[]>([]);

  // Пассажирская форма.
  const [fromLabel, setFromLabel] = useState('');
  const [fromPoint, setFromPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [toLabel, setToLabel] = useState('');
  const [toPoint, setToPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [pickTarget, setPickTarget] = useState<'from' | 'to'>('from');
  const [tariffId, setTariffId] = useState('economy');
  const [comment, setComment] = useState('');
  const [extraOpen, setExtraOpen] = useState(false);
  const [prefGender, setPrefGender] = useState<'any' | 'male' | 'female'>('any');
  const [prefMinAge, setPrefMinAge] = useState(18);
  const [rideOptions, setRideOptions] = useState<string[]>([]);
  const [forOther, setForOther] = useState(false);
  const [forName, setForName] = useState('');
  const [forPhone, setForPhone] = useState('');
  const [objectMode, setObjectMode] = useState<MapObjectMode>('houses');
  const [locating, setLocating] = useState<'from' | 'to' | null>(null);
  const [routePath, setRoutePath] = useState<Array<[number, number]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [myRides, setMyRides] = useState<RideRow[]>([]);

  const authHeaders = useCallback(async () => {
    if (!supabase) return null;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, []);

  const loadSummary = useCallback(() => {
    void fetch('/api/taxi/summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSummary(data); })
      .catch(() => {});
  }, []);

  const loadDriver = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) { setDriverLoaded(true); return; }
    const res = await fetch('/api/taxi/driver', { cache: 'no-store', headers }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setDriver(data?.driver ?? null);
    setOrders(Array.isArray(data?.rides) ? data.rides : []);
    setDriverLoaded(true);
  }, [authHeaders]);

  const loadRiderRides = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch('/api/taxi/rides?role=rider', { cache: 'no-store', headers }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (Array.isArray(data?.rides)) setMyRides(data.rides);
  }, [authHeaders]);

  const driverOnline = Boolean(driver?.isOnline);

  useEffect(() => {
    loadSummary();
    void loadDriver();
    if (account) void loadRiderRides();
    const timer = window.setInterval(() => {
      loadSummary();
      void loadDriver();
      if (account) void loadRiderRides();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [account?.id, loadSummary, loadDriver, loadRiderRides]); // eslint-disable-line react-hooks/exhaustive-deps

  // Маршрут по улицам (OSRM), п.4: прямая — только фолбэк.
  useEffect(() => {
    if (!fromPoint || !toPoint) { setRoutePath(null); return; }
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${fromPoint.lng},${fromPoint.lat};${toPoint.lng},${toPoint.lat}?overview=full&geometries=geojson`,
          { signal: controller.signal },
        );
        const data = await res.json();
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length > 1) {
          setRoutePath(coords.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]));
          return;
        }
        setRoutePath(null);
      } catch {
        setRoutePath(null);
      }
    })();
    return () => controller.abort();
  }, [fromPoint?.lat, fromPoint?.lng, toPoint?.lat, toPoint?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimate = useMemo(() => {
    if (!summary?.fare || !fromPoint || !toPoint) return null;
    const tariff = summary.tariffs.find((x) => x.id === tariffId);
    if (!tariff) return null;
    return estimateRide(fromPoint, toPoint, summary.fare, tariff, summary.slots ?? [], new Date(), rideOptions);
  }, [summary, fromPoint, toPoint, tariffId, rideOptions]);

  // Анкеты для слоя «Анкеты» (п.2: слой обязан показывать анкеты).
  const profileMarkers: MapMarker[] = useMemo(
    () => profiles
      .filter((p) => !p.isHidden && !p.isBanned && p.workplaceCoords && Number.isFinite(p.workplaceCoords.lat) && Number.isFinite(p.workplaceCoords.lng))
      .map((p) => ({
        id: p.id,
        position: { lat: p.workplaceCoords!.lat, lng: p.workplaceCoords!.lng },
        label: p.fullName || p.professionTitle || '',
        description: p.professionTitle || undefined,
        isSpecialist: Boolean(p.isSpecialist),
      })),
    [profiles],
  );

  const locate = async (target: 'from' | 'to') => {
    setLocating(target);
    try {
      const position = await getUserCoords(true);
      if (!position) return;
      let label = `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
      try {
        const geo = await reverseGeocode(position);
        if (geo) label = geo;
      } catch { /* координаты */ }
      if (target === 'from') { setFromPoint({ lat: position.lat, lng: position.lng }); setFromLabel(label); }
      else { setToPoint({ lat: position.lat, lng: position.lng }); setToLabel(label); }
    } finally {
      setLocating(null);
    }
  };

  const orderRide = async () => {
    const headers = await authHeaders();
    if (!headers) { setNotice(L('Сначала войдите в аккаунт.', 'Хьалха аккаунте чувала.')); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/taxi/rides', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromLabel, toLabel,
          fromLat: fromPoint?.lat, fromLng: fromPoint?.lng,
          toLat: toPoint?.lat, toLng: toPoint?.lng,
          tariffId, comment,
          prefGender, prefMinAge, options: rideOptions,
          passengerName: forOther ? forName : '',
          passengerPhone: forOther ? forPhone : '',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setNotice(data?.error ?? L('Не удалось создать заказ', 'Заказ кхолла ца делира')); return; }
      setNotice('');
      await loadRiderRides();
    } finally {
      setBusy(false);
    }
  };

  const rideAction = async (id: string, action: string) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/taxi/rides/${id}/action`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setNotice(data?.error ?? L('Не удалось выполнить действие', 'Дан ца делира'));
      else setNotice('');
      await loadDriver();
      await loadRiderRides();
      loadSummary();
    } finally {
      setBusy(false);
    }
  };

  const rateRide = async (rideId: string, to: 'driver' | 'rider', stars: number) => {
    const headers = await authHeaders();
    if (!headers) return;
    await fetch(`/api/taxi/rides/${rideId}/rate`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, stars }),
    }).catch(() => {});
    await loadRiderRides();
  };

  const activeRide = useMemo(
    () => myRides.find((r) => ['searching', 'assigned', 'to_pickup', 'in_ride'].includes(r.status)) ?? null,
    [myRides],
  );
  const activeDriverRide = useMemo(
    () => orders.find((r) => ['assigned', 'to_pickup', 'in_ride'].includes(r.status)) ?? null,
    [orders],
  );
  const openOrders = useMemo(() => orders.filter((r) => r.status === 'searching'), [orders]);

  const field = 'smk-field w-full px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white';

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />
      {notice && <Notice message={notice} type="error" onClose={() => setNotice('')} />}

      <div className="smk-shell">
        <AppSidebar isAdmin={Boolean(account?.isAdmin)} />
        <main className="smk-shell-main relative">
          {/* Карта во весь экран (п.1): только карта и точки. */}
          <section className="relative -mx-4 -my-4 overflow-hidden sm:-mx-6">
            <div className="relative h-[calc(100dvh-4rem)] min-h-[520px]">
              <InteractiveMapLazy
                className="h-full w-full"
                route={fromPoint && toPoint ? { from: fromPoint, to: toPoint, path: routePath ?? undefined } : null}
                showProfiles
                showHouses
                showPlaces
                objectMode={objectMode}
                markers={profileMarkers}
                onSelect={(pos, explicit) => {
                  const target = pickTarget;
                  void (async () => {
                    let label = explicit ?? '';
                    if (!label) {
                      try {
                        const g = await reverseGeocode(pos);
                        label = g || `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
                      } catch {
                        label = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
                      }
                    }
                    if (target === 'from') { setFromPoint({ lat: pos.lat, lng: pos.lng }); setFromLabel(label); }
                    else { setToPoint({ lat: pos.lat, lng: pos.lng }); setToLabel(label); }
                  })();
                }}
              />

              {/* Слои (п.2): «Анкеты, Дома, Другое», отдельно от
                  «Карта/Спутник/Гибрид»; повторный клик выключает. */}
              <div className="absolute left-2 top-16 z-[450] flex gap-1 sm:top-14">
                {([
                  ['profiles', L('Анкеты', 'Анкеташ')],
                  ['houses', L('Дома', 'ЦIенош')],
                  ['places', L('Другое', 'Кхин')],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setObjectMode(objectMode === mode ? 'none' : mode)}
                    className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold shadow-md transition ${
                      objectMode === mode
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white/95 text-slate-600 hover:bg-white dark:bg-zinc-900/95 dark:text-zinc-400 dark:hover:bg-zinc-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Таксист на линии: лента заказов вместо формы (п.1). */}
              {driverLoaded && driverOnline ? (
                <div className="absolute inset-x-0 bottom-20 z-[450] max-h-[55%] space-y-2 overflow-y-auto p-2 sm:bottom-3">
                  <div className="smk-sheet flex items-center gap-2 rounded-2xl p-2.5 shadow-xl">
                    <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="flex-1 text-xs font-bold text-slate-900 dark:text-white">
                      {L('Вы на линии', 'Хьо линии тIехь ву')} · ★{Number(driver?.rating ?? 0).toFixed(1)}
                    </p>
                    <button
                      type="button"
                      onClick={() => void (async () => {
                        const headers = await authHeaders();
                        if (!headers) return;
                        await fetch('/api/taxi/driver', {
                          method: 'PUT',
                          headers: { ...headers, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ isOnline: false }),
                        }).catch(() => {});
                        await loadDriver();
                        loadSummary();
                      })()}
                      className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:border-zinc-800 dark:text-zinc-400"
                    >
                      {L('Сойти с линии', 'Линера дала')}
                    </button>
                  </div>

                  {activeDriverRide && (
                    <RideCard
                      ride={activeDriverRide}
                      isRiderView={false}
                      language={language}
                      busy={busy}
                      onAction={(action) => void rideAction(activeDriverRide.id, action)}
                      cancelFee={summary?.fare?.cancelFee ?? 0}
                    />
                  )}

                  {!activeDriverRide && openOrders.map((order) => (
                    <div key={order.id} className="smk-sheet space-y-1.5 rounded-2xl p-3 shadow-xl">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {order.from_label} → {order.to_label}
                      </p>
                      <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                        {order.distance_km} {L('км', 'км')} · {order.price} ₽ · {order.tariff_id}
                        {order.passenger_name ? ` · ${L('пассажир', 'пассажир')}: ${order.passenger_name} ${order.passenger_phone}` : ''}
                      </p>
                      {order.comment && <p className="smk-text-label italic text-slate-400">«{order.comment}»</p>}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void rideAction(order.id, 'accept')}
                        className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {L('Принять заказ', 'Заказ тӀеэца')}
                      </button>
                    </div>
                  ))}

                  {!activeDriverRide && openOrders.length === 0 && (
                    <p className="smk-sheet rounded-2xl p-3 text-center smk-text-label text-slate-500 shadow-xl dark:text-zinc-400">
                      {L('Заказов пока нет — уведомим.', 'Заказаш хӀинца яц — хаам бер бу.')}
                    </p>
                  )}
                </div>
              ) : (
                <>
                {/* Шторка заказа: фиксирована над нижним меню (п.3). */}
                <div className="absolute inset-x-0 bottom-20 z-[450] p-2 sm:bottom-3 sm:p-3">
                  <div className="smk-sheet max-h-[55%] space-y-2 overflow-y-auto rounded-3xl p-3 shadow-2xl">
                    {/* п.8: вместо «откуда/куда» — цена, расстояние, время. */}
                    <p className="text-center text-sm font-black text-slate-900 dark:text-white">
                      {estimate
                        ? `${estimate.price} ₽ · ${estimate.distanceKm} ${L('км', 'км')} · ≈${estimate.minutes} ${L('мин', 'мин')}${estimate.surge > 1 ? ` · ×${estimate.surge}` : ''}`
                        : L('Выберите точки на карте или в полях', 'Картехь я поляшкахь точкаш харжа')}
                    </p>

                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                      {(summary?.tariffs ?? []).map((tariff) => (
                        <button
                          key={tariff.id}
                          type="button"
                          onClick={() => setTariffId(tariff.id)}
                          className={`shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                            tariffId === tariff.id
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {language === 'ce' && tariff.labelCe ? tariff.labelCe : tariff.labelRu}
                        </button>
                      ))}
                    </div>

                    {/* п.6: фокус поля выбирает, куда поставит клик по
                        карте; иконка — текущее местоположение. */}
                    <div className="flex items-center gap-1.5">
                      <input
                        value={fromLabel}
                        onFocus={() => setPickTarget('from')}
                        onChange={(e) => setFromLabel(e.target.value)}
                        placeholder={L('Откуда', 'Мичара')}
                        className={field}
                      />
                      <button
                        type="button"
                        onClick={() => void locate('from')}
                        title={L('Моё местоположение', 'Сан меттиг')}
                        aria-label={L('Моё местоположение', 'Сан меттиг')}
                        className="smk-field flex h-9 w-9 shrink-0 items-center justify-center"
                      >
                        {locating === 'from' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={toLabel}
                        onFocus={() => setPickTarget('to')}
                        onChange={(e) => setToLabel(e.target.value)}
                        placeholder={L('Куда', 'Мича')}
                        className={field}
                      />
                      <button
                        type="button"
                        onClick={() => void locate('to')}
                        title={L('Моё местоположение', 'Сан меттиг')}
                        aria-label={L('Моё местоположение', 'Сан меттиг')}
                        className="smk-field flex h-9 w-9 shrink-0 items-center justify-center"
                      >
                        {locating === 'to' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* п.7: «заказать для другого» — в дополнительном. */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setExtraOpen((v) => !v)}
                        className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {L('Дополнительно', 'Кхин тIе')}
                        <ChevronDown className={`h-3.5 w-3.5 transition ${extraOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {extraOpen && (
                        <div className="space-y-2 pt-2">
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
                            <input type="checkbox" checked={forOther} onChange={(e) => setForOther(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
                            {L('Заказать для другого', 'Кхечунна заказ дала')}
                          </label>
                          {forOther && (
                            <div className="grid grid-cols-2 gap-2">
                              <input value={forName} onChange={(e) => setForName(e.target.value)} placeholder={L('Имя пассажира', 'Пассажирин цIе')} className={field} />
                              <input value={forPhone} onChange={(e) => setForPhone(e.target.value)} placeholder={L('Телефон', 'Телефон')} inputMode="tel" className={field} />
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={prefGender}
                              onChange={(e) => setPrefGender(e.target.value as 'any' | 'male' | 'female')}
                              aria-label={L('Пол таксиста', 'Таксистан пол')}
                              className={field}
                            >
                              <option value="any">{L('Пол: без разницы', 'Пол: тайпана дац')}</option>
                              <option value="female">{L('Пол: женщина', 'Пол: зуда')}</option>
                              <option value="male">{L('Пол: мужчина', 'Пол: боьрша')}</option>
                            </select>
                            <select
                              value={String(prefMinAge)}
                              onChange={(e) => setPrefMinAge(Number(e.target.value))}
                              aria-label={L('Возраст таксиста', 'Таксистан хан')}
                              className={field}
                            >
                              {[18, 21, 25, 30, 40].map((age) => (
                                <option key={age} value={age}>{L(`Возраст: от ${age}`, `Хан: ${age}+`)}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {([
                              ['animals', L('С животными', 'Дийнаташца')],
                              ['cargo', L('Багаж', 'Багаж')],
                              ['child_seat', L('Детское кресло', 'Беран гIанда')],
                            ] as const).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setRideOptions((current) => current.includes(id)
                                  ? current.filter((x) => x !== id)
                                  : [...current, id])}
                                className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                                  rideOptions.includes(id)
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <input
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder={L('Комментарий', 'Комментари')}
                            maxLength={500}
                            className={field}
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busy || !fromLabel || !toLabel || !fromPoint || !toPoint}
                      onClick={() => void orderRide()}
                      className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {L('Заказать', 'Заказ дала')}
                    </button>
                  </div>

                  {/* Активная поездка пассажира — поверх шторки. */}
                  {activeRide && (
                    <div className="mt-2">
                      <RideCard
                        ride={activeRide}
                        isRiderView
                        language={language}
                        busy={busy}
                        onAction={(action) => void rideAction(activeRide.id, action)}
                        onRated={(to, stars) => void rateRide(activeRide.id, to, stars)}
                        cancelFee={summary?.fare?.cancelFee ?? 0}
                      />
                    </div>
                  )}
                </div>
                </>
              )}
            </div>
          </section>
        </main>
      </div>

      <MobileMenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} isAdmin={Boolean(account?.isAdmin)} />
      <BottomNav onOpenMenu={() => setIsMenuOpen(true)} onOpenCreate={() => setIsCreateOpen(true)} isAdmin={Boolean(account?.isAdmin)} />
      <CreateActionModal
        isOpen={isCreateOpen}
        onOpenPlus={() => setIsCreateOpen(true)}
        onClose={() => setIsCreateOpen(false)}
        onOpenCreateProfile={() => setIsCreateOpen(false)}
        onOpenTaxi={() => setIsCreateOpen(false)}
      />
    </div>
  );
}

/** Карточка поездки: статус, события, действия, оценка. */
function RideCard({
  ride, isRiderView, language, busy, onAction, onRated, cancelFee = 0,
}: {
  ride: RideRow;
  isRiderView: boolean;
  language: 'ru' | 'ce';
  busy: boolean;
  onAction: (action: string) => void;
  onRated?: (to: 'driver' | 'rider', stars: number) => void;
  cancelFee?: number;
}) {
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const status = STATUS_LABELS[ride.status] ?? { ru: ride.status, ce: ride.status };
  const driver = ride.taxi_drivers;

  const nextAction = !isRiderView
    ? ride.status === 'assigned' ? 'to_pickup'
      : ride.status === 'to_pickup' ? 'in_ride'
        : ride.status === 'in_ride' ? 'complete' : null
    : null;
  const nextLabel = nextAction === 'to_pickup' ? L('Выехал к точке', 'Точке воьлу')
    : nextAction === 'in_ride' ? L('Пассажир в машине', 'Пассажир чохь')
      : nextAction === 'complete' ? L('Завершить поездку', 'Некъ чекхбаккха') : null;

  return (
    <section className="smk-sheet space-y-2 rounded-3xl p-3 shadow-2xl">
      <div className="flex items-center gap-2">
        <CircleCheck className="h-4 w-4 text-emerald-600" />
        <p className="flex-1 text-xs font-bold text-slate-900 dark:text-white">{status[language === 'ce' ? 'ce' : 'ru']}</p>
        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">{ride.price} ₽</span>
      </div>
      <p className="text-xs text-slate-600 dark:text-zinc-400">
        {ride.from_label} → {ride.to_label} · {ride.distance_km} {L('км', 'км')}
      </p>
      {isRiderView && driver && (
        <p className="text-xs text-slate-600 dark:text-zinc-400">
          <Car className="mr-1 inline h-3 w-3 text-emerald-600" />
          {driver.user_profiles?.full_name ?? L('Таксист', 'Таксист')}
          {driver.show_gender && driver.user_profiles?.gender
            ? ` · ${driver.user_profiles.gender === 'female' ? L('жен', 'зуда') : driver.user_profiles.gender === 'male' ? L('муж', 'боьрша') : ''}`
            : ''}
          {` · ${driver.car_color} ${driver.car_model} · ${driver.car_plate}`}
          {driver.is_verified ? ` · ${L('проверен', 'теллина')}` : ''}
        </p>
      )}
      {!isRiderView && ride.passenger_name && (
        <p className="text-xs text-slate-600 dark:text-zinc-400">
          {L('Пассажир', 'Пассажир')}: {ride.passenger_name} {ride.passenger_phone}
        </p>
      )}
      <div className="flex gap-2">
        {nextAction && nextLabel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(nextAction)}
            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {nextLabel}
          </button>
        )}
        {(ride.status === 'searching' || ride.status === 'assigned' || ride.status === 'to_pickup') && (
          <span className="flex flex-col">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction('cancel')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <X className="h-3.5 w-3.5" />
              {L('Отменить', 'ДӀаяккха')}
            </button>
            {cancelFee > 0 && ride.status !== 'searching' && (
              <span className="mt-1 smk-text-label text-slate-400 dark:text-zinc-500">
                {L(`отмена после принятия — ${cancelFee} ₽ водителю`, `тIеэцначул тIаьхьа дIаяккхар — ${cancelFee} ₽`)}
              </span>
            )}
          </span>
        )}
        {ride.from_lat != null && ride.to_lat != null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${ride.from_lat},${ride.from_lng}&destination=${ride.to_lat},${ride.to_lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Route className="h-3.5 w-3.5" />
            {L('Маршрут', 'Маршрут')}
          </a>
        )}
      </div>

      {isRiderView && ride.status === 'completed' && onRated && (
        <div className="flex gap-0.5 border-t border-slate-100 pt-2 dark:border-zinc-800">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} type="button" aria-label={`${star}★`} onClick={() => onRated('driver', star)} className="p-0.5 text-slate-300 transition hover:text-amber-400">
              <Star className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}

      {Array.isArray(ride.taxi_events) && ride.taxi_events.length > 0 && (
        <div className="space-y-0.5 border-t border-slate-100 pt-2 dark:border-zinc-800">
          {[...ride.taxi_events]
            .sort((x, y) => x.created_at.localeCompare(y.created_at))
            .slice(-4)
            .map((ev) => (
              <p key={ev.created_at + ev.event_type} className="smk-text-label text-slate-500 dark:text-zinc-500">
                {(EVENT_LABELS[ev.event_type] ?? { ru: ev.event_type, ce: ev.event_type })[language === 'ce' ? 'ce' : 'ru']}
                {' · '}
                {new Date(ev.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
