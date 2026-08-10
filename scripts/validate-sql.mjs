#!/usr/bin/env node
/**
 * Lightweight SQL parser check.
 * Validates every SQL file under supabase/ parses as PostgreSQL via
 * libpg_query. Does NOT execute against a database.
 *
 *   - supabase/migrations/*.sql   (timestamped, for supabase db push)
 *   - supabase/steps/*.sql        (numbered, for SQL Editor paste)
 *   - supabase/seed.sql + supabase/steps/08-seed.sql
 *   - supabase/all-in-one.sql     (auto-generated bundle)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', 'supabase');

const pgQueryModule = await import('libpg-query');
const parse = pgQueryModule.parse || pgQueryModule.default?.parse;
if (typeof parse !== 'function') {
  console.error('libpg-query: parse() not found. Keys:', Object.keys(pgQueryModule));
  process.exit(1);
}

const targets = [];

function collect(dir, label) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) targets.push({ path: join(dir, f), label: `${label}/${f}` });
}

collect(join(ROOT, 'migrations'), 'migrations');
collect(join(ROOT, 'steps'), 'steps');
if (existsSync(join(ROOT, 'all-in-one.sql'))) {
  targets.push({ path: join(ROOT, 'all-in-one.sql'), label: 'all-in-one.sql' });
}
if (existsSync(join(ROOT, 'seed.sql'))) {
  targets.push({ path: join(ROOT, 'seed.sql'), label: 'seed.sql' });
}

let errors = 0;
console.log(`Validating ${targets.length} SQL files...\n`);

for (const t of targets) {
  const sql = readFileSync(t.path, 'utf8');
  try {
    parse(sql);
    console.log(`  OK   ${t.label.padEnd(40)} (${(statSync(t.path).size / 1024).toFixed(1)} kB)`);
  } catch (e) {
    errors += 1;
    console.error(`  FAIL ${t.label}`);
    console.error(`       ${e.message ?? e}`);
  }
}

if (errors > 0) {
  console.error(`\n${errors} file(s) failed to parse.`);
  process.exit(1);
}
console.log('\nAll SQL files parse cleanly.');
