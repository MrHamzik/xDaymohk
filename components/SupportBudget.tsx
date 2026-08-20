'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Save, WalletCards } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { HintMark } from '@/components/settings/SettingsPrimitives';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const DEFAULT_USD_RUB_RATE = 90;
const MONTHLY_VERCEL_USD = 20;
const MONTHLY_SUPABASE_USD = 20;
const MONTHLY_UPSTASH_USD = 10;
const MONTHLY_SERVER_RUB = 1140;
const MONTHLY_DOMAIN_RUB = 25;
const MONTHLY_WHOIS_RUB = 21;
const DEFAULT_OTHER_RUB = 500;

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatRubles(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)));
}

function readLocalNumber(key: string, fallback = 0) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? Math.max(0, Number(value) || 0) : fallback;
  } catch {
    return fallback;
  }
}

export default function SupportBudget() {
  const { account } = useAuth();
  const monthKey = getMonthKey(new Date());
  const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date());
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_RUB_RATE);
  const [otherCostsRub, setOtherCostsRub] = useState(DEFAULT_OTHER_RUB);
  const [otherCostsInput, setOtherCostsInput] = useState(String(DEFAULT_OTHER_RUB));
  const [collectedRub, setCollectedRub] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal })
      .then((response) => response.json() as Promise<{ rates?: { RUB?: number } }>)
      .then((payload) => {
        const rate = Number(payload.rates?.RUB);
        if (Number.isFinite(rate) && rate > 0) setUsdRate(rate);
      })
      .catch(() => {
        // Keep the approximate fallback if the public rate endpoint is unavailable.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBudget = async () => {
      setIsLoading(true);
      let collected = readLocalNumber(`daymohk-support-${monthKey}`);
      let other = readLocalNumber(`daymohk-support-other-${monthKey}`, DEFAULT_OTHER_RUB);

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('project_support')
          .select('collected_rub, other_costs_rub')
          .eq('month_key', monthKey)
          .maybeSingle();
        if (!error && data) {
          collected = Math.max(0, Number(data.collected_rub) || 0);
          other = Math.max(0, Number(data.other_costs_rub) || 0);
        }
      }

      if (!cancelled) {
        setCollectedRub(collected);
        setOtherCostsRub(other);
        setOtherCostsInput(String(Math.round(other)));
        setIsLoading(false);
      }
    };

    void loadBudget();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const channel = supabase
      .channel('daymohk-support-progress')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_support', filter: `month_key=eq.${monthKey}` }, (payload) => {
        const row = payload.new as { month_key?: string; collected_rub?: number; other_costs_rub?: number };
        if (row.month_key !== monthKey) return;
        setCollectedRub(Math.max(0, Number(row.collected_rub) || 0));
        setOtherCostsRub(Math.max(0, Number(row.other_costs_rub) || DEFAULT_OTHER_RUB));
        setOtherCostsInput(String(Math.round(Number(row.other_costs_rub) || DEFAULT_OTHER_RUB)));
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [monthKey]);

  const totalRub = MONTHLY_VERCEL_USD * usdRate
    + MONTHLY_SUPABASE_USD * usdRate
    + MONTHLY_UPSTASH_USD * usdRate
    + MONTHLY_SERVER_RUB
    + MONTHLY_DOMAIN_RUB
    + MONTHLY_WHOIS_RUB
    + otherCostsRub;
  const progress = totalRub > 0 ? Math.min(100, Math.round((collectedRub / totalRub) * 100)) : 0;

  const saveBudget = async () => {
    const other = Math.max(0, Number(otherCostsInput.replace(',', '.')) || 0);
    setIsSaving(true);
    setNotice('');

    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('project_support').upsert({
          month_key: monthKey,
          collected_rub: collectedRub,
          other_costs_rub: other,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'month_key' });
        if (error) throw new Error(error.message);
      } else {
        window.localStorage.setItem(`daymohk-support-${monthKey}`, String(collectedRub));
        window.localStorage.setItem(`daymohk-support-other-${monthKey}`, String(other));
      }
      setOtherCostsRub(other);
      setOtherCostsInput(String(Math.round(other)));
      setNotice('Прочие расходы за этот месяц обновлены. Сумма пожертвований считается автоматически.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить бюджет.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-5 rounded-3xl border border-rose-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6" aria-labelledby="support-budget-title">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
          <WalletCards className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 id="support-budget-title" className="text-base font-bold text-slate-900 dark:text-white">Ежемесячные расходы проекта</h3>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <BudgetRow
          name="Vercel"
          hint="Это дом сайта в интернете. Без него страница не откроется на телефоне."
          value={<>20 $ <span className="font-normal text-slate-500 dark:text-zinc-500">(~ {formatRubles(MONTHLY_VERCEL_USD * usdRate)})</span></>}
        />
        <BudgetRow
          name="Supabase"
          hint="Сейф с анкетами, письмами и входом через Google. Здесь живут ваши данные."
          value={<>20 $ <span className="font-normal text-slate-500 dark:text-zinc-500">(~ {formatRubles(MONTHLY_SUPABASE_USD * usdRate)})</span></>}
        />
        <BudgetRow
          name="Upstash"
          hint="Быстрая память сервера: очередь писем и защита от спама, чтобы сайт не падал от наплыва."
          value={<>10 $ <span className="font-normal text-slate-500 dark:text-zinc-500">(~ {formatRubles(MONTHLY_UPSTASH_USD * usdRate)})</span></>}
        />
        <BudgetRow
          name="Выделенный сервер"
          hint="Отдельная машина для тяжёлых дел: карта, файлы, ночные проверки."
          value={formatRubles(MONTHLY_SERVER_RUB)}
        />
        <BudgetRow
          name="Домен"
          hint="Имя daymohk.xyz. Это адрес, по которому люди находят сайт."
          value={formatRubles(MONTHLY_DOMAIN_RUB)}
        />
        <BudgetRow
          name="Скрытие данных в WHOIS"
          hint="Прячет личные данные владельца домена от чужих глаз."
          value={formatRubles(MONTHLY_WHOIS_RUB)}
        />
        <BudgetRow
          name="Прочие расходы"
          hint="Мелкие счета: почта, карты, разовые услуги, которые появляются в течение месяца."
          value={formatRubles(otherCostsRub)}
        />
        <div className="flex items-center justify-between gap-3 pt-1 text-base font-extrabold text-slate-900 dark:text-white">
          <span>Итого за месяц</span>
          <span>{formatRubles(totalRub)}</span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-bold text-slate-900 dark:text-white">Собрано</span>
          <span className="font-bold text-rose-600 dark:text-rose-300">{formatRubles(collectedRub)} / {formatRubles(totalRub)}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-rose-100 dark:bg-zinc-700" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Прогресс сбора поддержки">
          <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">В начале нового календарного месяца прогресс автоматически начинается с нуля.</p>
      </div>

      {account?.isAdmin && (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/20">
          <h4 className="text-xs font-bold text-rose-800 dark:text-rose-200">Редактирование для администратора</h4>
          <label className="mt-2 block max-w-sm text-xs font-bold text-rose-800 dark:text-rose-200">
            Прочие расходы, ₽
            <input
              type="number"
              min="0"
              step="50"
              value={otherCostsInput}
              onChange={(event) => setOtherCostsInput(event.target.value)}
              className="mt-1 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-rose-900 dark:bg-zinc-950 dark:text-white"
            />
          </label>
          <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">Сумма пожертвований рассчитывается автоматически после подтверждения платежа через webhook CloudTips.</p>
          <button
            type="button"
            onClick={saveBudget}
            disabled={isSaving || isLoading}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-500 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Сохраняем…' : 'Сохранить бюджет'}
          </button>
          {notice && <p className="mt-2 break-words text-xs font-semibold text-rose-700 dark:text-rose-300" aria-live="polite">{notice}</p>}
        </div>
      )}
    </section>
  );
}

function BudgetRow({
  name,
  hint,
  value,
}: {
  name: string;
  hint: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 dark:border-zinc-800">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-400">
        <span className="truncate">{name}</span>
        <HintMark text={hint} />
      </span>
      <span className="shrink-0 font-semibold text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}
