begin;

-- Ensure quarantine table exists (idempotent safety).
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

-- 1) Backfill org/unit from project_tasks.
update public.drive_items di
set
  org_id = pt.org_id,
  unit_id = pt.unit_id
from public.project_tasks pt
where di.project_task_id = pt.id
  and (di.org_id is distinct from pt.org_id or di.unit_id is distinct from pt.unit_id);

-- 2) Quarantine rows with missing tasks.
with missing_tasks as (
  select di.*,
    'task_not_found'::text as quarantine_reason
  from public.drive_items di
  left join public.project_tasks pt
    on di.project_task_id = pt.id
  where pt.id is null
)
insert into public.drive_items_quarantine (
  id,
  project_task_id,
  org_id,
  unit_id,
  uploaded_by,
  drive_file_id,
  web_view_link,
  name,
  mime_type,
  modified_time,
  created_at,
  thumbnail_link,
  file_size_bytes,
  original_size_bytes,
  quarantine_reason
)
select
  id,
  project_task_id,
  org_id,
  unit_id,
  uploaded_by,
  drive_file_id,
  web_view_link,
  name,
  mime_type,
  modified_time,
  created_at,
  thumbnail_link,
  file_size_bytes,
  original_size_bytes,
  quarantine_reason
from missing_tasks;

delete from public.drive_items di
where exists (
  select 1
  from public.project_tasks pt
  where di.project_task_id = pt.id
) is false;

-- 3) Quarantine rows still mismatching org/unit after backfill.
with mismatched as (
  select di.*,
    'org_unit_mismatch'::text as quarantine_reason
  from public.drive_items di
  join public.project_tasks pt
    on di.project_task_id = pt.id
  where di.org_id is distinct from pt.org_id
     or di.unit_id is distinct from pt.unit_id
)
insert into public.drive_items_quarantine (
  id,
  project_task_id,
  org_id,
  unit_id,
  uploaded_by,
  drive_file_id,
  web_view_link,
  name,
  mime_type,
  modified_time,
  created_at,
  thumbnail_link,
  file_size_bytes,
  original_size_bytes,
  quarantine_reason
)
select
  id,
  project_task_id,
  org_id,
  unit_id,
  uploaded_by,
  drive_file_id,
  web_view_link,
  name,
  mime_type,
  modified_time,
  created_at,
  thumbnail_link,
  file_size_bytes,
  original_size_bytes,
  quarantine_reason
from mismatched;

delete from public.drive_items di
where exists (
  select 1
  from public.project_tasks pt
  where di.project_task_id = pt.id
    and (di.org_id is distinct from pt.org_id or di.unit_id is distinct from pt.unit_id)
);

commit;
