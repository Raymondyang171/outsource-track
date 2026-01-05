begin;

-- =========================================================
-- Phase 2A Migration
-- Goal:
--   1) projects: add unit_id, backfill to Demo Unit, enforce NOT NULL, add FK + index
--   2) project_tasks: add org_id/unit_id, backfill from projects, enforce NOT NULL, add FK + index
--   3) RLS upgrade: read by org, write by same org+unit
--
-- Params (document-only):
--   org_id        = 27a437dd-3206-4734-8708-8d00eee0e2d1
--   demo_unit_id  = 7e51a3e8-af71-41cc-8dbe-3ca978530e4c
-- =========================================================

-- ===== 1) projects: add unit_id + backfill =====
alter table public.projects
  add column if not exists unit_id uuid;

update public.projects
set unit_id = '7e51a3e8-af71-41cc-8dbe-3ca978530e4c'::uuid
where unit_id is null;

update public.projects
set org_id = '27a437dd-3206-4734-8708-8d00eee0e2d1'::uuid
where org_id is null;

alter table public.projects
  alter column unit_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_unit_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_unit_id_fkey
      foreign key (unit_id) references public.units(id);
  end if;
end $$;

create index if not exists idx_projects_org_unit
  on public.projects(org_id, unit_id);


-- ===== 2) project_tasks: add org_id/unit_id + backfill =====
alter table public.project_tasks
  add column if not exists org_id uuid,
  add column if not exists unit_id uuid;

update public.project_tasks t
set
  org_id  = p.org_id,
  unit_id = p.unit_id
from public.projects p
where t.project_id = p.id
  and (t.org_id is null or t.unit_id is null);

alter table public.project_tasks
  alter column org_id set not null,
  alter column unit_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_org_id_fkey') then
    alter table public.project_tasks
      add constraint project_tasks_org_id_fkey
      foreign key (org_id) references public.orgs(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'project_tasks_unit_id_fkey') then
    alter table public.project_tasks
      add constraint project_tasks_unit_id_fkey
      foreign key (unit_id) references public.units(id);
  end if;
end $$;

create index if not exists idx_project_tasks_org_unit
  on public.project_tasks(org_id, unit_id);

create index if not exists idx_project_tasks_project_id
  on public.project_tasks(project_id);


-- ===== 3) indices for existing tables (recommended) =====
create index if not exists idx_progress_logs_org_unit
  on public.progress_logs(org_id, unit_id);

create index if not exists idx_drive_items_org_unit
  on public.drive_items(org_id, unit_id);


-- ===== 4) RLS helper functions =====
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_unit_member(p_org uuid, p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p_org
      and m.unit_id = p_unit
      and m.user_id = auth.uid()
  );
$$;


-- ===== 5) RLS policies =====
alter table public.projects enable row level security;

drop policy if exists projects_select_org on public.projects;
drop policy if exists projects_write_unit on public.projects;

create policy projects_select_org
on public.projects
for select
using (public.is_org_member(org_id));

create policy projects_write_unit
on public.projects
for all
using (public.is_unit_member(org_id, unit_id))
with check (public.is_unit_member(org_id, unit_id));


alter table public.project_tasks enable row level security;

drop policy if exists project_tasks_select_org on public.project_tasks;
drop policy if exists project_tasks_write_unit on public.project_tasks;

create policy project_tasks_select_org
on public.project_tasks
for select
using (public.is_org_member(org_id));

create policy project_tasks_write_unit
on public.project_tasks
for all
using (public.is_unit_member(org_id, unit_id))
with check (public.is_unit_member(org_id, unit_id));


alter table public.progress_logs enable row level security;

drop policy if exists progress_logs_select_org on public.progress_logs;
drop policy if exists progress_logs_select_org_member on public.progress_logs;
drop policy if exists progress_logs_insert_org_member on public.progress_logs;
drop policy if exists progress_logs_write_unit on public.progress_logs;

create policy progress_logs_select_org
on public.progress_logs
for select
using (public.is_org_member(org_id));

create policy progress_logs_write_unit
on public.progress_logs
for all
using (public.is_unit_member(org_id, unit_id))
with check (public.is_unit_member(org_id, unit_id));

commit;
