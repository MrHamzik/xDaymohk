import type { ReactNode } from 'react';

/**
 * Пустое состояние ленты или списка.
 *
 * Раньше это была серая строка в пунктире — выглядело как ошибка
 * загрузки. Здесь орнамент уже рисует .smk-dashed, плюс заголовок,
 * объяснение почему пусто и необязательная кнопка.
 */
export default function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="smk-dashed px-5 pb-6 pt-8 text-center">
      <p className="smk-text-title font-bold" style={{ color: 'var(--foreground)' }}>
        {title}
      </p>
      {hint && (
        <p className="mx-auto mt-1.5 max-w-sm smk-text-label smk-meta">
          {hint}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
