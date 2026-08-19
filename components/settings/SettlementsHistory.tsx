'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { currentMoscowMonth, shiftMonth } from '@/lib/payments';
import EmptyState from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/FeedSkeleton';

interface SettlementItem {
  id: string;
  taskId: string;
  title: string;
  role: 'customer' | 'executor';
  counterpartName: string;
  amount: number;
  method: string;
  completedAt: string;
  marked: boolean;
}

interface HistoryPayload {
  month: string;
  received: number;
  paid: number;
  unmarked: number;
  items: SettlementItem[];
}

function monthLabel(ym: string, locale: string): string {
  const date = new Date(`${ym}-01T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return ym;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
}

function dayLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function methodKey(method: string): `taskPay_${'cash' | 'sbp' | 'card' | 'yoomoney'}` {
  if (method === 'sbp' || method === 'card' || method === 'yoomoney') return `taskPay_${method}`;
  return 'taskPay_cash';
}

/** Список отмеченных сторонами расчётов за месяц. Не чек и не платёжка. */
export default function SettlementsHistory() {
  const { t } = useI18n();
  const locale = 'ru-RU';
  const [month, setMonth] = useState(currentMoscowMonth);
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (ym: string) => {
    if (!supabase) return;
    setIsLoading(true);
    setError('');
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setData(null);
        return;
      }
      const res = await fetch(`/api/payout/history?month=${encodeURIComponent(ym)}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || t.tasksLoadError);
      setData(body as HistoryPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.tasksLoadError);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [t.tasksLoadError]);

  useEffect(() => { void load(month); }, [load, month]);

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const current = currentMoscowMonth();
  const canNext = Boolean(next) && next <= current;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && setMonth(prev)}
          aria-label={t.settlementsPrev}
          className="smk-act flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="smk-text-title font-bold capitalize text-slate-900 dark:text-white">
          {monthLabel(month, locale)}
        </p>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => canNext && setMonth(next)}
          aria-label={t.settlementsNext}
          className="smk-act flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p className="smk-note smk-note-danger mb-3 px-3 py-2">{error}</p>
      )}

      {isLoading && <ListSkeleton count={4} />}

      {!isLoading && data && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="smk-inset px-3 py-2.5">
              <p className="smk-sheet-label">{t.settlementsReceived}</p>
              <p className="mt-0.5 text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                {data.received} ₽
              </p>
            </div>
            <div className="smk-inset px-3 py-2.5">
              <p className="smk-sheet-label">{t.settlementsPaid}</p>
              <p className="mt-0.5 text-sm font-extrabold text-slate-900 dark:text-white">
                {data.paid} ₽
              </p>
            </div>
          </div>

          {data.unmarked > 0 && (
            <p className="smk-note smk-note-warn mb-3 px-3 py-2">
              {t.settlementsUnmarked}: {data.unmarked} ₽. {t.settlementsSkipHint}
            </p>
          )}

          {data.items.length === 0 ? (
            <EmptyState title={t.settlementsEmpty} hint={t.settlementsNoneHint} />
          ) : (
            <div className="space-y-1.5">
              {data.items.map((item) => (
                <article key={item.id} className="smk-sheet-row px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate smk-text-body font-bold text-slate-900 dark:text-white">
                        {item.counterpartName || t.taskCustomerDefault}
                      </p>
                      <p className="mt-0.5 truncate smk-text-label text-slate-500 dark:text-zinc-400">
                        {item.role === 'customer' ? t.settlementsTo : t.settlementsFrom}
                        {' · '}
                        {item.title}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm font-extrabold ${
                      item.marked
                        ? item.role === 'executor'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}>
                      {item.role === 'executor' ? '+' : '−'}{item.amount} ₽
                    </p>
                  </div>
                  <p className="mt-1 smk-meta smk-text-label">
                    {dayLabel(item.completedAt, locale)}
                    {' · '}
                    {t[methodKey(item.method)]}
                    {!item.marked && ` · ${t.settlementsUnmarked}`}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
