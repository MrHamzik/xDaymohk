/**
 * Отзывы удалённых пользователей (п.1 из списка правок).
 *
 * Когда человек удаляет аккаунт, его отзывы остаются: в базе стоит
 * `on delete set null`, и author_id обнуляется. Отзыв показывается от
 * «Удалённого пользователя» и продолжает влиять на балл анкеты.
 *
 * Проверяется главное — кому такие записи разрешено трогать. Правка
 * рейтинга опаснее удаления: убрать чужой отзыв владелец анкеты вправе
 * (это его страница), а переписать единицу на пятёрку — нет, иначе
 * рейтинг перестаёт что-либо значить.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Права на удаление — копия предиката из ProfileReviewsTab. */
function canDelete(
  account: { id: string; isBlocked?: boolean; isAdmin?: boolean } | null,
  profile: { ownerId?: string },
  authorId?: string,
): boolean {
  return Boolean(
    account
    && !account.isBlocked
    && (account.id === authorId || account.id === profile.ownerId || account.isAdmin),
  );
}

/** Права на правку — копия предиката из ProfileReviewsTab. */
function canEdit(
  account: { id: string; isBlocked?: boolean; isAdmin?: boolean } | null,
  authorId?: string,
): boolean {
  const isOrphan = !authorId;
  return Boolean(
    account
    && !account.isBlocked
    && (account.id === authorId || (isOrphan && account.isAdmin)),
  );
}

const OWNER = { id: 'u-owner', isAdmin: false };
const ADMIN = { id: 'u-admin', isAdmin: true };
const GUEST = { id: 'u-guest', isAdmin: false };
const ANKETA = { ownerId: 'u-owner' };
/** Автор удалил аккаунт: author_id пуст. */
const ORPHAN = undefined;

describe('отзыв удалённого пользователя', () => {
  it('владелец анкеты может его удалить', () => {
    expect(canDelete(OWNER, ANKETA, ORPHAN)).toBe(true);
  });

  it('администратор может его удалить', () => {
    expect(canDelete(ADMIN, ANKETA, ORPHAN)).toBe(true);
  });

  it('посторонний удалить не может', () => {
    expect(canDelete(GUEST, ANKETA, ORPHAN)).toBe(false);
  });

  it('администратор может его исправить', () => {
    // Опечатку или грубость поправить больше некому.
    expect(canEdit(ADMIN, ORPHAN)).toBe(true);
  });

  it('владелец анкеты исправить его НЕ может', () => {
    // Ключевое ограничение: иначе он переписал бы себе оценку.
    expect(canEdit(OWNER, ORPHAN)).toBe(false);
  });

  it('посторонний исправить не может', () => {
    expect(canEdit(GUEST, ORPHAN)).toBe(false);
  });
});

describe('обычный отзыв живого автора', () => {
  const AUTHOR_ID = 'u-guest';

  it('автор правит свой отзыв', () => {
    expect(canEdit(GUEST, AUTHOR_ID)).toBe(true);
  });

  it('администратор чужой живой отзыв не правит', () => {
    // Исключение действует только для осиротевших записей.
    expect(canEdit(ADMIN, AUTHOR_ID)).toBe(false);
  });

  it('владелец анкеты чужой отзыв не правит, но удаляет', () => {
    expect(canEdit(OWNER, AUTHOR_ID)).toBe(false);
    expect(canDelete(OWNER, ANKETA, AUTHOR_ID)).toBe(true);
  });
});

describe('заблокированный аккаунт', () => {
  it('ничего не может', () => {
    const blocked = { id: 'u-admin', isAdmin: true, isBlocked: true };
    expect(canDelete(blocked, ANKETA, ORPHAN)).toBe(false);
    expect(canEdit(blocked, ORPHAN)).toBe(false);
  });
});

describe('сервер разрешает то же, что и интерфейс', () => {
  const api = readFileSync(join(process.cwd(), 'app/api/reviews/route.ts'), 'utf8');

  it('удаление не срывается из-за пропавшей анкеты', () => {
    // Раньше проверка `!profile` отклоняла даже администратора, и
    // отзыв без анкеты не мог удалить никто.
    expect(api).toContain('if (!isAuthor && !isOwner && !isAdmin) {');
  });

  it('правка осиротевшего отзыва доверена админу', () => {
    expect(api).toContain('isOrphanReview && isAdminEmail(userData.user.email)');
  });

  it('ответ не подменяет автора на того, кто правил', () => {
    // Иначе интерфейс показал бы отзыв как написанный админом.
    expect(api).toContain('authorId: liveReview?.author_id ?? undefined');
    expect(api).not.toContain('authorId: userData.user.id,');
  });
});
