begin;

-- =========================================================
-- Drive items integrity + performance
-- Goal:
--   1) Enforce drive_items org/unit always syncs to project_tasks
--   2) Provide quarantine table for legacy/mismatched rows
--   3) Add composite index for org/unit/task/created_at access
-- =========================================================

create table if not exists public.drive_items_quarantine (
  id uuid,
  project_task_id uuid,
  org_id uuid,
  unit_id uuid,
  uploaded_by uuid,
  drive_file_id text,
  web_view_link text,
  name text,
  mime_type text,
  modified_time timestamp with time zone,
  created_at timestamp with time zone,
  thumbnail_link text,
  file_size_bytes bigint,
  original_size_bytes bigint,
  quarantine_reason text not null,
  quarantined_at timestamp with time zone default now() not null
);

create or replace function public.sync_drive_items_org_unit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_unit uuid;
begin
  select org_id, unit_id
    into v_org, v_unit
  from public.project_tasks
  where id = new.project_task_id;

  if v_org is null or v_unit is null then
    raise exception 'drive_items.project_task_id not found or missing org/unit';
  end if;

  new.org_id := v_org;
  new.unit_id := v_unit;
  return new;
end;
$$;

drop trigger if exists trg_drive_items_sync_org_unit on public.drive_items;

create trigger trg_drive_items_sync_org_unit
before insert or update of project_task_id, org_id, unit_id
on public.drive_items
for each row
execute function public.sync_drive_items_org_unit();

create index if not exists idx_drive_items_org_unit_task_created
  on public.drive_items(org_id, unit_id, project_task_id, created_at);

commit;
