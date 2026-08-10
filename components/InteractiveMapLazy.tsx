'use client';

import dynamic from 'next/dynamic';
import type { InteractiveMapProps } from './InteractiveMap';

const InteractiveMapLazy = dynamic<InteractiveMapProps>(
  () => import('./InteractiveMap').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800"
        aria-label="Загрузка карты"
        role="status"
      >
        <div className="flex flex-col items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          Загрузка карты…
        </div>
      </div>
    ),
  }
);

export default InteractiveMapLazy;
