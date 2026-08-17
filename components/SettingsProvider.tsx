'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/components/AuthProvider';
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
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 1. Локальная копия — до сети.
  useEffect(() => {
    setSettings(readLocal());
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

  // 3. Оформление.
  //
  // Класс .dark принадлежит ThemeProvider — он единственный владелец
  // пары «светлая/тёмная», и трогать его здесь нельзя, иначе два
  // эффекта начнут перетирать друг друга при каждом рендере.
  //
  // Поэтому: пока выбрана light/dark, мы вообще не вмешиваемся и лишь
  // снимаем свои инлайновые переменные. Кастомная тема — наоборот,
  // полностью наша: она сама выставляет .dark по своей основе.
  useEffect(() => {
    const isPreset = settings.themeId === 'light' || settings.themeId === 'dark';
    if (isPreset) {
      clearThemeColors();
    } else {
      const theme = resolveTheme(settings.themeId, settings.customThemes);
      applyThemeColors(theme.colors, theme.isDark);
    }
  }, [settings.themeId, settings.customThemes]);

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

  const update = useCallback((patch: Partial<UserSettings>) => {
    setSettings((current) => {
      const next = normalizeSettings({ ...current, ...patch });
      persist(next);
      return next;
    });
  }, [persist]);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    setSettings(next);
    persist(next);
  }, [persist]);

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
