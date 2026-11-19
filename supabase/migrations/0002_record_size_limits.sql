-- ImpactMe: size limits (run after 0001_sign_in_and_sync.sql).
--
-- A signed-in user can only write their own rows, but without limits one
-- account could fill the project's storage. These caps are far above what
-- the app writes (a task or journal entry is a few KB) and match the checks
-- in src/data/sync.js, which holds back anything larger instead of sending it.

-- One record: at most 1 MB of JSON.
alter table public.tasks
  add constraint tasks_data_size check (data is null or octet_length(data::text) <= 1000000),
  add constraint tasks_id_length check (char_length(id) between 1 and 64);

alter table public.journal_entries
  add constraint journal_entries_data_size check (data is null or octet_length(data::text) <= 1000000),
  add constraint journal_entries_id_length check (char_length(id) between 1 and 64);

alter table public.projects
  add constraint projects_data_size check (data is null or octet_length(data::text) <= 1000000),
  add constraint projects_id_length check (char_length(id) between 1 and 64);

-- Settings are a handful of small values.
alter table public.user_settings
  add constraint user_settings_data_size check (octet_length(data::text) <= 10000);

-- Consent kinds are short names like 'journal_health_v1'.
alter table public.consents
  add constraint consents_kind_length check (char_length(kind) between 1 and 64);
