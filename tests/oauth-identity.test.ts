import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_NAME,
  identitySources,
  oauthAvatarUrl,
  oauthEmail,
  oauthFullName,
  oauthPhone,
  pickString,
  type OAuthLikeUser,
} from '@/lib/oauth-identity';

/**
 * Пользователь трижды сообщал: «ФИО и аватар из Google не
 * подтягиваются». Причина оказалась в том, что читали ТОЛЬКО
 * user_metadata.full_name / avatar_url, а Google (через Supabase)
 * кладёт данные ещё в двух местах и под другими именами.
 *
 * Тесты описывают все формы ответа, которые встречаются на практике.
 */

const base = { id: 'u1' } satisfies OAuthLikeUser;

describe('источники полей', () => {
  it('user_metadata идёт первым, identity_data — следом', () => {
    const user: OAuthLikeUser = {
      ...base,
      user_metadata: { full_name: 'Из метаданных' },
      identities: [{ identity_data: { full_name: 'Из identity' } }],
    };
    expect(identitySources(user)).toEqual([
      { full_name: 'Из метаданных' },
      { full_name: 'Из identity' },
    ]);
  });

  it('пустые identities не роняют разбор', () => {
    expect(identitySources({ ...base, identities: null })).toEqual([{}]);
    expect(identitySources({ ...base, identities: [null] })).toEqual([{}]);
    expect(identitySources({ ...base, identities: [{ identity_data: null }] })).toEqual([{}]);
  });
});

describe('pickString', () => {
  it('берёт первый непустой ключ по порядку', () => {
    expect(pickString([{ a: '', b: 'Б' }], ['a', 'b'])).toBe('Б');
  });

  it('пробелы не считаются значением и обрезаются', () => {
    expect(pickString([{ a: '   ' }, { a: '  Имя  ' }], ['a'])).toBe('Имя');
  });

  it('нестроковые значения игнорируются', () => {
    expect(pickString([{ a: 42 }, { a: 'ок' }], ['a'])).toBe('ок');
  });
});

describe('ФИО из Google', () => {
  it('обычный случай: full_name в user_metadata', () => {
    const user: OAuthLikeUser = { ...base, user_metadata: { full_name: 'Иван Петров' } };
    expect(oauthFullName(user)).toBe('Иван Петров');
  });

  it('user_metadata пуст — имя берётся из identity_data', () => {
    // Ровно этот случай ломал вход: Supabase оставляет user_metadata
    // почти пустым при повторной привязке аккаунта.
    const user: OAuthLikeUser = {
      ...base,
      user_metadata: { email_verified: true },
      identities: [{ identity_data: { full_name: 'Иван Петров', picture: 'https://g/p.jpg' } }],
    };
    expect(oauthFullName(user)).toBe('Иван Петров');
  });

  it('нет full_name — собираем из given_name и family_name', () => {
    const user: OAuthLikeUser = {
      ...base,
      user_metadata: { given_name: 'Иван', family_name: 'Петров' },
    };
    expect(oauthFullName(user)).toBe('Иван Петров');
  });

  it('есть только имя без фамилии', () => {
    expect(oauthFullName({ ...base, user_metadata: { given_name: 'Иван' } })).toBe('Иван');
  });

  it('имени нет вовсе — возвращается пустая строка, а не заглушка', () => {
    // Заглушку подставляет вызывающий код; функция обязана честно
    // сказать «данных нет», иначе её не отличить от настоящего имени.
    expect(oauthFullName(base)).toBe('');
    expect(oauthFullName(base)).not.toBe(PLACEHOLDER_NAME);
  });
});

describe('аватар из Google', () => {
  it('avatar_url в метаданных', () => {
    const user: OAuthLikeUser = { ...base, user_metadata: { avatar_url: 'https://g/a.jpg' } };
    expect(oauthAvatarUrl(user)).toBe('https://g/a.jpg');
  });

  it('picture вместо avatar_url', () => {
    // Google отдаёт картинку под именем picture — раньше её не читали.
    const user: OAuthLikeUser = { ...base, user_metadata: { picture: 'https://g/p.jpg' } };
    expect(oauthAvatarUrl(user)).toBe('https://g/p.jpg');
  });

  it('picture внутри identity_data', () => {
    const user: OAuthLikeUser = {
      ...base,
      identities: [{ identity_data: { picture: 'https://g/i.jpg' } }],
    };
    expect(oauthAvatarUrl(user)).toBe('https://g/i.jpg');
  });

  it('картинки нет — пустая строка', () => {
    expect(oauthAvatarUrl(base)).toBe('');
  });
});

describe('почта и телефон', () => {
  it('почта из identity_data, когда в метаданных её нет', () => {
    const user: OAuthLikeUser = {
      ...base,
      identities: [{ identity_data: { email: 'a@b.c' } }],
    };
    expect(oauthEmail(user)).toBe('a@b.c');
  });

  it('телефон из метаданных', () => {
    expect(oauthPhone({ ...base, user_metadata: { phone: '+79000000000' } })).toBe('+79000000000');
  });
});
