/**
 * Градиенты поверхностей в темах (п.21).
 *
 * Проверяется главное: значения из БД/localStorage приходят снаружи и
 * подставляются в CSS, поэтому мусор в них не должен доезжать до
 * стилей. Плюс совместимость: темы, созданные до появления градиентов,
 * обязаны работать как раньше.
 */
import { describe, expect, it } from 'vitest';
import { normalizeSettings, resolveTheme } from '@/lib/settings/defaults';
import { DEFAULT_GRADIENTS, GRADIENT_ANGLES } from '@/lib/settings/types';

/** Собирает настройки с одной пользовательской темой. */
function withTheme(gradients: unknown) {
  const settings = normalizeSettings({
    customThemes: [{
      id: 'mine',
      name: 'Моя',
      isDark: true,
      gradients,
      colors: {},
    }],
  });
  return settings.customThemes[0];
}

describe('нормализация градиентов', () => {
  it('тема без поля gradients остаётся рабочей', () => {
    // Совместимость: так выглядят все темы, созданные раньше.
    const theme = withTheme(undefined);
    expect(theme.gradients).toBeUndefined();
  });

  it('resolveTheme не падает на теме без градиентов', () => {
    const settings = normalizeSettings({
      customThemes: [{ id: 'mine', name: 'Моя', isDark: false, colors: {} }],
    });
    const resolved = resolveTheme('custom:mine', settings.customThemes);
    expect(resolved.gradients).toBeUndefined();
    expect(resolved.colors).toBeTruthy();
  });

  it('принимает корректные значения как есть', () => {
    const theme = withTheme({
      bg: true, card: false, surface: true, button: false,
      angle: 90, strength: 60,
    });
    expect(theme.gradients).toEqual({
      bg: true, card: false, surface: true, button: false,
      angle: 90, strength: 60,
    });
  });

  it('отбрасывает угол не из списка', () => {
    // 137deg в CSS валиден, но список закрыт: иначе испорченная
    // запись подставила бы в стили произвольное значение.
    const theme = withTheme({ bg: true, angle: 137, strength: 50 });
    expect(theme.gradients?.angle).toBe(DEFAULT_GRADIENTS.angle);
    expect(GRADIENT_ANGLES).toContain(theme.gradients!.angle);
  });

  it('обрезает силу до диапазона 0..100', () => {
    expect(withTheme({ bg: true, strength: 999 }).gradients?.strength).toBe(100);
    expect(withTheme({ bg: true, strength: -50 }).gradients?.strength).toBe(0);
  });

  it('на нечисловую силу берёт значение по умолчанию', () => {
    const theme = withTheme({ bg: true, strength: 'много' });
    expect(theme.gradients?.strength).toBe(DEFAULT_GRADIENTS.strength);
  });

  it('строку вместо объекта не принимает за настройки', () => {
    expect(withTheme('linear-gradient(0deg, red, blue)').gradients).toBeUndefined();
  });

  it('нестрогие значения флагов считает выключенными', () => {
    // 'true' строкой и 1 числом — типичный мусор из старого клиента.
    const theme = withTheme({ bg: 'true', card: 1, surface: null, button: true });
    expect(theme.gradients).toMatchObject({
      bg: false, card: false, surface: false, button: true,
    });
  });
});
