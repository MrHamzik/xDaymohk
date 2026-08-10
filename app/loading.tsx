export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">Загрузка Даймохк…</p>
      </div>
    </div>
  );
}
