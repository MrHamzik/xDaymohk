'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Bike, ChefHat, Clock, HardHat, MapPin, Send, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { buildQuickTaskPreset, type QuickTaskPreset } from '@/lib/quick-request';

interface CatalogLandingProps {
  /**
   * Открыть форму задания. Быстрая заявка передаёт пресет; кнопка
   * «Создать заявку на еду» — без пресета. Гостей страница сверху
   * направляет во вход, сюда они не доходят.
   */
  onOpenTask: (preset?: QuickTaskPreset | null) => void;
  /** Прокрутить к списку специалистов («Найти рабочих»). */
  onShowCatalog: () => void;
}

/**
 * Лендинг в шапке каталога — структура по макету владельца:
 * hero-баннер с преимуществами, три карточки услуг, блок быстрой
 * заявки. Без футера (решение владельца).
 *
 * Оформление подчиняется теме пользователя: в тёмной — как на макете
 * (тёмный фон, светлые штрихи гор), в светлой — тот же макет в
 * светлой палитре. Горы — один растровый линейный рисунок, на свете
 * он кладётся multiply (белое исчезает), в темноте — invert+screen
 * (чёрное исчезает, штрихи светлеют).
 *
 * Карточки не декорация: «Заказ еды» открывает форму задания,
 * «Сбор рабочих» прокручивает к списку специалистов ниже, «Курьер» —
 * в ВайТакси. Быстрая заявка собирает пресет и открывает штатную
 * форму задания «ГIончалла» — у заявки весь жизненный цикл заданий.
 */
export default function CatalogLanding({ onOpenTask, onShowCatalog }: CatalogLandingProps) {
  const { t } = useI18n();
  const { account } = useAuth();

  // Быстрая заявка: имя и телефон предзаполняются из аккаунта, но
  // правятся свободно (заявку оставляют и за родственника).
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!account) return;
    setName((current) => current || account.fullName || '');
    setPhone((current) => current || account.phone || '');
  }, [account?.id, account?.fullName, account?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitQuick = (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) return;
    onOpenTask(buildQuickTaskPreset(
      { name, phone, description },
      { defaultTitle: t.quickDefaultTitle, contactsWord: t.quickContactsWord },
    ));
    setDescription('');
  };

  const field = 'smk-field w-full px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white';

  return (
    <div className="space-y-3">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section
        className="smk-lux relative overflow-hidden rounded-3xl p-5 sm:p-6"
        aria-labelledby="catalog-landing-title"
      >
        <Image
          src="/mountains-hero.png"
          alt=""
          width={1600}
          height={500}
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 object-cover opacity-10 mix-blend-multiply select-none dark:opacity-25 dark:invert dark:mix-blend-screen"
        />
        <div className="relative z-10 max-w-2xl">
          <h1 id="catalog-landing-title" className="smk-title text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {t.catLandingTitle}
          </h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 dark:text-zinc-400 sm:text-sm">
            {t.catLandingLead}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenTask(null)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
            >
              <ChefHat className="h-3.5 w-3.5" />
              {t.catBtnFood}
            </button>
            {/* «Сбор рабочих» — такое же задание, но «на дату»
                (kind: scheduled): решение владельца. */}
            <button
              type="button"
              onClick={() => onOpenTask({ kind: 'scheduled' })}
              className="smk-solid inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
            >
              <HardHat className="h-3.5 w-3.5" />
              {t.catBtnWorkers}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 px-2.5 py-1 smk-text-label font-semibold text-slate-600 dark:bg-zinc-800/70 dark:text-zinc-300">
              <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {t.catChipArea}
            </span>
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 px-2.5 py-1 smk-text-label font-semibold text-slate-600 dark:bg-zinc-800/70 dark:text-zinc-300">
              <Clock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {t.catChip247}
            </span>
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 px-2.5 py-1 smk-text-label font-semibold text-slate-600 dark:bg-zinc-800/70 dark:text-zinc-300">
              <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {t.catChipVerified}
            </span>
          </div>
        </div>
      </section>

      {/* ── Три карточки услуг ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <div className="smk-lux flex flex-col p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <ChefHat className="h-5 w-5" />
          </span>
          <h3 className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">{t.catCardFood}</h3>
          <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{t.catCardFoodDesc}</p>
          <button
            type="button"
            onClick={() => onOpenTask(null)}
            className="mt-3 inline-flex items-center gap-1 self-start rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            {t.catCardFoodBtn}
          </button>
        </div>

        <div className="smk-lux flex flex-col p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--smk-gold)] text-white shadow-sm">
            <HardHat className="h-5 w-5" />
          </span>
          <h3 className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">{t.catCardWorkers}</h3>
          <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{t.catCardWorkersDesc}</p>
          <button
            type="button"
            onClick={() => onOpenTask({ kind: 'scheduled' })}
            className="mt-3 inline-flex items-center gap-1 self-start rounded-xl bg-emerald-600/90 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            {t.catCardWorkersBtn}
          </button>
        </div>

        <div className="smk-lux flex flex-col p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
            <Bike className="h-5 w-5" />
          </span>
          <h3 className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">{t.catCardCourier}</h3>
          <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{t.catCardCourierDesc}</p>
          <Link
            href="/taxi"
            className="mt-3 inline-flex items-center gap-1 self-start rounded-xl bg-slate-200/80 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-300/80 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {t.catCardCourierBtn}
          </Link>
        </div>
      </div>

      {/* ── Быстрая заявка ───────────────────────────────────────── */}
      <section className="smk-lux rounded-3xl p-4 sm:p-5" aria-labelledby="quick-request-title">
        <h2 id="quick-request-title" className="text-center text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">
          {t.catQuickTitle}
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 dark:text-zinc-400">
          {t.catQuickLead}
        </p>

        <form onSubmit={submitQuick} className="mx-auto mt-4 max-w-2xl space-y-2.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.catFormName}
              aria-label={t.catFormName}
              maxLength={80}
              className={field}
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t.catFormPhone}
              aria-label={t.catFormPhone}
              inputMode="tel"
              maxLength={30}
              className={field}
            />
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.catFormDesc}
            aria-label={t.catFormDesc}
            rows={2}
            maxLength={1000}
            className={`${field} resize-y`}
          />
          <button
            type="submit"
            disabled={!description.trim()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Send className="h-3.5 w-3.5" />
            {t.catFormSubmit}
          </button>
          {!account && (
            <p className="text-center smk-text-label text-slate-400 dark:text-zinc-500">
              {t.catFormGuest}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
