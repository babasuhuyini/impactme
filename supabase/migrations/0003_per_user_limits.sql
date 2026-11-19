-- ImpactMe: per-account limits (run after 0002). Security audit finding M2.
--
-- Without these, one account could keep adding rows until the project's
-- storage is full for everyone. The limits are far above real use:
--
--   table             live rows   all rows (incl. deletion markers)
--   tasks                20 000   100 000
--   journal_entries      10 000    50 000
--   projects              1 000     5 000
--   consents                  -       500   (answers are only ever added)
--
-- Only NEW rows are counted against the limit; updating an existing row
-- (including through upsert) is always allowed. A refused insert raises
-- SQLSTATE 54000 with the message 'quota_exceeded', which the app shows as
-- "Your account has reached its storage limit".

create or replace function public.enforce_row_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  live_limit integer := tg_argv[0]::integer; -- 0 = no live-row limit
  total_limit integer := tg_argv[1]::integer;
  has_id boolean := tg_argv[2]::boolean;
  existing boolean;
  live_count integer;
  total_count integer;
begin
  -- An upsert of a row that already exists is an update, not a new row.
  if has_id then
    execute format('select exists (select 1 from %I.%I where user_id = $1 and id = $2)', tg_table_schema, tg_table_name)
      into existing using new.user_id, new.id;
    if existing then
      return new;
    end if;
  end if;

  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into total_count using new.user_id;
  if total_count >= total_limit then
    raise exception 'quota_exceeded' using errcode = '54000';
  end if;

  if live_limit > 0 then
    execute format('select count(*) from %I.%I where user_id = $1 and not deleted', tg_table_schema, tg_table_name)
      into live_count using new.user_id;
    if live_count >= live_limit then
      raise exception 'quota_exceeded' using errcode = '54000';
    end if;
  end if;

  return new;
end;
$$;

-- Runs before the last-change-wins trigger (triggers fire in name order).
create trigger a_tasks_quota
  before insert on public.tasks
  for each row execute function public.enforce_row_quota(20000, 100000, true);

create trigger a_journal_entries_quota
  before insert on public.journal_entries
  for each row execute function public.enforce_row_quota(10000, 50000, true);

create trigger a_projects_quota
  before insert on public.projects
  for each row execute function public.enforce_row_quota(1000, 5000, true);

create trigger a_consents_quota
  before insert on public.consents
  for each row execute function public.enforce_row_quota(0, 500, false);
