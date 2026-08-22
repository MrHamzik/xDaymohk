[
  {
    "table_name": "certificates",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "certificates",
    "column_name": "profile_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "certificates",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "certificates",
    "column_name": "issuer",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "certificates",
    "column_name": "year",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "certificates",
    "column_name": "image_url",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "complaints",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "complaints",
    "column_name": "profile_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "complaints",
    "column_name": "author_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "complaints",
    "column_name": "author_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Пользователь'::text"
  },
  {
    "table_name": "complaints",
    "column_name": "reason",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "complaints",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'open'::text"
  },
  {
    "table_name": "complaints",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE"
  },
  {
    "table_name": "complaints",
    "column_name": "target_user_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "donations",
    "column_name": "operation_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "donations",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "donations",
    "column_name": "currency",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'643'::text"
  },
  {
    "table_name": "donations",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "donations",
    "column_name": "label",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "donations",
    "column_name": "received_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "donations",
    "column_name": "raw_payload",
    "data_type": "jsonb",
    "is_nullable": "NO",
    "column_default": "'{}'::jsonb"
  },
  {
    "table_name": "donations",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "house_addresses",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "street",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "house_number",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "full_address",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "postal_code",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'366602'::text"
  },
  {
    "table_name": "house_addresses",
    "column_name": "is_not_house",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "house_addresses",
    "column_name": "category",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "letter_log",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "letter_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "title_ru",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "title_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "message_ru",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "message_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "preset",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "color",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "icon",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "recipient_ids",
    "data_type": "ARRAY",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letter_log",
    "column_name": "count",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "letter_log",
    "column_name": "sent_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "letter_schedule",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "letter_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "run_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "processed",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "letter_schedule",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "letters",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "letters",
    "column_name": "key",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letters",
    "column_name": "letter_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'custom'::text"
  },
  {
    "table_name": "letters",
    "column_name": "title_ru",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "letters",
    "column_name": "title_ce",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "letters",
    "column_name": "message_ru",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "letters",
    "column_name": "message_ce",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "letters",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Даймохк'::text"
  },
  {
    "table_name": "letters",
    "column_name": "preset",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'green'::text"
  },
  {
    "table_name": "letters",
    "column_name": "color",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letters",
    "column_name": "icon",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'📩'::text"
  },
  {
    "table_name": "letters",
    "column_name": "recipients",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'all'::text"
  },
  {
    "table_name": "letters",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "letters",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "letters",
    "column_name": "schedule_enabled",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "letters",
    "column_name": "schedule_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "letters",
    "column_name": "schedule_repeat",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'once'::text"
  },
  {
    "table_name": "letters",
    "column_name": "schedule_days",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "1"
  },
  {
    "table_name": "letters",
    "column_name": "schedule_count",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "letters",
    "column_name": "schedule_sent",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "notifications",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "notifications",
    "column_name": "recipient_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "notifications",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'system'::text"
  },
  {
    "table_name": "notifications",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "notifications",
    "column_name": "message",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "notifications",
    "column_name": "is_read",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "notifications",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "notifications",
    "column_name": "title_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "notifications",
    "column_name": "message_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "notifications",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Даймохк'::text"
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "question_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "author_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "comment",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE"
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "reply_to_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "profile_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "author_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "question",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE"
  },
  {
    "table_name": "profiles",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "avatar_url",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "photos",
    "data_type": "jsonb",
    "is_nullable": "NO",
    "column_default": "'[]'::jsonb"
  },
  {
    "table_name": "profiles",
    "column_name": "is_specialist",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "profession_category",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "profession_title",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "bio",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "profiles",
    "column_name": "workplace_address",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "profiles",
    "column_name": "workplace_coords",
    "data_type": "jsonb",
    "is_nullable": "NO",
    "column_default": "'{\"lat\": 43.232, \"lng\": 45.078}'::jsonb"
  },
  {
    "table_name": "profiles",
    "column_name": "rating",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "profiles",
    "column_name": "review_count",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "profiles",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "profiles",
    "column_name": "hide_phone",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "is_verified",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "verification_status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'none'::text"
  },
  {
    "table_name": "profiles",
    "column_name": "is_admin",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "is_banned",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "telegram",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "whatsapp",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE"
  },
  {
    "table_name": "profiles",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "profiles",
    "column_name": "owner_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "experience",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "video_url",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "experience_start",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "experience_end",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "experience_current",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "is_hidden",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "same_as_phone_whatsapp",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "true"
  },
  {
    "table_name": "profiles",
    "column_name": "work_days",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": "'[\"Пн\", \"Вт\", \"Ср\", \"Чт\", \"Пт\", \"Сб\"]'::jsonb"
  },
  {
    "table_name": "profiles",
    "column_name": "work_hours_start",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "work_hours_end",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "break_start",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "break_end",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "is_flexible_schedule",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "profiles",
    "column_name": "gender",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "birth_date",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "settlement",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "birth_year",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "profiles",
    "column_name": "is_personal",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "project_support",
    "column_name": "month_key",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "project_support",
    "column_name": "collected_rub",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "project_support",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "project_support",
    "column_name": "other_costs_rub",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "500"
  },
  {
    "table_name": "reviews",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "reviews",
    "column_name": "profile_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "reviews",
    "column_name": "rating",
    "data_type": "smallint",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "reviews",
    "column_name": "text",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "reviews",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE"
  },
  {
    "table_name": "reviews",
    "column_name": "author_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "samashki_addresses",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "samashki_addresses",
    "column_name": "street",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "samashki_addresses",
    "column_name": "house_number",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "samashki_addresses",
    "column_name": "full_address",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "samashki_addresses",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "samashki_addresses",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "samashki_addresses",
    "column_name": "postal_code",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'366602'::text"
  },
  {
    "table_name": "user_profiles",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "user_profiles",
    "column_name": "email",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "user_profiles",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "user_profiles",
    "column_name": "avatar_url",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "user_profiles",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "user_profiles",
    "column_name": "is_admin",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "user_profiles",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "user_profiles",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "user_profiles",
    "column_name": "is_blocked",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "user_profiles",
    "column_name": "status_override",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'auto'::text"
  },
  {
    "table_name": "user_profiles",
    "column_name": "gender",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "user_profiles",
    "column_name": "birth_date",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "user_profiles",
    "column_name": "birth_year",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "user_profiles",
    "column_name": "settlement",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "articles",
    "column_name": "chapter_number",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "user_settings",
    "column_name": "is_reading_tip_shown",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "user_settings",
    "column_name": "reading_autosave",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "true"
  },
  {
    "table_name": "user_reading_progress",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "user_reading_progress",
    "column_name": "section_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "user_reading_progress",
    "column_name": "chapter_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "user_reading_progress",
    "column_name": "scroll_position",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "user_reading_progress",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "home_pin_proposals",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "home_pin_proposals",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "home_pin_proposals",
    "column_name": "target_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "home_pin_proposals",
    "column_name": "target_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "home_pin_proposals",
    "column_name": "proposed_date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE"
  },
  {
    "table_name": "home_pin_proposals",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "home_pinned",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "home_pinned",
    "column_name": "target_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "home_pinned",
    "column_name": "target_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "home_pinned",
    "column_name": "pinned_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "home_pinned",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "is_online",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "car_model",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "car_color",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "car_plate",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "years_driving",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "tariffs",
    "data_type": "ARRAY",
    "is_nullable": "NO",
    "column_default": "'{economy}'::text[]"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "is_verified",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "rating",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "ride_count",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "id",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "1"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "base_fare",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "50"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "per_km",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "15"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "per_min",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "2"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "min_fare",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "100"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "road_factor",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1.3"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "label_ru",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "label_ce",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "multiplier",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1"
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "sort_order",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "is_active",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "true"
  },
  {
    "table_name": "taxi_multiplier_schedule",
    "column_name": "id",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_multiplier_schedule",
    "column_name": "start_hour",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_multiplier_schedule",
    "column_name": "end_hour",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_multiplier_schedule",
    "column_name": "multiplier",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "rider_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "driver_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'searching'::text"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "tariff_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "from_label",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "from_lat",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "from_lng",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "to_label",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "to_lat",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "to_lng",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "distance_km",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "price",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "multiplier",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "comment",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "assigned_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "completed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "cancelled_by",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_ratings",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "taxi_ratings",
    "column_name": "ride_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_ratings",
    "column_name": "rider_to_driver",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_ratings",
    "column_name": "driver_to_rider",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_ratings",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "show_gender",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "show_age",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "home_pinned",
    "column_name": "expires_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "pref_gender",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'any'::text"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "pref_min_age",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "18"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "options",
    "data_type": "ARRAY",
    "is_nullable": "NO",
    "column_default": "'{}'::text[]"
  },
  {
    "table_name": "taxi_events",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "taxi_events",
    "column_name": "ride_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_events",
    "column_name": "event_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "taxi_events",
    "column_name": "actor",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'system'::text"
  },
  {
    "table_name": "taxi_events",
    "column_name": "note",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_events",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "car_brands",
    "column_name": "id",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "car_brands",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "car_brands",
    "column_name": "is_active",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "true"
  },
  {
    "table_name": "car_brand_suggestions",
    "column_name": "id",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "car_brand_suggestions",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "car_brand_suggestions",
    "column_name": "driver_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "car_brand_suggestions",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'pending'::text"
  },
  {
    "table_name": "car_brand_suggestions",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "taxi_drivers",
    "column_name": "car_year",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_rides",
    "column_name": "passenger_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_rides",
    "column_name": "passenger_phone",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text"
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "base_fare",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "per_km",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_tariffs",
    "column_name": "per_min",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "taxi_fare",
    "column_name": "child_seat_fee",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "50"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "intercity_from_km",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "30"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "intercity_per_km",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "25"
  },
  {
    "table_name": "taxi_fare",
    "column_name": "cancel_fee",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "100"
  },
  {
    "table_name": "car_requirements",
    "column_name": "model",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "car_requirements",
    "column_name": "year_economy",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "car_requirements",
    "column_name": "year_comfort",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "car_requirements",
    "column_name": "year_business",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "car_requirements",
    "column_name": "is_minivan",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  }
]
