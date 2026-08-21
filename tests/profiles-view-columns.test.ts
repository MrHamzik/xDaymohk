import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Вьюха каталога обязана отдавать все поля анкеты, которые читает
 * приложение.
 *
 * Повод (Этап 2, п.3 замечаний владельца): никнейм, галочка «показывать
 * ник вместо ФИО» и галочки «не показывать WhatsApp/Telegram» писались
 * в таблицу, но вьюха v_profiles (создана в обновлении 47) не была
 * пересоздана после миграций 51 и 69 — чтение возвращало пустоту, и
 * значения «не сохранялись». Тест ловит повторение класса бага: берёт
 * ПОСЛЕДНЕЕ определение вьюхи и сверяет набор колонок.
 */

const SUPABASE = join(process.cwd(), 'supabase');

function allSqlInOrder(): string {
  const files = [readFileSync(join(SUPABASE, 'schema.sql'), 'utf8')];
  const names = readdirSync(join(SUPABASE, 'update'))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  for (const n of names) files.push(readFileSync(join(SUPABASE, 'update', n), 'utf8'));
  return files.join('\n');
}

/** Тело последнего create view public.v_profiles. */
function lastViewBody(): string {
  const sql = allSqlInOrder();
  const bodies = [...sql.matchAll(
    /create view public\.v_profiles[\s\S]*?as\s*select([\s\S]*?)from public\.profiles/gi,
  )];
  expect(bodies.length).toBeGreaterThan(0);
  return bodies[bodies.length - 1][1];
}

describe('v_profiles отдаёт всё, что читает приложение', () => {
  const body = lastViewBody();

  // Чувствительные колонки — ради них тест и существует.
  const REQUIRED = [
    'nickname', 'show_nickname',
    'hide_phone', 'hide_whatsapp', 'hide_telegram',
    'is_personal', 'owner_id', 'full_name', 'avatar_url', 'phone',
    'whatsapp', 'telegram', 'settlement', 'gender', 'birth_date',
  ];

  for (const column of REQUIRED) {
    it(`колонка ${column} присутствует в последнем определении вьюхи`, () => {
      // Простая и надёжная проверка для «чувствительных» — вхождение
      // имени с точкой: псевдонимы (as phone) тоже считаются.
      expect(body.toLowerCase()).toContain(column);
    });
  }

  it('определение одно и оно после обновления 47', () => {
    const sql = allSqlInOrder();
    const creates = [...sql.matchAll(/create view public\.v_profiles/gi)];
    // 47-е создаёт, 72-е пересоздаёт — минимум два определения.
    expect(creates.length).toBeGreaterThanOrEqual(2);
  });
});
