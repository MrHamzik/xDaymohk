'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { useI18n } from '@/lib/i18n';
import { sendTourCommand, setTourActive, useTourEvents, type TourEvent } from '@/lib/tour';
import { useTourLock } from '@/lib/tour-lock';
import TourSpotlight from '@/components/TourSpotlight';
import QuickWidgetsEditor from '@/components/settings/QuickWidgetsEditor';
import ThemePickerButton from '@/components/settings/ThemePickerButton';
import { SettingRow, Toggle } from '@/components/settings/SettingsPrimitives';
import { prefFor } from '@/lib/settings/defaults';
import {
  DEFAULT_GROUP_SOUND, playSound, type SoundId,
} from '@/lib/notification-sounds';
import {
  LOCKED_NOTIFICATION_GROUPS, NOTIFICATION_GROUPS,
  type NotificationGroup, type NotificationPref,
} from '@/lib/settings/types';

/**
 * Названия и пояснения групп уведомлений — те же, что в настройках.
 *
 * Раньше здесь было три ветки if, а всё непонятное сваливалось в
 * «Системные»: гид показывал только часть групп, и добавление шестой
 * молча подписало бы её чужим именем. Теперь список полный и заданный
 * одной таблицей.
 */
function notifyLabel(group: NotificationGroup, t: ReturnType<typeof useI18n>['t']): string {
  const labels: Record<NotificationGroup, string> = {
    system: t.settingsGroupSystem,
    profile: t.settingsGroupProfile,
    activity: t.settingsGroupActivity,
    tasks: t.settingsGroupTasks,
    complaint: t.settingsGroupComplaint,
    taxi: t.settingsGroupTaxi,
  };
  return labels[group];
}

function notifyHint(group: NotificationGroup, t: ReturnType<typeof useI18n>['t']): string {
  const hints: Record<NotificationGroup, string> = {
    system: t.settingsGroupSystemDesc,
    profile: t.settingsGroupProfileDesc,
    activity: t.settingsGroupActivityDesc,
    tasks: t.settingsGroupTasksDesc,
    complaint: t.settingsGroupComplaintDesc,
    taxi: t.settingsGroupTaxiDesc,
  };
  return hints[group];
}

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
/** Номер текущего шага гида — переживает перезагрузку вкладки. */
const TOUR_STEP_KEY = 'daymohk-tour-step';

export default function FirstTour({ onDone, onCardVisible }: FirstTourProps) {
  const { t, language, setLanguage } = useI18n();
  const { account } = useAuth();
  const { settings, update } = useSettings();

  /** Правка настроек уведомлений — та же логика, что на странице настроек. */
  const setNotifyPref = (group: NotificationGroup, patch: Partial<NotificationPref>) => {
    update({
      notificationPrefs: {
        ...settings.notificationPrefs,
        [group]: { ...prefFor(settings, group), ...patch },
      },
    });
  };
  /**
   * Номер шага переживает перезагрузку страницы (п.17).
   *
   * Шаг с каталогом уводит человека на /catalog — это настоящий переход,
   * а не модалка. Если в этот момент обновить страницу (или просто
   * дождаться, пока браузер восстановит вкладку), гид начинался бы
   * заново, а чаще просто исчезал до следующего входа.
   *
   * Держим прогресс в sessionStorage: он живёт, пока открыта вкладка, и
   * не тянется в следующие сеансы — законченный гид помечается
   * настройкой tourDone, у неё своя долгая память.
   */
  const [index, setIndex] = useState(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const saved = Number(window.sessionStorage.getItem(TOUR_STEP_KEY));
      return Number.isInteger(saved) && saved >= 0 ? saved : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try { window.sessionStorage.setItem(TOUR_STEP_KEY, String(index)); } catch { /* private mode */ }
  }, [index]);
  /**
   * Шаг-задание выполнен? Пока false — карточка спрятана и человек
   * работает с настоящим интерфейсом. Сбрасывается при смене шага.
   */
  const [done, setDone] = useState(false);
  /** Открыто ли сейчас меню плюса — на шаге «Задания» прячет карточку. */
  const [plusOpen, setPlusOpen] = useState(false);
  /**
   * Задание шага началось.
   *
   * Раньше на шагах «Каталог», «Меню» и «Задания» карточка пряталась
   * сразу, и человек видел голую подсказку «нажмите и пролистайте», не
   * прочитав, зачем это делать. Теперь порядок обратный: сначала
   * карточка шага, и только после «Дальше» — само задание.
   */
  const [tasking, setTasking] = useState(false);
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
  /**
   * Каталог открыт — экран нужно освободить (п.2/3).
   *
   * Пока человек не нажал «Каталог», подсветка показывает, куда жать.
   * Как только каталог открылся, затемнение, размытие и подсказка
   * обязаны исчезнуть: иначе список, который просят пролистать, видно
   * через мутное стекло.
   */
  const [catalogOpen, setCatalogOpen] = useState(false);
  /** Корень карточки шага — нужен для сброса прокрутки (п.5). */
  const cardRef = useRef<HTMLDivElement | null>(null);

  /**
   * Шаг гида.
   *
   * allow/scroll описывают, что именно оживает на этом шаге. Не указаны —
   * значит заблокировано всё: гид сам по себе не разрешает ничего
   * (п.17/п.18), возможности открываются по одной там, где нужны.
   */
  interface TourStep {
    title: string;
    items: string[];
    marks: string[];
    panel: React.ReactNode;
    awaits: 'catalog-scroll' | 'menu-scroll' | 'plus' | null;
    hint: string;
    skippable: boolean;
    /** Селекторы островков, остающихся рабочими. */
    allow?: string[];
    /** Разрешена ли прокрутка страницы и списков. */
    scroll?: boolean;
  }

  const steps: TourStep[] = [
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
      // Что оживает на этом шаге (п.17): подсвеченные кнопки перехода,
      // сами карточки анкет и уже открытая анкета. Всё прочее —
      // фильтры, поиск, нижняя панель, шапка — заблокировано.
      allow: ['[data-tour="catalog"]', '[data-tour="map"]', '[data-tour-card]', '[role="dialog"]'],
      scroll: true,
    },
    {
      title: t.tour3Title,
      items: [t.tour3a, t.tour3b, t.tour3c],
      marks: ['menu', 'rail-menu'],
      panel: null,
      awaits: 'menu-scroll' as const,
      hint: t.tourWaitMenu,
      skippable: true,
      // Шаг 4 (п.18): работает ТОЛЬКО кнопка, открывающая меню, и
      // прокрутка внутри него. Ни иконки разделов, ни крестик, ни
      // шторки не нажимаются — человек просто смотрит список.
      allow: ['[data-tour="menu"]', '[data-tour="rail-menu"]'],
      scroll: true,
    },
    {
      // Шаг «Виджет»: если человек оставил боковое меню открытым на
      // прошлом шаге, оно закрывается само (п.4) — иначе карточка
      // висит за выездом, и непонятно, о каком виджете речь.
      title: t.tour4Title,
      items: [t.tour4a, t.tour4b, t.tour4c],
      marks: ['widgets'],
      // Тот же редактор, что и в настройках: одна реализация, не копия.
      panel: <QuickWidgetsEditor demo />,
      awaits: null,
      hint: '',
      skippable: true,
    },
    {
      title: t.tour5Title,
      items: [t.tour5a],
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
      // Уведомления и звук (п.47): без этого шага человек либо не знал,
      // что звук вообще настраивается, либо шёл искать его в настройках
      // телефона. Показываем главные три группы — остальные лежат в
      // настройках и устроены точно так же.
      title: t.tourNotifyTitle,
      items: [t.tourNotifya],
      marks: [],
      panel: (
        <div className="space-y-1.5">
          {NOTIFICATION_GROUPS.map((group) => {
            // Системные отключить нельзя: ими приходят блокировки и
            // важные сообщения. Показываем, но переключатель «показывать»
            // заблокирован — ровно как на странице настроек.
            const locked = LOCKED_NOTIFICATION_GROUPS.includes(group);
            const pref = prefFor(settings, group);
            const soundId = (pref.soundId ?? DEFAULT_GROUP_SOUND[group] ?? 'chime') as SoundId;
            return (
              <SettingRow key={group} title={notifyLabel(group, t)} hint={notifyHint(group, t)}>
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={locked ? true : pref.show}
                    disabled={locked}
                    onChange={(next) => { if (!locked) setNotifyPref(group, { show: next }); }}
                    label={`${notifyLabel(group, t)}: ${t.settingsColShow}`}
                  />
                  <Toggle
                    checked={pref.sound}
                    onChange={(next) => {
                      setNotifyPref(group, { sound: next });
                      // Включил звук — сразу слышно какой. Иначе выбор
                      // вслепую: названия мелодий ничего не говорят.
                      if (next) playSound(soundId);
                    }}
                    label={`${notifyLabel(group, t)}: ${t.settingsColSound}`}
                  />
                </div>
              </SettingRow>
            );
          })}
        </div>
      ),
      awaits: null,
      hint: '',
      skippable: true,
    },
    {
      // Оформление (п.46): тема, светлый режим, скругление углов.
      // Ползунок скругления показываем прямо здесь — это самая заметная
      // настройка внешнего вида, и она применяется ко всему сразу.
      title: t.tourLookTitle,
      items: [t.tourLooka, t.tourLookb],
      marks: [],
      panel: (
        <div className="space-y-3">
          <SettingRow title={t.settingsThemes} hint={t.settingsThemesHint}>
            <ThemePickerButton />
          </SettingRow>
          <div className="smk-field space-y-2 px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{t.settingsRadius}</span>
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                {(settings.radiusScale / 100).toFixed(2)}×
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={settings.radiusScale}
              onChange={(event) => update({ radiusScale: Number(event.target.value) })}
              aria-label={t.settingsRadius}
              className="w-full accent-emerald-600"
            />
            <p className="smk-text-label text-slate-500 dark:text-zinc-500">{t.settingsRadiusHint}</p>
          </div>
        </div>
      ),
      awaits: null,
      hint: '',
      skippable: true,
    },
    {
      title: t.tour6Title,
      items: [t.tour6a],
      marks: ['plus', 'plus-desktop'],
      panel: null,
      awaits: 'plus' as const,
      hint: t.tourWaitPlus,
      skippable: true,
      // Открыть меню плюса и закрыть его крестиком — больше ничего.
      allow: ['[data-tour="plus"]', '[data-tour="plus-desktop"]', '[data-tour-plus]'],
      scroll: false,
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
   * Сначала человек читает карточку шага. Нажал «Дальше» — карточка
   * уходит, и он выполняет задание на настоящем интерфейсе. Как только
   * задание выполнено (done), шаг сам перелистывается вперёд.
   */
  const waiting = Boolean(step.awaits) && tasking && !done;

  /**
   * Экран полностью отдан человеку.
   *
   * Затемнение, размытие и подсказка исчезают, когда он уже сделал то,
   * о чём просили: открыл каталог или раскрыл меню. Держать поверх
   * открытого списка мутное стекло и надпись «нажмите и пролистайте» —
   * ровно та жалоба, с которой начинались пункты 2 и 3.
   */
  const screenFree = waiting && (overlayOpen || catalogOpen);

  /**
   * Блокировка интерфейса на всё время гида (п.17/п.18).
   *
   * Раньше защита жила в слоях-ловушках самой подсветки, и, как только
   * подсветку убирали (открылся каталог или меню), интерфейс оживал
   * целиком: на шаге 3 можно было нажимать любые кнопки, на шаге 4 —
   * иконки, крестик и шторки. Теперь запрет висит на document и не
   * зависит ни от подсветки, ни от z-index.
   *
   * Шаг перечисляет свои islands в allow/scroll; пока человек читает
   * карточку (не нажал «Дальше»), не работает вообще ничего, кроме
   * самого окна гида.
   */
  useTourLock({
    active: true,
    scroll: tasking ? Boolean(step.scroll) : false,
    allow: tasking ? step.allow : undefined,
  });

  useEffect(() => {
    setDone(false);
    setPlusOpen(false);
    setOverlayOpen(false);
    setTasking(false);
    setCatalogOpen(false);
  }, [index]);

  /**
   * Прокрутка карточки шага в начало (п.5).
   *
   * Длинные шаги (уведомления, оформление) прокручиваются внутри окна.
   * Без сброса человек, пролистав шаг до конца и нажав «Дальше», видел
   * следующий шаг с середины — приходилось самому листать вверх.
   *
   * Прокручиваем и внешнее окно (его задаёт OnboardingModal), и
   * внутреннюю панель с переключателями.
   */
  useEffect(() => {
    if (waiting) return;
    const scroller = cardRef.current?.closest('.overflow-y-auto');
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
    cardRef.current?.querySelectorAll('.overflow-y-auto').forEach((node) => {
      if (node instanceof HTMLElement) node.scrollTop = 0;
    });
  }, [index, waiting]);

  useEffect(() => { onCardVisible?.(!waiting); }, [waiting, onCardVisible]);

  /**
   * Шаг про виджет требует чистого экрана (п.4).
   *
   * Предыдущий шаг просит открыть меню и пролистать его. Человек часто
   * оставляет выезд открытым — и следующий шаг оказывается за ним.
   * Закрываем меню сами: это единственный шаг, где интерфейс обязан
   * прийти в исходное состояние.
   */
  const closesMenu = step.marks.includes('widgets');
  useEffect(() => {
    // Зависимость — только номер шага. По самому массиву marks зависеть
    // нельзя: он пересоздаётся на каждый рендер, эффект срабатывал бы
    // непрерывно и захлопывал меню каждый раз, как человек его открыл.
    if (closesMenu) sendTourCommand('menu-close');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  /**
   * Переход в каталог (п.2/3).
   *
   * «Каталог» — обычная ссылка, события она не шлёт, поэтому смотрим на
   * адрес страницы. Как только он сменился на /catalog, задание по сути
   * началось: экран нужно освободить немедленно.
   */
  useEffect(() => {
    if (step.awaits !== 'catalog-scroll' || !tasking || catalogOpen) return;
    const check = () => {
      if (window.location.pathname.startsWith('/catalog')) setCatalogOpen(true);
    };
    check();
    // pushState в Next.js не поднимает popstate — опрашиваем адрес.
    const timer = window.setInterval(check, 150);
    window.addEventListener('popstate', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('popstate', check);
    };
  }, [step.awaits, tasking, catalogOpen]);

  useEffect(() => {
    if (step.awaits !== 'catalog-scroll' || !tasking || done) return;
    // Прокрутку считаем ТОЛЬКО в самом каталоге. Иначе главная, если она
    // короткая, сразу оказывается «пролистанной до конца», и шаг
    // проскакивал бы, ни разу не открыв каталог.
    if (!catalogOpen) return;

    // Сколько нужно пролистать, чтобы шаг засчитался.
    //
    // Раньше хватало 120px — это меньше одной карточки: человек чуть
    // качнул страницу, и гид уже возвращался, хотя списка он не увидел.
    // Теперь просим либо полтора экрана, либо докрутить до конца
    // страницы (если карточек мало и крутить особо нечего).
    const NEEDED = Math.round(window.innerHeight * 1.5);

    // Сколько нужно проехать, чтобы «докрутил до конца» засчиталось.
    //
    // Без этого порога шаг заканчивался сам собой (п.17): карточки
    // каталога подгружаются с сервера, и первые секунды страница пустая
    // и короткая — условие «мы в самом низу» выполнялось при scrollY = 0.
    // Гид считал список пролистанным и возвращал модалку сразу после
    // нажатия «Каталог», не дав ничего посмотреть.
    const MIN_SCROLL = 400;

    let timer = 0;

    const onScroll = () => {
      if (timer) return;
      const scrolled = window.scrollY;
      const atBottom =
        window.innerHeight + scrolled >= document.body.scrollHeight - 80;
      // Конец страницы засчитываем, только если человек и правда ехал.
      if (scrolled < NEEDED && !(atBottom && scrolled >= MIN_SCROLL)) return;

      // Пауза перед возвращением карточки: человек только что доскроллил
      // и ещё смотрит на список. Выпрыгивать ему в лицо сразу — грубо.
      timer = window.setTimeout(() => setDone(true), 2000);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Сразу onScroll не зовём: на свежеоткрытом каталоге он сработал бы
    // до появления карточек и закрыл шаг мгновенно. Ждём живой прокрутки.
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [step.awaits, tasking, done, catalogOpen]);

  // Меню и плюс сообщают о себе сами — они модальные, страница под ними
  // не двигается, поймать прокрутку окна там нечем.
  const onTourEvent = useCallback((event: TourEvent) => {
    if (event === 'menu-open' || event === 'plus-open') setOverlayOpen(true);
    if (event === 'menu-close' || event === 'plus-close') setOverlayOpen(false);
    if (!tasking) return;
    if (step.awaits === 'menu-scroll' && event === 'menu-scroll') {
      // Та же пауза, что и в каталоге: даём досмотреть список.
      window.setTimeout(() => setDone(true), 2000);
    }
    if (step.awaits !== 'plus') return;
    if (event === 'plus-open') setPlusOpen(true);
    // Закрыли меню плюса крестиком — задание выполнено.
    if (event === 'plus-close') { setPlusOpen(false); setDone(true); }
  }, [step.awaits, tasking]);
  useTourEvents(onTourEvent);

  const finish = () => {
    update({ tourDone: true });
    try {
      if (account?.id) window.localStorage.setItem(`daymohk-tour-${account.id}`, '1');
      // Гид пройден — прогресс шага больше не нужен, иначе следующий
      // запуск в этой же вкладке открылся бы на последнем шаге.
      window.sessionStorage.removeItem(TOUR_STEP_KEY);
    } catch { /* private mode */ }
    onDone();
  };

  const goNext = () => {
    // На шаге с заданием «Дальше» не листает вперёд, а запускает само
    // задание: карточка уходит, человек работает с интерфейсом.
    if (step.awaits && !tasking) {
      setTasking(true);
      // Шаг про «+» (п.8): «Дальше» и сама кнопка «+» должны делать одно
      // и то же — убрать окно гида и открыть меню. Раньше «Дальше»
      // только пряталo карточку, и человек искал, куда жать, глядя на
      // подсказку сквозь размытие.
      if (step.awaits === 'plus') sendTourCommand('plus-open');
      return;
    }
    if (last) finish();
    else setIndex((current) => current + 1);
  };

  /** «Пропустить шаг» листает вперёд всегда, минуя задание. */
  const skipStep = () => {
    if (last) finish();
    else setIndex((current) => current + 1);
  };

  // Задание выполнено — переходим к следующему шагу сами. Возвращать
  // карточку того же шага незачем: человек уже сделал, что просили.
  useEffect(() => {
    if (!done || !tasking) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, steps.length - 1));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [done, tasking, steps.length]);

  return (
    <div ref={cardRef} className={waiting ? 'contents' : 'relative px-6 pb-6 pt-10'}>
      {/* Подсветка живёт в портале на body, поэтому окно гида её не
          обрезает. Пустой список меток — шаг без подсветки.

          На шагах с заданием (awaits) подсвеченная кнопка остаётся
          рабочей, а всё вокруг заблокировано: нажать «Каталог» и
          пролистать нужно по-настоящему, но уйти в сторону нельзя.
          На остальных шагах интерфейс заблокирован целиком. */}
      {/* Экран освобождён (п.2/3): каталог открыт или поверх страницы
          висит меню — гид молча ждёт и ничем не мешает смотреть. */}
      {!screenFree && (
        <TourSpotlight marks={overlayOpen ? [] : step.marks} />
      )}

      {/* Шаг-задание: карточки нет, внизу только строка-подсказка. Иначе
          она закрывала бы ровно тот список, который просят пролистать. */}
      {waiting ? (
        // Портал в body: подложку модального окна на это время скрывают
        // (display:none), а вместе с ней исчезла бы и подсказка.
        // Пока открыто меню плюса или выезд меню, подсказку прячем (п.41):
        // человек уже сделал то, о чём она просила, и висеть поверх
        // открытого окна ей незачем.
        typeof document !== 'undefined' && !screenFree && createPortal(
          <div data-tour-ui className="pointer-events-none fixed inset-x-0 bottom-24 z-[96] flex justify-center px-4">
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
              onClick={skipStep}
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
