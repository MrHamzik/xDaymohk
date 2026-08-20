import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Личная анкета создаётся ровно в одном месте.
 *
 * Повод: строчка «создать анкету personal-<uid>» была скопирована в
 * четыре места — ensure_personal_profile(), триггер handle_new_auth_user(),
 * бэкфилл в конце schema.sql и переопределение в update/17. Копии
 * разъехались: версия из триггера не заполняла gender и birth_date, и у
 * человека, зарегистрированного обычным путём, анкета создавалась без
 * пола и даты рождения.
 *
 * Такую ошибку не видно ни в тестах приложения, ни при code review —
 * файлы большие, а копии лежат в сотнях строк друг от друга. Поэтому
 * проверяем инвариант текстом: список колонок личной анкеты встречается
 * в актуальной схеме один раз.
 *
 * «Актуальная схема» — это schema.sql плюс ПОСЛЕДНЯЯ миграция, которая
 * трогает эти функции. Старые миграции переопределяли их же, и в них
 * копии остаются законно: миграции — это история, переписывать её нельзя.
 */

const SUPABASE = join(process.cwd(), 'supabase');
const UPDATES = join(SUPABASE, 'update');

const schema = readFileSync(join(SUPABASE, 'schema.sql'), 'utf8');

/** Самая свежая миграция, создающая личную анкету. */
function latestPersonalProfileMigration(): string {
  const names = readdirSync(UPDATES)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  let latest = '';
  for (const name of names) {
    const body = readFileSync(join(UPDATES, name), 'utf8');
    if (body.includes('create_personal_profile') || body.includes('ensure_personal_profile')) {
      latest = body;
    }
  }
  return latest;
}

/** Маркер копии: строка bio, которую писала каждая из четырёх вставок. */
const BIO_MARKER = 'Житель Даймохк. Личная анкета.';

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('личная анкета: единственный источник правды', () => {
  it('schema.sql описывает вставку личной анкеты один раз', () => {
    expect(count(schema, BIO_MARKER)).toBe(1);
  });

  it('последняя миграция описывает вставку один раз', () => {
    expect(count(latestPersonalProfileMigration(), BIO_MARKER)).toBe(1);
  });

  it('триггер регистрации не вставляет анкету сам, а зовёт общую функцию', () => {
    const trigger = schema.slice(
      schema.indexOf('function public.handle_new_auth_user()'),
      schema.indexOf('drop trigger if exists on_auth_user_created'),
    );
    expect(trigger).not.toBe('');
    expect(trigger).toContain('perform public.create_personal_profile');
    expect(trigger).not.toContain('insert into public.profiles');
  });

  it('ensure_personal_profile не вставляет анкету сам', () => {
    const start = schema.indexOf('function public.ensure_personal_profile(');
    const body = schema.slice(start, schema.indexOf('$$;', start));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('public.create_personal_profile');
    expect(body).not.toContain('insert into public.profiles');
  });
});

describe('личная анкета: границы доступа', () => {
  /**
   * create_personal_profile принимает user_id аргументом, то есть может
   * создать анкету на чужой аккаунт. Она security definer, поэтому без
   * revoke её вызвал бы любой вошедший пользователь напрямую через RPC.
   */
  for (const role of ['public', 'anon', 'authenticated']) {
    it(`create_personal_profile недоступна роли ${role}`, () => {
      const pattern = new RegExp(
        `revoke all on function public\\.create_personal_profile\\([^)]*\\) from ${role};`,
      );
      expect(schema).toMatch(pattern);
    });
  }

  it('create_personal_profile никому не выдана через grant', () => {
    expect(schema).not.toMatch(/grant execute on function public\.create_personal_profile/);
  });

  it('ensure_personal_profile остаётся доступной вошедшему пользователю', () => {
    expect(schema).toMatch(
      /grant execute on function public\.ensure_personal_profile\([^)]*\) to authenticated;/,
    );
  });

  it('ensure_personal_profile берёт владельца из auth.uid(), а не из аргумента', () => {
    const start = schema.indexOf('function public.ensure_personal_profile(');
    const body = schema.slice(start, schema.indexOf('$$;', start));
    expect(body).toContain('auth.uid()');
    expect(body).toContain("raise exception 'Not authenticated'");
  });
});
