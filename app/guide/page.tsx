'use client';

/**
 * /guide — «Руководство»: обзор всех разделов приложения.
 * Открывается из бокового меню (Дополнительно → Руководство)
 * и из welcome-модалки.
 */

import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const SECTIONS = [
  { emoji: '👥', key: 'catalog', href: '/', title: 'Каталог', titleCe: 'Каталог', desc: 'Специалисты и жители, отзывы, рейтинги, поиск и фильтры.', descCe: 'Специалисташ а, жимхош а, отзываш, рейтингаш, лахар а, фильтраш а.' },
  { emoji: '🗺️', key: 'map', href: '/map', title: 'Карта', titleCe: 'Карта', desc: 'Дома, объекты, анкеты — с кластерами и фильтром категорий.', descCe: 'ЦIенош, объекташ, анкеташ — кластерашца а, категорин фильтрца а.' },
  { emoji: '📩', key: 'letters', href: '/', title: 'Письма', titleCe: 'Письманаш', desc: 'Уведомления и рассылки от Даймохка: welcome, новости, итоги.', descCe: 'Даймохкера хьехамаш а, дIевзарш а: welcome, керланаш, жамIаш.' },
  { emoji: '🚕', key: 'taxi', href: '/taxi', title: 'Вай Такси', titleCe: 'Вай Такси', desc: 'Поездки по селу и республике (в разработке).', descCe: 'Юьртахула а, республикехула а новкъа вахар (кечдеш ду).' },
  { emoji: '🛠️', key: 'temshik', href: '/', title: 'Аренца Темщик', titleCe: 'Аренца Темщик', desc: 'Оплачиваемые задания и поручения (в разработке).', descCe: 'Ахча луш долу тIедилларш (кечдеш ду).' },
  { emoji: '🤝', key: 'goyncha', href: '/', title: 'ГIончалла', titleCe: 'ГIончалла', desc: 'Бескорыстная помощь и волонтёрство (в разработке).', descCe: 'Маьхза гIо а, волонтералла (кечдеш ду).' },
  { emoji: '🕌', key: 'qibla', href: '/', title: 'Кибла', titleCe: 'Къилба', desc: 'Компас направления на Каабу — в боковом меню.', descCe: 'Кааба тIе компас — боковчу меню чохь.' },
  { emoji: '🤖', key: 'janna', href: '/', title: 'Вайнех Джанна', titleCe: 'Вайнех Джанна', desc: 'ИИ-ассистент на чеченском (в планах).', descCe: 'Нохчийн маттахь кхетам-ассистент (планехь ду).' },
];

export default function GuidePage() {
  const { language, setLanguage } = useI18n();
  const ce = language === 'ce';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      {/* Шапка */}
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          {ce ? 'ЦIа' : 'Назад'}
        </Link>
        <button type="button" onClick={() => setLanguage(ce ? 'ru' : 'ce')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
          {ce ? 'Русский' : 'Нохчийн'}
        </button>
      </div>

      {/* Заголовок */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">{ce ? 'Руководство' : 'Руководство'}</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{ce ? 'ХIара хIун ду Даймохкехь.' : 'Что есть в Даймохке.'}</p>
        </div>
      </div>

      {/* Секции */}
      <div className="space-y-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl dark:bg-zinc-800">{s.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{ce ? s.titleCe : s.title}</p>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{ce ? s.descCe : s.desc}</p>
            </div>
            <span className="mt-1 text-emerald-600 dark:text-emerald-400">→</span>
          </Link>
        ))}
      </div>

      <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        {ce
          ? '💡 Кхин хаам: хьажа мега «Помощь» а, «Правовые соглашения» а меню чохь.'
          : '💡 Подробнее — в разделах «Помощь» и «Правовые соглашения» в меню.'}
      </p>
    </div>
  );
}
