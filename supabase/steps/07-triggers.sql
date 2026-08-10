-- =============================================================================
-- Step 07 / 07 — Counter triggers
-- (rating / review_count on profiles, profile_count on user_profiles)
-- =============================================================================
-- Paste into SQL Editor and Run LAST, after all tables exist.
-- If this step is the one that errors with "uuid = text", please share
-- the exact error message + line number.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- reviews -> profiles.rating / profiles.review_count
-- ---------------------------------------------------------------------------
create or replace function public.recompute_profile_rating(target_id text)
returns void
language sql
security definer
set search_path = public
as $$
  -- profiles.id is text (e.g. 'personal-<uuid>'), so this works as-is.
  update public.profiles
     set rating = coalesce((select round(avg(rating)::numeric, 1)
                            from public.reviews where profile_id = target_id), 0),
         review_count = (select count(*) from public.reviews where profile_id = target_id),
         updated_at = now()
   where id = target_id;
$$;

revoke all on function public.recompute_profile_rating(text) from public;
grant execute on function public.recompute_profile_rating(text) to authenticated, service_role;

create or replace function public.trg_recompute_rating()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_profile_rating(old.profile_id);
    return old;
  else
    perform public.recompute_profile_rating(new.profile_id);
    if (tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id) then
      perform public.recompute_profile_rating(old.profile_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_reviews_after_insert on public.reviews;
create trigger trg_reviews_after_insert
  after insert on public.reviews
  for each row execute function public.trg_recompute_rating();

drop trigger if exists trg_reviews_after_update on public.reviews;
create trigger trg_reviews_after_update
  after update on public.reviews
  for each row execute function public.trg_recompute_rating();

drop trigger if exists trg_reviews_after_delete on public.reviews;
create trigger trg_reviews_after_delete
  after delete on public.reviews
  for each row execute function public.trg_recompute_rating();

-- ---------------------------------------------------------------------------
-- profiles -> user_profiles.profile_count
-- ---------------------------------------------------------------------------
create or replace function public.recompute_user_profile_count(target_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  -- user_profiles.id may be text on this Supabase project. profiles.owner_id
  -- is uuid, so we cast user_profiles.id to uuid for the comparison.
  update public.user_profiles
     set profile_count = (select count(*) from public.profiles where owner_id = target_user)
   where id::uuid = target_user;
$$;

revoke all on function public.recompute_user_profile_count(uuid) from public;
grant execute on function public.recompute_user_profile_count(uuid) to authenticated, service_role;

create or replace function public.trg_recompute_user_count()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    if (old.owner_id is not null) then
      perform public.recompute_user_profile_count(old.owner_id);
    end if;
    return old;
  else
    if (new.owner_id is not null) then
      perform public.recompute_user_profile_count(new.owner_id);
    end if;
    if (tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id and old.owner_id is not null) then
      perform public.recompute_user_profile_count(old.owner_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_profiles_after_insert on public.profiles;
create trigger trg_profiles_after_insert
  after insert on public.profiles
  for each row execute function public.trg_recompute_user_count();

drop trigger if exists trg_profiles_after_update on public.profiles;
create trigger trg_profiles_after_update
  after update on public.profiles
  for each row execute function public.trg_recompute_user_count();

drop trigger if exists trg_profiles_after_delete on public.profiles;
create trigger trg_profiles_after_delete
  after delete on public.profiles
  for each row execute function public.trg_recompute_user_count();
