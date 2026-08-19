'use client';

/**
 * Строка «подпись — значение» внутри открытой карточки.
 *
 * Раньше такой блок жил только в TaskDetailModal, а анкета набирала
 * факты вручную (то бейджами, то абзацами) — и внутренности двух
 * карточек выглядели как из разных приложений. Один компонент на оба
 * места убирает дубликат и держит ритм одинаковым.
 */
export default function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  // На широком экране — подпись слева, значение справа. На узком
  // столбиком: пары вроде «Стаж · 9 лет 7 месяцев» и «График ·
  // Пн–Сб 09:00–18:00» в одну строку на телефоне не помещались, и
  // значение обрезалось многоточием прямо на середине.
  //
  // whitespace-nowrap на подписи не даёт ей переноситься по слогам,
  // а break-words у значения — рвать длинный график как попало.
  return (
    <div className="smk-sheet-row flex flex-col gap-0.5 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      <span className="smk-sheet-label flex shrink-0 items-center gap-1 whitespace-nowrap">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="min-w-0 break-words text-xs font-bold text-slate-800 dark:text-zinc-200 sm:truncate sm:text-right">
        {value}
      </span>
    </div>
  );
}
