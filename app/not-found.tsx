import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-5xl font-black text-emerald-600 dark:text-emerald-400">404</p>
        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Страница не найдена</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Запрашиваемая страница не существует или была перемещена.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
        >
          Вернуться в каталог
        </Link>
      </div>
    </div>
  );
}
