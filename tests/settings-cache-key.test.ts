import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Кэш настроек в localStorage.
 *
 * Повод: ключ был один общий ('daymohk-settings') на все аккаунты и не
 * чистился ни при выходе, ни при удалении. В нём лежит tourDone —
 * поэтому после удаления аккаунта и повторной регистрации в том же
 * браузере обязательный гид не показывался: настройки удалённого
 * пользователя доставались новому, tourDone был true, и онбординг
 * сразу открывал форму профиля.
 *
 * Проверяем исходный код, а не поведение в браузере: сама эта логика
 * живёт в React-провайдере и завязана на localStorage, поднимать ради
 * неё jsdom дороже, чем закрепить контракт ключа.
 */

const provider = readFileSync(
  join(process.cwd(), 'components', 'SettingsProvider.tsx'),
  'utf8',
);
const auth = readFileSync(
  join(process.cwd(), 'components', 'AuthProvider.tsx'),
  'utf8',
);

describe('Кэш настроек привязан к аккаунту', () => {
  it('ключ собирается из идентификатора аккаунта', () => {
    expect(provider).toContain('function storageKey(accountId?: string)');
    expect(provider).toContain('`${SETTINGS_STORAGE_KEY}-${accountId}`');
  });

  it('у гостя свой ключ, а не общий', () => {
    expect(provider).toContain('`${SETTINGS_STORAGE_KEY}-guest`');
  });

  it('чтение и запись всегда получают аккаунт', () => {
    // Голые readLocal() / writeLocal(x) без второго аргумента —
    // это и есть та ошибка, из-за которой настройки протекали.
    //
    // Комментарии вырезаем: в пояснениях функции упоминаются по имени
    // со скобками, и без этого тест падал на собственной документации.
    const code = provider
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const bare = [...code.matchAll(/\b(readLocal|writeLocal)\(([^)]*)\)/g)]
      .filter((match) => {
        const before = code.slice(0, match.index);
        if (before.endsWith('function ')) return false; // объявление
        const [, name, args] = match;
        if (name === 'readLocal') return args.trim() === '';
        return !args.includes(','); // writeLocal(next) без ключа
      });

    expect(bare.map((match) => match[0])).toEqual([]);
  });

  it('старый общий ключ удаляется как мусор', () => {
    expect(provider).toContain('function dropLegacyCache()');
    expect(provider).toContain('dropLegacyCache();');
  });

  it('удаление аккаунта чистит его настройки и метку гида', () => {
    expect(auth).toContain('daymohk-settings-${deletedId}');
    expect(auth).toContain('daymohk-tour-${deletedId}');
  });
});
