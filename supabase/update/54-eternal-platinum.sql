-- Вечный Platinum для владельца проекта.

update public.user_settings
set pro_tier = 'platinum'
where user_id in (
  select id from auth.users where lower(email) = 'mr.hamzik1026@gmail.com'
);

insert into public.user_settings (user_id, pro_tier)
select id, 'platinum'
from auth.users
where lower(email) = 'mr.hamzik1026@gmail.com'
  and not exists (
    select 1 from public.user_settings as settings
    where settings.user_id = auth.users.id
  );
