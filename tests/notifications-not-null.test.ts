import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Никто не пишет явный null в колонку с not null + default (п.13).
 *
 * Повод — ошибка из консоли пользователя:
 *
 *   POST /rest/v1/notifications → 400
 *   null value in column "sender" of relation "notifications"
 *   violates not-null constraint
 *
 * Колонка объявлена так:
 *
 *   sender text not null default 'Даймохк'
 *
 * Ловушка в том, что default срабатывает, только если колонку в INSERT
 * НЕ УПОМЯНУТЬ вовсе. Клиент же слал `sender: notification.sender ?? null`
 * — то есть явный null, и умолчание не применялось. Уведомление
 * не сохранялось, а человек видел «Не удалось сохранить уведомление».
 *
 * Тест разбирает schema.sql, находит такие колонки и следит, чтобы код
 * не подставлял в них null. Ошибка этого класса иначе видна только на
 * живой базе, в рантайме, уже у пользователя.
 */

const ROOT = process.cwd();
const SUPABASE = join(ROOT, 'supabase');

/** Колонки таблицы, объявленные как not null и с default. */
function notNullDefaultColumns(table: string): string[] {
  const schema = readFileSync(join(SUPABASE, 'schema.sql'), 'utf8');
  const create = new RegExp(
    `create table (?:if not exists )?public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
  );
  const body = create.exec(schema);
  if (!body) return [];

  const columns: string[] = [];
  for (const rawLine of body[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) continue;
    const name = /^([a-z_][a-z0-9_]*)\s+/.exec(line);
    if (!name) continue;
    if (/\bnot null\b/i.test(line) && /\bdefault\b/i.test(line)) {
      columns.push(name[1]);
    }
  }
  return columns;
}

/** Все .ts/.tsx проекта, кроме зависимостей и сборки. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', 'coverage']);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('notifications: not null колонки не получают явный null', () => {
  const guarded = notNullDefaultColumns('notifications');

  it('схема разобрана — иначе проверка пустая', () => {
    expect(guarded).toContain('sender');
    expect(guarded).toContain('title');
  });

  /**
   * Ищем ровно тот вид записи, который ломал вставку:
   *
   *   sender: <что угодно> ?? null      или      sender: null
   *
   * Это не разбор TypeScript, а поиск по образцу, но он покрывает
   * реальный случай и стоит дёшево.
   */
  it('ни один файл не подставляет null в такие колонки', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      // Сам этот тест содержит примеры в комментариях — пропускаем.
      if (file.endsWith('notifications-not-null.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes("from('notifications')")) continue;

      for (const column of guarded) {
        const pattern = new RegExp(`\\b${column}\\s*:\\s*(?:[^,\\n]*\\?\\?\\s*)?null\\b`);
        const hit = pattern.exec(text);
        if (hit) {
          offenders.push(`${file.replace(ROOT, '.')}: ${hit[0].trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('клиент подставляет отправителя по умолчанию, а не пустоту', () => {
    const provider = readFileSync(join(ROOT, 'components/NotificationsProvider.tsx'), 'utf8');
    // Значение должно совпадать с default из схемы.
    const schema = readFileSync(join(SUPABASE, 'schema.sql'), 'utf8');
    const fallback = /sender\s+text not null default '([^']+)'/.exec(schema);
    expect(fallback).not.toBeNull();
    expect(provider).toContain(fallback![1]);
  });
});
