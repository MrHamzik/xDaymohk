'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Paperclip, Pin, PinOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';

interface PinRow {
  id: string;
  user_id: string;
  target_type: 'profile' | 'task';
  target_id: string;
  proposed_date: string;
  created_at: string;
  user_profiles?: { full_name: string } | Array<{ full_name: string }> | null;
}

/**
 * Админка → «Главная страница» (Этап 2-каталог, п.6): предложения
 * жителей закрепить анкету/задание («скрепка»). Сейчас здесь только
 * список предложений, сгруппированный по объекту, — само закрепление
 * блоков на главной будет следующим этапом.
 */
export default function AdminHomePinsSection() {
  const { t, language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const { profiles } = useProfiles();
  const [rows, setRows] = useState<PinRow[] | null>(null);
  /** Ключи «тип:id» закреплённых объектов. */
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch('/api/home-pins', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(L('Не удалось загрузить предложения', 'ТIедаьхнарш чуэца ца делира'));
        return;
      }
      setRows(Array.isArray(data?.proposals) ? data.proposals : []);
    } catch {
      setError(L('Не удалось загрузить предложения', 'ТIедаьхнарш чуэца ца делира'));
    }
    // Закреплённые — отдельным запросом (публичный эндпоинт).
    try {
      const res = await fetch('/api/home-pinned', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.pinned)) {
        setPinned(new Set(data.pinned.map((p: { target_type: string; target_id: string }) => `${p.target_type}:${p.target_id}`)));
      }
    } catch {
      // без закреплённых список предложений всё равно полезен
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  /** Закрепить/открепить объект предложения (обновление 74). */
  const togglePin = async (entry: { type: 'profile' | 'task'; id: string }) => {
    if (!supabase) return;
    const key = `${entry.type}:${entry.id}`;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    setBusyKey(key);
    try {
      const isPinned = pinned.has(key);
      const res = isPinned
        ? await fetch(`/api/home-pinned?targetType=${entry.type}&targetId=${encodeURIComponent(entry.id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        : await fetch('/api/home-pinned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ targetType: entry.type, targetId: entry.id }),
        });
      if (!res.ok) {
        setError(L('Не удалось изменить закрепление', 'Закрепленни хийца ца делира'));
        return;
      }
      setPinned((current) => {
        const next = new Set(current);
        if (isPinned) next.delete(key);
        else next.add(key);
        return next;
      });
    } finally {
      setBusyKey(null);
    }
  };

  // Группировка по объекту: сколько раз предложили, кто и когда.
  const grouped = useMemo(() => {
    const map = new Map<string, { type: 'profile' | 'task'; id: string; count: number; lastDate: string; names: string[] }>();
    for (const row of rows ?? []) {
      const key = `${row.target_type}:${row.target_id}`;
      const entry = map.get(key) ?? { type: row.target_type, id: row.target_id, count: 0, lastDate: '', names: [] };
      entry.count += 1;
      if (row.proposed_date > entry.lastDate) entry.lastDate = row.proposed_date;
      const who = Array.isArray(row.user_profiles)
        ? row.user_profiles[0]?.full_name
        : row.user_profiles?.full_name;
      if (who && !entry.names.includes(who)) entry.names.push(who);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || (b.lastDate > a.lastDate ? 1 : -1));
  }, [rows]);

  const targetLabel = (entry: { type: 'profile' | 'task'; id: string }) => {
    if (entry.type === 'profile') {
      const profile = profiles.find((p) => p.id === entry.id);
      return profile
        ? `${profile.fullName}${profile.professionTitle ? ` — ${profile.professionTitle}` : ''}`
        : entry.id;
    }
    return `${t.adminHomePinsTask} · ${entry.id.slice(0, 8)}…`;
  };

  return (
    <section className="space-y-3">
      {error && <p className="smk-note smk-note-danger px-3 py-2">{error}</p>}

      {rows === null && !error && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        </div>
      )}

      {rows !== null && grouped.length === 0 && (
        <p className="smk-dashed p-4 text-center text-xs text-slate-500 dark:text-zinc-500">
          {t.adminHomePinsEmpty}
        </p>
      )}

      <div className="space-y-2">
        {grouped.map((entry) => (
          <div key={`${entry.type}:${entry.id}`} className="smk-sheet-row flex items-start gap-3 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Paperclip className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                <span className="mr-1.5 rounded-lg bg-slate-100 px-1.5 py-0.5 smk-text-label font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {entry.type === 'profile' ? t.adminHomePinsProfile : t.adminHomePinsTask}
                </span>
                {targetLabel(entry)}
              </p>
              <p className="mt-1 smk-text-label text-slate-500 dark:text-zinc-500">
                {L(`Предложений: ${entry.count}`, `ТIедаьхнарш: ${entry.count}`)}
                {entry.lastDate ? ` · ${entry.lastDate}` : ''}
                {entry.names.length > 0 ? ` · ${entry.names.slice(0, 3).join(', ')}${entry.names.length > 3 ? '…' : ''}` : ''}
              </p>
            </div>
            <button
              type="button"
              disabled={busyKey === `${entry.type}:${entry.id}`}
              onClick={() => void togglePin(entry)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                pinned.has(`${entry.type}:${entry.id}`)
                  ? 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {busyKey === `${entry.type}:${entry.id}`
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : pinned.has(`${entry.type}:${entry.id}`)
                  ? <PinOff className="h-3.5 w-3.5" />
                  : <Pin className="h-3.5 w-3.5" />}
              {pinned.has(`${entry.type}:${entry.id}`) ? t.adminUnpin : t.adminPin}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
