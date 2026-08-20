-- ============================================================================
-- 58. profiles.created_at: date -> timestamptz (каталог перестаёт тасовать анкеты)
-- ============================================================================
--
-- Что было. В живой базе public.profiles.created_at объявлена как date со
-- значением по умолчанию CURRENT_DATE — то есть время создания не
-- сохранялось вообще. У всех анкет, заведённых в один день, значение
-- получалось буквально одинаковым.
--
-- Чем это плохо. Каталог сортируется именно по этой колонке
-- (lib/profiles/load.ts: order('created_at', desc)). Когда значения
-- равны, Postgres НЕ обязан возвращать строки в одном и том же порядке:
-- план может измениться, строка после update физически переезжает в
-- конец таблицы. Человек листает каталог, подгружается следующая
-- страница — и часть анкет показывается второй раз, а часть
-- пропускается.
--
-- Косвенное подтверждение, что это недосмотр, а не замысел: соседняя
-- колонка updated_at в той же таблице — честный timestamptz, и
-- schema.sql всё это время объявлял created_at тоже как timestamptz.
--
-- ---------------------------------------------------------------------------
-- ПОЧЕМУ ПЕРВАЯ ВЕРСИЯ ЭТОГО ФАЙЛА УПАЛА
-- ---------------------------------------------------------------------------
-- ERROR: cannot alter type of a column used by a view or rule
-- DETAIL: rule _RETURN on view v_public_profiles depends on column "created_at"
--
-- Postgres не позволяет менять тип колонки, на которую смотрит вьюха:
-- у вьюхи типы колонок зафиксированы в момент создания.
--
-- Отдельная сложность: v_public_profiles НЕ описана ни в одной миграции
-- этого репозитория и не встречается в коде приложения — её создали
-- прямо в базе. Значит написать «drop view v_public_profiles; ...;
-- create view v_public_profiles as ...» нельзя: её исходного текста
-- здесь просто нет, и мы бы её потеряли.
--
-- Поэтому миграция не хардкодит список вьюх, а работает так:
--   1. находит ВСЕ вьюхи, которые прямо или косвенно зависят от
--      public.profiles (рекурсивно, вьюха поверх вьюхи тоже найдётся);
--   2. сохраняет их определения (pg_get_viewdef), настройки
--      (security_invoker и прочее), комментарии и выданные права;
--   3. удаляет их, меняет тип колонки и восстанавливает всё обратно
--      в правильном порядке.
--
-- Так переживают миграцию и v_profiles из update/47, и неизвестная
-- v_public_profiles, и любая вьюха, которую добавят позже.
--
-- Права восстанавливаются ровно те, что были: список читается из
-- pg_class.relacl до удаления. Это важно для безопасности — молча
-- выдать лишний grant при восстановлении нельзя.
--
-- Всё в одной транзакции: если что-то пойдёт не так, база останется в
-- исходном состоянии, без «половины вьюх».
--
-- Идемпотентно: если тип уже timestamptz, вьюхи не трогаются вовсе.
-- ============================================================================

set lock_timeout = '10s';

do $$
declare
  v_type      text;
  v_saved     jsonb := '[]'::jsonb;
  v_item      jsonb;
  v_rec       record;
  v_sql       text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name  = 'created_at';

  if v_type is null then
    raise exception 'public.profiles.created_at не найдена';
  end if;

  if v_type <> 'date' then
    raise notice 'profiles.created_at уже %, миграция не нужна', v_type;
    return;
  end if;

  -- -------------------------------------------------------------------
  -- 1. Собираем зависимые вьюхи вместе со всем их «обвесом».
  --
  -- Порядок важен: вьюху, стоящую поверх другой вьюхи, надо удалить
  -- раньше, а создать позже. depth считает уровень вложенности.
  -- -------------------------------------------------------------------
  for v_rec in
    with recursive deps as (
      -- уровень 1: вьюхи, читающие саму таблицу profiles
      select distinct
             c.oid,
             1 as depth
        from pg_depend      d
        join pg_rewrite     r  on r.oid = d.objid
        join pg_class       c  on c.oid = r.ev_class
        join pg_class       src on src.oid = d.refobjid
        join pg_namespace   n  on n.oid = src.relnamespace
       where d.classid   = 'pg_rewrite'::regclass
         and d.refclassid = 'pg_class'::regclass
         and n.nspname   = 'public'
         and src.relname = 'profiles'
         and c.relkind in ('v', 'm')
         and c.oid <> src.oid

      union all

      -- уровень N+1: вьюхи поверх уже найденных вьюх
      select distinct
             c.oid,
             deps.depth + 1
        from deps
        join pg_depend  d  on d.refobjid = deps.oid
        join pg_rewrite r  on r.oid = d.objid
        join pg_class   c  on c.oid = r.ev_class
       where d.classid    = 'pg_rewrite'::regclass
         and d.refclassid = 'pg_class'::regclass
         and c.relkind in ('v', 'm')
         and c.oid <> deps.oid
    )
    select cls.oid,
           n.nspname                      as schema_name,
           cls.relname                    as view_name,
           cls.relkind                    as kind,
           max(deps.depth)                as depth,
           pg_get_viewdef(cls.oid, true)  as definition,
           cls.reloptions                 as options,
           obj_description(cls.oid, 'pg_class') as comment_text,
           cls.relacl                     as acl
      from deps
      join pg_class     cls on cls.oid = deps.oid
      join pg_namespace n   on n.oid = cls.relnamespace
     group by cls.oid, n.nspname, cls.relname, cls.relkind,
              cls.reloptions, cls.relacl
     order by max(deps.depth) desc
  loop
    v_saved := v_saved || jsonb_build_object(
      'schema',     v_rec.schema_name,
      'name',       v_rec.view_name,
      'kind',       v_rec.kind,
      'depth',      v_rec.depth,
      'definition', v_rec.definition,
      'options',    to_jsonb(coalesce(v_rec.options, array[]::text[])),
      'comment',    v_rec.comment_text,
      'grants',     (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'grantee',  case when a.grantee = 0 then 'PUBLIC'
                                  else pg_get_userbyid(a.grantee) end,
                 'priv',     a.privilege_type)), '[]'::jsonb)
          from aclexplode(v_rec.acl) a
      )
    );

    raise notice 'сохраняю вьюху %.% (уровень %)',
      v_rec.schema_name, v_rec.view_name, v_rec.depth;
  end loop;

  -- -------------------------------------------------------------------
  -- 2. Удаляем вьюхи — от самых внешних к самым внутренним.
  -- -------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(v_saved)
  loop
    execute format('drop %s if exists %I.%I',
      case when v_item->>'kind' = 'm' then 'materialized view' else 'view' end,
      v_item->>'schema', v_item->>'name');
  end loop;

  -- -------------------------------------------------------------------
  -- 3. Собственно смена типа.
  --
  -- Дата сохраняется, добавляется время 00:00 по часовому поясу сервера.
  -- Точнее уже не восстановить: в старых строках времени никогда и не
  -- было. Порядок для них закреплён вторым ключом сортировки (id) на
  -- стороне приложения — см. lib/profiles/load.ts.
  -- -------------------------------------------------------------------
  alter table public.profiles alter column created_at drop default;
  alter table public.profiles alter column created_at type timestamptz
    using created_at::timestamptz;
  alter table public.profiles alter column created_at set default now();
  alter table public.profiles alter column created_at set not null;

  raise notice 'profiles.created_at: date -> timestamptz';

  -- -------------------------------------------------------------------
  -- 4. Возвращаем вьюхи — теперь от внутренних к внешним.
  -- -------------------------------------------------------------------
  for v_item in
    select value
      from jsonb_array_elements(v_saved) with ordinality t(value, ord)
     order by (value->>'depth')::int asc, ord asc
  loop
    v_sql := format('create %s %I.%I',
      case when v_item->>'kind' = 'm' then 'materialized view' else 'view' end,
      v_item->>'schema', v_item->>'name');

    -- Настройки вьюхи (в первую очередь security_invoker = true, без
    -- которого вьюха начала бы обходить RLS таблицы profiles).
    if jsonb_array_length(v_item->'options') > 0 then
      v_sql := v_sql || ' with (' || (
        select string_agg(opt, ', ')
          from jsonb_array_elements_text(v_item->'options') as o(opt)
      ) || ')';
    end if;

    v_sql := v_sql || ' as ' || (v_item->>'definition');
    execute v_sql;

    if v_item->>'comment' is not null then
      execute format('comment on view %I.%I is %L',
        v_item->>'schema', v_item->>'name', v_item->>'comment');
    end if;

    -- Права возвращаем ровно те, что были сняты выше.
    for v_rec in
      select value->>'grantee' as grantee, value->>'priv' as priv
        from jsonb_array_elements(v_item->'grants')
    loop
      execute format('grant %s on %I.%I to %s',
        v_rec.priv,
        v_item->>'schema', v_item->>'name',
        case when v_rec.grantee = 'PUBLIC' then 'public'
             else quote_ident(v_rec.grantee) end);
    end loop;

    raise notice 'восстановлена вьюха %.%', v_item->>'schema', v_item->>'name';
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Индексы сортировки каталога — под новый тип колонки.
-- ---------------------------------------------------------------------------
drop index if exists public.idx_profiles_created_at;
create index if not exists idx_profiles_created_at
  on public.profiles (created_at desc);

-- Составной индекс под фактический порядок каталога: created_at desc, id desc.
-- Без него второй ключ сортировки заставлял бы Postgres досортировывать
-- результат в памяти на каждой странице.
create index if not exists idx_profiles_created_at_id
  on public.profiles (created_at desc, id desc);

comment on column public.profiles.created_at is
  'Момент создания анкеты. timestamptz, а не date: каталог сортируется по '
  'этой колонке, и без времени анкеты одного дня меняли порядок между '
  'запросами (дубли и пропуски при листании).';

notify pgrst, 'reload schema';

reset lock_timeout;
