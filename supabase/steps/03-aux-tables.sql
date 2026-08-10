-- =============================================================================
-- Step 03 / 07 — Auxiliary tables
-- (house_addresses, notifications, donations, project_support)
-- =============================================================================
-- Paste into SQL Editor and Run.
-- After this step you should have 9 tables total.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- house_addresses — admin-managed Samashki address book
-- ---------------------------------------------------------------------------
create table if not exists public.house_addresses (
  id             text primary key,
  street         text not null,
  house_number   text not null default '',
  full_address   text not null,
  lat            numeric(10,7) not null,
  lng            numeric(10,7) not null,
  postal_code    text not null default '366602',
  is_not_house   boolean not null default false,
  category       text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_house_addresses_street on public.house_addresses (street);
create index if not exists idx_house_addresses_category on public.house_addresses (category);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id            text primary key,
  recipient_id  uuid not null references public.user_profiles(id) on delete cascade,
  type          text not null default 'system'
    check (type in ('system', 'profile_hidden', 'profile_visible', 'user_blocked', 'user_unblocked')),
  title         text not null default 'Уведомление',
  message       text not null default '',
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (recipient_id) where not is_read;

-- ---------------------------------------------------------------------------
-- donations — CloudTips ledger (idempotent by operation_id)
-- ---------------------------------------------------------------------------
create table if not exists public.donations (
  operation_id  text primary key,
  amount        numeric(12,2) not null check (amount > 0),
  currency      text not null default 'RUB',
  sender        text,
  label         text,
  received_at   timestamptz not null,
  raw_payload   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_donations_received_at on public.donations (received_at);

-- ---------------------------------------------------------------------------
-- project_support — aggregated monthly donation progress
-- ---------------------------------------------------------------------------
create table if not exists public.project_support (
  month_key        text primary key, -- e.g. '2026-08'
  collected_rub    numeric(12,2) not null default 0,
  other_costs_rub  numeric(12,2) not null default 500,
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_project_support_updated on public.project_support;
create trigger trg_project_support_updated
  before update on public.project_support
  for each row execute function public.touch_updated_at();
