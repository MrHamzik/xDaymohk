# Supabase — ручная работа, без CLI

В папке только SQL-скрипты, которые вы вставляете вручную в
**Supabase Dashboard → SQL Editor**. Никаких конфигов CLI, команд и
утилит не требуется.

| Файл | Назначение |
|---|---|
| `schema.sql` | Полная схема с нуля: функции, таблицы, RLS, вьюхи, триггеры, storage, GRANT-ы. Идемпотентен. |
| `seed.sql` | Стартовые данные (сейчас пусто — адресная книга наполняется админом). |
| `legacy-update.sql` | Разовое обновление старых проектов: «Самашки» → «Даймохк» в данных. |

## Установка с нуля (новый проект)

1. Создайте проект в Supabase.
2. Откройте **SQL Editor** и вставьте целиком содержимое `supabase/schema.sql`, запустите.
3. Включите Google OAuth в Authentication → Providers.
4. В `lib/admin.ts` и в функции `is_admin_email()` внутри `schema.sql`
   держите одинаковый список админов.

## Обновление существующего проекта (с данными)

1. Схема уже есть — ничего пересоздавать не нужно.
2. Вставьте в SQL Editor `supabase/legacy-update.sql` — обновит старые
   данные («Самашки» → «Даймохк»).
3. Новые объекты из будущих версий `schema.sql` применяйте точечно
   (например, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

## Структура БД

```
auth.users                        (Supabase managed)
   └── public.user_profiles      (1:1, метаданные аккаунта)
          └── public.profiles    (1:N, анкеты: личная карточка + специалисты)
                 ├── public.certificates            (1:N)
                 ├── public.reviews                 (1:N)
                 ├── public.profile_questions       (1:N, вопросы)
                 │        └── public.profile_question_comments (обсуждение)
                 └── public.complaints              (1:N, жалобы)

public.notifications             (уведомления)
public.house_addresses           (адресная книга, наполняется админом)
public.donations                 (реестр пожертвований CloudTips)
public.project_support           (месячный прогресс сборов)
storage.objects / 'profile-media' (аватары + документы)
```

## RLS-сводка

| Таблица | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `user_profiles` | self, admin | self | self, admin | — |
| `profiles` | public (не скрытые/бан), owner, admin | owner | owner, admin | owner (не личная), admin |
| `certificates` | public | owner, admin | owner, admin | owner, admin |
| `reviews` | public | author (через API) | — | author, admin, владелец анкеты |
| `profile_questions` | public | — (через API) | — | author, admin, владелец анкеты |
| `profile_question_comments` | public | — (через API) | — | author, admin, владелец анкеты |
| `complaints` | author, admin | author | admin | — |
| `house_addresses` | public | admin | admin | admin |
| `notifications` | recipient | admin, self | recipient | — |
| `donations` / `project_support` | public | service_role | service_role | — |

## Вьюхи

| Вьюха | Что отдаёт |
|---|---|
| `v_user_display` | Публичный справочник id / full_name / avatar_url (для живых имён авторов) |
| `v_reviews` | Отзывы с живым именем/аватаром автора |
| `v_profile_questions` | Вопросы + `comment_count` |
| `v_question_comments` | Комментарии обсуждения + `reply_to`-автор |
| `v_users_with_profile_count` | Пользователи со счётчиком анкет (админ-панель) |
