'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * Мелкие блоки страницы настроек.
 *
 * Вынесены отдельно, потому что повторяются десятки раз: тумблер,
 * подсказка и заголовок секции. Оформление — разделители и подложки,
 * без вложенных рамок, как и везде в приложении.
 */

/** Круглый тумблер. */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? 'bg-emerald-600'
          : 'smk-toggle-off'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Восклицательный знак с подсказкой.
 *
 * Открывается по клику, а не по наведению: на телефоне hover не
 * существует, и подсказка была бы недоступна половине пользователей.
 */
export function HintMark({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  /**
   * Подсказка рендерится порталом в body и позиционируется вручную.
   *
   * Абсолютное позиционирование внутри строки не годилось: у родителей
   * есть overflow-hidden и rounded-*, поэтому широкая подсказка у
   * правого края уезжала за экран и обрезалась. Портал вне потока
   * позволяет прижать её к границам окна.
   */
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(260, window.innerWidth - margin * 2);
    // Центрируем по значку, затем зажимаем в границы окна.
    const rawLeft = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - width - margin));
    setBox({ top: rect.bottom + 8, left, width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    place();
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen, place]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={text}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((value) => !value);
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-black text-slate-600 transition hover:bg-slate-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
      >
        !
      </button>

      {isOpen && box && typeof document !== 'undefined' && createPortal(
        <>
          {/* Подложка: клик мимо закрывает. На телефоне это единственный
              удобный способ убрать подсказку. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[95] cursor-default"
          />
          <span
            role="tooltip"
            style={{ top: box.top, left: box.left, width: box.width }}
            className="fixed z-[96] rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-medium leading-relaxed text-white shadow-xl dark:bg-zinc-700"
          >
            {text}
          </span>
        </>,
        document.body,
      )}
    </>
  );
}

/** Заголовок секции: подпись, тонкая линия и необязательная подсказка. */
export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
        {title}
      </h2>
      {hint && <HintMark text={hint} />}
      <span className="smk-rule h-px flex-1" aria-hidden />
      {action}
    </div>
  );
}

/** Строка настройки: подпись слева, управление справа. */
export function SettingRow({
  title,
  description,
  hint,
  children,
}: {
  title: string;
  description?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="smk-field flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-bold text-slate-800 dark:text-zinc-200">{title}</p>
          {hint && <HintMark text={hint} />}
        </div>
        {description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-500">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Предупреждение перед опасным действием. */
export function WarningBox({ text }: { text: string }) {
  return (
    <p className="smk-note smk-note-warn flex items-start gap-2 px-3 py-2.5">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  );
}
