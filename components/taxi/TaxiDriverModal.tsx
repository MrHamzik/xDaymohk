'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useLockBody } from '@/lib/hooks/useLockBody';
import CarModelInput from '@/components/taxi/CarModelInput';
import { tariffAllowed, type CarRequirements } from '@/lib/taxi/pricing';

/**
 * Анкета таксиста (п.5 замечаний 23.08): заполняется в профиле, никуда
 * не перебрасывает. Анкета может быть только одна: если карточка уже
 * есть — модалка работает в режиме правки.
 *
 * Требования к водителю показаны прямо в форме: 18+, действующие права.
 */
export default function TaxiDriverModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const { account } = useAuth();
  useLockBody(isOpen);

  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNotInList, setCarNotInList] = useState(false);
  const [carColor, setCarColor] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [carYear, setCarYear] = useState('');
  const [yearsDriving, setYearsDriving] = useState('3');
  const [tariffs, setTariffs] = useState<string[]>(['economy']);
  const [availableTariffs, setAvailableTariffs] = useState<Array<{ id: string; labelRu: string; labelCe: string }>>([]);
  const [showGender, setShowGender] = useState(false);
  const [showAge, setShowAge] = useState(false);
  const [req, setReq] = useState<CarRequirements | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNotice('');
    void (async () => {
      if (!supabase) return;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [drv, sum] = await Promise.all([
        fetch('/api/taxi/driver', { cache: 'no-store', headers }).then((r) => r.json()).catch(() => null),
        fetch('/api/taxi/summary', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      setAvailableTariffs((sum?.tariffs ?? []).map((t: { id: string; labelRu: string; labelCe: string }) => ({ id: t.id, labelRu: t.labelRu, labelCe: t.labelCe })));
      if (drv?.driver) {
        setCarModel(drv.driver.carModel ?? '');
        setCarColor(drv.driver.carColor ?? '');
        setCarPlate(drv.driver.carPlate ?? '');
        setTariffs(drv.driver.tariffs?.length ? drv.driver.tariffs : ['economy']);
        setShowGender(Boolean(drv.driver.showGender));
        setShowAge(Boolean(drv.driver.showAge));
      }
      setLoaded(true);
    })();
  }, [isOpen]);

  // Требования к машине по тарифам (таблица Яндекса, п.9):
  // год ниже порога или «—» — тариф гаснет в анкете.
  useEffect(() => {
    if (!isOpen || carNotInList || !carModel.trim()) { setReq(null); return; }
    const controller = new AbortController();
    void fetch(`/api/taxi/requirements?model=${encodeURIComponent(carModel.trim())}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { requirement: null }))
      .then((d) => setReq(d?.requirement ?? null))
      .catch(() => setReq(null));
    return () => controller.abort();
  }, [carModel, carNotInList, isOpen]);

  const save = async () => {
    if (!supabase || !account) return;
    if (!carModel.trim() || !carPlate.trim()) {
      setNotice(L('Укажите машину и госномер', 'Машина а, лоьмар а йазде'));
      return;
    }
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    setBusy(true);
    setNotice('');
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch('/api/taxi/driver', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          carModel: carModel.trim(),
          carColor: carColor.trim(),
          carPlate: carPlate.trim().toUpperCase(),
          carYear: carYear ? Number(carYear) : null,
          yearsDriving: Number(yearsDriving) || 0,
          tariffs,
          showGender,
          showAge,
        }),
      });
      if (!res.ok) {
        setNotice((await res.json().catch(() => null))?.error ?? L('Не удалось сохранить', 'ДӀаязъян ца делира'));
        return;
      }
      if (carNotInList && carModel.trim()) {
        await fetch('/api/taxi/cars', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: carModel.trim() }),
        }).catch(() => {});
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const field = 'smk-field w-full px-2.5 py-2 text-xs text-slate-900 dark:text-white';

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="smk-sheet max-h-[85dvh] w-full max-w-sm space-y-2.5 overflow-y-auto rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-sm font-bold text-slate-900 dark:text-white">
            {L('Анкета таксиста', 'Таксистан анкета')}
          </h3>
          <button type="button" onClick={onClose} aria-label={L('Закрыть', 'ДӀакъовла')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="rounded-xl bg-emerald-50 px-2.5 py-2 smk-text-label leading-relaxed text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {L(
            'Требования: возраст 18 лет и старше, действующее водительское удостоверение. Анкета таксиста может быть только одна.',
            'Требованеш: хан 18+, болх беш йолу водительски удостоверени. Таксистан анкета цхьаъ бен хила ца мега.',
          )}
        </p>

        {!loaded && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>}

        {loaded && (
          <>
            <CarModelInput value={carModel} onChange={setCarModel} notInList={carNotInList} onNotInList={setCarNotInList} />
            <div className="grid grid-cols-3 gap-2">
              <input value={carColor} onChange={(e) => setCarColor(e.target.value)} placeholder={L('Цвет', 'Бос')} className={field} />
              <input value={carPlate} onChange={(e) => setCarPlate(e.target.value)} placeholder={L('Номер', 'Лоьмар')} className={field} />
              <select value={carYear} onChange={(e) => setCarYear(e.target.value)} aria-label={L('Год выпуска', 'Араволу шо')} className={field}>
                <option value="">{L('Год', 'Шо')}</option>
                {Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 2026 - i).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="mb-1 block smk-text-label font-semibold text-slate-600 dark:text-zinc-400">
                {L('Стаж вождения, лет', 'Вожданен стаж, шо')}
              </span>
              <input value={yearsDriving} onChange={(e) => setYearsDriving(e.target.value)} inputMode="numeric" className={field} />
            </div>
            <div>
              <span className="mb-1 block smk-text-label font-semibold text-slate-600 dark:text-zinc-400">
                {L('Тарифы, которые вожу', 'Леладеш долу тарифаш')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableTariffs.map((tariff) => {
                  const allowed = tariffAllowed(tariff.id, carYear ? Number(carYear) : null, req);
                  const label = language === 'ce' && tariff.labelCe ? tariff.labelCe : tariff.labelRu;
                  return (
                    <button
                      key={tariff.id}
                      type="button"
                      disabled={!allowed}
                      title={allowed ? undefined : L('Машина не подходит по году или классу', 'Машина шераца я классца ца йогIу')}
                      onClick={() => setTariffs((current) => current.includes(tariff.id)
                        ? current.filter((x) => x !== tariff.id)
                        : [...current, tariff.id])}
                      className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                        !allowed
                          ? 'cursor-not-allowed bg-slate-100 text-slate-300 line-through dark:bg-zinc-800 dark:text-zinc-600'
                          : tariffs.includes(tariff.id)
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
              <input type="checkbox" checked={showGender} onChange={(e) => setShowGender(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
              {L('Показывать пассажирам мой пол', 'Пассажирашна сан пол гойта')}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400">
              <input type="checkbox" checked={showAge} onChange={(e) => setShowAge(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
              {L('Показывать пассажирам мой возраст', 'Пассажирашна сан хан гойта')}
            </label>

            {notice && <p className="smk-note smk-note-danger px-2.5 py-2">{notice}</p>}

            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {L('Сохранить анкету', 'Анкета дӀаязъе')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
