-- =============================================================================
-- 20260101000200_realtime.sql
-- Enable Supabase Realtime (logical replication) for the tables the client
-- subscribes to in components/ProfilesProvider.tsx and NotificationsProvider.
--
-- Without these the `postgres_changes` channels in the client are silent.
-- =============================================================================

-- Required for Supabase Realtime: add the table to the publication used
-- by the realtime WebSocket. Supabase creates `supabase_realtime` on every
-- project; we attach the public tables to it.
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.user_profiles;
alter publication supabase_realtime add table public.complaints;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.house_addresses;
