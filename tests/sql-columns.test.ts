import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Проверка ссылок на колонки в SQL-миграциях.
 *
 * Повод: во вьюхе v_tasks_feed (обновление 56) whatsapp и telegram
 * брались из алиаса user_profiles, а лежат они в profiles. Postgres
 * ответил «column u.whatsapp does not exist» — но только в момент
 * применения миграции на живой базе, когда ошибку уже увидел человек.
 *
 * Здесь то же самое ловится на этапе тестов: собираем колонки таблиц из
 * schema.sql и alter table по всем миграциям, затем сверяем каждую
 * ссылку вида <алиас>.<колонка> во вьюхе с реальным составом таблицы.
 *
 * Это не полноценный разбор SQL: проверяется одна конкретная вьюха с
 * известными алиасами. Полный анализ потребовал бы поднимать Postgres,
 * а цена ошибки здесь — сломанная миграция, которую видно сразу.
 */

const SUPABASE = join(process.cwd(), 'supabase');
const UPDATES = join(SUPABASE, 'update');

/** schema.sql + все миграции одним текстом. */
function allSql(): string {
  const files = [readFileSync(join(SUPABASE, 'schema.sql'), 'utf8')];
  for (const name of readdirSync(UPDATES).filter((f) => f.endsWith('.sql')).sort()) {
    files.push(readFileSync(join(UPDATES, name), 'utf8'));
  }
  return files.join('\n');
}

/** Колонки таблицы: create table + все add column из миграций. */
function columnsOf(table: string, blob: string): Set<string> {
  const found = new Set<string>();

  const create = new RegExp(
    `create table (?:if not exists )?public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'g',
  );
  for (const match of blob.matchAll(create)) {
    for (const rawLine of match[1].split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('--')) continue;
      const column = /^([a-z_][a-z0-9_]*)\s+/.exec(line);
      if (!column) continue;
      const reserved = ['constraint', 'primary', 'unique', 'check', 'foreign'];
      if (!reserved.includes(column[1])) found.add(column[1]);
    }
  }

  const alter = new RegExp(`alter table (?:only )?public\\.${table}([\\s\\S]*?);`, 'gi');
  for (const match of blob.matchAll(alter)) {
    for (const added of match[1].matchAll(/add column (?:if not exists )?([a-z_]+)/gi)) {
      found.add(added[1]);
    }
  }

  return found;
}

describe('SQL: ссылки на колонки во вьюхе заданий', () => {
  const blob = allSql();

  const tasks = columnsOf('tasks', blob);
  const userProfiles = columnsOf('user_profiles', blob);
  const profiles = columnsOf('profiles', blob);
  const participants = columnsOf('task_participants', blob);

  it('таблицы разобраны — иначе проверка ничего не значит', () => {
    expect(tasks.size).toBeGreaterThan(10);
    expect(userProfiles.size).toBeGreaterThan(5);
    expect(profiles.size).toBeGreaterThan(10);
    expect(participants.size).toBeGreaterThan(3);
  });

  it('контакты лежат там, где мы думаем', () => {
    // Миграция 56 лечила путаницу «колонка не в той таблице».
    // С ТЗ от 21.08 (п.4.1) WhatsApp и Telegram живут и в ПРОФИЛЕ
    // (user_profiles, миграция 69) — их вводят там; в анкетах они
    // лишь копия для показа, полей ввода больше нет.
    expect(userProfiles.has('phone')).toBe(true);
    expect(userProfiles.has('whatsapp')).toBe(true);
    expect(userProfiles.has('telegram')).toBe(true);
    expect(profiles.has('whatsapp')).toBe(true);
    expect(profiles.has('telegram')).toBe(true);
  });

  it('v_tasks_feed не ссылается на несуществующие колонки', () => {
    const migration = readFileSync(join(UPDATES, '56-task-contacts.sql'), 'utf8');
    const view = migration.slice(migration.indexOf('create view public.v_tasks_feed'));
    expect(view).not.toHaveLength(0);

    // Алиас p используется в двух независимых подзапросах, поэтому
    // разбираем их отдельно от внешнего запроса.
    const lateral = /left join lateral \(([\s\S]*?)\) ap on true/.exec(view);
    const counter = /\(select count\(\*\) from public\.task_participants p([\s\S]*?)\) as taken_slots/.exec(view);
    expect(lateral).not.toBeNull();
    expect(counter).not.toBeNull();

    const outer = view.replace(lateral![1], '').replace(counter![1], '');

    const scopes: Array<[string, string, string, Set<string>]> = [
      [outer, 't', 'tasks', tasks],
      [outer, 'u', 'user_profiles', userProfiles],
      [lateral![1], 'p', 'profiles', profiles],
      [counter![1], 'p', 'task_participants', participants],
    ];

    const missing: string[] = [];
    for (const [scope, alias, table, known] of scopes) {
      for (const ref of scope.matchAll(new RegExp(`\\b${alias}\\.([a-z_]+)`, 'g'))) {
        if (!known.has(ref[1])) missing.push(`${alias}.${ref[1]} — нет в ${table}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
