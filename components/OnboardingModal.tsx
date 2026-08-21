'use client';

/**
 * OnboardingModal — приветствие при первом открытии приложения.
 *
 * Флоу:
 *   welcome (гостю, один раз в кеше; зарег. не показывается)
 *     ├─ «Руководство» → окно-гид по разделам (Назад → welcome)
 *     ├─ «Войти в Даймохк» → окно согласия (оферта/политика/рассылка)
 *     │     → Google-вход → обязательный гид → окно профиля
 *     └─ «Продолжить как гость» → закрыть
 *
 * При входе как гость из мини-профиля открывается то же окно согласия.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Globe2, LogIn } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import FirstTour from '@/components/FirstTour';
import { useTourLock } from '@/lib/tour-lock';
import { releaseTourPreflight } from '@/lib/tour-preflight';
import { useI18n } from '@/lib/i18n';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const ONBOARDED_KEY = 'daymohk-onboarded-v1';
// Флаг «сейчас происходит вход через Google». Хранится в sessionStorage,
// потому что signInWithOAuth — это полный редирект на Google и обратно:
// страница перезагружается, useRef сбрасывается, а sessionStorage переживает
// навигацию в той же вкладке.
const AUTHING_KEY = 'daymohk-onboarding-authing';

/**
 * Публичные «Письма» с коротким кэшем.
 *
 * Этот компонент живёт в корневом layout, и без кэша запрос уходил
 * при КАЖДОЙ полной загрузке страницы — дважды (текст welcome-окна и
 * приветственного письма), хотя нужны они только новым людям.
 *
 * Кэш в sessionStorage на 10 минут: переживает перезагрузку и переходы
 * внутри вкладки, умирает вместе с ней. Правки админа в «Письмах»
 * доходят не мгновенно — для приветственного текста это нормально.
 */
const LETTERS_CACHE_KEY = 'daymohk-letters-public';
const LETTERS_CACHE_TTL_MS = 10 * 60_000;

/** Строка из «Писем» — берём только известные поля, остальное не трогаем. */
interface PublicLetter {
  key?: string;
  title_ru?: string;
  title_ce?: string;
  message_ru?: string;
  message_ce?: string;
  sender?: string;
}

async function fetchPublicLetters(): Promise<PublicLetter[] | null> {
  try {
    const raw = window.sessionStorage.getItem(LETTERS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at?: number; letters?: PublicLetter[] };
      if (
        typeof parsed.at === 'number'
        && Date.now() - parsed.at < LETTERS_CACHE_TTL_MS
        && Array.isArray(parsed.letters)
      ) {
        return parsed.letters;
      }
    }
  } catch { /* приватный режим — просто идём в сеть */ }

  try {
    const res = await fetch('/api/letters/public', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as { letters?: PublicLetter[] };
    const letters = Array.isArray(data.letters) ? data.letters : null;
    if (letters) {
      try {
        window.sessionStorage.setItem(LETTERS_CACHE_KEY, JSON.stringify({ at: Date.now(), letters }));
      } catch { /* приватный режим — кэш не критичен */ }
    }
    return letters;
  } catch {
    return null;
  }
}

export default function OnboardingModal() {
  const { account, isLoading, signInWithGoogle } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const { settings, update: updateSettings, isLoading: isSettingsLoading } = useSettings();
    const [step, setStep] = useState<'welcome' | 'guide' | 'consent' | 'tour' | 'profile' | 'look'>('welcome');
  // Видна ли сейчас карточка гида. Гид сам её прячет на шагах, где
  // человек нажимает настоящие кнопки.
  const [tourCardVisible, setTourCardVisible] = useState(true);
  const [open, setOpen] = useState(false);
  // Текст модального окна приветствия — из БД (раздел «Письма» → «Модальное окно»).
  const [modalText, setModalText] = useState<{ title_ru?: string; title_ce?: string; message_ru?: string; message_ce?: string }>({});
  const [error, setError] = useState('');
  // Защита от двойной отправки welcome-письма (useEffect + submit).
  const sentRef = useRef(false);
  const authingRef = useRef(false);

  const ce = language === 'ce';

  // --- Функции (объявлены ДО хуков, чтобы не было ReferenceError) ---

  /**
   * Возвращает true, только если приветствие действительно ушло.
   * По этому ответу выставляется постоянный флаг welcomeSent, поэтому
   * молча «проглотить» ошибку здесь нельзя: иначе человек лишится
   * приветствия навсегда из-за одного упавшего запроса.
   */
  const sendWelcomeNotification = async (): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase || !account) return false;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      let title = ce ? 'Марша догIийла хьомечу Даймохка' : 'Добро пожаловать в родной Даймохк';
      let message = ce
        ? 'Хьо Даймохк йукъараллашна тIехьа вош вина! Хьайн анкета кечйина ю — хьо тахана дуьйна каталогехь ву.'
        : 'Вы стали частью сообщества Даймохк! Ваша анкета готова — вы уже в каталоге.';
      let ceTitle = title;
      let ceMessage = message;
      let sender = 'Даймохк';

      try {
        const letters = await fetchPublicLetters();
        const welcome = letters ? letters.find((l) => l.key === 'welcome') : undefined;
        if (welcome) {
          title = welcome.title_ru || title;
          ceTitle = welcome.title_ce || welcome.title_ru || ceTitle;
          message = welcome.message_ru || message;
          ceMessage = welcome.message_ce || welcome.message_ru || ceMessage;
          sender = welcome.sender || sender;
        }
      } catch {}

      const sent = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          recipientId: account.id,
          type: 'system',
          title,
          message,
          ceTitle,
          ceMessage,
          sender,
        }),
      });
      return sent.ok;
    } catch {
      return false;
    }
  };

  const finishOnboarding = async () => {
    // Онбординг пройден ЦЕЛИКОМ: 11 шагов гида + «Внешний вид» +
    // «Заполнить профиль». Только здесь рождается tourDone — с этого
    // момента гид больше не возвращается, а личная анкета перестаёт
    // быть скрытой (RLS в миграции 65). Гость (account === null) гид
    // не проходит — ему и писать нечего.
    if (account) {
      updateSettings({ tourDone: true, tourStep: 0 });
    }

    // Приветствие отправляется РОВНО один раз за аккаунт.
    //
    // Три рубежа, и каждый закрывает свой случай:
    //  1. sentRef — повторные вызовы finishOnboarding в этой же сессии
    //     (useEffect, submit, кнопка гостя срабатывают вперемешку);
    //  2. settings.welcomeSent — флаг на сервере. Раньше признак жил в
    //     localStorage, поэтому письмо приходило заново с каждого нового
    //     устройства, из инкогнито и после чистки кэша;
    //  3. ONBOARDED_KEY — по-прежнему локальный, он про показ модалки,
    //     а не про письмо.
    try { window.localStorage.setItem(ONBOARDED_KEY, '1'); } catch {}

    // Флаг проверяем В БАЗЕ, а не в settings (п.8).
    //
    // settings приходит из локальной копии и обновляется серверной
    // версией асинхронно. finishOnboarding вызывается сразу после
    // входа — в этот момент settings.welcomeSent часто ещё false,
    // хотя в базе давно true. Отсюда «Даймохк приветствует тебя» при
    // каждом заходе: письмо уходило заново.
    //
    // Один запрос к user_settings стоит дешевле, чем лишнее письмо
    // человеку при каждом входе.
    let alreadySent = settings.welcomeSent;
    if (!alreadySent && isSupabaseConfigured && supabase && account) {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('welcome_sent')
          .eq('user_id', account.id)
          .maybeSingle();
        if (data?.welcome_sent === true) {
          alreadySent = true;
          // Подтягиваем флаг в локальные настройки, чтобы следующий
          // вход обошёлся вообще без запроса.
          updateSettings({ welcomeSent: true });
        }
      } catch { /* сеть недоступна — решаем по локальному флагу */ }
    }

    if (!sentRef.current && !alreadySent) {
      sentRef.current = true;
      const sent = await sendWelcomeNotification();
      if (sent) {
        updateSettings({ welcomeSent: true });
      } else {
        // Отправка не удалась — снимаем блокировку, чтобы следующая
        // попытка (другой заход) всё-таки доставила письмо.
        sentRef.current = false;
      }
    }
    setOpen(false);
  };

  // --- Хуки (ВСЕГДА в одном порядке, до return null) ---

  // Показываем welcome ТОЛЬКО гостю, один раз (флаг в localStorage).
  useEffect(() => {
    if (isLoading) return; // ждём, пока выяснится, зареган ли пользователь
    if (account) return; // зарег. — не показываем
    try {
      if (window.localStorage.getItem(ONBOARDED_KEY) === '1') return;
    } catch {}
    setStep('welcome');
    setOpen(true);
  }, [account, isLoading]);

  // Загружаем текст модального окна приветствия из «Писем» (welcome_modal).
  useEffect(() => {
    (async () => {
      const letters = await fetchPublicLetters();
      const m = letters ? letters.find((l) => l.key === 'welcome_modal') : undefined;
      if (m) setModalText(m);
    })();
  }, []);

  // Слушаем глобальное событие «открыть окно согласия» (мини-профиль,
  // когда гость кликает «Войти»). Открываем сразу на шаге consent.
  useEffect(() => {
    const handler = () => {
      if (account) return; // зарег. — не нужно
      setStep('consent');
      setOpen(true);
    };
    window.addEventListener('daymohk-open-consent', handler);
    return () => window.removeEventListener('daymohk-open-consent', handler);
  }, [account]);

  // Гид уже проходили в этом браузере — метка переживает и выход из
  // аккаунта, и потерю связи с базой. Объявлена ДО эффекта
  // возобновления: тот на неё ссылается, решая, показывать ли гид
  // аккаунту с несохранённым флагом.
  // СНЯТО (миграция 65): истина о прохождении — только база
  // (user_settings.tour_done). Локальная метка оставалась в браузерах
  // со времён старой схемы и перечёркивала бы решение базы.

  /**
   * Возобновление гида после перезагрузки страницы (п.17).
   *
   * Шаг с каталогом уводит на /catalog по-настоящему, и любое
   * обновление вкладки или закрытие браузера в этот момент раньше
   * просто выключало гид: окно открывалось только по «свежему входу»
   * (AUTHING_KEY), а он к тому времени уже израсходован. Человек
   * оставался зарегистрированным, но без обучения — а гид обязателен.
   *
   * Прогресс теперь живёт в БД (user_settings.tour_step) и переживает
   * всё: перезагрузку, закрытие браузера, вход с другого устройства.
   * tourDone означает «пройдено ВСЁ: 11 шагов + "Внешний вид" +
   * анкета». Пока он false, каждый заход открывает онбординг ровно на
   * том этапе, где человек остановился:
   *
   *   tourStep 0–10 → шаг гида с этим номером;
   *   tourStep 11   → окно «Внешний вид»;
   *   tourStep 12   → окно «Заполнить профиль».
   *
   * Гостю гид не положен: у него нет аккаунта и этого эффекта тоже.
   *
   * Свежий вход через Google не трогаем: им распоряжается эффект ниже
   * по флагу AUTHING_KEY (там решается, гид это или сразу анкета).
   */
  useEffect(() => {
    if (!account || isLoading) return;
    if (isSettingsLoading) return;
    if (settings.tourDone) return;
    if (open || step !== 'welcome') return;
    try {
      if (window.sessionStorage.getItem(AUTHING_KEY) === '1') return;
    } catch { /* private mode */ }
    setStep('tour');
    setOpen(true);
  }, [account, isLoading, isSettingsLoading, settings.tourDone, settings.tourStep, step, open]);

  // После появления аккаунта (вход через Google): гид открываем
  // ТОЛЬКО если пользователь только что вошёл (authingRef / sessionStorage),
  // иначе — не перебиваем welcome. Флаг читаем и из sessionStorage, потому
  // что вход через Google — это редирект с перезагрузкой страницы, и useRef
  // теряется.
  useEffect(() => {
    if (!account) return;
    let authing = authingRef.current;
    try { if (window.sessionStorage.getItem(AUTHING_KEY) === '1') authing = true; } catch {}
    authingRef.current = false;
    try { window.sessionStorage.removeItem(AUTHING_KEY); } catch {}
    if (!authing) return;

    // Свежий вход: пока гид не пройден — открываем его на сохранённом
    // шаге (FirstTour сам продолжит с settings.tourStep; анкета и финал
    // теперь шаги гида, отдельных модалок больше нет).
    const startTour = () => {
      if (!settings.tourDone) {
        setStep('tour');
        setOpen(true);
        return;
      }
      // Возвращающийся пользователь с пройденным онбордингом — тихо
      // закрываем (заодно чиним флаг в базе, если он не доехал).
      void finishOnboarding();
    };

    const looksRegistered = (account.fullName || '').trim().split(/\s+/).filter(Boolean).length >= 2;
    if (looksRegistered) {
      // Имя уже есть — гид только у новой регистрации.
      void (async () => {
        let isNewUser = false;
        try {
          if (isSupabaseConfigured && supabase) {
            const { data } = await supabase.auth.getUser();
            const createdAt = data?.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
            isNewUser = Number.isFinite(createdAt) && Date.now() - createdAt < 3 * 60_000;
          }
        } catch {}
        if (isNewUser) startTour();
        else startTour(); // см. startTour: решение принимает tourDone из базы
      })();
      return;
    }
    startTour();
    // finishOnboarding нарочно не в зависимостях: эффект решает «куда
    // открыть после входа», а не «что делать при каждом рендере», и
    // пересоздавать его из-за идентичности функции незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, settings.tourDone, settings.tourStep]);

  /**
   * Интерфейс заперт, пока не выяснено, нужен ли гид (п.3).
   *
   * Между загрузкой страницы и появлением гида была щель: настройки
   * ещё едут с сервера, окна нет, и всё это время по сайту можно было
   * тыкать. Особенно заметно после F5 на середине обучения.
   *
   * Держим замок, пока не станет ясно одно из двух: гид не нужен
   * (гость, или уже пройден) — отпускаем; гид нужен — замок передаёт
   * эстафету самому гиду, у него свои правила по шагам.
   *
   * Гостю гид не положен: `account === null` при isLoading === false —
   * это точный ответ «не вошёл», и держать его нельзя.
   */

  /**
   * Аварийный предохранитель.
   *
   * Замок держится на цепочке условий, и любая из них может не
   * сойтись: сеть отвалилась на полпути, настройки не доехали, гид не
   * смонтировался. Цена ошибки здесь несимметрична — пропущенный гид
   * человек переживёт, намертво запертый сайт означает «ничего не
   * работает, я туда больше не пойду».
   *
   * Поэтому через 10 секунд после загрузки замок снимается в любом
   * случае. Это дольше любой нормальной загрузки настроек и короче
   * терпения человека перед мёртвой страницей.
   */
  const [lockTimedOut, setLockTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLockTimedOut(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  const undecided =
    !lockTimedOut
    && (
      isLoading
      || (
        Boolean(account)
        && !settings.tourDone
        // Настройки ещё едут: tourDone по умолчанию false, и до ответа
        // сервера отличить «гид не пройден» от «ещё не знаем» нельзя.
        && step === 'welcome'
        && !open
      )
    );

  /**
   * Модалки онбординга ведут себя как настоящие модальные окна (п.5).
   *
   * Пока открыт любой НЕ-тур шаг (welcome / руководство / согласие),
   * фон не должен ни прокручиваться, ни принимать нажатия. Шаг 'tour'
   * исключён — там всем распоряжается сам гид (useTourLock внутри
   * FirstTour, включая его шаги анкеты и финала), второй замок мешал бы.
   */
  const modalLocked = open && step !== 'tour';

  useTourLock({ active: undecided || modalLocked });

  /**
   * Передача замка от CSS к React (п.2).
   *
   * До гидратации интерфейс держит класс smk-preflight-lock, который
   * поставил синхронный скрипт из <head>. Как только React разобрался,
   * нужен гид или нет, класс снимаем: дальше всем распоряжается
   * useTourLock, у которого есть разбор по шагам и списки исключений.
   *
   * Снимаем только когда замок React уже НЕ нужен либо когда он уже
   * взял управление на себя, иначе между двумя механизмами возникла бы
   * щель в один кадр — та самая, из-за которой всё и затевалось.
   */
  useEffect(() => {
    if (undecided) return;
    releaseTourPreflight();
  }, [undecided]);

  if (!open) return null;

  const handleGoogleAuth = async () => {
    setError('');
    authingRef.current = true; // после входа откроем окно профиля
    // Редирект на Google перезагружает страницу — продублируем флаг в
    // sessionStorage, чтобы после возврата окно профиля всё же открылось.
    try { window.sessionStorage.setItem(AUTHING_KEY, '1'); } catch {}
    try {
      await signInWithGoogle();
    } catch (authError) {
      authingRef.current = false;
      try { window.sessionStorage.removeItem(AUTHING_KEY); } catch {}
      setError(authError instanceof Error ? authError.message : (ce ? 'Хаамаш ца кхочуш' : 'Не удалось войти через Google'));
    }
  };

  const toggleLanguage = () => setLanguage(language === 'ru' ? 'ce' : 'ru');

  const guideSections = [
    { emoji: '👥', title: ce ? 'Каталог' : 'Каталог', desc: ce ? 'Специалисташ а, жимхош а, отзываш, рейтингаш' : 'Специалисты и жители, отзывы, рейтинги' },
    { emoji: '🗺️', title: ce ? 'Карта' : 'Карта', desc: ce ? 'ЦIенош, объекташ, анкеташ — кластерашца' : 'Дома, объекты, анкеты — с кластерами' },
    { emoji: '📩', title: ce ? 'Письманаш' : 'Письма', desc: ce ? 'Хьехамаш а, дIевзарш а' : 'Уведомления и рассылки от Даймохка' },
    { emoji: '🚕', title: t.taxiTitle, desc: ce ? 'Новкъа вахар юьртахула' : 'Поездки по селу и республике' },
    { emoji: '🛠️', title: t.gullaqTitle, desc: ce ? 'Белхан тIедилларш' : 'Оплачиваемые задания и поручения' },
    { emoji: '🤝', title: t.goTitle, desc: ce ? 'Маьхза гIо а, волонтералла' : 'Помощь и волонтёрство' },
    { emoji: '🕌', title: ce ? 'Къилба' : 'Кибла', desc: ce ? 'Компас Кааба тIе' : 'Компас направления на Каабу' },
    { emoji: '🤖', title: t.djannaTitle, desc: ce ? 'Кхетам-ассистент нохчийн маттахь' : 'ИИ-ассистент на чеченском (в планах)' },
  ];

  // Гид на шаге-задании прячет карточку: человек в это время работает
  // с настоящим интерфейсом, и подложка модального окна ему мешает.
  const tourCardHidden = step === 'tour' && !tourCardVisible;



  return (
    // Во время гида фон НЕ затемняем и НЕ размываем: подсветка показывает
    // настоящую кнопку на экране, а под размытием её было бы не разглядеть.
    // Затемнение в этом случае рисует сам прожектор — вокруг выреза.
    //
    // Карточка гида по центру экрана (items-center), как и остальные шаги
    // онбординга: прижатая к верху, она висела над пустотой и уезжала под
    // обрез на низких экранах. Внутренняя прокрутка карточки ниже
    // (max-h + overflow) держит длинные шаги в пределах экрана.
    <div
      // data-tour-ui — метка для useTourLock: всё внутри окна гида
      // остаётся рабочим, пока остальной интерфейс заблокирован. Без
      // неё общий запрет съел бы и кнопку «Дальше».
      data-tour-ui
      className={`fixed inset-0 z-[95] flex items-center justify-center p-4 ${
        step === 'tour'
          ? 'pointer-events-none'
          : 'bg-zinc-950/70 backdrop-blur-md'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onb-title"
    >
      <div
        className={`smk-sheet smk-sign pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl shadow-2xl ${
          step === 'tour' ? 'max-h-[calc(100dvh-8rem)] overflow-y-auto' : ''
        } ${tourCardHidden ? 'smk-tour-card smk-tour-card--hidden' : 'smk-tour-card'}`}
      >
        {step === 'welcome' && (
          <div className="relative px-6 pb-6 pt-12">
            <div className="mb-5 text-center">
              <div className="smk-emblem mb-3" aria-hidden="true" />
              <h2 id="onb-title" className="text-xl font-black leading-tight text-slate-900 dark:text-white">
                {ce
                  ? (modalText.title_ce || 'Марша догIийла хьомечу Даймохка')
                  : (modalText.title_ru || 'Добро пожаловать в родной Даймохк')}
              </h2>
            </div>

            <hr className="smk-orn mb-4" />

            <p className="text-center text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
              {ce
                ? (modalText.message_ce || 'Хьо авторизаци йан а, профиль кечйан а мега, приложенин доца руководство йилла а, я гостера дIадерзо.')
                : (modalText.message_ru || 'Вы можете авторизоваться и заполнить профиль, открыть краткое руководство по приложению или продолжить в режиме гостя.')}
            </p>

            <div className="mt-5 space-y-2">
              <button type="button" onClick={() => setStep('guide')} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                <BookOpen className="h-3.5 w-3.5" />
                {ce ? 'Руководство' : 'Руководство'}
              </button>
              <button type="button" onClick={() => setStep('consent')} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
                <LogIn className="h-3.5 w-3.5" />
                {ce ? 'Чуйаха Даймохк' : 'Войти в Даймохк'}
              </button>
              <button
                type="button"
                onClick={() => { void finishOnboarding(); window.location.href = '/'; }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {ce ? 'Гостера дIадерзо' : 'Продолжить как гость'}
              </button>
            </div>

            {error && <p className="smk-note smk-note-danger mt-3 px-3 py-2">{error}</p>}

            <div className="mt-4 flex items-center justify-center">
              <button type="button" onClick={toggleLanguage} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <Globe2 className="h-3.5 w-3.5" />
                {ce ? 'Русский' : 'Нохчийн'}
              </button>
            </div>
          </div>
        )}

        {step === 'guide' && (
          <div className="relative px-6 pb-6 pt-10">
            <div className="mb-4 flex items-center gap-3">
              <button type="button" onClick={() => setStep('welcome')} className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300" aria-label="Назад">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{ce ? 'Руководство' : 'Руководство'}</h2>
            </div>
            <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">{ce ? 'Хьажа, хIара хIун ду Даймохкехь.' : 'Что есть в Даймохке.'}</p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto no-scrollbar">
              {guideSections.map((s) => (
                <div key={s.title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
                  <span className="text-lg">{s.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{s.title}</p>
                    <p className="smk-text-label text-slate-500 dark:text-zinc-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setStep('consent')} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
              <LogIn className="h-3.5 w-3.5" />
              {ce ? 'Чуйаха Даймохк' : 'Войти в Даймохк'}
            </button>
          </div>
        )}

        {step === 'consent' && (
          <div className="relative px-6 pb-6 pt-10">
            <div className="mb-4 flex items-center gap-3">
              <button type="button" onClick={() => setStep('welcome')} className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300" aria-label="Назад">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{ce ? 'Бакъо' : 'Согласие'}</h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-600 dark:text-zinc-300">
              {ce ? (
                <>
                  Google чуйаьллачул тIехьа, хьо тIелоцу{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Услови</Link> а,{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Къайлаха политика</Link> а, ткъа иштта бакъо ло{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">рассылке</Link> тIе.
                </>
              ) : (
                <>
                  Войдя через Google, вы принимаете{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Условия</Link> и{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">Политику конфиденциальности</Link>, а также соглашаетесь на{' '}
                  <Link href="/legal" className="font-bold text-emerald-600 underline">рассылку</Link>.
                </>
              )}
            </p>
            <button type="button" onClick={() => void handleGoogleAuth()} className="smk-btn-google mt-2 smk-text-label">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white smk-text-label font-black text-blue-600">G</span>
              {ce ? 'Google чуйаха' : 'Войти через Google'}
            </button>
            {error && <p className="smk-note smk-note-danger mt-3 px-3 py-2">{error}</p>}
          </div>
        )}

        {/* Финальная кнопка «Завершить» гида заканчивает весь
            онбординг: письмо, tourDone в БД, закрытие окна. */}
        {step === 'tour' && (
          <FirstTour onDone={() => { void finishOnboarding(); }} onCardVisible={setTourCardVisible} />
        )}

      </div>
    </div>
  );
}
