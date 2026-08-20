/**
 * Понятные сообщения об ошибках (п.26).
 *
 * Смысл проверки: наружу не должен просачиваться технический текст.
 * Тексты в `cases` — настоящие сообщения Postgres/Supabase, а не
 * выдуманные, иначе тест проверял бы сам себя.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { humanError, humanErrorMessage } from '@/lib/errors';

describe('humanError', () => {
  beforeEach(() => {
    // Переводчик пишет подробности в консоль — в отчёте о тестах это шум.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cases: Array<{ raw: string; expect: RegExp; note: string }> = [
    {
      raw: 'duplicate key value violates unique constraint "profiles_pkey"',
      expect: /уже есть/i,
      note: 'уникальность',
    },
    {
      raw: 'new row violates row-level security policy for table "tasks"',
      expect: /прав/i,
      note: 'RLS',
    },
    {
      raw: 'JWT expired',
      expect: /войдите/i,
      note: 'протухший вход',
    },
    {
      raw: 'column profiles.created_at does not exist',
      expect: /поддержку/i,
      note: 'дрейф схемы',
    },
    {
      raw: 'invalid input syntax for type integer: "abc"',
      expect: /неверно/i,
      note: 'кривой ввод',
    },
    {
      raw: 'null value in column "title" violates not-null constraint',
      expect: /обязательные/i,
      note: 'пустое обязательное поле',
    },
    {
      raw: 'TypeError: Failed to fetch',
      expect: /связи|интернет/i,
      note: 'нет сети',
    },
  ];

  for (const item of cases) {
    it(`переводит: ${item.note}`, () => {
      const result = humanError(new Error(item.raw), 'ru');
      expect(result.message).toMatch(item.expect);
      // Исходный текст сохраняется — его прикладывают к обращению.
      expect(result.technical).toBe(item.raw);
    });
  }

  it('не показывает человеку технический текст', () => {
    // Проверка-мутация: если правило перестанет срабатывать и наружу
    // уйдёт сырое сообщение, тест обязан упасть.
    const raw = 'duplicate key value violates unique constraint "x"';
    const shown = humanErrorMessage(new Error(raw), 'ru');
    expect(shown).not.toContain('constraint');
    expect(shown).not.toContain('duplicate');
  });

  it('понимает объект ошибки Supabase, а не только Error', () => {
    const supabaseError = {
      message: 'permission denied for table profiles',
      code: '42501',
      details: null,
      hint: null,
    };
    expect(humanErrorMessage(supabaseError, 'ru')).toMatch(/прав/i);
  });

  it('на незнакомую ошибку даёт запасную фразу, а не пустоту', () => {
    const shown = humanErrorMessage(new Error('нечто небывалое'), 'ru');
    expect(shown.length).toBeGreaterThan(10);
    expect(shown).toMatch(/попробуйте/i);
  });

  it('отвечает на чеченском, когда язык ce', () => {
    const ru = humanErrorMessage(new Error('JWT expired'), 'ru');
    const ce = humanErrorMessage(new Error('JWT expired'), 'ce');
    expect(ce).not.toBe(ru);
    expect(ce.length).toBeGreaterThan(5);
  });

  it('переживает undefined и пустую строку', () => {
    expect(humanErrorMessage(undefined, 'ru').length).toBeGreaterThan(10);
    expect(humanErrorMessage('', 'ru').length).toBeGreaterThan(10);
  });
});
