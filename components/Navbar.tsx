'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function Navbar() {
  const { t } = useI18n();

  return (
    <header
      className="site-header fixed inset-x-0 top-0 lg:left-[290px] z-50 shadow-sm backdrop-blur-md transition-colors"
      /* replaced with tailwind classes */
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        {/* Brand / Logo only with transparent background */}
        <Link href="/" className="flex items-center gap-2.5" aria-label="Даймохк — на главную">
          <div
            className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-transparent"
            style={{ borderRadius: 'var(--radius-xl, 0.75rem)' }}
          >
            <img
              src="/icon.png"
              alt="Даймохк"
              className="h-full w-full object-contain rounded-xl bg-transparent"
              style={{ borderRadius: 'var(--radius-xl, 0.75rem)' }}
            />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-lg">
              Даймохк
            </h1>
            <p className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 sm:text-xs">
              {t.siteSubtitle}
            </p>
          </div>
        </Link>
      </div>
    </header>
  );
}
