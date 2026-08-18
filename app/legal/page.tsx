'use client';

/**
 * /legal — правовые документы: публичная оферта, политика
 * конфиденциальности, согласие на рекламу.
 *
 * Тексты живут в lib/legal/* как markdown и рендерятся тем же
 * компонентом Prose, что и страницы-чтения: одинаковая типографика,
 * таблицы, выделения. HTML строкой не вставляется.
 *
 * Документы только на русском языке — это осознанное решение: при
 * расхождении версий силу имеет русский текст, а перевод юридических
 * формулировок без юриста создаёт риск, что чеченская версия скажет
 * не то же самое. Об этом сказано на самой странице.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Lock, Megaphone, ScrollText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import Prose from '@/components/reading/Prose';
import { OFFER_TEXT, OFFER_UPDATED_AT } from '@/lib/legal/offer';
import { PRIVACY_TEXT, PRIVACY_UPDATED_AT } from '@/lib/legal/privacy';
import { ADS_TEXT, ADS_UPDATED_AT } from '@/lib/legal/ads';

type Doc = 'offer' | 'privacy' | 'ads';

const DOCS: {
  id: Doc;
  label: string;
  icon: typeof FileText;
  text: string;
  updated: string;
}[] = [
  { id: 'offer', label: 'Публичная оферта', icon: ScrollText, text: OFFER_TEXT, updated: OFFER_UPDATED_AT },
  { id: 'privacy', label: 'Конфиденциальность', icon: Lock, text: PRIVACY_TEXT, updated: PRIVACY_UPDATED_AT },
  { id: 'ads', label: 'Согласие на рекламу', icon: Megaphone, text: ADS_TEXT, updated: ADS_UPDATED_AT },
];

function formatDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export default function LegalPage() {
  const { language } = useI18n();
  const ce = language === 'ce';
  const [doc, setDoc] = useState<Doc>('offer');
  const active = DOCS.find((d) => d.id === doc)!;
  const Icon = active.icon;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <Link href="/" className="smk-solid inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold">
          <ArrowLeft className="h-3.5 w-3.5" />
          {ce ? 'ЦIа' : 'Назад'}
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hero-gradient text-white shadow-lg">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="smk-title truncate text-xl font-black text-slate-900 dark:text-white">
            {ce ? 'Бакъонан бартамаш' : 'Правовые соглашения'}
          </h1>
          <p className="truncate text-xs text-slate-500 dark:text-zinc-400">
            {ce ? 'Оферта, къайлалла, реклама' : 'Оферта, конфиденциальность, реклама'}
          </p>
        </div>
      </div>

      {/* Переключатель документов */}
      <div className="smk-seg mb-4 grid grid-cols-3">
        {DOCS.map((d) => {
          const IconD = d.icon;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => { setDoc(d.id); window.scrollTo({ top: 0 }); }}
              aria-pressed={doc === d.id}
              className={`smk-seg-btn ${doc === d.id ? 'smk-seg-btn--on' : ''}`}
            >
              <IconD className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{d.label}</span>
            </button>
          );
        })}
      </div>

      <hr className="smk-orn mb-4" />

      <article className="smk-read">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {active.label}
          </h2>
        </div>
        <Prose text={active.text} />
      </article>

      <hr className="smk-orn my-5" />

      <p className="smk-meta text-center text-[11px]">
        {ce ? 'ТIаьххьара хийцам: ' : 'Последнее обновление: '}
        {formatDate(active.updated)}
      </p>
    </div>
  );
}
