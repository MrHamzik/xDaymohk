'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CheckCheck, Mail, type LucideIcon } from 'lucide-react';

export interface LetterPreviewIcon {
  Icon: LucideIcon;
  cls: string;
}

export interface LetterPreviewProps {
  /** Подпись категории в шапке (уже локализованная вызывающей стороной). */
  categoryLabel?: string;
  /** Метка отправителя («От:» / «Царара:»). */
  fromLabel?: string;
  /** Метка блока темы. */
  themeLabel?: string;
  /** Метка блока текста письма. */
  textLabel?: string;
  readLabel?: string;
  unreadLabel?: string;
  sender: string;
  title: string;
  message: string;
  isRead?: boolean;
  createdAt?: string;
  icon: LetterPreviewIcon;
  /** Кнопки справа в шапке (удалить/закрыть). В превью — не передаётся. */
  headerActions?: ReactNode;
  /** Включить прямое редактирование полей: прозрачные инпуты поверх текста,
   *  стиль которых повторяет статичную вёрстку (вид письма не меняется). */
  edit?: { sender?: boolean; title?: boolean; message?: boolean };
  onSenderChange?: (value: string) => void;
  onTitleChange?: (value: string) => void;
  onMessageChange?: (value: string) => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Прозрачный textarea, высота которого всегда равна содержимому. */
export function AutoTextarea({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

/**
 * Подсветка редактируемости: при наведении/фокусе появляется мягкая
 * подложка и кольцо, но сам текст выглядит как в статичном письме.
 * px-1 + -mx-1 компенсируют паддинг, чтобы текст не «прыгал».
 */
const EDIT_AFFORDANCE =
  '-mx-1 rounded-md px-1 outline-none transition hover:bg-amber-100/50 focus:bg-amber-100/60 focus:ring-2 focus:ring-emerald-400/60 dark:hover:bg-zinc-700/60 dark:focus:bg-zinc-700/70';

/**
 * Карточка «письма» — точно повторяет модалку письма из уведомлений
 * (w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ...).
 * Используется и в NotificationLetterModal, и как превью-редактор в админке:
 * один источник истины — вид никогда не разъезжается.
 */
export default function LetterPreview({
  categoryLabel = 'Система',
  fromLabel = 'От:',
  themeLabel = 'Тема',
  textLabel = 'Текст письма',
  readLabel = 'Прочитано',
  unreadLabel = 'Не прочитано',
  sender,
  title,
  message,
  isRead = false,
  createdAt,
  icon,
  headerActions,
  edit,
  onSenderChange,
  onTitleChange,
  onMessageChange,
}: LetterPreviewProps) {
  const { Icon, cls } = icon;

  return (
    <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-950 border border-slate-200/50 dark:border-zinc-700">
      {/* Шапка: иконка + категория */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${cls}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 smk-text-label font-bold text-slate-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
            <Mail className="h-2.5 w-2.5" />
            {categoryLabel}
          </span>
          {/* «От: <имя>» — в ряд (метка слева, имя справа от неё) */}
          <div className="mt-1.5 flex flex-row items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1.5 dark:bg-zinc-800">
            <span className="shrink-0 smk-text-label font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              {fromLabel}
            </span>
            {edit?.sender && onSenderChange ? (
              <input
                value={sender}
                onChange={(e) => onSenderChange(e.target.value)}
                aria-label={fromLabel}
                placeholder="Даймохк"
                className={`w-full min-w-0 truncate bg-transparent smk-text-label font-bold text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500 ${EDIT_AFFORDANCE}`}
              />
            ) : (
              <span className="truncate smk-text-label font-bold text-slate-900 dark:text-white">
                {sender || 'Даймохк'}
              </span>
            )}
          </div>
        </div>
        {headerActions}
      </div>

      {/* Тело письма: разделители между блоками */}
      <div className="p-5">
        <div className="pb-3">
          <p className="smk-text-label font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            {themeLabel}
          </p>
          {edit?.title && onTitleChange ? (
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              aria-label={themeLabel}
              placeholder={themeLabel}
              className={`mt-1 w-full bg-transparent text-sm font-bold text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500 ${EDIT_AFFORDANCE}`}
            />
          ) : (
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{title}</p>
          )}
        </div>

        <div className="border-t border-dashed smk-hr" />

        <div className="py-3">
          <p className="smk-text-label font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            {textLabel}
          </p>
          {edit?.message && onMessageChange ? (
            <AutoTextarea
              value={message}
              onChange={onMessageChange}
              ariaLabel={textLabel}
              className={`mt-1 w-full resize-none whitespace-pre-wrap break-words bg-transparent text-xs leading-relaxed text-slate-700 placeholder:text-slate-400 [overflow-wrap:anywhere] dark:text-zinc-300 dark:placeholder:text-zinc-500 ${EDIT_AFFORDANCE}`}
            />
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-relaxed text-slate-700 dark:text-zinc-300">
              {message}
            </p>
          )}
        </div>

        <div className="border-t border-dashed smk-hr" />

        <div className="flex items-center justify-between pt-3">
          <span className="flex items-center gap-1 smk-text-label text-slate-400 dark:text-zinc-500">
            <CheckCheck className="h-3.5 w-3.5" />
            {isRead ? readLabel : unreadLabel}
          </span>
          {createdAt && (
            <time className="smk-text-label font-medium text-slate-400 dark:text-zinc-500">
              {formatDate(createdAt)}
            </time>
          )}
        </div>
      </div>
    </div>
  );
}
