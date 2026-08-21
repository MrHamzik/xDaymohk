/**
 * Разбор данных, которые приходят от провайдера входа (Google).
 *
 * Вынесено из AuthProvider отдельным модулем по одной причине: это
 * чистая логика без React, и её можно закрыть тестами. Ошибка здесь
 * стоила пользователю нескольких кругов «ФИО и аватар из Google не
 * подтягиваются» — впредь поведение зафиксировано тестами.
 *
 * Две вещи, из-за которых прошлые попытки не работали:
 *
 *  1. Данные лежат не только в user_metadata. При части сценариев
 *     входа Supabase оставляет user_metadata почти пустым, а всё
 *     содержимое остаётся в identities[].identity_data.
 *  2. Ключи называются по-разному: имя приходит как full_name, name
 *     или парой given_name + family_name; картинка — как avatar_url
 *     либо picture.
 */

/** Заглушка, которую подставляли, когда имя неизвестно. */
export const PLACEHOLDER_NAME = 'Пользователь';

export interface OAuthLikeUser {
  id: string;
  email?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ identity_data?: Record<string, unknown> | null } | null> | null;
}

/** Все источники полей в порядке приоритета: сначала метаданные. */
export function identitySources(user: OAuthLikeUser): Array<Record<string, unknown>> {
  const metadata = user.user_metadata ?? {};
  const identityData = (user.identities ?? [])
    .map((identity) => identity?.identity_data)
    .filter((data): data is Record<string, unknown> => Boolean(data));
  return [metadata, ...identityData];
}

/** Первое непустое строковое значение по списку ключей. */
export function pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

/**
 * ФИО из данных провайдера.
 *
 * Возвращает пустую строку, если настоящего имени нет: подставлять
 * заглушку решает вызывающий код. Так проще отличить «имени нет» от
 * «имя есть», не сравнивая результат со строкой-заглушкой.
 */
export function oauthFullName(user: OAuthLikeUser): string {
  const sources = identitySources(user);
  const direct = pickString(sources, ['full_name', 'name', 'display_name']);
  if (direct) return direct;
  const given = pickString(sources, ['given_name', 'first_name']);
  const family = pickString(sources, ['family_name', 'last_name']);
  return [given, family].filter(Boolean).join(' ').trim();
}

/** Ссылка на аватар от провайдера или пустая строка. */
export function oauthAvatarUrl(user: OAuthLikeUser): string {
  return pickString(identitySources(user), ['avatar_url', 'picture']);
}

/** Телефон от провайдера или пустая строка. */
export function oauthPhone(user: OAuthLikeUser): string {
  return pickString(identitySources(user), ['phone']);
}

/** Почта от провайдера или пустая строка. */
export function oauthEmail(user: OAuthLikeUser): string {
  return pickString(identitySources(user), ['email']);
}
