import type { FontFamilyId } from '@/lib/settings/types';

/**
 * Ленивая загрузка шрифтов настроек.
 *
 * Раньше все десять семейств тянулись одним @import из globals.css.
 * Умолчание — Manrope, и 99% людей никогда не открывают выбор шрифта,
 * но каждый платил за цепочку «CSS → таблица Google Fonts → ~40 файлов
 * начертаний»: она блокировала отрисовку и весила сотни килобайт.
 *
 * Теперь Manrope подключён постоянным <link> в app/layout.tsx, а
 * остальные семейства догружаются здесь — в момент, когда шрифт
 * действительно выбран (вызывается из applyTypography). Грузятся только
 * начертания 400–800 с кириллицей, одно семейство — один файл таблицы.
 */

/** Основное семейство — грузится всегда, отдельного файла не требует. */
export const BASE_FONT_ID: FontFamilyId = 'manrope';

/** Ссылка на таблицу стилей Google Fonts для семейства, null — качать нечего. */
export function fontHref(id: FontFamilyId): string | null {
  switch (id) {
    case 'manrope':
      // Уже подключён в <head> — см. app/layout.tsx.
      return null;
    case 'inter':
      return 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    case 'rubik':
      return 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap';
    case 'montserrat':
      return 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap';
    case 'jost':
      return 'https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap';
    case 'onest':
      return 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap';
    case 'pt-serif':
      return 'https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap';
    case 'literata':
      return 'https://fonts.googleapis.com/css2?family=Literata:wght@400;500;600;700&display=swap';
    case 'roboto-mono':
      return 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap';
    // Georgia и системный стек браузеру уже доступны — качать нечего.
    case 'georgia':
    case 'system':
      return null;
    default:
      return null;
  }
}

/**
 * Подключить семейство, если оно ещё не подключено.
 *
 * Идемпотентно: ссылка помечена data-smk-font и ищется по ней, поэтому
 * повторные вызовы (applyTypography гоняется на каждую смену настроек)
 * ничего не добавляют. Пока таблица грузится, браузер рисует текст
 * запасным шрифтом (font-display: swap) — экран не пустеет.
 */
export function ensureFontLoaded(id: FontFamilyId): void {
  if (typeof document === 'undefined') return;
  const href = fontHref(id);
  if (!href) return;

  const marker = `smk-font-${id}`;
  if (document.querySelector(`link[data-smk-font="${marker}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.smkFont = marker;
  document.head.appendChild(link);
}
