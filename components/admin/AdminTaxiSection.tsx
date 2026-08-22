'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

/* eslint-disable @typescript-eslint/no-explicit-any */

type TaxiAdminGroup = 'price' | 'drivers' | 'brands';

/**
 * Админка → «Такси» (п.4 замечаний 23.08): три группы.
 *  1. Цена — тарифная сетка, множители тарифов, множитель по часам.
 *  2. Таксисты — анкеты, проверка.
 *  3. Марки — предложения таксистов («моей машины нет в списке»)
 *     и добавление новых марок в базу.
 */
export default function AdminTaxiSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);

  const [group, setGroup] = useState<TaxiAdminGroup>('price');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [fare, setFare] = useState<Record<string, string>>({});
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const token = async () => {
    if (!supabase) return '';
    const s = await supabase.auth.getSession();
    return s.data.session?.access_token || '';
  };

  const load = useCallback(async () => {
    const accessToken = await token();
    if (!accessToken) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [drv, sum] = await Promise.all([
      fetch('/api/taxi/admin', { cache: 'no-store', headers }).then((r) => r.json()).catch(() => null),
      fetch('/api/taxi/summary', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);
    setDrivers(Array.isArray(drv?.drivers) ? drv.drivers : []);
    setSuggestions(Array.isArray(drv?.suggestions) ? drv.suggestions : []);
    setBrands(Array.isArray(drv?.brands) ? drv.brands : []);
    setTariffs(Array.isArray(sum?.tariffs) ? sum.tariffs : []);
    if (sum?.fare) {
      setFare({
        baseFare: String(sum.fare.baseFare),
        perKm: String(sum.fare.perKm),
        perMin: String(sum.fare.perMin),
        minFare: String(sum.fare.minFare),
        roadFactor: String(sum.fare.roadFactor),
      });
    }
    if (supabase) {
      const { data } = await supabase
        .from('taxi_multiplier_schedule')
        .select('*')
        .order('start_hour', { ascending: true });
      setSlots((data ?? []).map((s: any) => ({
        id: s.id,
        startHour: Number(s.start_hour),
        endHour: Number(s.end_hour),
        multiplier: Number(s.multiplier),
      })));
    }
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const put = async (body: unknown) => {
    const accessToken = await token();
    if (!accessToken) return;
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/taxi/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) setNotice((await res.json().catch(() => null))?.error ?? L('Не удалось сохранить', 'ДӀаязъян ца делира'));
      else setNotice(L('Сохранено', 'ДӀаяздина'));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const field = 'smk-field w-full px-2.5 py-2 text-xs text-slate-900 dark:text-white';

  return (
    <section className="space-y-4">
      {/* Три группы (п.4). */}
      <div className="flex gap-1.5">
        {([
          ['price', L('Цена', 'Цена')],
          ['drivers', L('Таксисты', 'Таксисташ')],
          ['brands', L('Марки', 'Маркаш')],
        ] as [TaxiAdminGroup, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setGroup(id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              group === id ? 'bg-emerald-600 text-white shadow-sm' : 'smk-field text-slate-600 dark:text-zinc-400'
            }`}
          >
            {label}
            {id === 'brands' && suggestions.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-white smk-text-label">{suggestions.length}</span>
            )}
          </button>
        ))}
      </div>

      {notice && <p className="smk-note smk-note-success px-3 py-2">{notice}</p>}
      {!loaded && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>}

      {loaded && group === 'price' && (
        <div className="space-y-4">
          {/* 1. Тарифная сетка */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {L('Тарифная сетка', 'Тарифан сетка')}
            </h3>
            <p className="smk-text-label leading-relaxed text-slate-500 dark:text-zinc-500">
              {L(
                'Цена поездки = подача + км × «за км» + минуты × «за мин», сверху множитель тарифа и множитель спроса. «Минималка» — ниже неё цена не опустится. «Коэффициент дорог» переводит прямую линию в реальную дорогу.',
                'Нехан цена = подача + км + миноти, тIехь тарифан а, эхаран а множитель.',
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([
                ['baseFare', L('Подача, ₽', 'Подача, ₽')],
                ['perKm', L('За км, ₽', 'Км, ₽')],
                ['perMin', L('За мин, ₽', 'Мин, ₽')],
                ['minFare', L('Минималка, ₽', 'Минималка, ₽')],
                ['roadFactor', L('Коэф. дороги', 'Некъан коэф.')],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <span className="mb-1 block smk-text-label font-semibold text-slate-600 dark:text-zinc-400">{label}</span>
                  <input
                    value={fare[key] ?? ''}
                    onChange={(e) => setFare((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder="0"
                    inputMode="decimal"
                    className={field}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void put({
                type: 'fare',
                baseFare: Number(fare.baseFare),
                perKm: Number(fare.perKm),
                perMin: Number(fare.perMin),
                minFare: Number(fare.minFare),
                roadFactor: Number(fare.roadFactor),
              })}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {L('Сохранить цену', 'Цена дӀаязъе')}
            </button>
          </div>

          {/* 2. Множители тарифов */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {L('Множители тарифов', 'Тарифийн множители')}
            </h3>
            <div className="space-y-2">
              {tariffs.map((tar: any) => (
                <TariffEditor
                  key={tar.id}
                  tariff={tar}
                  disabled={busy}
                  onSave={(payload) => void put({ type: 'tariff', tariffId: tar.id, ...payload })}
                />
              ))}
            </div>
          </div>

          {/* 3. Множитель по часам */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {L('Множитель по часам', 'Сахьташкахь множитель')}
            </h3>
            <div className="space-y-1.5">
              {slots.map((slot: any, index: number) => (
                <div key={slot.id ?? index} className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={24}
                    value={slot.startHour}
                    onChange={(e) => setSlots((s) => s.map((x, i) => (i === index ? { ...x, startHour: Number(e.target.value) } : x)))}
                    className={`${field} w-16`}
                  />
                  <span className="text-xs text-slate-400">—</span>
                  <input
                    type="number" min={0} max={24}
                    value={slot.endHour}
                    onChange={(e) => setSlots((s) => s.map((x, i) => (i === index ? { ...x, endHour: Number(e.target.value) } : x)))}
                    className={`${field} w-16`}
                  />
                  <span className="text-xs text-slate-400">× </span>
                  <input
                    type="number" step="0.1" min="0.5" max="5"
                    value={slot.multiplier}
                    onChange={(e) => setSlots((s) => s.map((x, i) => (i === index ? { ...x, multiplier: Number(e.target.value) } : x)))}
                    className={`${field} w-20`}
                  />
                  <button
                    type="button"
                    aria-label={L('Удалить слот', 'Слот дӀаяккха')}
                    onClick={() => setSlots((s) => s.filter((_, i) => i !== index))}
                    className="smk-act smk-act--danger flex h-7 w-7 items-center justify-center"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSlots((s) => [...s, { startHour: 8, endHour: 10, multiplier: 1.2 }])}
                className="inline-flex items-center gap-1 rounded-xl smk-field px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-zinc-400"
              >
                <Plus className="h-3.5 w-3.5" />
                {L('Слот', 'Слот')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void put({ type: 'surge', slots })}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {L('Сохранить слоты', 'Слоташ дӀаязъе')}
              </button>
            </div>
          </div>
        </div>
      )}

      {loaded && group === 'drivers' && (
        <div className="space-y-2">
          {drivers.length === 0 && (
            <p className="smk-dashed p-3 text-center text-xs text-slate-500">{L('Таксистов пока нет.', 'Таксисташ хӀинца бац.')}</p>
          )}
          {drivers.map((d: any) => (
            <div key={d.user_id} className="smk-sheet-row flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                  {d.user_profiles?.full_name ?? d.user_id}
                </p>
                <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                  {d.car_color} {d.car_model} · {d.car_plate} · ★{Number(d.rating).toFixed(1)} · {d.ride_count}
                  {d.is_online ? ` · ${L('на линии', 'линии тӀехь')}` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void put({ type: 'verify', userId: d.user_id, verified: !d.is_verified })}
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                  d.is_verified ? 'bg-emerald-600 text-white' : 'smk-field text-slate-600 dark:text-zinc-400'
                }`}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {d.is_verified ? L('Проверен', 'Теллина') : L('Проверить', 'Телла')}
              </button>
            </div>
          ))}
        </div>
      )}

      {loaded && group === 'brands' && (
        <div className="space-y-4">
          {/* Предложения таксистов */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {L('Предложения таксистов', 'Таксистийн кховдор')}
            </h3>
            {suggestions.length === 0 && (
              <p className="smk-dashed p-3 text-center text-xs text-slate-500">
                {L('Новых предложений нет.', 'Керла кховдор дац.')}</p>
            )}
            {suggestions.map((sug: any) => (
              <div key={sug.id} className="smk-sheet-row flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{sug.name}</p>
                  <p className="smk-text-label text-slate-500 dark:text-zinc-500">
                    {sug.user_profiles?.full_name ?? ''} · {String(sug.created_at ?? '').slice(0, 10)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void put({ type: 'brand_approve', suggestionId: sug.id })}
                  className="rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {L('В базу', 'Базе тӀетоха')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void put({ type: 'brand_reject', suggestionId: sug.id })}
                  aria-label={L('Отклонить', 'Юхадаккха')}
                  className="smk-act smk-act--danger flex h-7 w-7 items-center justify-center"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Добавить марку вручную */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {L('Добавить марку', 'Марка тӀетоха')}
            </h3>
            <div className="flex gap-2">
              <input
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder={L('Например: Lada Vesta SW Cross', 'Масала: Lada Vesta SW Cross')}
                className={field}
              />
              <button
                type="button"
                disabled={busy || newBrand.trim().length < 3}
                onClick={() => { void put({ type: 'brand_add', name: newBrand.trim() }); setNewBrand(''); }}
                className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="smk-text-label text-slate-500 dark:text-zinc-500">
              {L(`В базе марок: ${brands.length}`, `Базехь маркаш: ${brands.length}`)}
            </p>
            <RequirementEditor
              brands={brands.map((b: any) => b.name)}
              disabled={busy}
              onSave={(payload) => void put({ type: 'requirement', ...payload })}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function TariffEditor({
  tariff, disabled, onSave,
}: {
  tariff: { id: string; labelRu: string; multiplier: number; baseFare?: number | null; perKm?: number | null; perMin?: number | null };
  disabled: boolean;
  onSave: (payload: { multiplier: number; baseFare: number | ''; perKm: number | ''; perMin: number | '' }) => void;
}) {
  const [multiplier, setMultiplier] = useState(String(tariff.multiplier));
  const [baseFare, setBaseFare] = useState(tariff.baseFare != null ? String(tariff.baseFare) : '');
  const [perKm, setPerKm] = useState(tariff.perKm != null ? String(tariff.perKm) : '');
  const [perMin, setPerMin] = useState(tariff.perMin != null ? String(tariff.perMin) : '');
  useEffect(() => {
    setMultiplier(String(tariff.multiplier));
    setBaseFare(tariff.baseFare != null ? String(tariff.baseFare) : '');
    setPerKm(tariff.perKm != null ? String(tariff.perKm) : '');
    setPerMin(tariff.perMin != null ? String(tariff.perMin) : '');
  }, [tariff]);
  const cell = 'smk-field w-full px-2 py-1.5 text-xs text-slate-900 dark:text-white';
  return (
    <div className="rounded-xl border border-slate-200 p-2 dark:border-zinc-800">
      <p className="mb-1.5 text-xs font-bold text-slate-800 dark:text-zinc-200">{tariff.labelRu}</p>
      <div className="grid grid-cols-4 gap-1.5">
        <label className="block">
          <span className="smk-text-label text-slate-500">×спрос</span>
          <input type="number" step="0.1" min="0.5" max="5" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} className={cell} />
        </label>
        <label className="block">
          <span className="smk-text-label text-slate-500">Подача</span>
          <input type="number" value={baseFare} onChange={(e) => setBaseFare(e.target.value)} placeholder="—" className={cell} />
        </label>
        <label className="block">
          <span className="smk-text-label text-slate-500">₽/км</span>
          <input type="number" value={perKm} onChange={(e) => setPerKm(e.target.value)} placeholder="—" className={cell} />
        </label>
        <label className="block">
          <span className="smk-text-label text-slate-500">₽/мин</span>
          <input type="number" value={perMin} onChange={(e) => setPerMin(e.target.value)} placeholder="—" className={cell} />
        </label>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave({
          multiplier: Number(multiplier),
          baseFare: baseFare === '' ? '' : Number(baseFare),
          perKm: perKm === '' ? '' : Number(perKm),
          perMin: perMin === '' ? '' : Number(perMin),
        })}
        className="mt-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        OK
      </button>
    </div>
  );
}

/** Требования к машине по тарифам (таблица Яндекса): модель → годы. */
function RequirementEditor({
  brands, disabled, onSave,
}: {
  brands: string[];
  disabled: boolean;
  onSave: (payload: { model: string; yearEconomy: number | ''; yearComfort: number | ''; yearBusiness: number | ''; isMinivan: boolean }) => void;
}) {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const [model, setModel] = useState('');
  const [yearEconomy, setYearEconomy] = useState('2011');
  const [yearComfort, setYearComfort] = useState('2015');
  const [yearBusiness, setYearBusiness] = useState('');
  const [isMinivan, setIsMinivan] = useState(false);
  const [open, setOpen] = useState(false);
  const sugs = model.trim()
    ? brands.filter((b) => b.toLowerCase().includes(model.trim().toLowerCase())).slice(0, 8)
    : [];
  const cell = 'smk-field w-full px-2 py-1.5 text-xs text-slate-900 dark:text-white';
  return (
    <div className="rounded-xl border border-slate-200 p-2 dark:border-zinc-800">
      <p className="mb-1.5 text-xs font-bold text-slate-800 dark:text-zinc-200">
        {L('Требования к машине (годы по тарифам)', 'Машинеха требованеш (тарифашца шераш)')}
      </p>
      <div className="relative">
        <input
          value={model}
          onChange={(e) => { setModel(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={L('Модель из базы', 'Базера модель')}
          className={cell}
        />
        {open && sugs.length > 0 && (
          <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            {sugs.map((name) => (
              <button key={name} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setModel(name); setOpen(false); }}
                className="block w-full px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50 dark:text-zinc-300 dark:hover:bg-emerald-950/40">
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <label className="block">
          <span className="smk-text-label text-slate-500">{L('Эконом от', 'Эконом')}</span>
          <input type="number" value={yearEconomy} onChange={(e) => setYearEconomy(e.target.value)} className={cell} />
        </label>
        <label className="block">
          <span className="smk-text-label text-slate-500">{L('Комфорт от', 'Комфорт')}</span>
          <input type="number" value={yearComfort} onChange={(e) => setYearComfort(e.target.value)} className={cell} />
        </label>
        <label className="block">
          <span className="smk-text-label text-slate-500">{L('Бизнес от (пусто — «—»)', 'Бизнес (— )')}</span>
          <input type="number" value={yearBusiness} onChange={(e) => setYearBusiness(e.target.value)} placeholder="—" className={cell} />
        </label>
      </div>
      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
        <input type="checkbox" checked={isMinivan} onChange={(e) => setIsMinivan(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
        {L('Минивэн (тариф «Минивэн»)', 'Минивэн')}
      </label>
      <button
        type="button"
        disabled={disabled || !model.trim()}
        onClick={() => onSave({
          model: model.trim(),
          yearEconomy: yearEconomy === '' ? '' : Number(yearEconomy),
          yearComfort: yearComfort === '' ? '' : Number(yearComfort),
          yearBusiness: yearBusiness === '' ? '' : Number(yearBusiness),
          isMinivan,
        })}
        className="mt-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        {L('Сохранить требования', 'Требованеш дӀаязъе')}
      </button>
    </div>
  );
}
