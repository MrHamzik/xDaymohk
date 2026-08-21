import { describe, expect, it } from 'vitest';
import { buildQuickTaskPreset } from '@/lib/quick-request';

/**
 * Быстрая заявка каталога: форма лишь собирает пресет для штатной
 * формы задания — проверяем сборку.
 */

const words = { defaultTitle: 'Быстрая заявка', contactsWord: 'Контакты' };

describe('buildQuickTaskPreset', () => {
  it('заголовок — первая строка описания, контакты — в тело', () => {
    const preset = buildQuickTaskPreset(
      { name: 'Дамир', phone: '+7 928 000-00-00', description: 'Привезти продукты\nна ул. Кирова, 15' },
      words,
    );
    expect(preset.title).toBe('Привезти продукты');
    expect(preset.description).toContain('Привезти продукты\nна ул. Кирова, 15');
    expect(preset.description.endsWith('Контакты: Дамир, +7 928 000-00-00')).toBe(true);
  });

  it('пустое описание — дефолтный заголовок', () => {
    const preset = buildQuickTaskPreset({ name: '', phone: '', description: '   ' }, words);
    expect(preset.title).toBe('Быстрая заявка');
    expect(preset.description).toBe('');
  });

  it('без контактов строка контактов не появляется', () => {
    const preset = buildQuickTaskPreset({ name: ' ', phone: '', description: 'Помочь с забором' }, words);
    expect(preset.description).toBe('Помочь с забором');
    expect(preset.description).not.toContain('Контакты');
  });

  it('длинное описание обрезается до лимита заголовка', () => {
    const long = 'а'.repeat(200);
    const preset = buildQuickTaskPreset({ name: '', phone: '', description: long }, words);
    expect(preset.title.length).toBe(80);
    expect(preset.description.length).toBe(200); // тело не режем
  });
});
