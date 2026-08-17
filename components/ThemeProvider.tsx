'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'daymohk-theme';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start with light on the server and resolve the saved/system preference after hydration.
  // The class is applied in the effect below, so every route uses the same theme state.
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(getPreferredTheme());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';

    // Пользовательская тема (расширенные настройки) сама решает, тёмная
    // она или светлая, и ставит .dark в SettingsProvider. Если её
    // выбрали — не вмешиваемся, иначе два эффекта перетирали бы класс
    // друг друга и тема мигала бы при каждом рендере.
    let hasCustomTheme = false;
    try {
      const raw = window.localStorage.getItem('daymohk-settings');
      const themeId = raw ? (JSON.parse(raw) as { themeId?: string }).themeId : undefined;
      hasCustomTheme = Boolean(themeId && themeId !== 'light' && themeId !== 'dark');
    } catch {
      hasCustomTheme = false;
    }

    if (!hasCustomTheme) {
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = theme;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isDarkMode: theme === 'dark',
      toggleTheme,
    }),
    [theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}
