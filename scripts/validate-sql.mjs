#!/usr/bin/env node
/**
 * Lightweight SQL parser check.
 * Validates that every migration file in supabase/migrations/ parses
 * as PostgreSQL via libpg_query. Does NOT execute against a database.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = resolve(__dirname, '..', 'supabase', 'migrations');
const SEED_FILE = resolve(__dirname, '..', 'supabase', 'seed.sql');

const pgQueryModule = await import('libpg-query');
const parse = pgQueryModule.parse || pgQueryModule.default?.parse;
if (typeof parse !== 'function') {
  console.error('libpg-query: parse() not found. Keys:', Object.keys(pgQueryModule));
  process.exit(1);
}

let errors = 0;
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log(`Validating ${files.length} migration files...\n`);

for (const file of files) {
  const path = join(MIGRATIONS_DIR, file);
  const sql = readFileSync(path, 'utf8');
  try {
    parse(sql);
    console.log(`  OK   ${file}  (${(statSync(path).size / 1024).toFixed(1)} kB)`);
  } catch (e) {
    errors += 1;
    console.error(`  FAIL ${file}`);
    console.error(`       ${e.message ?? e}`);
  }
}

try {
  parse(readFileSync(SEED_FILE, 'utf8'));
  console.log(`\n  OK   seed.sql  (${(statSync(SEED_FILE).size / 1024).toFixed(1)} kB)`);
} catch (e) {
  errors += 1;
  console.error(`\n  FAIL supabase/seed.sql`);
  console.error(`       ${e.message ?? e}`);
}

if (errors > 0) {
  console.error(`\n${errors} file(s) failed to parse.`);
  process.exit(1);
}
console.log('\nAll SQL files parse cleanly.');
