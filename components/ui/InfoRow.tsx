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
  // Одна строка: подпись слева, значение справа. Двухэтажный вариант
  // разрывал короткие пары вроде «Осталось · 2 ч» без пользы.
  return (
    <div className="smk-sheet-row flex items-center justify-between gap-2 px-2.5 py-2">
      <span className="smk-sheet-label flex shrink-0 items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="truncate text-xs font-bold text-slate-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}
