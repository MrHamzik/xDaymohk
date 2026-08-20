'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { useI18n } from '@/lib/i18n';
import { setTourActive, useTourEvents, type TourEvent } from '@/lib/tour';
import TourSpotlight from '@/components/TourSpotlight';
import QuickWidgetsEditor from '@/components/settings/QuickWidgetsEditor';
import { SettingRow, Toggle } from '@/components/settings/SettingsPrimitives';

interface FirstTourProps {
  onDone: () => void;
  /**
   * Гид сообщает наверх, видна ли сейчас карточка. На шагах-заданиях
   * она прячется, и окно вокруг неё (белая подложка модалки) тоже
   * должно исчезнуть — иначе посреди экрана останется пустой лист.
   */
  onCardVisible?: (visible: boolean) => void;
}

/**
 * Обязательный гид нового аккаунта.
 *
 * Для старшего, кто плохо разбирается в телефоне: крупные буквы,
 * не больше четырёх пунктов на шаг, любой шаг можно пропустить.
 * Показывается один раз — флаг в настройках и в localStorage.
 *
 * Три принципа, ради которых гид переписан:
 *
 * 1. Показывать, а не описывать. Каждый шаг подсвечивает настоящую
 *    кнопку на экране позади окна (marks → data-tour). Текст «внизу
 *    пять кнопок» человеку постарше ничего не давал.
 * 2. Давать попробовать руками. Шаги про каталог, меню и плюс убирают
 *    карточку с дороги и ждут, пока человек сам нажмёт и пролистает.
 *    Карточка возвращается, когда действие выполнено (см. lib/tour).
 * 3. Настраивать на месте. Там, где речь о языке, виджете и настройках,
 *    прямо в шаге стоят рабочие переключатели: не нужно запоминать
 *    дорогу в настройки и возвращаться туда потом.
 */
export default function FirstTour({ onDone, onCardVisible }: FirstTourProps) {
  const { t, language, setLanguage } = useI18n();
  const { account } = useAuth();
  const { settings, update } = useSettings();
  const [index, setIndex] = useState(0);
  /**
   * Шаг-задание выполнен? Пока false — карточка спрятана и человек
   * работает с настоящим интерфейсом. Сбрасывается при смене шага.
   */
  const [done, setDone] = useState(false);
  /** Открыто ли сейчас меню плюса — на шаге «Задания» прячет карточку. */
  const [plusOpen, setPlusOpen] = useState(false);
  /**
   * Открыт ли поверх страницы выезд меню или меню плюса.
   *
   * Важно для подсветки: её слой-ловушка лежит выше этих окон (иначе он
   * не перехватывал бы нажатия по интерфейсу), и, пока окно открыто, он
   * блокировал бы его собственные кнопки. На это время подсветку убираем
   * совсем — окно и так занимает весь экран, показывать пальцем некуда.
   */
  const [overlayOpen, setOverlayOpen] = useState(false);

  /**
   * Пока гид идёт, кнопки интерфейса открываются, но ничего не делают:
   * иначе человек уедет создавать анкету посреди обучения.
   */
  useEffect(() => {
    setTourActive(true);
    return () => setTourActive(false);
  }, []);

  /**
   * awaits — какое действие ждёт шаг. Пока оно не сделано, карточки нет.
   *   'catalog-scroll' — нажать «Каталог» и пролистать вниз до карточек;
   *   'menu-scroll'    — открыть меню и пролистать его;
   *   'plus-close'     — открыть меню плюса и закрыть крестиком.
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
      // На телефоне подсвечиваем нижнюю панель, на ПК её нет —
      // там же роль «главного пульта» играет плюс справа внизу.
      marks: ['nav', 'plus-desktop'],
      panel: null,
      awaits: null,
      hint: '',
      skippable: false,
    },
    {
      // Язык — первое, что нужно человеку: дальше он читает этот же гид.
      title: t.tourLangTitle,
      items: [t.tourLanga, t.tourLangb, t.tourLangc],
      marks: [],
      panel: (
        <div className="grid grid-cols-2 gap-2">
          {(['ru', 'ce'] as const).map((code) => {
            const chosen = language === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                aria-pressed={chosen}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
                  chosen
                    ? 'bg-emerald-600 text-white'
                    : 'smk-field text-slate-700 dark:text-zinc-200'
                }`}
              >
                {chosen && <Check className="h-4 w-4" />}
                {code === 'ru' ? 'Русский' : 'Нохчийн'}
              </button>
            );
          })}
        </div>
      ),
      awaits: null,
      hint: '',
      skippable: false,
    },
    {
      title: t.tour2Title,
      items: [t.tour2a, t.tour2b, t.tour2c],
      marks: ['catalog', 'map'],
      panel: null,
      awaits: 'catalog-scroll' as const,
      hint: t.tourWaitCatalog,
      skippable: true,
    },
    {
      title: t.tour3Title,
      items: [t.tour3a, t.tour3b, t.tour3c],
      marks: ['menu', 'rail-menu'],
      panel: null,
      awaits: 'menu-scroll' as const,
      hint: t.tourWaitMenu,
      skippable: true,
    },
    {
      title: t.tour4Title,
      items: [t.tour4a, t.tour4b, t.tour4c],
      marks: ['widgets'],
      // Тот же редактор, что и в настройках: одна реализация, не копия.
      panel: <QuickWidgetsEditor />,
      awaits: null,
      hint: '',
      skippable: true,
    },
    {
      title: t.tour5Title,
      items: [t.tour5a, t.tour5b, t.tour5c],
      marks: [],
      panel: (
        <div className="space-y-1.5">
          <SettingRow title={t.settingsAutoActive} hint={t.settingsAutoActiveHint}>
            <Toggle checked={settings.autoActiveOnOpen} onChange={(next) => update({ autoActiveOnOpen: next })} label={t.settingsAutoActive} />
          </SettingRow>
          <SettingRow title={t.settingsAutoApprove} hint={t.settingsAutoApproveHint}>
            <Toggle checked={settings.autoApproveExecutor} onChange={(next) => update({ autoApproveExecutor: next })} label={t.settingsAutoApprove} />
          </SettingRow>
          <SettingRow title={t.settingsHideHints} hint={t.settingsHideHintsHint}>
            <Toggle checked={settings.hideHints} onChange={(next) => update({ hideHints: next })} label={t.settingsHideHints} />
          </SettingRow>
          <SettingRow title={t.settingsCompact} hint={t.settingsCompactHint}>
            <Toggle checked={settings.compactLists} onChange={(next) => update({ compactLists: next })} label={t.settingsCompact} />
          </SettingRow>
          <SettingRow title={t.settingsConfirmDanger} hint={t.settingsConfirmDangerHint}>
            <Toggle checked={settings.confirmDanger} onChange={(next) => update({ confirmDanger: next })} label={t.settingsConfirmDanger} />
          </SettingRow>
          <SettingRow title={t.settingsQuietHours} hint={t.settingsQuietHoursHint}>
            <Toggle checked={settings.quietHours} onChange={(next) => update({ quietHours: next })} label={t.settingsQuietHours} />
          </SettingRow>
          <SettingRow title={t.settingsVibrate} hint={t.settingsVibrateHint}>
            <Toggle checked={settings.vibrate} onChange={(next) => update({ vibrate: next })} label={t.settingsVibrate} />
          </SettingRow>
          <SettingRow title={t.hidePrayer} hint={t.hidePrayerHint}>
            <Toggle checked={settings.hidePrayer} onChange={(next) => update({ hidePrayer: next })} label={t.hidePrayer} />
          </SettingRow>
        </div>
      ),
      awaits: null,
      hint: '',
      skippable: true,
    },
    {
      title: t.tour6Title,
      items: [t.tour6a, t.tour6b, t.tour6c, t.tour6d],
      marks: ['plus', 'plus-desktop'],
      panel: null,
      awaits: 'plus' as const,
      hint: t.tourWaitPlus,
      skippable: true,
    },
    {
      // Реквизиты вынесены из шага «Задания»: там это был пятый пункт,
      // который читали по диагонали, а без него не получить оплату.
      title: t.tourPayTitle,
      items: [t.tourPaya, t.tourPayb, t.tourPayc],
      marks: [],
      panel: null,
      awaits: null,
      hint: '',
      skippable: true,
    },
    {
      title: t.tour7Title,
      items: [t.tour7a, t.tour7b, t.tour7c],
      marks: [],
      panel: null,
      awaits: null,
      hint: '',
      skippable: false,
    },
  ];

  const last = index === steps.length - 1;
  const step = steps[index];

  /**
   * Когда карточки не видно.
   *
   * Шаги «Каталог» и «Меню» прячут её сразу: человек сам нажимает
   * кнопку и листает, а карточка закрывала бы ровно то, что нужно
   * увидеть. Возвращается она после прокрутки.
   *
   * Шаг «Задания» — наоборот: сначала читают список из четырёх пунктов,
   * и карточка уходит только на то время, пока открыто меню плюса.
   * Закрыли крестиком — карточка вернулась.
   */
  const waiting = step.awaits === 'plus' ? plusOpen : Boolean(step.awaits) && !done;

  useEffect(() => {
    setDone(false);
    setPlusOpen(false);
    setOverlayOpen(false);
  }, [index]);

  useEffect(() => { onCardVisible?.(!waiting); }, [waiting, onCardVisible]);

  /**
   * Шаг про каталог ждёт не нажатия, а прокрутки: человек должен
   * увидеть, что под первым экраном есть ещё карточки. Ловим прокрутку
   * страницы напрямую — «Каталог» это обычная ссылка, событий она не шлёт.
   */
  useEffect(() => {
    if (step.awaits !== 'catalog-scroll' || done) return;
    const onScroll = () => {
      if (window.scrollY > 120) setDone(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [step.awaits, done]);

  // Меню и плюс сообщают о себе сами — они модальные, страница под ними
  // не двигается, поймать прокрутку окна там нечем.
  const onTourEvent = useCallback((event: TourEvent) => {
    if (event === 'menu-open' || event === 'plus-open') setOverlayOpen(true);
    if (event === 'menu-close' || event === 'plus-close') setOverlayOpen(false);
    if (step.awaits === 'menu-scroll' && event === 'menu-scroll') setDone(true);
    if (step.awaits !== 'plus') return;
    if (event === 'plus-open') setPlusOpen(true);
    if (event === 'plus-close') setPlusOpen(false);
  }, [step.awaits]);
  useTourEvents(onTourEvent);

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
    <div className={waiting ? 'contents' : 'relative px-6 pb-6 pt-10'}>
      {/* Подсветка живёт в портале на body, поэтому окно гида её не
          обрезает. Пустой список меток — шаг без подсветки.

          На шагах с заданием (awaits) подсвеченная кнопка остаётся
          рабочей, а всё вокруг заблокировано: нажать «Каталог» и
          пролистать нужно по-настоящему, но уйти в сторону нельзя.
          На остальных шагах интерфейс заблокирован целиком. */}
      <TourSpotlight
        marks={overlayOpen ? [] : step.marks}
        interactive={overlayOpen || Boolean(step.awaits)}
      />

      {/* Шаг-задание: карточки нет, внизу только строка-подсказка. Иначе
          она закрывала бы ровно тот список, который просят пролистать. */}
      {waiting ? (
        // Портал в body: подложку модального окна на это время скрывают
        // (display:none), а вместе с ней исчезла бы и подсказка.
        typeof document !== 'undefined' && createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[96] flex justify-center px-4">
            <p className="smk-sheet pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-bold text-slate-800 shadow-2xl dark:text-zinc-100">
              {step.hint}
            </p>
          </div>,
          document.body,
        )
      ) : (
        <>
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
              {/* Всегда «Дальше»: на шагах с переключателями стояло
                  «Настроить», и человек ждал, что откроется ещё какой-то
                  экран, — кнопка ведёт себя одинаково на всех шагах. */}
              {last ? t.tourFinish : t.tourNext}
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
        </>
      )}
    </div>
  );
}
