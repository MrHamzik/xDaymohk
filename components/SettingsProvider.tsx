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
import { applyThemeColors, applyTypography, clearThemeColors } from '@/lib/settings/apply-theme';
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
  // «Расширенная» тема — любая, кроме базовой пары light/dark: и
  // пресеты (Космос, Чёрный, Стеклянный…), и пользовательские. Все они
  // применяются одинаково — через подстановку переменных.
  const resolved = isLoading
    ? null
    : resolveTheme(settings.themeId, settings.customThemes);
  const isThemedMode = Boolean(
    settings.advancedMode
    && settings.themeId !== 'light'
    && settings.themeId !== 'dark',
  );
  // Тёмная основа: у расширенной темы — её собственный флаг,
  // у базовой пары — сам идентификатор.
  const effectiveDark = isThemedMode
    ? Boolean(resolved?.isDark)
    : settings.themeId === 'dark';

  useEffect(() => {
    if (isLoading) return;

    if (isThemedMode && resolved) {
      applyThemeColors(resolved.colors, resolved.isDark, resolved.glass === true);
      return;
    }

    // Обычный режим: снимаем инлайновые переменные кастомной темы,
    // иначе они остаются на :root и перебивают каскад globals.css.
    clearThemeColors();
    document.documentElement.classList.toggle('dark', effectiveDark);
    document.documentElement.style.colorScheme = effectiveDark ? 'dark' : 'light';
    // resolved пересоздаётся каждый рендер — в зависимостях держим его
    // первоисточники, иначе эффект крутился бы бесконечно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isThemedMode, effectiveDark, settings.themeId, settings.customThemes]);

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
   * persist() вызывается в эффекте, а НЕ внутри апдейтера setSettings.
   * Апдейтер обязан быть чистой функцией: React в StrictMode вызывает
   * его дважды и может выполнить во время рендера. Запись в
   * localStorage и setTimeout оттуда давали предупреждение
   * «Cannot update a component while rendering» — тот самый трейс с
   * dispatchSetState при перетаскивании цвета в редакторе тем.
   */
  const pendingSave = useRef<UserSettings | null>(null);
  const [saveTick, setSaveTick] = useState(0);

  const update = useCallback((patch: Partial<UserSettings>) => {
    setSettings((current) => {
      const next = normalizeSettings({ ...current, ...patch });
      pendingSave.current = next;
      return next;
    });
    setSaveTick((value) => value + 1);
  }, []);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    setSettings(next);
    pendingSave.current = next;
    setSaveTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (saveTick === 0 || !pendingSave.current) return;
    persist(pendingSave.current);
  }, [saveTick, persist]);

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
