-- =============================================================================
-- 61. Срок действия подписки (пункт 3 плана по п.20)
-- -----------------------------------------------------------------------------
-- ПРОБЛЕМА.
--
-- pro_tier бессрочный: выданный уровень остаётся навсегда. Подписка,
-- которая никогда не заканчивается, — это не подписка, а разовый
-- подарок. Продлевать её никто не станет.
--
-- РЕШЕНИЕ — то же, что уже работает у статуса «Темщик» (executor_status):
-- храним «оплачено до» и считаем ПРОТУХШИЙ уровень отсутствующим ПРИ
-- ЧТЕНИИ. Ноль фоновых задач: не нужен ни pg_cron, ни ночной обход всех
-- пользователей, ни рассинхрон между «в базе gold, а на деле истёк».
--
-- Почему не выключать по расписанию: задача, гасящая подписки, обязана
-- отработать вовремя на каждом пользователе. Если она упала ночью, утром
-- часть людей пользуется тем, за что не платит. Вычисление при чтении
-- не может «не сработать».
--
-- NULL в pro_until означает БЕССРОЧНО. Это нужно владельцу проекта и
-- ручной выдаче администратором — им срок не выставляем.
--
-- Запуск повторно безопасен.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Колонка срока.
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column if not exists pro_until timestamptz;

comment on column public.user_settings.pro_until is
  'Подписка оплачена до этого момента. NULL — бессрочно (владелец, выдача админом).';

-- Быстрый отбор истекающих подписок для будущих напоминаний об оплате.
create index if not exists idx_user_settings_pro_until
  on public.user_settings (pro_until)
  where pro_until is not null;

-- ---------------------------------------------------------------------------
-- 2. Действующий уровень с учётом срока.
--
--    Единственное место, где решается «активна ли подписка». И сервер, и
--    отчёты обязаны спрашивать здесь, а не сравнивать даты вручную:
--    иначе правило разъедется по копиям.
-- ---------------------------------------------------------------------------
create or replace function public.effective_pro_tier(
  tier text,
  until timestamptz
)
returns text
language sql
immutable
as $$
  select case
    when tier is null or tier = 'none' then 'none'
    -- NULL = бессрочно: уровень действует всегда.
    when until is null then tier
    when until > now() then tier
    else 'none'
  end;
$$;

comment on function public.effective_pro_tier(text, timestamptz) is
  'Уровень подписки с учётом срока: истёкший считается none. NULL в until — бессрочно.';

-- ---------------------------------------------------------------------------
-- 3. Защита нового поля.
--
--    Без этого дыра, закрытая миграцией 60, открылась бы снова с другой
--    стороны: уровень выдать нельзя, зато можно отодвинуть себе срок на
--    сто лет вперёд. Правило то же: менять срок вправе только сервер,
--    администратор и никто больше.
-- ---------------------------------------------------------------------------
create or replace function public.guard_pro_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_owner_email text;
  previous_tier text;
  previous_until timestamptz;
begin
  select lower(coalesce(email, '')) into row_owner_email
  from auth.users
  where id::text = new.user_id::text;

  -- Владелец проекта: платина навсегда и без срока.
  if row_owner_email = 'mr.hamzik1026@gmail.com' then
    new.pro_tier := 'platinum';
    new.pro_until := null;
    return new;
  end if;

  -- Сервер (service_role) и администраторы: оплата и ручная выдача.
  if auth.uid() is null or public.is_admin_email() then
    return new;
  end if;

  -- Остальные: и уровень, и срок остаются прежними.
  if tg_op = 'INSERT' then
    new.pro_tier := 'none';
    new.pro_until := null;
    return new;
  end if;

  select pro_tier, pro_until into previous_tier, previous_until
  from public.user_settings
  where user_id = new.user_id;

  new.pro_tier := coalesce(previous_tier, 'none');
  new.pro_until := previous_until;
  return new;
end;
$$;

comment on function public.guard_pro_tier() is
  'Не даёт пользователю выдать себе pro_tier или продлить pro_until; владельцу держит platinum.';

drop trigger if exists trg_guard_pro_tier on public.user_settings;
create trigger trg_guard_pro_tier
  before insert or update on public.user_settings
  for each row
  execute function public.guard_pro_tier();

-- ---------------------------------------------------------------------------
-- 4. Владельцу — платина без срока (на случай, если строка уже была).
-- ---------------------------------------------------------------------------
insert into public.user_settings (user_id, pro_tier, pro_until)
select id, 'platinum', null
from auth.users
where lower(coalesce(email, '')) = 'mr.hamzik1026@gmail.com'
on conflict (user_id) do update set pro_tier = 'platinum', pro_until = null;

-- ---------------------------------------------------------------------------
-- 5. Проверка глазами: кто и до какого числа платит.
--
--   select u.email, s.pro_tier, s.pro_until,
--          public.effective_pro_tier(s.pro_tier, s.pro_until) as active_tier
--   from public.user_settings s
--   join auth.users u on u.id = s.user_id
--   where s.pro_tier <> 'none';
-- ---------------------------------------------------------------------------
