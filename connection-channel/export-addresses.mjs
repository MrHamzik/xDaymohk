#!/usr/bin/env node
/**
 * export-addresses.mjs — выгрузка ВСЕХ адресов из таблицы house_addresses (Supabase)
 * в CSV + статистика. Также может удалить дубликаты (опционально).
 *
 * Запуск (из корня проекта, где есть node_modules и .env):
 *   node connection-channel/export-addresses.mjs                # выгрузить в addresses-export.csv
 *   node connection-channel/export-addresses.mjs --out out.csv  # свой путь
 *   node connection-channel/export-addresses.mjs --delete-duplicates
 *       # оставить по одному адресу на (street+house_number+is_not_house),
 *       # остальные дубли удалить из БД (service role, необратимо!)
 *
 * Требует в .env: NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.
 * Service-role ключ обходит RLS — скрипт нужен только для админ-операций.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- читаем .env вручную (без dotenv) ---
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync('.env', 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return env;
}

const env = loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в .env');
  process.exit(1);
}

const supabase = createClient(url, key);
const PAGE = 1000;

async function fetchAll() {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('house_addresses')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function streetHouseKey(r) {
  const s = String(r.street || '').toLowerCase().replace(/^ул\.\s*/i, '').replace(/\s+/g, ' ').trim();
  const n = String(r.house_number || '').toLowerCase().replace(/^д\.\s*/i, '').replace(/\s+/g, ' ').trim();
  return `${s}|${n}|${r.is_not_house ? 1 : 0}`;
}

async function main() {
  const outPath = process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]
    : 'addresses-export.csv';
  const deleteDups = process.argv.includes('--delete-duplicates');

  console.log('Читаю house_addresses...');
  const rows = await fetchAll();
  console.log(`Всего строк в БД: ${rows.length}`);

  // статистика по дублям (улица+номер)
  const seen = new Map();
  let dups = 0;
  for (const r of rows) {
    const k = streetHouseKey(r);
    if (seen.has(k)) dups += 1; else seen.set(k, r);
  }
  console.log(`Уникальных (улица+номер+тип): ${seen.size}`);
  console.log(`Дублей: ${dups}`);

  // CSV (UTF-8 BOM, ; — как ждёт импортёр админки)
  const header = ['id', 'street', 'house_number', 'full_address', 'lat', 'lng', 'is_not_house', 'category', 'postal_code', 'created_at'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(header.map((h) => esc(r[h])).join(';'));
  }
  writeFileSync(outPath, '\uFEFF' + lines.join('\r\n'), 'utf-8');
  console.log(`CSV записан: ${outPath} (${rows.length} строк)`);

  if (deleteDups) {
    console.log('\nУдаляю дубликаты (оставляю первую запись по улица+номер)...');
    const keepIds = new Set([...seen.values()].map((r) => String(r.id)));
    const toDelete = rows.filter((r) => !keepIds.has(String(r.id))).map((r) => String(r.id));
    console.log(`Будет удалено: ${toDelete.length}`);
    if (toDelete.length > 0) {
      for (let i = 0; i < toDelete.length; i += 1000) {
        const chunk = toDelete.slice(i, i + 1000);
        const { error } = await supabase.from('house_addresses').delete().in('id', chunk);
        if (error) { console.error('Ошибка удаления:', error.message); process.exit(1); }
        console.log(`  удалено ${i + chunk.length}/${toDelete.length}`);
      }
    }
    console.log('Готово: дубли удалены.');
  }
}

main().catch((e) => { console.error('Ошибка:', e.message || e); process.exit(1); });
