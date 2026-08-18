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
import { applyEffects, applyThemeColors, applyTypography } from '@/lib/settings/apply-theme';
import type { UserSettings } from '@/lib/settings/types';

const SETTINGS_STORAGE_KEY = 'daymohk-settings';

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

/** Локальная копия: нужна, чтобы применить тему до ответа сервера. */
function readLocal(): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeLocal(settings: UserSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
  const { account } = useAuth();
  // Выбор «светлая/тёмная» живёт в ThemeProvider; применяем его здесь.
  const { isDarkMode } = useTheme();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 1. Локальная копия — до сети.
  //
  // ВАЖНО: не затираем настройки, если пользователь успел что-то
  // переключить до окончания загрузки. readLocal() возвращает то, что
  // было на диске на момент старта, и без слияния перезапись гасила
  // свежий выбор темы — она «отскакивала» обратно.
  useEffect(() => {
    const stored = readLocal();
    setSettings((current) => (current === DEFAULT_SETTINGS ? stored : current));
    setIsLoading(false);
  }, []);

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
      const remote = settingsFromDb(data as Record<string, unknown>);
      setSettings(remote);
      writeLocal(remote);
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
  const activeThemeId = settings.advancedMode
    ? settings.themeId
    : (settings.themeId === 'dark' ? 'dark' : 'light');

  const resolved = isLoading
    ? null
    : resolveTheme(activeThemeId, settings.customThemes);

  useEffect(() => {
    if (isLoading || !resolved) return;
    applyThemeColors(resolved.colors, resolved.isDark, resolved.glass === true);
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

  const persist = useCallback((next: UserSettings) => {
    writeLocal(next);
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
    setSettings((current) => normalizeSettings({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => {
    hasLocalEdit.current = true;
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

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
