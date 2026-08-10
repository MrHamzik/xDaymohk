-- =============================================================================
-- Step 04 / 07 — Storage bucket + enable RLS on all tables
-- =============================================================================
-- Paste into SQL Editor and Run.
-- This step does NOT yet define policies — that is step 05.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage: profile-media bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS on all tables (policies come in step 05)
-- ---------------------------------------------------------------------------
alter table public.user_profiles   enable row level security;
alter table public.profiles         enable row level security;
alter table public.certificates     enable row level security;
alter table public.reviews          enable row level security;
alter table public.complaints       enable row level security;
alter table public.house_addresses  enable row level security;
alter table public.notifications    enable row level security;
alter table public.donations        enable row level security;
alter table public.project_support  enable row level security;
