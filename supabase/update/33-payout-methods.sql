-- =============================================================================
-- Даймохк — обновление 33
-- Реквизиты для получения оплаты и способ оплаты задания.
--
-- Почему НЕ эквайринг и не эскроу
-- -------------------------------
-- Правообладатель — ИП на НПД. По ст. 4 ч. 2 п. 5 закона 422-ФЗ
-- плательщик НПД не вправе действовать в интересах других лиц по
-- агентским договорам, поручению и комиссии. Приём денег заказчика на
-- свой счёт с последующей передачей исполнителю — ровно это, и оно
-- лишает права на НПД.
--
-- Поэтому сервис ДЕНЕГ НЕ КАСАЕТСЯ: он лишь показывает заказчику
-- реквизиты исполнителя, а перевод идёт напрямую между людьми. Отсюда
-- и отсутствие комиссии.
--
-- Приватность реквизитов
-- ----------------------
-- Номер телефона и карта — чувствительные данные: по ним работают
-- схемы «верните ошибочный перевод». Поэтому таблица закрыта RLS
-- «только владелец», а заказчику они отдаются ТОЛЬКО сервером и
-- ТОЛЬКО после одобрения отклика (см. /api/tasks/[id]/payout).
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

-- ---------------------------------------------------------------------------
-- 1. Реквизиты исполнителя
-- ---------------------------------------------------------------------------
create table if not exists public.payout_methods (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,

  -- СБП: номер телефона и банк получателя. Банк нужен, потому что один
  -- номер может быть привязан к нескольким банкам, и отправитель должен
  -- знать, какой выбрать.
  sbp_phone text not null default '',
  sbp_bank  text not null default '',

  -- Карта. Храним как ввёл пользователь (16–19 цифр), нормализуя пробелы.
  -- Это НЕ платёжные данные в смысле PCI DSS: мы ничего не списываем,
  -- CVV и срок не спрашиваем — только номер для перевода.
  card_number text not null default '',
  card_bank   text not null default '',

  -- Кошелёк ЮMoney: 11–16 цифр.
  yoomoney_wallet text not null default '',

  updated_at timestamptz not null default now()
);

comment on table public.payout_methods is
  'Реквизиты для прямых переводов между жителями. Сервис в расчётах не '
  'участвует (ИП на НПД, ст. 4 ч. 2 п. 5 422-ФЗ). Отдаются заказчику '
  'только после одобрения отклика.';

-- Длины проверяем, а формат — на входе в API: тут важно не пустить
-- «простыню» в поле, а осмысленность проверит сервер.
alter table public.payout_methods
  drop constraint if exists payout_methods_lengths;
alter table public.payout_methods
  add constraint payout_methods_lengths check (
    char_length(sbp_phone) <= 20
    and char_length(sbp_bank) <= 60
    and char_length(card_number) <= 25
    and char_length(card_bank) <= 60
    and char_length(yoomoney_wallet) <= 20
  );

drop trigger if exists trg_payout_methods_updated on public.payout_methods;
create trigger trg_payout_methods_updated
  before update on public.payout_methods
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS: строка видна и меняется ТОЛЬКО владельцем
--
-- Заказчик получает реквизиты не отсюда, а через серверный эндпоинт с
-- service role — он сначала проверяет, что отклик одобрен.
-- ---------------------------------------------------------------------------
alter table public.payout_methods enable row level security;

drop policy if exists "payout self select" on public.payout_methods;
create policy "payout self select"
  on public.payout_methods for select
  using (auth.uid()::text = user_id::text);

drop policy if exists "payout self upsert" on public.payout_methods;
create policy "payout self upsert"
  on public.payout_methods for insert
  with check (auth.uid()::text = user_id::text);

drop policy if exists "payout self update" on public.payout_methods;
create policy "payout self update"
  on public.payout_methods for update
  using (auth.uid()::text = user_id::text)
  with check (auth.uid()::text = user_id::text);

drop policy if exists "payout self delete" on public.payout_methods;
create policy "payout self delete"
  on public.payout_methods for delete
  using (auth.uid()::text = user_id::text);

-- ---------------------------------------------------------------------------
-- 3. Способ оплаты у задания
--
-- 'cash' — наличными при встрече (по умолчанию: в селе это основной
-- способ, и он не требует никаких реквизитов).
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists payment_method text not null default 'cash';

alter table public.tasks
  drop constraint if exists tasks_payment_method_known;
alter table public.tasks
  add constraint tasks_payment_method_known
  check (payment_method in ('cash', 'sbp', 'card', 'yoomoney'));

comment on column public.tasks.payment_method is
  'Как заказчик расплатится: наличные, СБП, карта или ЮMoney. '
  'Сервис перевод не проводит — только показывает реквизиты.';

-- ---------------------------------------------------------------------------
-- 4. Готово
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'Обновление 33 применено: payout_methods и tasks.payment_method готовы.';
end $$;
