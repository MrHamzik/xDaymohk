'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Plus, Trash2, Save, GripVertical, RotateCcw,
  Briefcase, Stethoscope, Hammer, GraduationCap, Wrench, Scissors,
  ShoppingBag, Sprout, Car, Home, Utensils, Truck, Baby, Scale,
  Paintbrush, Laptop, Camera, Music, Dumbbell, Leaf, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppFilter } from '@/lib/types';

/**
 * Раздел «Фильтры» в админке.
 *
 * Только «Задания» и «Каталог»: категории объектов карты живут в
 * разделе «Адреса» → «Поиск и категории», дублировать их здесь нельзя —
 * получились бы два несогласованных справочника.
 */
type Scope = 'tasks' | 'catalog' | 'map';

/**
 * Иконки для фильтров. Ключ хранится в app_filters.icon, значение —
 * компонент lucide-react. Список закрытый: имя из БД попадает в
 * разметку, поэтому произвольные значения не допускаются.
 */
const ICON_OPTIONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, Stethoscope, Hammer, GraduationCap, Wrench, Scissors,
  ShoppingBag, Sprout, Car, Home, Utensils, Truck, Baby, Scale,
  Paintbrush, Laptop, Camera, Music, Dumbbell, Leaf,
};
const ICON_NAMES = Object.keys(ICON_OPTIONS);

/**
 * Выбор иконки сеткой, а не выпадающим списком названий: по строке
 * «Sprout» непонятно, что будет нарисовано. Кнопки показывают саму
 * иконку, подпись остаётся в title для ясности.
 */
function IconPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (name: string) => void;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const Current = ICON_OPTIONS[value] ?? Briefcase;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={label}
        title={value || 'Иконка'}
        className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-transparent bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        <Current className="h-4 w-4" />
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {isOpen && (
        <>
          {/* Клик мимо закрывает палитру */}
          <button
            type="button"
            aria-label="Закрыть выбор иконки"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full z-30 mt-1 grid w-56 grid-cols-6 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            {ICON_NAMES.map((name) => {
              const Icon = ICON_OPTIONS[name];
              const isActive = name === value;
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  onClick={() => { onChange(name); setIsOpen(false); }}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const SCOPES: Array<{ value: Scope; label: string; hint: string }> = [
  { value: 'tasks', label: 'Задания', hint: 'Направления в «Аренца Темщик» и «ГIончалла»' },
  { value: 'catalog', label: 'Каталог', hint: 'Сферы деятельности специалистов' },
  { value: 'map', label: 'Карта', hint: 'Категории объектов «Другое» на карте' },
];

export default function AdminFiltersSection() {
  const [scope, setScope] = useState<Scope>('tasks');
  const [filters, setFilters] = useState<AppFilter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const [newValue, setNewValue] = useState('');
  const [newLabelRu, setNewLabelRu] = useState('');
  const [newLabelCe, setNewLabelCe] = useState('');
  const [newIcon, setNewIcon] = useState('Briefcase');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      // all=1 — показываем и отключённые: иначе выключенный фильтр
      // исчезал из админки и включить его обратно было нельзя.
      const response = await fetch(`/api/tasks/filters?scope=${scope}&all=1`, { cache: 'no-store' });
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

  const post = async (payload: Record<string, unknown>) => {
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
    setError(''); setNotice('');
    const value = newValue.trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(value)) {
      setError('Код: только латиница, цифры, дефис и подчёркивание. Например: cleaning');
      return;
    }
    if (!newLabelRu.trim()) { setError('Укажите название'); return; }

    setBusyId('new');
    try {
      await post({
        scope, value,
        labelRu: newLabelRu.trim(),
        labelCe: newLabelCe.trim() || undefined,
        icon: newIcon,
        sortOrder: (filters.length + 1) * 10,
        isActive: true,
      });
      setNewValue(''); setNewLabelRu(''); setNewLabelCe(''); setNewIcon('Briefcase');
      setNotice('Фильтр добавлен');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить');
    } finally {
      setBusyId('');
    }
  };

  const handleSave = async (filter: AppFilter) => {
    setError(''); setNotice('');
    setBusyId(filter.id);
    try {
      await post({
        id: filter.id,
        scope: filter.scope,
        value: filter.value,
        labelRu: filter.labelRu,
        labelCe: filter.labelCe ?? undefined,
        icon: filter.icon ?? undefined,
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

  /** Включение/отключение — та же запись, просто меняем is_active. */
  const handleToggleActive = async (filter: AppFilter) => {
    setError(''); setNotice('');
    setBusyId(filter.id);
    try {
      if (filter.isActive) {
        const response = await fetch(`/api/tasks/filters?id=${encodeURIComponent(filter.id)}`, {
          method: 'DELETE',
          headers: await authHeaders(),
        });
        if (!response.ok) throw new Error('Не удалось отключить');
        setNotice('Фильтр отключён — он скрыт от пользователей');
      } else {
        await post({
          id: filter.id, scope: filter.scope, value: filter.value,
          labelRu: filter.labelRu, labelCe: filter.labelCe ?? undefined,
          icon: filter.icon ?? undefined,
          sortOrder: filter.sortOrder, isActive: true,
        });
        setNotice('Фильтр включён');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить');
    } finally {
      setBusyId('');
    }
  };

  const patchLocal = (id: string, next: Partial<AppFilter>) => {
    setFilters((cur) => cur.map((f) => (f.id === id ? { ...f, ...next } : f)));
  };

  /** Перетаскивание: порядок задаётся мышью, поле «номер» не нужно. */
  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const from = filters.findIndex((f) => f.id === dragId);
    const to = filters.findIndex((f) => f.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }

    const next = [...filters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setFilters(next);
    setDragId(null);

    try {
      const response = await fetch('/api/tasks/filters', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ ids: next.map((f) => f.id) }),
      });
      if (!response.ok) throw new Error('Не удалось сохранить порядок');
      setNotice('Порядок сохранён');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить порядок');
      await load();
    }
  };

  const field =
    'w-full rounded-lg border border-transparent bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/25 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-900';

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Фильтры</h3>
        <p className="text-sm text-slate-500 dark:text-zinc-500">
          Справочники категорий. Порядок задаётся перетаскиванием.
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
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_4rem_1fr_1fr_auto]">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Код: cleaning"
            aria-label="Код фильтра"
            className={field}
          />
          <IconPicker value={newIcon} onChange={setNewIcon} label="Иконка нового фильтра" />
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
            placeholder="Нохчийн"
            aria-label="Название на чеченском"
            className={field}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={busyId === 'new'}
            className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60 sm:col-span-1"
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
          {/* Шапка колонок — только на широком экране, на мобильном
              поля подписаны плейсхолдерами. */}
          <div className="hidden grid-cols-[auto_7rem_4rem_1fr_1fr_auto] gap-2 px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:grid">
            <span className="w-4" />
            <span>Код</span>
            <span>Иконка</span>
            <span>Название</span>
            <span>Нохчийн</span>
            <span className="w-[4.5rem] text-right">Действия</span>
          </div>
          {filters.map((filter) => (
            <div
              key={filter.id}
              draggable
              onDragStart={() => setDragId(filter.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(filter.id)}
              className={`grid grid-cols-[auto_1fr] items-center gap-2 rounded-2xl border bg-white p-2.5 shadow-sm transition dark:bg-zinc-950 sm:grid-cols-[auto_7rem_4rem_1fr_1fr_auto] ${
                dragId === filter.id
                  ? 'border-emerald-400 opacity-60'
                  : 'border-slate-200 dark:border-zinc-800'
              } ${filter.isActive ? '' : 'opacity-55'}`}
            >
              {/* Ручка перетаскивания */}
              <span
                className="cursor-grab text-slate-300 active:cursor-grabbing dark:text-zinc-600"
                title="Перетащите, чтобы изменить порядок"
              >
                <GripVertical className="h-4 w-4" />
              </span>

              {/* Код: служебный слаг, используется в ссылках и сравнениях */}
              <code className="truncate rounded bg-slate-100 px-1.5 py-1 text-[10px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                {filter.value}
              </code>

              {/* Иконка: селект + живой предпросмотр слева */}
              <IconPicker
                value={filter.icon ?? ''}
                onChange={(name) => patchLocal(filter.id, { icon: name })}
                label={`Иконка ${filter.value}`}
              />

              <input
                value={filter.labelRu}
                onChange={(e) => patchLocal(filter.id, { labelRu: e.target.value })}
                aria-label={`Название ${filter.value}`}
                placeholder="Название"
                className={`${field} col-span-2 sm:col-span-1`}
              />
              <input
                value={filter.labelCe ?? ''}
                onChange={(e) => patchLocal(filter.id, { labelCe: e.target.value })}
                placeholder="Нохчийн"
                aria-label={`Название на чеченском ${filter.value}`}
                className={`${field} col-span-2 sm:col-span-1`}
              />

              <div className="col-span-2 flex shrink-0 justify-end gap-1 sm:col-span-1">
                <button
                  type="button"
                  onClick={() => handleSave(filter)}
                  disabled={busyId === filter.id}
                  title="Сохранить"
                  aria-label={`Сохранить ${filter.value}`}
                  className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                >
                  {busyId === filter.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleActive(filter)}
                  disabled={busyId === filter.id}
                  title={filter.isActive ? 'Отключить' : 'Включить'}
                  aria-label={filter.isActive ? `Отключить ${filter.value}` : `Включить ${filter.value}`}
                  className={`rounded-lg p-2 transition disabled:opacity-60 ${
                    filter.isActive
                      ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  {filter.isActive ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
