'use client';

import Link from 'next/link';
import { Ban } from 'lucide-react';
import { cacheBustAvatarUrl } from '@/lib/media';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { banRemainingLabel } from '@/lib/ban';
import { useEffect, useState } from 'react';

/**
 * Мини-профиль в боковом меню. Отдельный модуль: рендерится как
 * shrink-0-блок ВНЕ скролл-контейнера меню, поэтому никогда не
 * скроллится вместе с навигацией.
 *
 * Если пользователь НЕ авторизован — клик открывает окно согласия
 * (онбординг, шаг consent), а не страницу /profile.
 */
export default function MenuProfileCard() {
  const { account } = useAuth();
  const { language, t } = useI18n();
  const isLocked = Boolean(account?.isBlocked);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isLocked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isLocked]);

  const banLabel = isLocked ? banRemainingLabel(account?.bannedUntil, language, now) : null;

  const openConsent = () => {
    window.dispatchEvent(new Event('samashki-open-consent'));
  };

  const cls = `flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${
    isLocked
      ? 'bg-red-100 ring-1 ring-red-300 dark:bg-red-900/60 dark:ring-red-800'
      : 'bg-slate-50/90 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800'
  }`;

  const inner = (
    <>
      <div className={`relative h-11 w-11 shrink-0 rounded-full p-0.5 shadow-sm overflow-hidden bg-white dark:bg-zinc-950 ${isLocked ? 'ring-2 ring-red-400/80' : 'ring-2 ring-emerald-500/80'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cacheBustAvatarUrl(account?.avatarUrl || '/icon.png')}
          alt={account?.fullName || 'Даймохк'}
          className="h-full w-full object-cover rounded-full"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-xs font-bold text-slate-900 dark:text-white">
          {account?.fullName || 'Даймохк'}
        </h3>
        <p className="truncate text-[10px] text-slate-500 dark:text-zinc-500">
          {account?.email || (language === 'ce' ? 'Нохчийн Республика' : 'Чеченская Республика')}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {account ? (
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${isLocked ? 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>
            Профиль
          </span>
        ) : (
          <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 dark:bg-zinc-700 dark:text-zinc-300">
            {t.signIn}
          </span>
        )}
      </div>
    </>
  );

  return (
    <div className="shrink-0 border-t border-slate-100 pt-3 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      {account ? (
        <Link href="/profile" className={cls}>{inner}</Link>
      ) : (
        <button type="button" onClick={openConsent} className={cls}>{inner}</button>
      )}

      {isLocked && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-xl bg-red-100 px-2.5 py-1.5 text-[10px] font-bold text-red-800 dark:bg-red-900/50 dark:text-red-200">
          <Ban className="h-3 w-3 shrink-0" />
          <span className="truncate">{banLabel ?? (language === 'ce' ? 'Аккаунт билсена яьлла' : 'Аккаунт заблокирован')}</span>
        </div>
      )}
    </div>
  );
}
