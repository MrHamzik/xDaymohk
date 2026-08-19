'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, ShieldAlert, ShieldCheck, ShieldPlus, ShieldMinus,
  EyeOff, Eye, Trash2, Gavel, History, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Раздел «Журнал» в админке.
 *
 * Читает public.admin_audit_log (обновление 47). Таблица под RLS
 * доступна на чтение только администраторам, и записи в ней не
 * изменяются и не удаляются — ни через интерфейс, ни через API.
 * Поэтому здесь нет ни одной кнопки действия: журнал только смотрят.
 *
 * Зачем это админу: блокировки и выдача прав раньше не оставляли
 * следов. Админов двое, и после факта нельзя было ответить «кто это
 * сделал и почему». Журнал защищает и самого админа — есть чем
 * подтвердить, что действие было обоснованным.
 */

interface AuditRow {
  id: number;
  actor_email: string;
  action: string;
  target_label: string;
  target_user_id: string | null;
  reason: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/** Сколько записей тянем за раз: журнал растёт вечно, читают всегда свежее. */
const PAGE_SIZE = 50;

/**
 * Описание действий: подпись, иконка и цветовой слот.
 *
 * Цвета — через переменные темы (var(--smk-…)), а не литералами:
 * админка живёт во всех девяти темах, и красный из светлой на чёрной
 * выглядит ядовитым.
 */
const ACTIONS: Record<
  string,
  { ru: string; ce: string; Icon: typeof ShieldAlert; tone: 'danger' | 'success' | 'info' | 'warn' }
> = {
  user_ban: { ru: 'Блокировка', ce: 'Блокировка', Icon: ShieldAlert, tone: 'danger' },
  user_unban: { ru: 'Разблокировка', ce: 'Блокировка дIаяккхар', Icon: ShieldCheck, tone: 'success' },
  role_grant: { ru: 'Выданы права админа', ce: 'Админан бакъонаш елла', Icon: ShieldPlus, tone: 'warn' },
  role_revoke: { ru: 'Сняты права админа', ce: 'Админан бакъонаш дIаяьхна', Icon: ShieldMinus, tone: 'warn' },
  profile_hide: { ru: 'Анкета скрыта', ce: 'Анкета къайлаяьккхина', Icon: EyeOff, tone: 'warn' },
  profile_show: { ru: 'Анкета возвращена', ce: 'Анкета юхаялийна', Icon: Eye, tone: 'success' },
  profile_delete: { ru: 'Анкета удалена', ce: 'Анкета дIаяьккхина', Icon: Trash2, tone: 'danger' },
  complaint_resolve: { ru: 'Жалоба закрыта', ce: 'Арз дIакъевлина', Icon: Gavel, tone: 'info' },
};

const NOTE_CLASS: Record<string, string> = {
  danger: 'smk-note smk-note-danger',
  success: 'smk-note smk-note-success',
  info: 'smk-note smk-note-info',
  warn: 'smk-note smk-note-warn',
};

/** Дата в человеческом виде: «19 августа, 14:07». */
function formatMoment(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Подробности одной строкой.
 *
 * Показываем только то, что человек поймёт без документации: срок
 * блокировки и прежнее состояние права. Сырой JSON в интерфейс не
 * выводим — он там никому не помогает.
 */
function describeDetails(details: Record<string, unknown> | null, isRu: boolean): string {
  if (!details) return '';
  const parts: string[] = [];
  if (details.permanent === true) parts.push(isRu ? 'навсегда' : 'даиманна');
  if (typeof details.hours === 'number' && details.hours > 0) {
    parts.push(isRu ? `на ${details.hours} ч` : `${details.hours} сахьт`);
  }
  if (typeof details.was === 'boolean' && typeof details.now === 'boolean') {
    parts.push(
      isRu
        ? `${details.was ? 'был админом' : 'не был админом'} → ${details.now ? 'админ' : 'обычный житель'}`
        : `${details.was ? 'админ вара' : 'админ вацара'} → ${details.now ? 'админ' : 'кхиболу бахархо'}`,
    );
  }
  return parts.join(' · ');
}

export default function AdminAuditSection({ language }: { language: 'ru' | 'ce' }) {
  const isRu = language === 'ru';
  const L = (ru: string, ce: string) => (isRu ? ru : ce);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'bans' | 'roles'>('all');

  const load = useCallback(async () => {
    if (!supabase) {
      setError(L('База данных недоступна.', 'Хаамийн база йац.'));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('admin_audit_log')
      .select('id, actor_email, action, target_label, target_user_id, reason, details, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (loadError) {
      // Частый случай: миграция 47 ещё не применена. Говорим прямо,
      // а не показываем пустой список — иначе админ решит, что журнал
      // работает и просто пуст.
      setError(
        loadError.message.includes('does not exist')
          ? L(
              'Журнал ещё не создан: примените обновление 47 в Supabase.',
              'Журнал кхоьллина яц: Supabase чохь 47 тIетоьхна хила еза.',
            )
          : loadError.message,
      );
      setRows([]);
    } else {
      setRows((data ?? []) as AuditRow[]);
    }
    setIsLoading(false);
    // L зависит только от language, перечислять его отдельно незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'bans') return rows.filter((r) => r.action.startsWith('user_'));
    if (filter === 'roles') return rows.filter((r) => r.action.startsWith('role_'));
    return rows;
  }, [rows, filter]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {L('Журнал действий', 'Гуламан журнал')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-zinc-500">
            {L(
              'Кто, что и над кем сделал. Записи не изменяются и не удаляются.',
              'Хьан, хIун, хьенан тIехь дина. Яздарш хийца а, дIаяха а йиш яц.',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {L('Обновить', 'Керлайаккха')}
        </button>
      </div>

      <div className="flex gap-1 smk-panel p-1">
        {([
          ['all', L('Все', 'Массо')],
          ['bans', L('Блокировки', 'Блокировкаш')],
          ['roles', L('Права', 'Бакъонаш')],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filter === value
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="smk-note smk-note-danger px-3 py-2.5">{error}</p>}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="smk-dashed p-8 text-center">
          <History className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-zinc-700" />
          <p className="text-sm text-slate-500 dark:text-zinc-500">
            {L('Записей пока нет.', 'Яздарш дац хIинцалц.')}
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((row) => {
            const meta = ACTIONS[row.action];
            const Icon = meta?.Icon ?? History;
            const details = describeDetails(row.details, isRu);
            return (
              <li key={row.id} className="smk-inset flex items-start gap-3 px-3 py-2.5">
                <span
                  className={`${NOTE_CLASS[meta?.tone ?? 'info']} flex h-7 w-7 shrink-0 items-center justify-center rounded-lg`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    {meta ? L(meta.ru, meta.ce) : row.action}
                    {row.target_label && (
                      <span className="font-medium text-slate-500 dark:text-zinc-500">
                        {' · '}
                        {row.target_label}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 smk-text-label text-slate-500 dark:text-zinc-500">
                    {row.actor_email || L('неизвестно', 'ца девза')}
                    {' · '}
                    {formatMoment(row.created_at, isRu ? 'ru-RU' : 'ru-RU')}
                    {details && ` · ${details}`}
                  </p>
                  {row.reason && (
                    <p className="mt-1 smk-text-label italic text-slate-500 dark:text-zinc-500">
                      {row.reason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
