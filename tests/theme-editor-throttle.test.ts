import { describe, expect, it, vi } from 'vitest';
import { normalizeColors } from '@/lib/settings/defaults';
import { PRESET_THEMES } from '@/lib/settings/defaults';

/**
 * Правка цвета темы не должна заваливать React обновлениями (п.13).
 *
 * Трейс из отчёта пользователя:
 *   onChange (ThemeEditor.tsx:526)
 *     → patchTheme (ThemeEditor.tsx:203)
 *       → SettingsProvider.update (SettingsProvider.tsx:319)
 *         → «Maximum update depth exceeded»
 *
 * Причина НЕ в рекурсии: <input type="color"> шлёт onChange непрерывно,
 * пока палитру тащат мышью, — десятки событий в секунду, каждое с новым
 * значением. Каждое уходило в setSettings, и React упирался в предел
 * вложенных обновлений.
 *
 * Здесь проверяются два свойства, на которых держится починка.
 */

const BASE = PRESET_THEMES.light.colors;

describe('normalizeColors — идемпотентность (настоящей петли нет)', () => {
  /**
   * Если бы нормализация возвращала значение, отличное от заданного,
   * получился бы честный самоподдерживающийся цикл: состояние менялось
   * бы на каждом проходе и эффекты запускали бы друг друга бесконечно.
   * Тогда одним троттлингом делу не помочь — он бы лишь замаскировал
   * причину. Убеждаемся, что цикла нет.
   */
  it('валидный цвет проходит нормализацию без изменений', () => {
    const once = normalizeColors({ ...BASE, card: '#ff8800' }, BASE);
    const twice = normalizeColors(once, BASE);
    expect(once.card).toBe('#ff8800');
    expect(twice).toEqual(once);
  });

  it('регистр букв не создаёт расхождения между проходами', () => {
    const once = normalizeColors({ ...BASE, card: '#AABBCC' }, BASE);
    expect(normalizeColors(once, BASE)).toEqual(once);
  });

  it('мусорное значение откатывается к базовому и дальше не скачет', () => {
    const once = normalizeColors({ ...BASE, card: 'не цвет' }, BASE);
    expect(once.card).toBe(BASE.card);
    expect(normalizeColors(once, BASE)).toEqual(once);
  });
});

describe('сжатие потока правок до одного кадра', () => {
  /**
   * Модель того, что делает patchThemeLive в ThemeEditor: копим
   * последнее значение и применяем его один раз за кадр.
   */
  function makeThrottler(raf: (cb: () => void) => number) {
    let frame: number | null = null;
    let pending: (() => void) | null = null;
    return (run: () => void) => {
      pending = run;
      if (frame !== null) return;
      frame = raf(() => {
        frame = null;
        const next = pending;
        pending = null;
        next?.();
      });
    };
  }

  it('сотня событий перетаскивания даёт одно обновление настроек', () => {
    const queue: Array<() => void> = [];
    const raf = vi.fn((cb: () => void) => queue.push(cb));
    const update = vi.fn();
    const schedule = makeThrottler(raf as unknown as (cb: () => void) => number);

    // Пользователь тащит ползунок: 100 событий подряд, без кадров между ними.
    for (let i = 0; i < 100; i += 1) {
      const color = `#0000${i.toString(16).padStart(2, '0')}`;
      schedule(() => update(color));
    }

    expect(update).not.toHaveBeenCalled();

    // Браузер отрисовал кадр.
    queue.forEach((cb) => cb());

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('до кадра доезжает ПОСЛЕДНИЙ выбранный цвет, а не первый', () => {
    const queue: Array<() => void> = [];
    const raf = vi.fn((cb: () => void) => queue.push(cb));
    const update = vi.fn();
    const schedule = makeThrottler(raf as unknown as (cb: () => void) => number);

    schedule(() => update('#111111'));
    schedule(() => update('#222222'));
    schedule(() => update('#333333'));
    queue.forEach((cb) => cb());

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('#333333');
  });

  it('следующее перетаскивание после кадра снова проходит', () => {
    const queue: Array<() => void> = [];
    const raf = vi.fn((cb: () => void) => queue.push(cb));
    const update = vi.fn();
    const schedule = makeThrottler(raf as unknown as (cb: () => void) => number);

    schedule(() => update('#aaaaaa'));
    queue.splice(0).forEach((cb) => cb());
    schedule(() => update('#bbbbbb'));
    queue.splice(0).forEach((cb) => cb());

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith('#bbbbbb');
  });
});
