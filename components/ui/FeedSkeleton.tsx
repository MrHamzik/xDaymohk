/**
 * Силуэты карточек на время загрузки.
 *
 * Спиннер оставляет пустой экран на несколько секунд сельского
 * интернета, потом страница «прыгает». Скелетон держит ту же сетку,
 * что живая лента, и пульсирует мягко.
 */
function Bone({ className }: { className: string }) {
  return <div className={`smk-skel-bar ${className}`} />;
}

function CardSilhouette() {
  return (
    <div className="smk-lux rounded-3xl p-4" aria-hidden="true">
      <div className="flex items-start gap-3">
        <Bone className="h-12 w-12 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <Bone className="h-3 w-2/3 rounded-full" />
          <Bone className="h-2.5 w-1/2 rounded-full" />
        </div>
        <Bone className="h-6 w-14 shrink-0 rounded-lg" />
      </div>
      <div className="mt-3 space-y-2">
        <Bone className="h-2.5 w-full rounded-full" />
        <Bone className="h-2.5 w-4/5 rounded-full" />
      </div>
      <div className="mt-3 flex gap-2">
        <Bone className="h-5 w-16 rounded-full" />
        <Bone className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export default function FeedSkeleton({
  count = 4,
  columns = 2,
}: {
  count?: number;
  columns?: 1 | 2;
}) {
  return (
    <div
      className={columns === 2 ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'space-y-2.5'}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Загрузка…</span>
      {Array.from({ length: count }, (_, index) => (
        <CardSilhouette key={index} />
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-busy="true">
      <span className="sr-only">Загрузка…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="smk-sheet-row flex items-center gap-2.5 p-2.5" aria-hidden="true">
          <Bone className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Bone className="h-2.5 w-2/3 rounded-full" />
            <Bone className="h-2 w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
