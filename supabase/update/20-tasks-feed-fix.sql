-- =============================================================================
-- Даймохк — обновление 20
-- ИСПРАВЛЕНИЕ: задания создаются, но не видны в ленте.
--
-- Причина
-- -------
-- Вьюха v_tasks_feed была создана с security_invoker = true, то есть RLS
-- применяется от имени ЧИТАЮЩЕГО. Внутри вьюхи есть
--     join public.user_profiles u on u.id = t.author_id
-- а политика «user_profiles self select» разрешает читать ТОЛЬКО свою
-- строку:
--     using (auth.uid()::text = id::text or is_admin_email())
--
-- В результате JOIN отбрасывал все задания, кроме собственных (а для
-- анонимного клиента — вообще все). Лента приходила пустой: задание в
-- таблице есть, но вьюха его не отдаёт.
--
-- Решение
-- -------
-- Тот же приём, что уже применён в схеме для v_user_display:
-- security_invoker = false (вьюха выполняется с правами владельца), а
-- видимость самих заданий ограничиваем ВНУТРИ вьюхи условием
--     where not t.is_archived
-- Так публикуются только неархивные задания и только безопасные поля
-- автора (имя, аватар, рейтинг, счётчики) — ровно те, что и так
-- показываются в шапке карточки. Приватные данные (email, телефон,
-- is_blocked, дата рождения) во вьюху не попадают.
--
-- Свои архивные задания автор видит через отдельный роут
-- /api/tasks/mine, который работает под service role после проверки JWT.
--
-- Идемпотентно, можно перезапускать.
-- =============================================================================
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'tasks')
    then raise exception 'Нет таблицы public.tasks — сначала примените 18-tasks.sql'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Пересоздаём вьюху ленты
-- ---------------------------------------------------------------------------
drop view if exists public.v_tasks_feed;

create view public.v_tasks_feed
-- ВАЖНО: false, а не true. С true JOIN к user_profiles резался политикой
-- «self select» и лента всегда была пустой.
with (security_invoker = false)
as
select
  t.id,
  t.author_id,
  t.is_paid,
  t.kind,
  t.title,
  t.description,
  t.category,
  t.reward,
  t.priority,
  t.slots,
  t.deadline_at,
  t.scheduled_at,
  t.address,
  t.lat,
  t.lng,
  t.min_rating,
  t.min_account_days,
  t.min_tasks_done,
  t.allow_newcomers,
  t.status,
  t.payment_status,
  t.submitted_at,
  t.completed_at,
  t.cancelled_at,
  t.cancel_reason,
  t.is_archived,
  t.created_at,
  t.updated_at,
  -- Публичные данные заказчика для шапки карточки. Ничего приватного:
  -- email, телефон, is_blocked и дата рождения сюда не попадают.
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
-- Фильтр видимости внутри вьюхи заменяет RLS, отключённый вместе с
-- security_invoker: наружу уходят только неархивные задания.
where not t.is_archived;

grant select on public.v_tasks_feed to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1b. Карточка одного задания — БЕЗ фильтра архива.
--     v_tasks_feed скрывает архивные (это лента), но карточку
--     завершённого задания открывать нужно: по нему стороны ставят
--     взаимные оценки, и в уведомлении «Оцените заказчика» ссылка ведёт
--     именно туда. Иначе после закрытия сделки задание становится
--     недоступно и оценку поставить невозможно.
-- ---------------------------------------------------------------------------
drop view if exists public.v_task_details;

create view public.v_task_details
with (security_invoker = false)
as
select
  t.id,
  t.author_id,
  t.is_paid,
  t.kind,
  t.title,
  t.description,
  t.category,
  t.reward,
  t.priority,
  t.slots,
  t.deadline_at,
  t.scheduled_at,
  t.address,
  t.lat,
  t.lng,
  t.min_rating,
  t.min_account_days,
  t.min_tasks_done,
  t.allow_newcomers,
  t.status,
  t.payment_status,
  t.submitted_at,
  t.completed_at,
  t.cancelled_at,
  t.cancel_reason,
  t.is_archived,
  t.created_at,
  t.updated_at,
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
-- 2. Публичный справочник участников
--    Карточка задания показывает, кто его взял (имя, аватар, рейтинг).
--    Прямой JOIN task_participants → user_profiles от анонимного клиента
--    упирался в ту же политику «self select», поэтому имена исполнителей
--    не отображались. Отдаём их через отдельную вьюху с теми же
--    публичными полями.
-- ---------------------------------------------------------------------------
drop view if exists public.v_task_participants;

create view public.v_task_participants
with (security_invoker = false)
as
select
  p.id,
  p.task_id,
  p.user_id,
  p.status,
  p.attended,
  p.bonus_percent,
  p.joined_at,
  p.excluded_at,
  u.full_name        as full_name,
  u.avatar_url       as avatar_url,
  u.resident_rating  as rating,
  u.tasks_done_count as tasks_done_count,
  greatest(0, extract(day from now() - u.created_at)::int) as account_days
from public.task_participants p
join public.user_profiles u on u.id = p.user_id;

grant select on public.v_task_participants to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Публичные отзывы о жителях (с именем автора)
--    Та же проблема: resident_reviews → user_profiles через anon-клиент.
-- ---------------------------------------------------------------------------
drop view if exists public.v_resident_reviews;

create view public.v_resident_reviews
with (security_invoker = false)
as
select
  r.id,
  r.task_id,
  r.target_id,
  r.author_id,
  r.target_role,
  r.rating,
  r.text,
  r.created_at,
  u.full_name  as author_name,
  u.avatar_url as author_avatar_url
from public.resident_reviews r
left join public.user_profiles u on u.id = r.author_id;

grant select on public.v_resident_reviews to anon, authenticated;

-- =============================================================================
-- Проверка (должно вернуть ваши задания, а не 0 строк):
--   select id, title, status, author_name from public.v_tasks_feed;
--   select count(*) from public.tasks;              -- сколько всего в таблице
--   select count(*) from public.v_tasks_feed;       -- сколько видно в ленте
-- Если первое число больше второго — разница это архивные (завершённые,
-- отменённые, просроченные) задания, так и задумано.
-- =============================================================================
