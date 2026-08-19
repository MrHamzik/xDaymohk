'use client';

import type { ReactNode } from 'react';

export interface MapSegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Небольшая цифра-счётчик справа от подписи (только у активного пункта). */
  count?: number;
}

interface MapSegmentedControlProps<T extends string> {
  options: MapSegmentOption<T>[];
  /** Активные значения. Один — radio-поведение, несколько — независимые тумблеры. */
  active: T[];
  onSelect: (value: T) => void;
  ariaLabel: string;
  /** true — radio (role="tablist"/aria-selected), false — независимые кнопки. */
  radio?: boolean;
  /**
   * Не сжимать кнопки, а прокручивать ряд по горизонтали.
   *
   * Нужно там, где подписей много или они длинные («Уведомления»,
   * «Расширенные»): при равном делении ширины текст переставал
   * помещаться и обрезался. Скролл невидимый — полоса не занимает
   * место и не мозолит глаза.
   */
  scrollable?: boolean;
  className?: string;
}

/**
 * Единый сегмент-переключатель карты.
 *
 * Одно место, где живёт оформление «Карта / Спутник / Гибрид», — и ровно
 * то же оформление получают «Анкеты / Дома / Другие» на странице «Карта»
 * и переключатели карты внутри анкет. Раньше разметка была скопирована
 * в трёх файлах и успела разъехаться (разные отступы, скругления и
 * hover-состояния).
 */
export default function MapSegmentedControl<T extends string>({
  options,
  active,
  onSelect,
  ariaLabel,
  radio = true,
  scrollable = false,
  className = '',
}: MapSegmentedControlProps<T>) {
  return (
    <div
      className={`flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-zinc-800 ${
        scrollable ? 'no-scrollbar overflow-x-auto' : ''
      } ${className}`}
      role={radio ? 'tablist' : undefined}
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = active.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role={radio ? 'tab' : undefined}
            aria-selected={radio ? isActive : undefined}
            aria-pressed={radio ? undefined : isActive}
            onClick={() => onSelect(option.value)}
            className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
              scrollable
                ? 'shrink-0 whitespace-nowrap '
                : className.includes('w-full') ? 'flex-1 ' : ''
            }${
              isActive
                ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200'
            }`}
          >
            {option.label}
            {isActive && typeof option.count === 'number' && (
              <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[9px] text-slate-500 dark:bg-zinc-600 dark:text-zinc-200">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
