'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppFilter } from '@/lib/types';

type Scope = 'tasks' | 'catalog' | 'map';

const SCOPES: Array<{ value: Scope; label: string; hint: string }> = [
  { value: 'tasks', label: 'Задания', hint: 'Категории в «Аренца Темщик» и «ГIончалла»' },
  { value: 'catalog', label: 'Каталог', hint: 'Сферы деятельности специалистов' },
  { value: 'map', label: 'Карта', hint: 'Категории объектов «Другое»' },
];

/**
 * Админ-раздел «Фильтры»: единое место, где редактируются справочники
 * для заданий, каталога и карты. Раньше категории были захардкожены в
 * коде — любое изменение требовало правки и деплоя.
 *
 * Удаление мягкое (is_active = false): у существующих заданий остаётся
 * ссылка на категорию, и они не должны «потерять» её при чистке.
 */
export default function AdminFiltersSection() {
  const [scope, setScope] = useState<Scope>('tasks');
  const [filters, setFilters] = useState<AppFilter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [newValue, setNewValue] = useState('');
  const [newLabelRu, setNewLabelRu] = useState('');
  const [newLabelCe, setNewLabelCe] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/tasks/filters?scope=${scope}`, { cache: 'no-store' });
      const data = await response.json();
      setFilters(data.filters ?? []);
    } catch {
      setError('Не удалось загрузить фильтры');
    } finally {
      setIsLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const authHeaders = async (): Promise<Record<string, string>> => {
    if (!supabase) throw new Error('Supabase не настроен');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Сессия истекла — войдите снова');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  };

  const save = async (payload: Partial<AppFilter> & { scope: Scope; value: string; labelRu: string }) => {
    const response = await fetch('/api/tasks/filters', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Не удалось сохранить');
    }
  };

  const handleAdd = async () => {
    setError('');
    setNotice('');
    const value = newValue.trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(value)) {
      setError('Код: только латиница, цифры, дефис и подчёркивание');
      return;
    }
    if (!newLabelRu.trim()) {
      setError('Укажите название');
      return;
    }
    setBusyId('new');
    try {
      await save({
        scope,
        value,
        labelRu: newLabelRu.trim(),
        labelCe: newLabelCe.trim() || undefined,
        sortOrder: (filters.length + 1) * 10,
        isActive: true,
      });
      setNewValue('');
      setNewLabelRu('');
      setNewLabelCe('');
      setNotice('Фильтр добавлен');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить');
    } finally {
      setBusyId('');
    }
  };

  const handleUpdate = async (filter: AppFilter) => {
    setError('');
    setNotice('');
    setBusyId(filter.id);
    try {
      await save({
        id: filter.id,
        scope: filter.scope as Scope,
        value: filter.value,
        labelRu: filter.labelRu,
        labelCe: filter.labelCe ?? undefined,
        sortOrder: filter.sortOrder,
        isActive: filter.isActive,
      });
      setNotice('Сохранено');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusyId('');
    }
  };

  const handleDelete = async (filter: AppFilter) => {
    setError('');
    setNotice('');
    setBusyId(filter.id);
    try {
      const response = await fetch(`/api/tasks/filters?id=${encodeURIComponent(filter.id)}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      if (!response.ok) throw new Error('Не удалось удалить');
      setNotice('Фильтр отключён');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setBusyId('');
    }
  };

  const patchLocal = (id: string, next: Partial<AppFilter>) => {
    setFilters((cur) => cur.map((f) => (f.id === id ? { ...f, ...next } : f)));
  };

  const field = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Фильтры</h3>
        <p className="text-sm text-slate-500 dark:text-zinc-500">
          Справочники категорий для заданий, каталога и карты.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setScope(s.value)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              scope === s.value
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400">{SCOPES.find((s) => s.value === scope)?.hint}</p>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {/* Добавление */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mb-2 text-xs font-bold text-slate-700 dark:text-zinc-300">Новый фильтр</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Код (latin)"
            aria-label="Код фильтра"
            className={field}
          />
          <input
            value={newLabelRu}
            onChange={(e) => setNewLabelRu(e.target.value)}
            placeholder="Название"
            aria-label="Название"
            className={field}
          />
          <input
            value={newLabelCe}
            onChange={(e) => setNewLabelCe(e.target.value)}
            placeholder="Нохчийн (необяз.)"
            aria-label="Название на чеченском"
            className={field}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={busyId === 'new'}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busyId === 'new' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Добавить
          </button>
        </div>
      </div>

      {/* Список */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : filters.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-zinc-700">
          Фильтров пока нет.
        </p>
      ) : (
        <div className="space-y-2">
          {filters.map((filter) => (
            <div
              key={filter.id}
              className="grid grid-cols-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-[90px_1fr_1fr_70px_auto]"
            >
              <code className="truncate rounded bg-slate-100 px-1.5 py-1 text-[10px] text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                {filter.value}
              </code>
              <input
                value={filter.labelRu}
                onChange={(e) => patchLocal(filter.id, { labelRu: e.target.value })}
                aria-label={`Название ${filter.value}`}
                className={field}
              />
              <input
                value={filter.labelCe ?? ''}
                onChange={(e) => patchLocal(filter.id, { labelCe: e.target.value })}
                placeholder="Нохчийн"
                aria-label={`Название на чеченском ${filter.value}`}
                className={field}
              />
              <input
                type="number"
                value={filter.sortOrder}
                onChange={(e) => patchLocal(filter.id, { sortOrder: Number(e.target.value) || 0 })}
                aria-label={`Порядок ${filter.value}`}
                className={field}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleUpdate(filter)}
                  disabled={busyId === filter.id}
                  title="Сохранить"
                  aria-label={`Сохранить ${filter.value}`}
                  className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                >
                  {busyId === filter.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(filter)}
                  disabled={busyId === filter.id}
                  title="Отключить"
                  aria-label={`Отключить ${filter.value}`}
                  className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
