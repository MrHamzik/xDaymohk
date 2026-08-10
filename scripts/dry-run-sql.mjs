#!/usr/bin/env node
/**
 * Dry-run all Supabase migrations against pg-mem (in-memory Postgres).
 * Validates that every CREATE TABLE, RLS policy, and TRIGGER compiles
 * without syntax errors. Note: pg-mem is a partial implementation of
 * Postgres — it does NOT understand auth.uid(), auth.users, storage.*,
 * or publication supabase_realtime. We stub these before running.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = resolve(__dirname, '..', 'supabase', 'migrations');
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const db = newDb({ autoCreateForeignKeyIndices: true });
const adapter = db.adapters.createPg();
const { Client } = adapter;

const client = new Client();
await client.connect();

// --- Stubs for Supabase-specific features ---
await client.query(`
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false
  );
  create table if not exists storage.objects (
    id bigserial primary key,
    bucket_id text references storage.buckets(id),
    name text not null
  );

  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select '00000000-0000-0000-0000-000000000000'::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select 'authenticated'
  $$;

  -- storage.foldername returns text[] in real Supabase
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/')
  $$;

  -- publication stub
  create or replace function pg_catalog.alter_publication_pg_memory_stub() returns void language sql as $$ begin end $$;
  do $$ begin
    -- pg-mem does not support ALTER PUBLICATION; this is just a marker
    null;
  end $$;
`);

let totalStatements = 0;
let totalErrors = 0;

for (const file of files) {
  const path = join(MIGRATIONS_DIR, file);
  const sql = readFileSync(path, 'utf8');

  // pg-mem does not support ALTER PUBLICATION; strip those lines.
  const cleanedSql = sql
    .replace(/alter publication supabase_realtime add table [\w.]+;/gi, '-- (skipped: ALTER PUBLICATION)')
    .replace(/create extension if not exists "pgcrypto";/gi, '-- (skipped: pgcrypto)');

  console.log(`\n--- ${file} ---`);
  const statements = cleanedSql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
  let fileErrors = 0;
  for (const statement of statements) {
    totalStatements += 1;
    try {
      await client.query(statement);
    } catch (e) {
      fileErrors += 1;
      totalErrors += 1;
      // Print first line of statement for context
      const preview = statement.split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? '';
      console.error(`  FAIL: ${preview.slice(0, 80)}…`);
      console.error(`       ${e.message ?? e}`);
    }
  }
  if (fileErrors === 0) {
    console.log(`  ${statements.length} statements OK`);
  } else {
    console.log(`  ${fileErrors}/${statements.length} statements FAILED`);
  }
}

await client.end();

console.log(`\n=== ${totalStatements - totalErrors}/${totalStatements} statements OK across ${files.length} files ===`);
if (totalErrors > 0) {
  process.exit(1);
}
