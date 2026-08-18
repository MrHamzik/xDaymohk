'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Palette, Settings as SettingsIcon } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { contrastRatio } from '@/lib/settings/derive';
import { PRESET_THEMES, resolveTheme } from '@/lib/settings/defaults';
import { useI18n } from '@/lib/i18n';

/**
 * Выбор темы из шапки — заменяет кнопку «светлая / тёмная», когда
 * включён расширенный режим.
 *
 * Простой toggle там больше не годится: тем становится больше двух, и
 * циклический перебор по нажатию заставлял бы прощёлкивать всё
 * подряд, чтобы вернуться к нужной.
 */
export default function ThemePickerButton() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  const active = resolveTheme(settings.themeId, settings.customThemes);

  /**
   * Плитка кнопки: фон из акцента темы, значок ВСЕГДА белый.
   *
   * Значок белый по требованию: это фирменный вид кнопки, одинаковый
   * во всех темах. Подбирать его цвет автоматически не нужно — такие
   * попытки уже ломали кнопку трижды:
   *   1) значок цветом фона страницы — пропадал на светлых темах;
   *   2) значок по контрасту к акценту — становился чёрным в тёмных
   *      темах, где ожидается белый;
   *   3) то же правило с учётом основы — давало чёрный в светлых.
   *
   * Меняется только ПОДЛОЖКА, и лишь в одном случае: когда акцент сам
   * почти белый (тема «Чёрный»), белый значок на нём был бы не виден.
   */
  const tileStyle = (() => {
    const accent = active.colors.accent;
    // Плитка почти белая (как в теме «Чёрный», где акцент это чистый
    // #ffffff) — белый значок на ней слился бы. Подложку приглушаем до
    // серого из палитры самой темы; значок при этом остаётся белым.
    const tooLight = contrastRatio('#ffffff', accent) < 1.4;
    return {
      background: tooLight ? active.colors.statusOffline : accent,
      color: '#ffffff',
    };
  })();

  const options = [
    ...Object.entries(PRESET_THEMES).map(([id, theme]) => ({
      id,
      name: theme.name,
      colors: theme.colors,
    })),
    ...settings.customThemes.map((theme) => ({
      id: `custom:${theme.id}`,
      name: theme.name,
      colors: theme.colors,
    })),
  ];

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        title={`${t.settingsThemes}: ${active.name}`}
        aria-label={t.settingsThemes}
        className="flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all active:scale-95"
        style={tileStyle}
      >
        <Palette className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="smk-solid absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="max-h-72 overflow-y-auto p-1.5 no-scrollbar">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  update({ themeId: option.id });
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: option.colors.bg }}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: option.colors.accent }}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800 dark:text-zinc-200">
                  {option.name}
                </span>
                {settings.themeId === option.id && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
              </button>
            ))}
          </div>

          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            {t.settingsThemeCreate}
          </Link>
        </div>
      )}
    </div>
  );
}
