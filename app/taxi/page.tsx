'use client';

/**
 * ВайТакси v1 — механика по мотивам Яндекс Такси (согласованный скоуп):
 * пассажир заказывает А→Б с ценой до заказа (подача + км + минуты ×
 * тариф × спрос), первый нажавший «Принять» таксист везёт; статусы
 * поиск→назначен→еду→в поездке→завершено; взаимные оценки.
 * Тарифы — набор «как в Яндексе» (Эконом/Комфорт/Бизнес/Минивэн).
 * Оплата — наличными/СБП мимо сервиса.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Bike, Car, CircleCheck, Loader2, LocateFixed, Map as MapIcon, MapPin, Route, Star, X,
} from 'lucide-react';

/* Карта — только на клиенте (leaflet не живёт в SSR). */
const TaxiMapModal = dynamic(() => import('@/components/taxi/TaxiMapModal'), { ssr: false });
import InteractiveMapLazy from '@/components/InteractiveMapLazy';
import { type MapLayerMode, type MapObjectMode } from '@/components/InteractiveMap';
import { reverseGeocode } from '@/lib/geocoding';
import { ChevronDown as ChevronDownIcon } from 'lucide-react';
import Navbar from '@/components/Navbar';
import AppSidebar from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import Notice from '@/components/Notice';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { getUserCoords } from '@/lib/geo';
import {
  estimateRide, type SurgeSlot, type TaxiFare, type TaxiTariff,
} from '@/lib/taxi/pricing';

interface DriverCard {
  userId: string;
  isOnline: boolean;
  carModel: string;
  carColor: string;
  carPlate: string;
  yearsDriving: number;
  tariffs: string[];
  isVerified: boolean;
  rating: number;
  rideCount: number;
  showGender: boolean;
  showAge: boolean;
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
}

/** Лента событий поездки (п.13): что и когда произошло. */
const EVENT_LABELS: Record<string, { ru: string; ce: string }> = {
  created: { ru: 'Заказ создан', ce: 'Заказ кхоьллина' },
  accept: { ru: 'Таксист принял заказ', ce: 'Таксиста заказ тIеэцна' },
  to_pickup: { ru: 'Таксист выехал к точке', ce: 'Таксист точке воьлу' },
  in_ride: { ru: 'Поездка началась', ce: 'Некъ болабелла' },
  complete: { ru: 'Поездка завершена', ce: 'Некъ чекхбаьлла' },
  cancel: { ru: 'Заказ отменён', ce: 'Заказ дIаяьккхина' },
};

const STATUS_LABELS: Record<string, { ru: string; ce: string }> = {
  searching: { ru: 'Ищем таксиста…', ce: 'Таксист лоьхуш…' },
  assigned: { ru: 'Таксист назначен', ce: 'Таксист хӀоттийна' },
  to_pickup: { ru: 'Едет к вам', ce: 'Хьоьга воьду' },
  in_ride: { ru: 'В поездке', ce: 'Некъехь' },
  completed: { ru: 'Завершена', ce: 'Чекхъяьлла' },
  cancelled: { ru: 'Отменена', ce: 'ДӀаяьккхина' },
};

export default function TaxiPage() {
  const { t, language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const { account } = useAuth();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const [mode, setMode] = useState<'rider' | 'driver'>(() => {
    if (typeof window === 'undefined') return 'rider';
    return new URLSearchParams(window.location.search).get('tab') === 'driver' ? 'driver' : 'rider';
  });
  const [summary, setSummary] = useState<{
    onlineDrivers: number;
    surge: number;
    tariffs: TaxiTariff[];
    fare: TaxiFare | null;
    slots: SurgeSlot[];
  } | null>(null);
  /** Карта: выбор точки «откуда/куда» или просмотр маршрута. */
  const [mapMode, setMapMode] = useState<null | 'from' | 'to' | 'route'>(null);
  const [pickTarget, setPickTarget] = useState<'from' | 'to'>('to');
  const [objectMode, setObjectMode] = useState<MapObjectMode>('houses');
  const [layerMode, setLayerMode] = useState<MapLayerMode>('streets');
  const [extraOpen, setExtraOpen] = useState(false);
  const [carNotInList, setCarNotInList] = useState(false);
  // п.11: предпочтения пассажира и опции поездки.
  const [prefGender, setPrefGender] = useState<'any' | 'male' | 'female'>('any');
  const [prefMinAge, setPrefMinAge] = useState(18);
  const [rideOptions, setRideOptions] = useState<string[]>([]);
  const [routeRide, setRouteRide] = useState<RideRow | null>(null);

  // ── пассажир ──
  const [fromLabel, setFromLabel] = useState('');
  const [fromPoint, setFromPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [toLabel, setToLabel] = useState('');
  const [toPoint, setToPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [tariffId, setTariffId] = useState('economy');
  const [comment, setComment] = useState('');
  const [myRides, setMyRides] = useState<RideRow[]>([]);
  const [locating, setLocating] = useState(false);

  // ── таксист ──
  const [driver, setDriver] = useState<DriverCard | null>(null);
  const [driverLoaded, setDriverLoaded] = useState(false);
  const [carModel, setCarModel] = useState('');
  const [carColor, setCarColor] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [driverTariffs, setDriverTariffs] = useState<string[]>(['economy']);
  const [showGender, setShowGender] = useState(false);
  const [showAge, setShowAge] = useState(false);
  const [orders, setOrders] = useState<RideRow[]>([]);
  const [busy, setBusy] = useState(false);

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

  const loadRiderRides = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch('/api/taxi/rides?role=rider', { cache: 'no-store', headers });
    const data = await res.json().catch(() => null);
    if (Array.isArray(data?.rides)) setMyRides(data.rides);
  }, [authHeaders]);

  const loadDriver = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch('/api/taxi/driver', { cache: 'no-store', headers });
    const data = await res.json().catch(() => null);
    setDriver(data?.driver ?? null);
    setOrders(Array.isArray(data?.rides) ? data.rides : []);
    if (data?.driver) {
      setCarModel(data.driver.carModel);
      setCarColor(data.driver.carColor);
      setCarPlate(data.driver.carPlate);
      setDriverTariffs(data.driver.tariffs?.length ? data.driver.tariffs : ['economy']);
      setShowGender(Boolean(data.driver.showGender));
      setShowAge(Boolean(data.driver.showAge));
    }
    setDriverLoaded(true);
  }, [authHeaders]);

  useEffect(() => {
    loadSummary();
    if (!account) return;
    void loadRiderRides();
    void loadDriver();
    const timer = window.setInterval(() => {
      loadSummary();
      void loadRiderRides();
      if (mode === 'driver') void loadDriver();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [account?.id, mode, loadSummary, loadRiderRides, loadDriver]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeRide = useMemo(
    () => myRides.find((r) => ['searching', 'assigned', 'to_pickup', 'in_ride'].includes(r.status)) ?? null,
    [myRides],
  );
  const activeDriverRide = useMemo(
    () => orders.find((r) => ['assigned', 'to_pickup', 'in_ride'].includes(r.status)) ?? null,
    [orders],
  );
  const openOrders = useMemo(
    () => orders.filter((r) => r.status === 'searching'),
    [orders],
  );

  // Цена «на берегу» — та же математика, что на сервере.
  // Цена «на берегу» — та же математика, что на сервере, и с текущим
  // множителем спроса: пассажир видит, сколько реально заплатит (п.12).
  const estimate = useMemo(() => {
    if (!summary?.fare || !fromPoint || !toPoint) return null;
    const tariff = summary.tariffs.find((x) => x.id === tariffId);
    if (!tariff) return null;
    return estimateRide(fromPoint, toPoint, summary.fare, Number(tariff.multiplier), summary.slots ?? [], new Date());
  }, [summary, fromPoint, toPoint, tariffId]);

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

  const rideAction = async (id: string, action: string, reload: () => Promise<void>) => {
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
      await reload();
      loadSummary();
    } finally {
      setBusy(false);
    }
  };

  const saveDriverCard = async (online?: boolean) => {
    const headers = await authHeaders();
    if (!headers) { setNotice(L('Сначала войдите в аккаунт.', 'Хьалха аккаунте чувала.')); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/taxi/driver', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carModel, carColor, carPlate, tariffs: driverTariffs,
          showGender, showAge,
          ...(online !== undefined ? { isOnline: online } : {}),
        }),
      });
      // «Моей машины нет в списке» — ручной ввод уходит админам (п.3).
      if (carNotInList && carModel.trim()) {
        await fetch('/api/taxi/cars', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ name: carModel.trim() }),
        }).catch(() => {});
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) { setNotice(data?.error ?? L('Не удалось сохранить', 'ДӀаязъян ца делира')); return; }
      setNotice('');
      await loadDriver();
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

  const locateMe = async () => {
    setLocating(true);
    try {
      const coords = await getUserCoords();
      if (coords) {
        setFromPoint({ lat: coords.lat, lng: coords.lng });
        setFromLabel(L('Я здесь', 'Со кхузахь'));
      }
    } catch {
      setNotice(L('Геолокация недоступна', 'Геолокаци ца кхочу'));
    } finally {
      setLocating(false);
    }
  };

  const field = 'smk-field w-full px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white';

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />
      {notice && <Notice message={notice} type="error" onClose={() => setNotice('')} />}

      <div className="smk-shell">
        <AppSidebar isAdmin={Boolean(account?.isAdmin)} />
        <main className="smk-shell-main">
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <Car className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-black text-slate-900 dark:text-white sm:text-xl">
                {L('Такси', 'Такси')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {summary
                  ? `${L('Онлайн таксистов', 'Онлайн таксисташ')}: ${summary.onlineDrivers} · ${L('множитель', 'множитель')} ×${summary.surge}`
                  : L('Сервис поездок по селу и республике', 'Юьртахь а, республикехь а некъийн сервис')}
              </p>
            </div>
          </header>

          {!account && (
            <p className="smk-note smk-note-warn mb-4 p-3">
              {L('ВайТакси доступно после входа в аккаунт.', 'ВайТакси аккаунте чувалча мега.')}
            </p>
          )}

          {/* Переключатель ролей */}
          <div className="smk-field mb-4 flex gap-1 rounded-2xl p-1">
            {(['rider', 'driver'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${
                  mode === m ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                {m === 'rider' ? L('Мне нужно ехать', 'Со ваха оьшу') : L('Я таксист', 'Со таксист ву')}
              </button>
            ))}
          </div>

          {mode === 'rider' && (
            <div className="space-y-4">
              {/* relative z-20: подсказки адресов и тарифы не должны
                  перекрываться следующими блоками (п.11). */}
              {!activeRide && (
                <section className="relative -mx-4 -my-4 overflow-hidden sm:-mx-6">
                  {/* Наша карта из раздела «Карта» — во весь экран
                      (п.1, п.12): режимы и слои — её штатные контролы,
                      маршрут А→Б рисуется автоматически. */}
                  <div className="relative h-[calc(100dvh-9rem)] min-h-[520px]">
                    <InteractiveMapLazy
                      className="h-full w-full"
                      route={fromPoint && toPoint ? { from: fromPoint, to: toPoint } : null}
                      showProfiles
                      showHouses
                      showPlaces
                      objectMode={objectMode}
                      mapLayerMode={layerMode}
                      onMapLayerModeChange={setLayerMode}
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
                    {/* Слои точек — компактно поверх карты. */}
                    <div className="absolute right-2 top-2 z-[500] flex gap-1">
                      {([
                        ['houses', L('Дома', 'ЦIенош')],
                        ['places', L('Другое', 'Кхин')],
                        ['profiles', L('Анкеты', 'Анкеташ')],
                        ['none', L('Скрыть', 'Къайла')],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setObjectMode(mode)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-bold shadow transition ${
                            objectMode === mode
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white/95 text-slate-600 hover:bg-white dark:bg-zinc-900/95 dark:text-zinc-400'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Нижняя шторка с полями — как в Яндекс Такси. */}
                    <div className="absolute inset-x-0 bottom-0 z-[500] p-2 sm:p-3">
                      <div className="smk-sheet max-h-[60%] space-y-2 overflow-y-auto rounded-3xl p-3 shadow-2xl">
                        <div className="flex items-center gap-1.5">
                          {(['from', 'to'] as const).map((target) => (
                            <button
                              key={target}
                              type="button"
                              onClick={() => setPickTarget(target)}
                              className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                                pickTarget === target
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                              }`}
                            >
                              {target === 'from' ? L('Откуда', 'Мичара') : L('Куда', 'Мича')}
                            </button>
                          ))}
                          <span className="ml-auto smk-text-label text-slate-400 dark:text-zinc-500">
                            {L('тык по карте — поставит точку', 'картехь тIетаIа — точка хIоттур ю')}
                          </span>
                        </div>

                        <div className="flex items-end gap-1.5">
                          <div className="flex-1">
                            <AddressAutocomplete id="taxi-from" value={fromLabel} onChange={(v) => setFromLabel(v)} onSelect={(sg) => { setFromLabel(sg.displayName); setFromPoint({ lat: sg.lat, lng: sg.lng }); }} />
                          </div>
                          <button
                            type="button"
                            onClick={() => void locateMe()}
                            title={L('Где я?', 'Со мичахь?')}
                            aria-label={L('Где я?', 'Со мичахь?')}
                            className="smk-field flex h-9 w-9 shrink-0 items-center justify-center"
                          >
                            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                          </button>
                        </div>
                        <AddressAutocomplete id="taxi-to" value={toLabel} onChange={(v) => setToLabel(v)} onSelect={(sg) => { setToLabel(sg.displayName); setToPoint({ lat: sg.lat, lng: sg.lng }); }} />

                        {/* Тарифы с ценой и множителем — на виду. */}
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                          {(summary?.tariffs ?? []).map((tariff) => {
                            const price = (() => {
                              if (!summary?.fare || !fromPoint || !toPoint) return null;
                              return estimateRide(fromPoint, toPoint, summary.fare, Number(tariff.multiplier), summary.slots ?? [], new Date()).price;
                            })();
                            return (
                              <button
                                key={tariff.id}
                                type="button"
                                onClick={() => setTariffId(tariff.id)}
                                className={`shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                                  tariffId === tariff.id
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                                }`}
                              >
                                {language === 'ce' && tariff.labelCe ? tariff.labelCe : tariff.labelRu}
                                {price != null ? ` · ${price} ₽` : ''}
                              </button>
                            );
                          })}
                        </div>

                        {/* Дополнительно — раскрывающийся список (п.1). */}
                        <div>
                          <button
                            type="button"
                            onClick={() => setExtraOpen((v) => !v)}
                            className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            {L('Дополнительно', 'Кхин тIе')}
                            <ChevronDownIcon className={`h-3.5 w-3.5 transition ${extraOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {extraOpen && (
                            <div className="space-y-2 pt-2">
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={prefGender}
                                  onChange={(e) => setPrefGender(e.target.value as 'any' | 'male' | 'female')}
                                  aria-label={L('Пол таксиста', 'Таксистан пол')}
                                  className="smk-field w-full px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                                >
                                  <option value="any">{L('Пол: без разницы', 'Пол: тайпана дац')}</option>
                                  <option value="female">{L('Пол: женщина', 'Пол: зуда')}</option>
                                  <option value="male">{L('Пол: мужчина', 'Пол: боьрша')}</option>
                                </select>
                                <select
                                  value={String(prefMinAge)}
                                  onChange={(e) => setPrefMinAge(Number(e.target.value))}
                                  aria-label={L('Возраст таксиста', 'Таксистан хан')}
                                  className="smk-field w-full px-2.5 py-2 text-xs text-slate-900 dark:text-white"
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
                                className="smk-field w-full px-2.5 py-2 text-xs text-slate-900 dark:text-white"
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
                          {estimate != null
                            ? `${L('Заказать', 'Заказ дала')} · ${estimate.price} ₽ · ${estimate.minutes} ${L('мин', 'мин')}`
                            : L('Заказать', 'Заказ дала')}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeRide && (
                <RideCard
                  ride={activeRide}
                  isRiderView
                  language={language}
                  busy={busy}
                  onAction={(action) => void rideAction(activeRide.id, action, loadRiderRides)}
                  onShowRoute={() => { setRouteRide(activeRide); setMapMode('route'); }}
                />
              )}

              {/* История */}
              {myRides.filter((r) => ['completed', 'cancelled'].includes(r.status)).length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-extrabold text-slate-900 dark:text-white">
                    {L('История поездок', 'Некъийн истори')}
                  </h2>
                  <div className="space-y-2">
                    {myRides.filter((r) => ['completed', 'cancelled'].includes(r.status)).slice(0, 10).map((ride) => (
                      <div key={ride.id} className="smk-lux flex items-center gap-3 p-3">
                        <Bike className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {ride.from_label} → {ride.to_label}
                          </p>
                          <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                            {(STATUS_LABELS[ride.status] ?? { ru: ride.status, ce: ride.status })[language === 'ce' ? 'ce' : 'ru']} · {ride.price} ₽
                          </p>
                        </div>
                        {ride.status === 'completed' && (
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button key={star} type="button" aria-label={`${star}★`} onClick={() => void rateRide(ride.id, 'driver', star)} className="p-0.5 text-slate-300 transition hover:text-amber-400">
                                <Star className="h-4 w-4" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {mode === 'driver' && (
            <div className="space-y-4">
              {!driverLoaded && <p className="smk-text-label text-slate-500">{t.loading}</p>}

              {driverLoaded && !driver && (
                <section className="smk-lux space-y-2.5 rounded-3xl p-4">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {L('Анкета таксиста', 'Таксистан анкета')}
                  </h2>
                  <CarModelInput value={carModel} onChange={setCarModel} notInList={carNotInList} onNotInList={setCarNotInList} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input value={carColor} onChange={(e) => setCarColor(e.target.value)} placeholder={L('Цвет', 'Бос')} className={field} />
                    <input value={carPlate} onChange={(e) => setCarPlate(e.target.value)} placeholder={L('Номер А123ВС95', 'Лоьмар А123ВС95')} className={field} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(summary?.tariffs ?? []).map((tariff) => (
                      <button
                        key={tariff.id}
                        type="button"
                        onClick={() => setDriverTariffs((current) => current.includes(tariff.id)
                          ? current.filter((x) => x !== tariff.id)
                          : [...current, tariff.id])}
                        className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                          driverTariffs.includes(tariff.id)
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {language === 'ce' && tariff.labelCe ? tariff.labelCe : tariff.labelRu}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy || driverTariffs.length === 0}
                    onClick={() => void saveDriverCard(true)}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {L('Стать таксистом и выйти на линию', 'Таксист хила а, линии тӀе вала а')}
                  </button>
                </section>
              )}

              {driverLoaded && driver && (
                <section className="smk-lux space-y-2.5 rounded-3xl p-4">
                  {/* Анкета авто правится на месте (п.17): раньше
                      после создания карточки поля пропадали. */}
                  <CarModelInput value={carModel} onChange={setCarModel} notInList={carNotInList} onNotInList={setCarNotInList} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input value={carColor} onChange={(e) => setCarColor(e.target.value)} placeholder={L('Цвет', 'Бос')} className={field} />
                    <input value={carPlate} onChange={(e) => setCarPlate(e.target.value)} placeholder={L('Номер', 'Лоьмар')} className={field} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={showGender}
                        onChange={(e) => setShowGender(e.target.checked)}
                        className="h-3.5 w-3.5 accent-emerald-600"
                      />
                      {L('Показывать пол', 'Дуьненан пол гойта')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={showAge}
                        onChange={(e) => setShowAge(e.target.checked)}
                        className="h-3.5 w-3.5 accent-emerald-600"
                      />
                      {L('Показывать возраст', 'Хан гойта')}
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveDriverCard()}
                      className="ml-auto rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {L('Сохранить', 'ДӀаязъе')}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 border-t border-slate-100 pt-2.5 dark:border-zinc-800">
                    <div className="min-w-0 flex-1">
                      <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                        ★ {driver.rating.toFixed(1)} · {driver.rideCount} {L('поездок', 'некъ')}
                        {driver.isVerified ? ` · ${L('проверен', 'теллина')}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveDriverCard(!driver.isOnline)}
                      className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                        driver.isOnline ? 'bg-emerald-600 text-white' : 'smk-field text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      {driver.isOnline ? L('На линии', 'Линии тӀехь') : L('Не в линии', 'Линии тӀехь вац')}
                    </button>
                  </div>

                  {activeDriverRide ? (
                    <RideCard
                      ride={activeDriverRide}
                      isRiderView={false}
                      language={language}
                      busy={busy}
                      onAction={(action) => void rideAction(activeDriverRide.id, action, loadDriver)}
                      onShowRoute={() => { setRouteRide(activeDriverRide); setMapMode('route'); }}
                    />
                  ) : driver.isOnline ? (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        {L('Входящие заказы', 'ДогӀу заказаш')}
                      </h3>
                      {openOrders.length === 0 && (
                        <p className="smk-text-label text-slate-400">{L('Заказов пока нет — уведомим.', 'Заказаш хӀинца яц — хаам бер бу.')}</p>
                      )}
                      {openOrders.map((order) => (
                        <div key={order.id} className="smk-field space-y-1.5 rounded-xl p-3">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {order.from_label} → {order.to_label}
                          </p>
                          <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                            {order.distance_km} {L('км', 'км')} · {order.price} ₽ · {order.tariff_id}
                          </p>
                          {order.comment && <p className="smk-text-label italic text-slate-400">«{order.comment}»</p>}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void rideAction(order.id, 'accept', loadDriver)}
                            className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {L('Принять заказ', 'Заказ тӀеэца')}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              )}
            </div>
          )}
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

      <TaxiMapModal
        isOpen={mapMode !== null}
        onClose={() => setMapMode(null)}
        pick={mapMode === 'from' || mapMode === 'to' ? mapMode : null}
        onPick={(pt) => {
          if (mapMode === 'from') {
            setFromPoint(pt);
            setFromLabel(L('Точка на карте', 'Картехь точка'));
          }
          if (mapMode === 'to') {
            setToPoint(pt);
            setToLabel(L('Точка на карте', 'Картехь точка'));
          }
          setMapMode(null);
        }}
        pickHint={mapMode === 'from' || mapMode === 'to'
          ? L('Ткните в точку на карте', 'Картехь точка тIетаIайе')
          : undefined}
        from={mapMode === 'route' && routeRide?.from_lat != null && routeRide?.from_lng != null
          ? { lat: Number(routeRide.from_lat), lng: Number(routeRide.from_lng), label: routeRide.from_label }
          : mapMode === 'to' && fromPoint
            ? { ...fromPoint, label: fromLabel }
            : null}
        to={mapMode === 'route' && routeRide?.to_lat != null && routeRide?.to_lng != null
          ? { lat: Number(routeRide.to_lat), lng: Number(routeRide.to_lng), label: routeRide.to_label }
          : null}
      />
    </div>
  );
}

/** Карточка активной поездки со статусной линейкой и действиями. */
function ageFromBirth(birth?: string | null): string | null {
  if (!birth) return null;
  const year = Number(String(birth).slice(0, 4));
  if (!Number.isFinite(year) || year < 1900) return null;
  return String(new Date().getFullYear() - year);
}

function RideCard({
  ride, isRiderView, language, busy, onAction, onShowRoute,
}: {
  ride: RideRow;
  isRiderView: boolean;
  language: 'ru' | 'ce';
  busy: boolean;
  onAction: (action: string) => void;
  onShowRoute?: () => void;
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
    <section className="smk-lux space-y-2 rounded-3xl p-4">
      <div className="flex items-center gap-2">
        <CircleCheck className="h-4 w-4 text-emerald-600" />
        <p className="text-xs font-bold text-slate-900 dark:text-white">{status[language === 'ce' ? 'ce' : 'ru']}</p>
        <span className="ml-auto text-xs font-black text-emerald-700 dark:text-emerald-400">{ride.price} ₽</span>
      </div>
      <p className="text-xs text-slate-600 dark:text-zinc-400">
        <MapPin className="mr-1 inline h-3 w-3 text-emerald-600" />
        {ride.from_label} → {ride.to_label} · {ride.distance_km} {L('км', 'км')}
      </p>
      {isRiderView && driver && (
        <p className="text-xs text-slate-600 dark:text-zinc-400">
          <Car className="mr-1 inline h-3 w-3 text-emerald-600" />
          {driver.user_profiles?.full_name ?? L('Таксист', 'Таксист')}
          {/* п.17: пол/возраст — только если таксист разрешил. */}
          {driver.show_gender && driver.user_profiles?.gender
            ? ` · ${driver.user_profiles.gender === 'female' ? L('жен', 'зуда') : driver.user_profiles.gender === 'male' ? L('муж', 'боьрша') : driver.user_profiles.gender}`
            : ''}
          {driver.show_age ? (() => {
            const age = ageFromBirth(driver.user_profiles?.birth_date);
            return age ? ` · ${age} ${L('лет', 'шо')}` : '';
          })() : ''}
          {' '}· {driver.car_color} {driver.car_model} · {driver.car_plate}
          {driver.is_verified ? ` · ${L('проверен', 'теллина')}` : ''}
        </p>
      )}
      {ride.from_lat != null && ride.to_lat != null && onShowRoute && (
        <button
          type="button"
          onClick={onShowRoute}
          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
        >
          <Route className="h-3.5 w-3.5" />
          {L('Маршрут на карте', 'Маршрут карт тIехь')}
        </button>
      )}
      <div className="flex gap-2 pt-1">
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
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(isRiderView ? 'cancel' : 'cancel')}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X className="h-3.5 w-3.5" />
            {L('Отменить', 'ДӀаяккха')}
          </button>
        )}
      </div>

      {/* Лента событий (п.13): уведомления дублируются в разделе. */}
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

/**
 * Марка машины таксиста (п.3 замечаний 23.08): подсказки из
 * справочника БД; галочка «моей машины нет в списке» включает ручной
 * ввод — он уйдёт админам в «Такси → Марки».
 */
function CarModelInput({
  value, onChange, notInList, onNotInList,
}: {
  value: string;
  onChange: (v: string) => void;
  notInList: boolean;
  onNotInList: (v: boolean) => void;
}) {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (notInList) return;
    const q = value.trim();
    const handle = window.setTimeout(() => {
      void fetch(`/api/taxi/cars?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { cars: [] }))
        .then((d) => setSugs(Array.isArray(d?.cars) ? d.cars : []))
        .catch(() => setSugs([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [value, notInList]);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={L('Марка и модель: Lada Granta', 'Марка а, модель а: Lada Granta')}
        className="smk-field w-full px-2.5 py-2 text-xs text-slate-900 dark:text-white"
      />
      {!notInList && open && sugs.length > 0 && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          {sugs.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(name); setOpen(false); }}
              className="block w-full px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-emerald-50 dark:text-zinc-300 dark:hover:bg-emerald-950/40"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={notInList}
          onChange={(e) => onNotInList(e.target.checked)}
          className="h-3.5 w-3.5 accent-emerald-600"
        />
        {L('Моей машины нет в списке', 'Сан машина спискехь яц')}
      </label>
    </div>
  );
}
