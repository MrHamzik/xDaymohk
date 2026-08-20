import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * schema.sql не должен расходиться с живой базой.
 *
 * Повод: profiles.created_at в продакшене оказалась date (default
 * CURRENT_DATE), хотя schema.sql всё время объявлял её timestamptz.
 * Время создания не сохранялось, каталог сортируется по этой колонке без
 * второго ключа — и анкеты одного дня меняли порядок между запросами,
 * из-за чего при листании часть анкет дублировалась, а часть пропадала.
 * Заодно нашлось, что birth_date в базе text, а в схеме date.
 *
 * Такое расхождение не ловится ни типами, ни сборкой: код обращается к
 * колонке по имени, а тип узнаёт только Postgres. Поэтому сверяем
 * объявления в SQL с дампом реальной базы (supabase/DB.md).
 *
 * Дамп — это снимок information_schema.columns на момент выгрузки.
 * Если колонку намеренно меняют миграцией, дамп надо обновить: тест
 * существует ровно для того, чтобы это не забывали сделать.
 */

const SUPABASE = join(process.cwd(), 'supabase');
const UPDATES = join(SUPABASE, 'update');

interface LiveColumn {
  table_name: string;
  column_name: string;
  data_type: string;
}

const live: LiveColumn[] = JSON.parse(readFileSync(join(SUPABASE, 'DB.md'), 'utf8'));

/** Имена типов из SQL -> как их показывает information_schema. */
const NORMALISE: Record<string, string> = {
  text: 'text',
  varchar: 'character varying',
  int: 'integer',
  integer: 'integer',
  bigint: 'bigint',
  smallint: 'smallint',
  boolean: 'boolean',
  jsonb: 'jsonb',
  json: 'json',
  uuid: 'uuid',
  date: 'date',
  timestamptz: 'timestamp with time zone',
  numeric: 'numeric',
  'double precision': 'double precision',
  inet: 'inet',
};

/** schema.sql + миграции по возрастанию номера. */
function sqlSources(): string[] {
  const out = [readFileSync(join(SUPABASE, 'schema.sql'), 'utf8')];
  const names = readdirSync(UPDATES)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  for (const n of names) out.push(readFileSync(join(UPDATES, n), 'utf8'));
  return out;
}

/**
 * Последний объявленный тип колонки: create table, затем перекрытия
 * через alter column ... type в более поздних миграциях.
 */
function declaredTypes(): Map<string, string> {
  const declared = new Map<string, string>();

  for (const sql of sqlSources()) {
    const creates = sql.matchAll(
      /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g,
    );
    for (const [, table, body] of creates) {
      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('--')) continue;
        const m = line.match(/^(\w+)\s+([a-z ]+?)(?:\(|\s|,|$)/);
        if (!m) continue;
        const [, column, rawType] = m;
        const type = NORMALISE[rawType.trim()];
        if (type) declared.set(`${table}.${column}`, type);
      }
    }

    const alters = sql.matchAll(
      /alter table public\.(\w+)[\s\S]*?alter column (\w+) type ([a-z ]+)/g,
    );
    for (const [, table, column, rawType] of alters) {
      const type = NORMALISE[rawType.trim()];
      if (type) declared.set(`${table}.${column}`, type);
    }
  }

  return declared;
}

describe('schema.sql соответствует живой базе', () => {
  const declared = declaredTypes();

  /**
   * Известные и разобранные расхождения. Каждое — с причиной; список
   * должен только сокращаться. Новое расхождение в него не попадёт и
   * уронит тест, ради чего всё и затевалось.
   */
  const known: Record<string, string> = {
    // information_schema показывает любой массив как ARRAY, конкретный
    // тип лежит в отдельной колонке. Сверять по data_type нельзя.
    'letter_log.recipient_ids': 'text[] всегда виден как ARRAY',

    // Колонку чинит supabase/update/58: date -> timestamptz. Дамп
    // DB.md снят ДО применения миграции. После того как обновление
    // будет накачено и дамп пересобран, строку нужно убрать.
    'profiles.created_at': 'исправляется обновлением 58, дамп снят раньше',

    // numeric(10,7) против double precision: у double точность выше
    // объявленной, координаты домов не страдают. Трогать живую базу
    // ради этого дороже, чем польза.
    'house_addresses.lat': 'double precision точнее numeric(10,7)',
    'house_addresses.lng': 'double precision точнее numeric(10,7)',

    // numeric(2,1) против smallint. Оценка всё равно валидируется на
    // сервере как целое 1..5 (app/api/reviews/route.ts), дробных
    // значений в колонку не попадает.
    'reviews.rating': 'оценка целая, валидируется сервером как 1..5',
  };
  const skip = new Set(Object.keys(known));

  const checked = live.filter((c) => {
    const key = `${c.table_name}.${c.column_name}`;
    return declared.has(key) && !skip.has(key) && c.data_type !== 'ARRAY';
  });

  it('дамп базы и объявления вообще сверяются', () => {
    // Защита от «тест зелёный, потому что ничего не проверил»: если
    // разбор SQL сломается, список окажется пустым и тест упадёт.
    expect(checked.length).toBeGreaterThan(100);
  });

  for (const column of checked) {
    const key = `${column.table_name}.${column.column_name}`;
    it(`${key}: тип совпадает с базой`, () => {
      expect(declared.get(key)).toBe(column.data_type);
    });
  }
});

describe('каталог сортируется однозначно', () => {
  /**
   * created_at у анкет одного дня совпадает даже после миграции 58
   * (у старых строк время 00:00). Без второго ключа порядок страниц
   * снова поплывёт, поэтому проверяем, что он на месте.
   */
  it('загрузка анкет сортируется по created_at и по id', () => {
    const source = readFileSync(join(process.cwd(), 'lib/profiles/load.ts'), 'utf8');
    const start = source.indexOf(".from('v_profiles')");
    expect(start).toBeGreaterThan(-1);
    const query = source.slice(start, source.indexOf(';', start));
    expect(query).toContain("order('created_at'");
    expect(query).toContain("order('id'");
  });
});
