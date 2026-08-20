'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { useI18n } from '@/lib/i18n';
import TourSpotlight from '@/components/TourSpotlight';
import QuickWidgetsEditor from '@/components/settings/QuickWidgetsEditor';
import { SettingRow, Toggle } from '@/components/settings/SettingsPrimitives';

interface FirstTourProps {
  onDone: () => void;
}

/**
 * Обязательный гид нового аккаунта.
 *
 * Для старшего, кто плохо разбирается в телефоне: крупные буквы,
 * не больше четырёх пунктов на шаг, любой шаг можно пропустить.
 * Показывается один раз — флаг в настройках и в localStorage.
 *
 * Два принципа, ради которых гид переписан:
 *
 * 1. Показывать, а не описывать. Каждый шаг подсвечивает настоящую
 *    кнопку на экране позади окна (marks → data-tour). Текст «внизу
 *    пять кнопок» человеку постарше ничего не давал.
 * 2. Настраивать на месте. Там, где речь о виджете и о времени намаза,
 *    прямо в шаге стоят рабочие переключатели: не нужно запоминать
 *    дорогу в настройки и возвращаться туда потом.
 */
export default function FirstTour({ onDone }: FirstTourProps) {
  const { t } = useI18n();
  const { account } = useAuth();
  const { settings, update } = useSettings();
  const [index, setIndex] = useState(0);

  /**
   * marks — метки data-tour, которые подсвечивает шаг. Порядок важен:
   *   берётся первая видимая, поэтому телефонный «plus» стоит раньше
   *   компьютерного «plus-desktop».
   * panel — живые переключатели внутри шага.
   * skippable — показывать ли «Пропустить шаг».
   */
  const steps = [
    {
      title: t.tour1Title,
      items: [t.tour1a, t.tour1b, t.tour1c],
      marks: ['nav'],
      panel: null,
      skippable: false,
    },
    {
      title: t.tour2Title,
      items: [t.tour2a, t.tour2b, t.tour2c],
      marks: ['catalog', 'map'],
      panel: null,
      skippable: true,
    },
    {
      title: t.tour3Title,
      items: [t.tour3a, t.tour3b, t.tour3c],
      marks: ['menu'],
      panel: null,
      skippable: true,
    },
    {
      title: t.tour4Title,
      items: [t.tour4a, t.tour4b, t.tour4c],
      marks: ['widgets'],
      // Тот же редактор, что и в настройках: одна реализация, не копия.
      panel: <QuickWidgetsEditor />,
      skippable: true,
    },
    {
      title: t.tour5Title,
      items: [t.tour5a, t.tour5b, t.tour5c],
      marks: [],
      panel: (
        <SettingRow title={t.hidePrayer} hint={t.hidePrayerHint}>
          <Toggle
            checked={settings.hidePrayer}
            onChange={(next) => update({ hidePrayer: next })}
            label={t.hidePrayer}
          />
        </SettingRow>
      ),
      skippable: true,
    },
    {
      title: t.tour6Title,
      items: [t.tour6a, t.tour6b, t.tour6c, t.tour6d],
      marks: ['plus', 'plus-desktop'],
      panel: null,
      skippable: true,
    },
    {
      title: t.tour7Title,
      items: [t.tour7a, t.tour7b, t.tour7c],
      marks: [],
      panel: null,
      skippable: false,
    },
  ];

  const last = index === steps.length - 1;
  const step = steps[index];

  const finish = () => {
    update({ tourDone: true });
    try {
      if (account?.id) window.localStorage.setItem(`daymohk-tour-${account.id}`, '1');
    } catch { /* private mode */ }
    onDone();
  };

  const goNext = () => {
    if (last) finish();
    else setIndex((current) => current + 1);
  };

  return (
    <div className="relative px-6 pb-6 pt-10">
      {/* Подсветка живёт в портале на body, поэтому окно гида её не
          обрезает. Пустой список меток — шаг без подсветки. */}
      <TourSpotlight marks={step.marks} />

      <p className="smk-text-label font-bold uppercase tracking-wide text-[var(--smk-gold)]">
        {t.tourStepOf.replace('{n}', String(index + 1)).replace('{m}', String(steps.length))}
      </p>
      <h2 className="mt-1 smk-text-display font-black text-slate-900 dark:text-white">
        {step.title}
      </h2>
      <hr className="smk-orn my-3" />

      <ol className="space-y-3">
        {step.items.map((item, itemIndex) => (
          <li key={item} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
              {itemIndex + 1}
            </span>
            <p className="pt-1 text-sm font-semibold leading-relaxed text-slate-800 dark:text-zinc-200">
              {item}
            </p>
          </li>
        ))}
      </ol>

      {/* Подсказка только там, где есть что подсвечивать: иначе она
          отправила бы человека искать несуществующую рамку. */}
      {step.marks.length > 0 && (
        <p className="mt-3 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-500">
          {t.tourHighlight}
        </p>
      )}

      {step.panel && (
        <div className="mt-4 max-h-[42vh] overflow-y-auto rounded-2xl bg-slate-50 p-3 dark:bg-zinc-900/60">
          {step.panel}
        </div>
      )}

      <div className="mt-5 flex items-center gap-1.5" aria-hidden>
        {steps.map((_, dot) => (
          <span
            key={dot}
            className={`h-1.5 flex-1 rounded-full ${dot === index ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-zinc-700'}`}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((current) => current - 1)}
            aria-label={t.tourBack}
            className="smk-hit flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={goNext}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
        >
          {/* На шагах с переключателями человек уже настраивает —
              «Далее» там читается как «пропустить». Пишем «Настроить». */}
          {last ? t.tourFinish : (step.panel ? t.tourSetup : t.tourNext)}
          {!last && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>

      {step.skippable && (
        <button
          type="button"
          onClick={goNext}
          className="mt-2 w-full py-2 text-center text-sm font-bold text-slate-500 dark:text-zinc-400"
        >
          {t.tourSkip}
        </button>
      )}
    </div>
  );
}
