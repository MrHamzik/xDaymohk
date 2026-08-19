-- =============================================================================
-- Даймохк — обновление 36
-- Вьюхи заданий: способ оплаты и поля спора.
--
-- Что было сломано
-- ----------------
-- v_tasks_feed и v_task_details перечисляют колонки ЯВНО (обновление 21).
-- Колонки, добавленные позже, во вьюху не попадали:
--   • payment_method (обновление 33) — карточка всегда показывала
--     «Наличными», какой бы способ ни выбрал заказчик, и фильтр по
--     способу оплаты не находил ничего;
--   • dispute_until, dispute_reason (обновление 35) — блок спора в
--     карточке не отображался, а клиент не знал про заморозку.
--
-- Почему это повторится
-- ---------------------
-- Любая новая колонка tasks требует пересоздания обеих вьюх. Явный
-- список безопаснее `select t.*` (случайное поле не утечёт наружу), но
-- о нём легко забыть. Поэтому здесь оставлен комментарий-напоминание.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tasks'
                   and column_name = 'payment_method')
    then raise exception 'Нет колонки tasks.payment_method — сначала примените 33-payout-methods.sql'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tasks'
                   and column_name = 'dispute_until')
    then raise exception 'Нет колонки tasks.dispute_until — сначала примените 35-task-dispute.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Лента заданий
--
-- ВНИМАНИЕ: при добавлении новой колонки в tasks её нужно дописать
-- И СЮДА, И в v_task_details ниже — иначе она не дойдёт до интерфейса.
-- ---------------------------------------------------------------------------
drop view if exists public.v_tasks_feed;

create view public.v_tasks_feed
with (security_invoker = false)
as
select
  t.id, t.author_id, t.is_paid, t.kind, t.title, t.description, t.category,
  t.reward, t.purchase_budget, t.priority, t.slots,
  t.deadline_at, t.scheduled_at, t.address, t.lat, t.lng,
  t.min_rating, t.min_account_days, t.min_tasks_done, t.allow_newcomers,
  t.status, t.payment_status, t.submitted_at, t.completed_at,
  t.cancelled_at, t.cancel_reason, t.is_archived, t.created_at, t.updated_at,
  -- Обновление 33
  t.payment_method,
  -- Обновление 35
  t.dispute_until, t.dispute_reason,
  u.full_name             as author_name,
  u.avatar_url            as author_avatar_url,
  u.resident_rating       as author_rating,
  u.resident_review_count as author_review_count,
  u.tasks_created_count   as author_tasks_created,
  greatest(0, extract(day from now() - u.created_at)::int) as author_account_days,
  (select count(*) from public.task_participants p
    where p.task_id = t.id and p.status in ('joined', 'attended', 'done')) as taken_slots
from public.tasks t
join public.user_profiles u on u.id = t.author_id
where not t.is_archived;

grant select on public.v_tasks_feed to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Карточка задания
-- ---------------------------------------------------------------------------
drop view if exists public.v_task_details;

create view public.v_task_details
with (security_invoker = false)
as
select
  t.id, t.author_id, t.is_paid, t.kind, t.title, t.description, t.category,
  t.reward, t.purchase_budget, t.priority, t.slots,
  t.deadline_at, t.scheduled_at, t.address, t.lat, t.lng,
  t.min_rating, t.min_account_days, t.min_tasks_done, t.allow_newcomers,
  t.status, t.payment_status, t.submitted_at, t.completed_at,
  t.cancelled_at, t.cancel_reason, t.is_archived, t.created_at, t.updated_at,
  t.payment_method,
  t.dispute_until, t.dispute_reason,
  u.full_name             as author_name,
  u.avatar_url            as author_avatar_url,
  u.resident_rating       as author_rating,
  u.resident_review_count as author_review_count,
  u.tasks_created_count   as author_tasks_created,
  greatest(0, extract(day from now() - u.created_at)::int) as author_account_days,
  (select count(*) from public.task_participants p
    where p.task_id = t.id and p.status in ('joined', 'attended', 'done')) as taken_slots
from public.tasks t
join public.user_profiles u on u.id = t.author_id;

grant select on public.v_task_details to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 36 применено: вьюхи отдают payment_method и поля спора.';
end $$;
