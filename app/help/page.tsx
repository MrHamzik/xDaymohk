'use client';

/**
 * /help — «Помощь»: частые вопросы и контакты (разработчики, админы).
 */

import Link from 'next/link';
import { ArrowLeft, LifeBuoy, Mail, MessageCircle, Phone } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const FAQ = [
  { q: 'Как добавить анкету?', a: 'Войдите через Google → откройте профиль → «Новая анкета». Заполните профессию, услуги, место работы.', qCe: 'Миха анкета тIетоха?', aCe: 'Google чуйаха → профиль → «Керла анкета». Говзалла, гIуллакхаш, болх беш меттиг кечйе.' },
  { q: 'Как изменить имя или фото?', a: 'В профиле нажмите «Изменить фото» или отредактируйте ФИО — это применится ко всем анкетам.', qCe: 'Миха цIе я сурт хийца?', aCe: 'Профилехь «Сурт хийца» тIе тIедаккха я ФИО нийсаде — иза массо анкеташкахь хир ду.' },
  { q: 'Почему я не вижу свою анкету на карте?', a: 'Проверьте, что в анкете указан адрес/место работы, и включите слой «Анкеты» на карте.', qCe: 'ХIунда суна сайна анкета карта тIехь ца ги?', aCe: 'Хьажа, анкета чохь адрес/болх беш меттиг хIунда яц, карта тIехь «Анкеташ» слой хьаяй.' },
  { q: 'Как связаться с администрацией?', a: 'Напишите нам: контакты ниже.', qCe: 'Миха администрацех зIе йаккха?', aCe: 'Тхойга язъе: контакташ лахахь ду.' },
];

export default function HelpPage() {
  const { language, setLanguage } = useI18n();
  const ce = language === 'ce';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          {ce ? 'ЦIа' : 'Назад'}
        </Link>
        <button type="button" onClick={() => setLanguage(ce ? 'ru' : 'ce')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
          {ce ? 'Русский' : 'Нохчийн'}
        </button>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">{ce ? 'ГIо' : 'Помощь'}</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{ce ? 'Хьехамаш а, жоппаш а' : 'Вопросы и ответы'}</p>
        </div>
      </div>

      {/* FAQ */}
      <div className="space-y-2">
        {FAQ.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-900 transition hover:text-emerald-700 dark:text-white dark:hover:text-emerald-300">
              {ce ? f.qCe : f.q}
            </summary>
            <p className="border-t border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600 dark:border-zinc-800 dark:text-zinc-300">
              {ce ? f.aCe : f.a}
            </p>
          </details>
        ))}
      </div>

      {/* Контакты */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">{ce ? 'Контакташ' : 'Контакты'}</h2>
        <div className="space-y-2">
          <a href="mailto:support@daimokhk.ru" className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-emerald-50 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-emerald-950/30">
            <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            support@daimokhk.ru
          </a>
          <a href="https://t.me/daimokhk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-emerald-50 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-emerald-950/30">
            <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {ce ? 'Телеграм-канал' : 'Телеграм'}
          </a>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">
            <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {ce ? '+7 (999) 000-00-00 (администратор)' : '+7 (999) 000-00-00 (админ)'}
          </div>
        </div>
      </div>
    </div>
  );
}
