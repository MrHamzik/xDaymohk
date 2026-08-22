-- =============================================================================
-- Даймохк — обновление 74: закреплённые блоки главной страницы
-- -----------------------------------------------------------------------------
-- Продолжение «скрепки» (обновление 73): администрация выбирает из
-- предложенного и закрепляет анкеты/задания на главной. Закреплённые
-- блоки показываются на вкладке «Главная» под баннером.
--
-- Пишет только сервер от имени администратора; публика читает через
-- RLS. Скрытые/забаненные анкеты отсеиваются на клиенте (как весь
-- каталог), а не здесь — вьюха одна на всех.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_profiles')
    then raise exception 'Нет таблицы user_profiles — сначала примените schema.sql'; end if;
end $$;

create table if not exists public.home_pinned (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  -- Кто закрепил — для журнала в админке.
  pinned_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint home_pinned_target_known
    check (target_type in ('profile', 'task')),
  constraint home_pinned_once
    unique (target_type, target_id)
);

comment on table public.home_pinned is
  'Закреплённые администрацией анкеты/задания для блоков на главной. '
  'Порядок — по времени закрепления.';

-- Читать могут все (главная показывается и гостям), писать — только
-- администраторы.
alter table public.home_pinned enable row level security;

drop policy if exists "home pinned public read" on public.home_pinned;
create policy "home pinned public read"
  on public.home_pinned for select
  using (true);

drop policy if exists "home pinned admin write" on public.home_pinned;
create policy "home pinned admin write"
  on public.home_pinned for insert
  with check (is_admin_email());

drop policy if exists "home pinned admin delete" on public.home_pinned;
create policy "home pinned admin delete"
  on public.home_pinned for delete
  using (is_admin_email());

-- Права на таблицу: чтение — всем (главную видят и гости), запись —
-- через сервисную роль сервера (эндпоинт проверяет админа сам).
grant select on public.home_pinned to anon, authenticated;
