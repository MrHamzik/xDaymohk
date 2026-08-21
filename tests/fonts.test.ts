import { describe, expect, it } from 'vitest';
import { BASE_FONT_ID, fontHref } from '@/lib/fonts';
import { FONT_FAMILIES, type FontFamilyId } from '@/lib/settings/types';

/**
 * Ленивая загрузка шрифтов (lib/fonts.ts).
 *
 * Раньше все десять семейств тянулись одним CSS-@import из globals.css —
 * блокирующая цепочка на каждого посетителя. Теперь Manrope стоит в
 * <head> постоянно, остальные грузятся по требованию. Эти тесты держат
 * контракт карты: у каждого выбираемого семейства есть ссылка (или
 * честный null для системных), и ссылки не разъезжаются со списком
 * начертаний в настройках.
 */

describe('fontHref — карта семейств', () => {
  it('у каждого id из FONT_FAMILIES есть значение в карте (ссылка или null)', () => {
    for (const id of Object.keys(FONT_FAMILIES) as FontFamilyId[]) {
      expect(() => fontHref(id)).not.toThrow();
      // Системные и базовое семейство качать нечего, остальным нужна ссылка.
      const downloadable = id !== 'manrope' && id !== 'georgia' && id !== 'system';
      if (downloadable) expect(fontHref(id)).toBeTruthy();
    }
  });

  it('основное семейство (Manrope) отдельной ссылки не требует — оно в <head>', () => {
    expect(fontHref(BASE_FONT_ID)).toBeNull();
  });

  it('системные стеки (georgia, system) ничего не скачивают', () => {
    expect(fontHref('georgia')).toBeNull();
    expect(fontHref('system')).toBeNull();
  });

  it('все ссылки — https на fonts.googleapis.com с display=swap', () => {
    for (const id of Object.keys(FONT_FAMILIES) as FontFamilyId[]) {
      const href = fontHref(id);
      if (!href) continue;
      expect(href.startsWith('https://fonts.googleapis.com/css2?')).toBe(true);
      expect(href).toContain('display=swap');
    }
  });

  it('каждая ссылка подключает ровно одно семейство', () => {
    for (const id of Object.keys(FONT_FAMILIES) as FontFamilyId[]) {
      const href = fontHref(id);
      if (!href) continue;
      expect((href.match(/family=/g) ?? []).length).toBe(1);
    }
  });
});
