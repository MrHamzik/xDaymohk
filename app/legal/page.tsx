'use client';

/**
 * /legal — «Правовые соглашения»: публичная оферта, политика
 * конфиденциальности, согласие на рекламу. Переключатель документов
 * сверху (как в уведомлениях).
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Lock, Megaphone, ScrollText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

type Doc = 'offer' | 'privacy' | 'ads';

const DOCS: { id: Doc; label: string; labelCe: string; icon: typeof FileText }[] = [
  { id: 'offer', label: 'Публичная оферта', labelCe: 'Публични оферта', icon: ScrollText },
  { id: 'privacy', label: 'Конфиденциальность', labelCe: 'Къайлаха', icon: Lock },
  { id: 'ads', label: 'Согласие на рекламу', labelCe: 'Рекламе дуьхьа бакъо', icon: Megaphone },
];

const CONTENT: Record<Doc, { ru: string[]; ce: string[] }> = {
  offer: {
    ru: [
      '1. Настоящий документ является публичной офертой (ст. 437 ГК РФ) и определяет условия использования сервиса «Даймохк».',
      '2. Используя сервис, вы принимаете настоящие условия в полном объёме.',
      '3. Сервис предоставляет каталог жителей и специалистов, карту, уведомления и иные функции.',
      '4. Администрация вправе изменять условия оферты, уведомляя пользователей через раздел «Письма».',
      '5. Запрещено размещать недостоверные сведения, спам, оскорбления и иной противоправный контент.',
      '6. Администрация вправе блокировать аккаунты за нарушение правил.',
    ],
    ce: [
      '1. ХIара документ публични оферта ду (ГК РФ 437 ст.) — «Даймохк» гIирсан лелоран хьал къастадо.',
      '2. ГIирс лелош, хьо хIара хьал йуьззина тIелоцу.',
      '3. ГIирса тIехь ду каталог, карта, хьехамаш а, кхин функцеш а.',
      '4. Администрацис офертин хьал хийца мега, «Письманаш» чохь хаийтина.',
      '5. Бакъ ца хиларан хаамаш, спам, оскорблени а, кхин закон доцу чулацам дIадаха ца мега.',
      '6. Администрацис бакъо йу аккаунташ блок йаккха бакъонаш йохочарна.',
    ],
  },
  privacy: {
    ru: [
      '1. Мы обрабатываем персональные данные (ФИО, фото, контакты) только для работы сервиса.',
      '2. Данные хранятся в защищённом хранилище; доступ ограничен.',
      '3. Мы не передаём данные третьим лицам, кроме случаев, предусмотренных законом.',
      '4. Вы можете запросить удаление своих данных в любой момент (удаление аккаунта).',
      '5. Фото и данные анкет видны другим пользователям сервиса.',
    ],
    ce: [
      '1. Тхо персональни хаамаш (ФИО, сурт, контакташ) кхин цхьаъ гIуллакх дан ца леладо.',
      '2. Хаамаш ларйина меттигехь ду; тIекхочу верг маьхкина ву.',
      '3. Хаамаш кхин нахана ца ло, законо ма-леладо боцург.',
      '4. Хьайн хаамаш дIадаккха дехар дан мега муьлхха а ханна (аккаунт дIадаккхар).',
      '5. Сурт а, анкетин хаамаш а гIирс лелочарна гучудолу.',
    ],
  },
  ads: {
    ru: [
      '1. Сервис может отправлять информационные и рекламные сообщения (письма, уведомления).',
      '2. Отправляя согласие, вы разрешаете получение таких сообщений.',
      '3. Вы можете отозвать согласие в любой момент (настройки уведомлений).',
      '4. Сообщения содержат пометку о рекламном характере.',
    ],
    ce: [
      '1. ГIирса тIехь информацин а, рекламин а хьехамаш дIабахийта мега (письманаш, хьехамаш).',
      '2. Бакъо луш, хьо иштта хьехамаш тIеоьцу.',
      '3. Бакъо дIадаккха мега муьлхха а ханна (уведомленийн настройкаш).',
      '4. Хьехамашкахь реклама хилар билгалдоккху.',
    ],
  },
};

export default function LegalPage() {
  const { language, setLanguage } = useI18n();
  const ce = language === 'ce';
  const [doc, setDoc] = useState<Doc>('offer');
  const active = DOCS.find((d) => d.id === doc)!;
  const Icon = active.icon;
  const content = CONTENT[doc];

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

      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">{ce ? 'Правовин соглашени' : 'Правовые соглашения'}</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{ce ? 'Оферта, къайлаха, реклама' : 'Оферта, конфиденциальность, реклама'}</p>
        </div>
      </div>

      {/* Переключатель документов */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {DOCS.map((d) => {
          const IconD = d.icon;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setDoc(d.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${doc === d.id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
            >
              <IconD className="h-3.5 w-3.5" />
              {ce ? d.labelCe : d.label}
            </button>
          );
        })}
      </div>

      {/* Содержимое документа */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{ce ? active.labelCe : active.label}</h2>
        </div>
        <div className="space-y-3">
          {(ce ? content.ce : content.ru).map((line, i) => (
            <p key={i} className="text-xs leading-relaxed text-slate-600 dark:text-zinc-300">{line}</p>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-[10px] text-slate-400 dark:text-zinc-500">
        {ce ? 'ТIаьххьара хийцам: 2026 шо' : 'Последнее обновление: 2026'}
      </p>
    </div>
  );
}
