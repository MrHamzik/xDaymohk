-- =============================================================================
-- Даймохк — обновление 01
-- Населённый пункт: «Самашки» → «Даймохк»
-- Запускать ОДИН файл за раз в SQL Editor. Перед запуском: закройте другие
-- вкладки SQL Editor и остановите dev-сервер / приложение (они держат
-- read-локи на таблицы). Если упрётся в lock — просто повторите.
-- =============================================================================
set lock_timeout = '5s';

update public.user_profiles
   set settlement = 'Даймохк'
 where settlement = 'Самашки';

update public.profiles
   set settlement = 'Даймохк'
 where settlement = 'Самашки';

update public.profiles
   set bio = 'Житель Даймохк. Личная анкета.'
 where bio = 'Житель Самашек. Личная анкета.'
    or bio = 'Житель Самашек.';

update public.profiles
   set workplace_address = 'Даймохк'
 where workplace_address = 'Самашки';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'author'
  ) then
    update public.reviews set author = 'Житель Даймохка' where author = 'Житель Самашек';
  end if;
end $$;

reset lock_timeout;
