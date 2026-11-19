-- ImpactMe: sign-in and sync, database (Phase 1).
-- Run once in the Supabase SQL editor, or with `supabase db push`.
--
-- Records are stored whole as jsonb: the device validates every record with
-- its normalize* functions, and the shape will keep changing.
-- Deletion reaches other devices through tombstones (deleted = true). Rows are
-- only removed for real when the account is deleted (on delete cascade).

-- ---------------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------------

-- Last change wins, per record, by the time the change was made on the device.
-- On update: if the stored row is newer than the incoming one, skip the update
-- (returning null from a BEFORE UPDATE trigger leaves the row untouched).
-- Otherwise stamp server_updated_at, which devices use as their pull cursor.
create or replace function public.sync_last_change_wins()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.changed_at > new.changed_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- Consent rows are evidence, so their time always comes from the server.
create or replace function public.consents_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.recorded_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record tables: tasks, journal_entries, projects (same shape)
-- ---------------------------------------------------------------------------

create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,                         -- the record's id from the device (UUID string)
  data jsonb,                               -- the whole normalized record; null when deleted
  deleted boolean not null default false,   -- tombstone, so deletions reach other devices
  changed_at bigint not null,               -- ms timestamp of the change on the device; decides conflicts
  server_updated_at timestamptz not null default clock_timestamp(),  -- pull cursor
  primary key (user_id, id),
  constraint tasks_tombstone check (deleted = (data is null))
);
create index tasks_pull on public.tasks (user_id, server_updated_at);

create table public.journal_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  changed_at bigint not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  constraint journal_entries_tombstone check (deleted = (data is null))
);
create index journal_entries_pull on public.journal_entries (user_id, server_updated_at);

create table public.projects (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  changed_at bigint not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  constraint projects_tombstone check (deleted = (data is null))
);
create index projects_pull on public.projects (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Settings (synced keys only; device-only keys never leave the device)
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  changed_at bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------
-- Consents (age check, terms and privacy, journal health data)
-- ---------------------------------------------------------------------------

create table public.consents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,               -- 'terms_privacy_v1', 'journal_health_v1', 'age_16_plus'
  granted boolean not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, kind, recorded_at)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger tasks_last_change_wins
  before insert or update on public.tasks
  for each row execute function public.sync_last_change_wins();

create trigger journal_entries_last_change_wins
  before insert or update on public.journal_entries
  for each row execute function public.sync_last_change_wins();

create trigger projects_last_change_wins
  before insert or update on public.projects
  for each row execute function public.sync_last_change_wins();

create trigger user_settings_last_change_wins
  before insert or update on public.user_settings
  for each row execute function public.sync_last_change_wins();

create trigger consents_server_time
  before insert on public.consents
  for each row execute function public.consents_server_time();

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only, and no delete for anyone through the API.
-- ---------------------------------------------------------------------------

revoke all on public.tasks, public.journal_entries, public.projects,
              public.user_settings, public.consents
  from anon, authenticated;

grant select, insert, update on public.tasks, public.journal_entries,
                                public.projects, public.user_settings
  to authenticated;

grant select, insert on public.consents to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: every row belongs to exactly one user.
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.journal_entries enable row level security;
alter table public.projects enable row level security;
alter table public.user_settings enable row level security;
alter table public.consents enable row level security;

-- tasks
create policy "tasks: owner can read" on public.tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tasks: owner can insert" on public.tasks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tasks: owner can update" on public.tasks
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- journal_entries
create policy "journal_entries: owner can read" on public.journal_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "journal_entries: owner can insert" on public.journal_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "journal_entries: owner can update" on public.journal_entries
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- projects
create policy "projects: owner can read" on public.projects
  for select to authenticated using (user_id = (select auth.uid()));
create policy "projects: owner can insert" on public.projects
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "projects: owner can update" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- user_settings
create policy "user_settings: owner can read" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_settings: owner can insert" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_settings: owner can update" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- consents: read and add only. History is kept until the account is deleted.
create policy "consents: owner can read" on public.consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "consents: owner can insert" on public.consents
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Withdrawing journal consent: remove the caller's journal rows from the
-- server. There is no delete policy, so this is the one narrow way to do it.
-- It only ever touches rows of the signed-in caller. Journal entries on the
-- user's devices are not affected.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_journal_entries()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.journal_entries where user_id = (select auth.uid());
$$;

revoke all on function public.delete_my_journal_entries() from public, anon;
grant execute on function public.delete_my_journal_entries() to authenticated;
