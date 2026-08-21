'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  DEFAULT_SETTINGS, normalizeSettings, resolveTheme, settingsFromDb, settingsToDb,
} from '@/lib/settings/defaults';
import { applyEffects, applyRadiusScale, applyThemeColors, applyTypography } from '@/lib/settings/apply-theme';
import { activeProTier, forceOwnerPlatinum } from '@/lib/settings/pro';
import type { UserSettings } from '@/lib/settings/types';

const SETTINGS_STORAGE_KEY = 'daymohk-settings';

/**
 * Привилегии Pro у гостя.
 *
 * Настройки лежат в localStorage, чтобы тема применилась в первом кадре
 * и страница не моргала. Но там же оставался proTier: человек оформлял
 * подписку, выходил из аккаунта — и платные темы продолжали работать,
 * потому что локальная копия никем не сбрасывалась. То же самое
 * получал любой гость на общем компьютере после ушедшего владельца.
 *
 * Подписка привязана к аккаунту, поэтому без сессии её нет по
 * определению. Гостю возвращаем 'none' и снимаем платное оформление:
 * тема откатывается к светлой или тёмной, свои палитры не применяются.
 *
 * Функция применяется в ОДНОМ месте — при постановке состояния, — чтобы
 * ни один путь (localStorage, ответ сервера, update) не мог её обойти.
 */
function applyAccess(settings: UserSettings, isGuest: boolean): UserSettings {
  if (!isGuest || settings.proTier === 'none') return settings;
  return {
    ...settings,
    proTier: 'none',
    // Платная палитра гостю недоступна: возвращаем базовую пару.
    themeId: settings.themeId === 'dark' ? 'dark' : 'light',
  };
}

interface SettingsContextValue {
  settings: UserSettings;
  /** Частичное обновление: сохраняется в localStorage и в Supabase. */
  update: (patch: Partial<UserSettings>) => void;
  /** Полный сброс к заводским значениям. */
  reset: () => void;
  /** Первичная загрузка ещё идёт (важно для страницы настроек). */
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

/**
 * Ключ локальной копии — СВОЙ на каждый аккаунт.
 *
 * Раньше ключ был один общий ('daymohk-settings') и не чистился ни при
 * выходе, ни при удалении аккаунта. Из-за этого настройки одного
 * человека доставались следующему, кто вошёл в том же браузере, а
 * главное — переживали удаление аккаунта: tourDone оставался true, и
 * обязательный гид новой регистрации не показывался, форма профиля
 * открывалась сразу.
 *
 * Гостю оставляем отдельный ключ: тема, выбранная до входа, должна
 * пережить перезагрузку страницы.
 */
function storageKey(accountId?: string): string {
  return accountId ? `${SETTINGS_STORAGE_KEY}-${accountId}` : `${SETTINGS_STORAGE_KEY}-guest`;
}

/**
 * Разовая уборка ключа из прошлой схемы.
 *
 * Он общий для всех аккаунтов и больше не читается, но останется в
 * браузерах навсегда — вместе с чужим tourDone и оплаченным proTier.
 * Настройки от этого не теряются: источник истины на сервере, при
 * входе они приезжают из user_settings.
 */
function dropLegacyCache(): void {
  try {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // приватный режим — не критично
  }
}

/** Локальная копия: нужна, чтобы применить тему до ответа сервера. */
function readLocal(accountId?: string): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(storageKey(accountId));
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeLocal(settings: UserSettings, accountId?: string): void {
  try {
    window.localStorage.setItem(storageKey(accountId), JSON.stringify(settings));
  } catch {
    // приватный режим или переполнение — не критично
  }
}

/**
 * Настройки пользователя.
 *
 * Источник истины — Supabase (нужен серверу для фильтрации уведомлений
 * и автоодобрения), но копия лежит в localStorage: тему и шрифт надо
 * применить в первом же кадре, иначе страница мигает светлой темой,
 * пока грузится профиль.
 *
 * Записи в БД дебаунсятся: ползунок масштаба шрифта иначе слал бы
 * запрос на каждое движение.
 */
export default function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { account, isLoading: isAuthLoading } = useAuth();
  // Выбор «светлая/тёмная» живёт в ThemeProvider; применяем его здесь.
  const { isDarkMode } = useTheme();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Гость — только когда авторизация ТОЧНО отработала. Пока isAuthLoading
  // истинно, account ещё null, и без этой проверки подписка мигала бы:
  // на первых кадрах сбрасывалась в none, а после ответа возвращалась.
  const isGuest = !isAuthLoading && !account;

  // 1. Локальная копия — до сети.
  //
  // ВАЖНО: не затираем настройки, если пользователь успел что-то
  // переключить до окончания загрузки. readLocal() возвращает то, что
  // было на диске на момент старта, и без слияния перезапись гасила
  // свежий выбор темы — она «отскакивала» обратно.
  //
  // Перечитываем при смене аккаунта: у каждого своя копия, и настройки
  // предыдущего пользователя не должны оставаться на экране.
  useEffect(() => {
    if (isAuthLoading) return;
    dropLegacyCache();
    const stored = readLocal(account?.id);
    setSettings((current) => (current === DEFAULT_SETTINGS ? stored : current));
    setIsLoading(false);
  }, [account?.id, isAuthLoading]);

  // 1b. Гость не наследует подписку от прошлого сеанса.
  //
  // Срабатывает и при выходе из аккаунта, и при загрузке страницы с
  // чужой локальной копией. Пишем в localStorage сразу же — иначе
  // следующая перезагрузка снова подняла бы платный proTier с диска.
  useEffect(() => {
    if (!isGuest) return;
    setSettings((current) => {
      const guarded = applyAccess(current, true);
      if (guarded === current) return current;
      writeLocal(guarded, undefined);
      return guarded;
    });
  }, [isGuest]);

  // 2. Серверная версия перекрывает локальную при входе.
  useEffect(() => {
    if (!account || !isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase!
        .from('user_settings')
        .select('*')
        .eq('user_id', account.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const remote = forceOwnerPlatinum(settingsFromDb(data as Record<string, unknown>), account.email);
      setSettings(remote);
      writeLocal(remote, account.id);
    })();

    return () => { cancelled = true; };
  }, [account?.id]);

  // 3. Оформление — ЕДИНСТВЕННОЕ место, где меняется класс .dark.
  //
  // Источник истины один — settings.themeId. Раньше здесь применялся
  // isDarkMode из ThemeProvider, а палитра писала в themeId: выбор
  // «Тёмная» в списке тем не давал ничего, потому что эффект смотрел
  // не туда. Отсюда и «переключается через раз».
  //
  // Кнопка солнце/луна теперь тоже пишет в themeId (см.
  // SettingsControlsBar), так что оба пути ведут в одно место.
  //
  // Пока настройки грузятся с диска, DOM не трогаем: иначе на первом
  // кадре успел бы примениться light из значения по умолчанию и тема
  // моргала бы при каждой перезагрузке.
  // ВСЕ темы — включая светлую и тёмную — применяются одинаково:
  // через подстановку переменных из палитры.
  //
  // Раньше light/dark шли отдельной веткой (clearThemeColors + класс
  // .dark), а значения брались из globals.css. Два источника истины
  // разъезжались: в CSS --smk-panel был #f1f3f6, а в пресете #ededed.
  // Из-за этого «создать свою тему» от светлой или тёмной подставляло
  // не те оттенки, что видел пользователь.
  // Вне расширенного режима доступны только светлая и тёмная: если
  // выбрана «Космос», а тумблер выключили — возвращаемся к паре.
  // Второй рубеж: даже если платный proTier каким-то путём просочился
  // в состояние, у гостя платные темы не применяются.
  //
  // Главный рубеж теперь на сервере (миграция 62): база сама откатывает
  // платную тему тем, у кого нет действующей подписки. Здесь остаётся
  // косметика — чтобы интерфейс не показывал платное лишнюю секунду.
  // Срок учитывается через activeProTier: истёкшая подписка платных тем
  // не даёт.
  const extraThemes = !isGuest && activeProTier(settings) !== 'none';
  const activeThemeId = extraThemes || settings.themeId === 'light' || settings.themeId === 'dark'
    ? ((settings.advancedMode || extraThemes) ? settings.themeId : (settings.themeId === 'dark' ? 'dark' : 'light'))
    : (settings.themeId === 'dark' ? 'dark' : 'light');

  const resolved = isLoading
    ? null
    : resolveTheme(activeThemeId, settings.customThemes);

  useEffect(() => {
    if (isLoading || !resolved) return;
    applyThemeColors(
      resolved.colors,
      resolved.isDark,
      resolved.glass === true,
      resolved.gradients,
    );

    // Классы-выключатели градиентов (п.21). Правила в CSS висят на
    // html.smk-grad-*, поэтому тема без переходов выглядит ровно так,
    // как выглядела до появления этой настройки.
    const root = document.documentElement;
    const on = resolved.gradients;
    root.classList.toggle('smk-grad-bg', on?.bg === true);
    root.classList.toggle('smk-grad-card', on?.card === true);
    root.classList.toggle('smk-grad-surface', on?.surface === true);
    root.classList.toggle('smk-grad-button', on?.button === true);
    // resolved пересоздаётся каждый рендер — в зависимостях держим его
    // первоисточники, иначе эффект крутился бы бесконечно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, activeThemeId, settings.customThemes]);

  // Первый вход: themeId ещё не выбирали, берём системную/сохранённую
  // тему из ThemeProvider, чтобы поведение не изменилось для тех, кто
  // никогда не открывал настройки.
  const didSyncInitialTheme = useRef(false);
  useEffect(() => {
    if (isLoading || didSyncInitialTheme.current) return;
    didSyncInitialTheme.current = true;
    const wanted = isDarkMode ? 'dark' : 'light';
    // Пишем напрямую: это не действие пользователя, а перенос уже
    // сохранённого выбора в новое поле. Гонять его через update() и
    // сохранять на сервер незачем.
    setSettings((current) => (
      current.advancedMode || current.themeId === wanted
        ? current
        : { ...current, themeId: wanted }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Типографика не зависит от темы и применяется всегда.
  useEffect(() => {
    applyTypography(settings.fontScale, settings.fontFamily);
  }, [settings.fontScale, settings.fontFamily]);

  // Эффекты тоже не зависят от темы: человек может выключить тени на
  // слабом телефоне и оставить любое оформление.
  useEffect(() => {
    applyEffects(settings.effects);
  }, [settings.effects]);

  useEffect(() => {
    applyRadiusScale(settings.radiusScale);
  }, [settings.radiusScale]);

  const persist = useCallback((next: UserSettings) => {
    // Запись в localStorage — синхронный JSON.stringify всего объекта
    // настроек, и делать его в кадре анимации незачем (п.7): при
    // перетаскивании ползунка цвета этот кадр и так занят перерисовкой
    // темы. Откладываем на «когда браузер освободится», с запасным
    // таймаутом для Safari, где requestIdleCallback нет.
    const saveLocal = () => writeLocal(next, account?.id);
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(saveLocal, { timeout: 1000 });
    } else {
      window.setTimeout(saveLocal, 0);
    }

    if (!account || !isSupabaseConfigured || !supabase) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase!
        .from('user_settings')
        .upsert({ user_id: account.id, ...settingsToDb(next) }, { onConflict: 'user_id' })
        .then(({ error }) => {
          if (error) console.warn('[settings] save failed:', error.message);
        });
    }, 600);
  }, [account?.id]);

  /**
   * Обновление настроек.
   *
   * Апдейтер setSettings обязан быть ЧИСТОЙ функцией. React в
   * StrictMode вызывает его дважды и может выполнить прямо во время
   * рендера, поэтому оттуда нельзя ни писать в localStorage, ни
   * трогать ref, ни планировать таймеры.
   *
   * Прошлая версия вынесла persist() в эффект, но оставила в апдейтере
   * мутацию `pendingSave.current` — то есть побочный эффект никуда не
   * делся, и предупреждение «Cannot update a component while
   * rendering» продолжало появляться при перетаскивании цвета в
   * редакторе тем (трейс dispatchSetState → update → patchTheme).
   *
   * Теперь апдейтер только считает новое состояние, а сохранение
   * запускает отдельный эффект, следящий за самим `settings`. Флаг
   * hasLocalEdit нужен, чтобы не записывать обратно то, что мы только
   * что прочитали с сервера при загрузке.
   */
  const hasLocalEdit = useRef(false);

  const update = useCallback((patch: Partial<UserSettings>) => {
    hasLocalEdit.current = true;
    setSettings((current) => applyAccess(
      forceOwnerPlatinum(normalizeSettings({ ...current, ...patch }), account?.email),
      isGuest,
    ));
  }, [account?.email, isGuest]);

  const reset = useCallback(() => {
    hasLocalEdit.current = true;
    setSettings(applyAccess(
      forceOwnerPlatinum({ ...DEFAULT_SETTINGS }, account?.email),
      isGuest,
    ));
  }, [account?.email, isGuest]);

  // Сохраняем после фиксации состояния, а не во время его вычисления.
  useEffect(() => {
    if (isLoading || !hasLocalEdit.current) return;
    persist(settings);
  }, [settings, isLoading, persist]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const value = useMemo(
    () => ({ settings, update, reset, isLoading }),
    [settings, update, reset, isLoading],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
