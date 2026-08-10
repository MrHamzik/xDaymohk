# Supabase setup

## One-time local setup

### Option A: Supabase CLI (recommended for developers)

```bash
# 1. Install the Supabase CLI
brew install supabase/tap/supabase   # macOS
# Linux: see https://supabase.com/docs/guides/cli
# Windows (scoop): scoop install supabase

# 2. Generate a Personal Access Token at
#    https://supabase.com/dashboard/account/tokens
#    Then expose it to the CLI:
export SUPABASE_ACCESS_TOKEN=<paste-token-here>

# 3. Link to your project
supabase link --project-ref <your-project-ref>

# 4. Apply all migrations in order
supabase db push

# 5. (Optional) Seed initial data
psql "$DATABASE_URL" -f supabase/seed.sql
```

### Option B: Browser SQL Editor (no CLI, no tokens)

If you cannot install the CLI or the project is on a restricted network,
use the **step-by-step files** in `supabase/steps/`. Each is small enough
to paste into the SQL Editor without overwhelming it, and you can run
them one at a time to isolate any error.

| Step | File | What it does | Result |
|---|---|---|---|
| 1 | `steps/01-extensions-and-helpers.sql` | pgcrypto + `is_admin_email()` | Functions exist |
| 2 | `steps/02-tables.sql` | user_profiles, profiles, certificates, reviews, complaints | 5 tables |
| 3 | `steps/03-aux-tables.sql` | house_addresses, notifications, donations, project_support | 9 tables |
| 4 | `steps/04-storage-and-rls-enable.sql` | profile-media bucket + enable RLS | Storage bucket visible |
| 5 | `steps/05-rls-policies.sql` | All RLS policies | Policies active |
| 6 | `steps/06-realtime-and-views.sql` | `supabase_realtime` + 4 views | Realtime enabled |
| 7 | `steps/07-triggers.sql` | rating / review_count / profile_count triggers | Counters live |
| 8 | `steps/08-seed.sql` | 58 Samashki houses | house_addresses populated |

**For each step:**

1. Open <https://supabase.com/dashboard/project/_/sql/new>
2. Open the corresponding `steps/0N-*.sql` from this repo
3. Copy the entire file contents (`Ctrl+A` → `Ctrl+C` on raw view)
4. Paste into the editor and click **Run**
5. Verify the expected "Result" column above before moving to the next step
6. If a step errors, **stop** and report the error message + step number

**Bundled option:** if you prefer one paste instead of 8,
run `npm run db:build-all` (or use the existing `supabase/all-in-one.sql`)
to regenerate the bundled file, then paste it once.

## Migration order

The migrations are timestamp-prefixed and **must be applied in order**:

| File | Purpose |
|---|---|
| `20260101000000_init.sql` | All tables, indexes, RLS enable, storage bucket, `is_admin_email()` helper |
| `20260101000100_rls_policies.sql` | Per-table row-level security policies |
| `20260101000200_realtime.sql` | Attach `public.*` tables to `supabase_realtime` publication |
| `20260101000300_counters_and_triggers.sql` | `rating` / `review_count` / `profile_count` maintenance |
| `20260101000400_views.sql` | `v_public_profiles`, `v_all_profiles`, `v_user_directory`, `v_current_donations` |

## Schema overview

```
auth.users                       (Supabase managed)
   └── public.user_profiles     (1:1, per-account metadata)
          └── public.profiles    (1:N, per-questionnaire)
                 ├── public.certificates   (1:N)
                 ├── public.reviews        (1:N)
                 └── public.complaints     (1:N, references both profile and target user)

public.notifications             (1:N per user)
public.house_addresses           (admin-managed, public read)
public.donations                 (CloudTips webhook ledger, idempotent by operation_id)
public.project_support           (monthly aggregates, key = 'YYYY-MM')
storage.objects / 'profile-media' (avatars + documents bucket, public read, owner write)
```

## Row-Level Security summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `user_profiles` | self, admin | self | self, admin | — |
| `profiles` | public (not hidden/banned), owner, admin | owner | owner, admin | owner (non-personal), admin |
| `certificates` | public | profile owner, admin | profile owner, admin | profile owner, admin |
| `reviews` | public | author | — | author, admin |
| `complaints` | author, admin | author | admin | — |
| `house_addresses` | public | admin | admin | admin |
| `notifications` | recipient | admin, self | recipient | — |
| `donations` | public | service_role only | service_role only | — |
| `project_support` | public | service_role only | service_role only | — |

The `is_admin_email()` function mirrors `lib/admin.ts` on the client. **Keep
the email allowlist in both places in sync** — when you add or remove an
admin, update both `lib/admin.ts` and the SQL function.

## Realtime

Tables attached to the `supabase_realtime` publication:

- `public.profiles`
- `public.user_profiles`
- `public.complaints`
- `public.notifications`
- `public.house_addresses`

These are the tables the client subscribes to via
`supabase.channel(...).on('postgres_changes', ...)` in
`components/ProfilesProvider.tsx` and `components/NotificationsProvider.tsx`.

## Storage

Bucket `profile-media` is public-readable. Object paths follow the
convention `<folder>/<userId>-<timestamp>.<ext>` where `folder` is one of:

- `avatars` — profile pictures (max 300 KB after `lib/media.ts` compression)
- `documents` — certificates / diplomas

The `profile-media owner write` policy enforces both the folder allowlist
and that the second path segment starts with the authenticated user id, so
users cannot overwrite each other's files.

## Migrations as code review

When a PR changes `lib/profile-db.ts`, `lib/profile-filters.ts`, or any
component that reads from Supabase:

1. Add a new numbered migration to `supabase/migrations/` with a
   timestamp **after** the latest existing one.
2. Update the schema overview table in this README.
3. Run `supabase db push` against a staging project before merging.

## Useful queries

```sql
-- Monthly donation totals
select * from v_current_donations;

-- Top-rated specialists in catalog
select full_name, profession_title, rating, review_count
from v_public_profiles
where is_specialist
order by rating desc, review_count desc
limit 20;

-- Open complaints awaiting moderation
select c.*, p.full_name as profile_name, u.email as reporter_email
from complaints c
join profiles p on p.id = c.profile_id
join user_profiles u on u.id = c.author_id
where c.status = 'open'
order by c.created_at desc;
```
