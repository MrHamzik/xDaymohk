-- =============================================================================
-- Даймохк — обновление 05
-- Вьюха v_users_with_profile_count
-- Запускать ОДИН файл за раз в SQL Editor. Перед запуском: закройте другие
-- вкладки SQL Editor и остановите dev-сервер / приложение (они держат
-- read-локи на таблицы). Если упрётся в lock — просто повторите.
-- =============================================================================
set lock_timeout = '5s';

create or replace view public.v_users_with_profile_count
  with (security_invoker = true) as
select
  u.id,
  u.email,
  u.full_name,
  u.avatar_url,
  u.is_admin,
  u.is_blocked,
  u.created_at,
  u.settlement,
  coalesce(c.profiles_total, 0) as profile_count,
  coalesce(c.hidden_total, 0)   as hidden_count
from public.user_profiles u
left join (
  select
    owner_id,
    count(*)                          as profiles_total,
    count(*) filter (where is_hidden or is_banned) as hidden_total
  from public.profiles
  where owner_id is not null
  group by owner_id
) c on c.owner_id = u.id;

notify pgrst, 'reload schema';

reset lock_timeout;
