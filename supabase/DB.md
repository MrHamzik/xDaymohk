[
  {
    "table_name": "certificates",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "certificates",
    "column_name": "profile_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "certificates",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "certificates",
    "column_name": "issuer",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "certificates",
    "column_name": "year",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "certificates",
    "column_name": "image_url",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "profile_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "author_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "author_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Пользователь'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "reason",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'open'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE",
    "character_maximum_length": null
  },
  {
    "table_name": "complaints",
    "column_name": "target_user_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "operation_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "amount",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "currency",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'643'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "label",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "received_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "raw_payload",
    "data_type": "jsonb",
    "is_nullable": "NO",
    "column_default": "'{}'::jsonb",
    "character_maximum_length": null
  },
  {
    "table_name": "donations",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "street",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "house_number",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "full_address",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "postal_code",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'366602'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "is_not_house",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false",
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "category",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "house_addresses",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "letter_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "title_ru",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "title_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "message_ru",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "message_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "preset",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "color",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "icon",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "recipient_ids",
    "data_type": "ARRAY",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "count",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0",
    "character_maximum_length": null
  },
  {
    "table_name": "letter_log",
    "column_name": "sent_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "character_maximum_length": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "letter_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "run_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "processed",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false",
    "character_maximum_length": null
  },
  {
    "table_name": "letter_schedule",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "key",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "letter_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'custom'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "title_ru",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "title_ce",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "message_ru",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "message_ce",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Даймохк'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "preset",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'green'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "color",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "icon",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'📩'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "recipients",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'all'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "schedule_enabled",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "schedule_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "schedule_repeat",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'once'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "schedule_days",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "1",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "schedule_count",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0",
    "character_maximum_length": null
  },
  {
    "table_name": "letters",
    "column_name": "schedule_sent",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0",
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "recipient_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'system'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "message",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "is_read",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false",
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()",
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "title_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "message_ce",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "notifications",
    "column_name": "sender",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'Даймохк'::text",
    "character_maximum_length": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "question_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "author_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "comment",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE",
    "character_maximum_length": null
  },
  {
    "table_name": "profile_question_comments",
    "column_name": "reply_to_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "profile_id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "author_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "question",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profile_questions",
    "column_name": "created_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": "CURRENT_DATE",
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "avatar_url",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "photos",
    "data_type": "jsonb",
    "is_nullable": "NO",
    "column_default": "'[]'::jsonb",
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "is_specialist",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false",
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "profession_category",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "profession_title",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null,
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "bio",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  },
  {
    "table_name": "profiles",
    "column_name": "workplace_address",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "''::text",
    "character_maximum_length": null
  }
]